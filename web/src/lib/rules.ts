import {
  DOC_LABELS,
  needsInsurance,
  needsSanitary,
  requiredDocKinds,
  type BillOfLadingFields,
  type CertificateOfOriginFields,
  type Check,
  type CheckStatus,
  type DocKind,
  type InsuranceFields,
  type InvoiceFields,
  type PackingListFields,
  type PurchaseOrder,
  type SanitaryFields,
  type VerificationResult,
} from "./domain";
import {
  daysBetween,
  digitsOnly,
  formatDate,
  formatNcm,
  formatNumber,
  missingKeywords,
  normalizeCurrency,
  sameCompany,
  samePlace,
  tokens,
} from "./normalize";

export interface DocsToVerify {
  invoice?: InvoiceFields;
  packingList?: PackingListFields;
  billOfLading?: BillOfLadingFields;
  certificateOfOrigin?: CertificateOfOriginFields;
  insurance?: InsuranceFields;
  sanitary?: SanitaryFields;
}

const PRESENTATION_DAYS = 21;
const WEIGHT_MATCH_PCT = 0.5;
const COMPANY_MATCH = 0.8;
const COMPANY_SIMILAR = 0.5;

const kg = (n: number | null | undefined) => (n == null ? "—" : `${formatNumber(n)} kg`);
const money = (n: number | null | undefined, currency: string) =>
  n == null ? "—" : `${currency} ${formatNumber(n, 2)}`;
const pctDiff = (a: number, b: number) => (Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b))) * 100;

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function verify(po: PurchaseOrder, docs: DocsToVerify, today: string = todayIso()): VerificationResult {
  const checks: Check[] = [];
  const add = (
    id: string,
    label: string,
    status: CheckStatus,
    detail: string,
    rule: string,
    documents: DocKind[],
    extra: Partial<Pick<Check, "expected" | "found" | "fix">> = {},
  ) => checks.push({ id, label, status, detail, rule, documents, ...extra });

  const required = requiredDocKinds(po);
  const missingDocs = required.filter((k) => !docs[k]);
  for (const kind of missingDocs) {
    add(`docs.${kind}`, `Falta: ${DOC_LABELS[kind]}`, "error", "Sin este documento no se puede liberar el pago.", "Documentos exigidos por la orden de compra", [kind], {
      fix: "Pedile al proveedor que lo suba.",
    });
  }

  const inv = docs.invoice;
  const pl = docs.packingList;
  const bl = docs.billOfLading;
  const poNcm = digitsOnly(po.hsCode);

  if (inv) {
    companyCheck(add, {
      id: "invoice.seller",
      label: "Vendedor en la factura",
      found: inv.seller,
      expected: po.sellerName,
      rule: "UCP 600, art. 18(a)(i): la factura la tiene que emitir el vendedor",
      doc: "invoice",
      fix: "La factura tiene que salir a nombre de la misma empresa que figura en la orden de compra.",
    });

    companyCheck(add, {
      id: "invoice.buyer",
      label: "Comprador en la factura",
      found: inv.buyer,
      expected: po.buyerName,
      rule: "UCP 600, art. 18(a)(ii): la factura va a nombre del comprador",
      doc: "invoice",
      fix: "Pedile al proveedor que corrija la razón social del comprador.",
    });

    const missing = missingKeywords(inv.description, po.goodsKeywords);
    if (!inv.description) {
      add("invoice.description", "Descripción de la mercadería", "error", "No encontramos la descripción de la mercadería en la factura.", "UCP 600, art. 18(c)", ["invoice"], {
        fix: "La factura tiene que describir la mercadería como en la orden de compra.",
      });
    } else if (missing.length === 0) {
      add("invoice.description", "Descripción de la mercadería", "ok", "La descripción de la factura corresponde con la orden de compra.", "UCP 600, art. 18(c)", ["invoice"], {
        found: inv.description,
      });
    } else {
      add("invoice.description", "Descripción de la mercadería", "error", `A la descripción de la factura le falta: ${missing.join(", ")}.`, "UCP 600, art. 18(c): la descripción de la factura tiene que corresponder con la acordada", ["invoice"], {
        expected: po.goodsDescription,
        found: inv.description,
        fix: "El banco rechaza facturas con una descripción distinta. Pedí que la corrijan.",
      });
    }

    if (!inv.hsCode) {
      add("invoice.hsCode", "Posición arancelaria (NCM)", "warning", "La factura no indica la posición arancelaria. No es obligatoria, pero el despachante la va a necesitar.", "Nomenclatura Común del MERCOSUR", ["invoice"], {
        expected: formatNcm(po.hsCode),
      });
    } else if (digitsOnly(inv.hsCode).slice(0, 8) === poNcm.slice(0, 8)) {
      add("invoice.hsCode", "Posición arancelaria (NCM)", "ok", "Coincide con la posición de la orden de compra.", "Nomenclatura Común del MERCOSUR", ["invoice"], {
        found: formatNcm(inv.hsCode),
      });
    } else {
      add("invoice.hsCode", "Posición arancelaria (NCM)", "error", "La posición arancelaria de la factura no es la acordada. Define qué derechos e impuestos se pagan: un error puede terminar en multa o en un despacho observado.", "Nomenclatura Común del MERCOSUR (Código Aduanero)", ["invoice"], {
        expected: formatNcm(po.hsCode),
        found: formatNcm(inv.hsCode),
        fix: "Confirmá la posición con tu despachante y pedí la factura corregida.",
      });
    }

    if (inv.quantity == null) {
      add("invoice.quantity", "Cantidad facturada", "error", "No encontramos la cantidad en la factura.", "UCP 600, art. 18(c)", ["invoice"]);
    } else {
      const diff = pctDiff(inv.quantity, po.quantity);
      const ok = diff <= po.quantityTolerancePct + 1e-9;
      add("invoice.quantity", "Cantidad facturada", ok ? "ok" : "error", ok ? "La cantidad facturada es la acordada." : `La cantidad facturada difiere un ${formatNumber(diff, 1)}% de la acordada (tolerancia: ${formatNumber(po.quantityTolerancePct, 1)}%).`, "Orden de compra y UCP 600, art. 30", ["invoice"], {
        expected: `${formatNumber(po.quantity)} ${po.unit}`,
        found: formatNumber(inv.quantity),
        ...(ok ? {} : { fix: "Si fue un embarque parcial, acordalo por escrito antes de liberar el pago." }),
      });
    }

    const currency = normalizeCurrency(inv.currency);
    if (!currency) {
      add("invoice.currency", "Moneda", "error", "No encontramos la moneda de la factura.", "UCP 600, art. 18(a)(iii)", ["invoice"], {
        expected: po.currency,
      });
    } else if (currency === po.currency.toUpperCase()) {
      add("invoice.currency", "Moneda", "ok", "La factura está en la moneda acordada.", "UCP 600, art. 18(a)(iii)", ["invoice"], { found: currency });
    } else {
      add("invoice.currency", "Moneda", "error", "La factura está en otra moneda.", "UCP 600, art. 18(a)(iii): la factura va en la moneda acordada", ["invoice"], {
        expected: po.currency,
        found: currency,
        fix: "Pedí la factura en la moneda de la orden de compra.",
      });
    }

    if (inv.quantity != null && inv.unitPrice != null && inv.totalAmount != null) {
      const computed = inv.quantity * inv.unitPrice;
      const ok = Math.abs(computed - inv.totalAmount) <= Math.max(0.01, inv.totalAmount * 0.005);
      add("invoice.arithmetic", "Cuentas de la factura", ok ? "ok" : "error", ok ? "Cantidad por precio unitario da el total facturado." : "Cantidad por precio unitario no da el total facturado.", "UCP 600, art. 14(d): los datos no pueden contradecirse", ["invoice"], {
        expected: money(computed, po.currency),
        found: money(inv.totalAmount, po.currency),
        ...(ok ? {} : { fix: "Hay un error de cálculo en la factura: pedí que la rehagan." }),
      });
    }

    if (inv.totalAmount == null) {
      add("invoice.amount", "Monto facturado", "error", "No encontramos el total de la factura.", "UCP 600, art. 18(b)", ["invoice"]);
    } else if (inv.totalAmount > po.amount * 1.0001) {
      add("invoice.amount", "Monto facturado", "error", "La factura supera el monto acordado.", "UCP 600, art. 18(b): la factura no puede superar el monto acordado", ["invoice"], {
        expected: money(po.amount, po.currency),
        found: money(inv.totalAmount, po.currency),
        fix: "La custodia solo libera lo acordado. Pedí una factura por el monto correcto.",
      });
    } else if (inv.totalAmount < po.amount * 0.9999) {
      add("invoice.amount", "Monto facturado", "warning", "La factura es menor que lo acordado. ¿Es un embarque parcial? La custodia liberaría el monto completo.", "UCP 600, art. 18(b)", ["invoice"], {
        expected: money(po.amount, po.currency),
        found: money(inv.totalAmount, po.currency),
      });
    } else {
      add("invoice.amount", "Monto facturado", "ok", "El total coincide con el monto de la custodia.", "UCP 600, art. 18(b)", ["invoice"], {
        found: money(inv.totalAmount, po.currency),
      });
    }

    if (!inv.incoterm) {
      add("invoice.incoterm", "Incoterm", "error", "La factura no indica la condición de entrega (Incoterm).", "Incoterms 2020 (ICC)", ["invoice"], {
        expected: `${po.incoterm} ${po.incotermPlace}`,
      });
    } else if (inv.incoterm.toUpperCase() !== po.incoterm.toUpperCase()) {
      add("invoice.incoterm", "Incoterm", "error", "La condición de entrega no es la acordada: cambia quién paga el flete y el seguro, y desde dónde viaja el riesgo.", "Incoterms 2020 (ICC)", ["invoice"], {
        expected: `${po.incoterm} ${po.incotermPlace}`,
        found: `${inv.incoterm} ${inv.incotermPlace ?? ""}`.trim(),
        fix: "Pedí que la factura respete el Incoterm de la orden de compra.",
      });
    } else if (inv.incotermPlace && !samePlace(inv.incotermPlace, po.incotermPlace)) {
      add("invoice.incoterm", "Incoterm", "warning", "El Incoterm coincide, pero el lugar es otro.", "Incoterms 2020 (ICC)", ["invoice"], {
        expected: `${po.incoterm} ${po.incotermPlace}`,
        found: `${inv.incoterm} ${inv.incotermPlace}`,
      });
    } else {
      add("invoice.incoterm", "Incoterm", "ok", "La condición de entrega es la acordada.", "Incoterms 2020 (ICC)", ["invoice"], {
        found: `${inv.incoterm} ${inv.incotermPlace ?? ""}`.trim(),
      });
    }
  }

  if (pl) {
    if (inv?.quantity != null && pl.quantity != null) {
      const ok = inv.quantity === pl.quantity;
      add("packing.quantity", "Cantidad en el packing list", ok ? "ok" : "error", ok ? "Coincide con la factura." : "El packing list y la factura indican cantidades distintas.", "UCP 600, art. 14(d): los datos no pueden contradecirse", ["packingList", "invoice"], {
        expected: formatNumber(inv.quantity),
        found: formatNumber(pl.quantity),
        ...(ok ? {} : { fix: "Uno de los dos documentos está mal: pedí que los unifiquen." }),
      });
    }

    if (pl.description && missingKeywords(pl.description, po.goodsKeywords).length === po.goodsKeywords.length) {
      add("packing.description", "Descripción en el packing list", "warning", "La descripción no menciona ninguna de las palabras clave de la mercadería.", "UCP 600, art. 14(e): puede ser general, pero no contradictoria", ["packingList"], {
        found: pl.description,
      });
    }

    if (inv?.invoiceNumber && pl.invoiceNumber) {
      const same = tokens(inv.invoiceNumber).join("") === tokens(pl.invoiceNumber).join("");
      add("packing.invoiceRef", "Factura de referencia", same ? "ok" : "warning", same ? "El packing list referencia la factura correcta." : "El packing list referencia otra factura.", "UCP 600, art. 14(d)", ["packingList", "invoice"], {
        expected: inv.invoiceNumber,
        found: pl.invoiceNumber,
      });
    }
  }

  if (bl) {
    if (bl.shipper) {
      const score = sameCompany(bl.shipper, po.sellerName);
      add("bl.shipper", "Cargador del BL", score >= COMPANY_MATCH ? "ok" : "warning", score >= COMPANY_MATCH ? "El cargador es el vendedor." : "El cargador no es el vendedor. Las reglas lo permiten, pero confirmá que sea un agente suyo.", "UCP 600, art. 14(k)", ["billOfLading"], {
        expected: po.sellerName,
        found: bl.shipper,
      });
    }

    const consignee = bl.consignee ?? "";
    if (!bl.consignee) {
      add("bl.consignee", "Consignatario del BL", "error", "No encontramos el consignatario: no se sabe a quién se entrega la mercadería.", "Condición de entrega de la orden de compra", ["billOfLading"], {
        expected: po.buyerName,
      });
    } else if (/\bto\s+(the\s+)?order\b|\ba\s+la\s+orden\b/i.test(consignee)) {
      add("bl.consignee", "Consignatario del BL", "warning", "El BL es \"a la orden\": la mercadería la retira quien tenga el BL endosado.", "Condición de entrega de la orden de compra", ["billOfLading"], {
        expected: po.buyerName,
        found: consignee,
        fix: "Confirmá que el BL original te llegue endosado antes de liberar el pago.",
      });
    } else {
      const score = sameCompany(consignee, po.buyerName);
      add("bl.consignee", "Consignatario del BL", score >= COMPANY_MATCH ? "ok" : "error", score >= COMPANY_MATCH ? "La mercadería está consignada al comprador." : "La mercadería está consignada a otra empresa.", "Condición de entrega de la orden de compra", ["billOfLading"], {
        expected: po.buyerName,
        found: consignee,
        ...(score >= COMPANY_MATCH ? {} : { fix: "No liberes el pago: pedí que la naviera corrija el consignatario." }),
      });
    }

    portCheck(add, "bl.portOfLoading", "Puerto de carga", bl.portOfLoading, po.portOfLoading, "UCP 600, art. 20(a)(ii)");
    portCheck(add, "bl.portOfDischarge", "Puerto de descarga", bl.portOfDischarge, po.portOfDischarge, "UCP 600, art. 20(a)(iii)");

    if (!bl.shippedOnBoardDate) {
      add("bl.onBoard", "Fecha de embarque", "error", "El BL no tiene fecha de embarque a bordo: no prueba que la mercadería salió.", "UCP 600, art. 20(a)(ii): el BL tiene que indicar que la mercadería fue embarcada a bordo", ["billOfLading"], {
        expected: `Hasta el ${formatDate(po.latestShipmentDate)}`,
        fix: "Pedí un BL con la anotación \"shipped on board\" y su fecha.",
      });
    } else {
      const late = daysBetween(po.latestShipmentDate, bl.shippedOnBoardDate);
      if (late > 0) {
        add("bl.onBoard", "Fecha de embarque", "error", `La mercadería se embarcó ${late} ${late === 1 ? "día" : "días"} después del plazo acordado.`, "Orden de compra: fecha límite de embarque", ["billOfLading"], {
          expected: `Hasta el ${formatDate(po.latestShipmentDate)}`,
          found: formatDate(bl.shippedOnBoardDate),
          fix: "Decidí si aceptás el atraso. Si lo aceptás, dejalo por escrito antes de liberar.",
        });
      } else if (daysBetween(today, bl.shippedOnBoardDate) > 0) {
        add("bl.onBoard", "Fecha de embarque", "warning", "La fecha a bordo es posterior a hoy: un BL no puede emitirse antes del embarque.", "UCP 600, art. 20(a)(ii)", ["billOfLading"], {
          found: formatDate(bl.shippedOnBoardDate),
        });
      } else {
        add("bl.onBoard", "Fecha de embarque", "ok", "Se embarcó dentro del plazo.", "Orden de compra: fecha límite de embarque", ["billOfLading"], {
          expected: `Hasta el ${formatDate(po.latestShipmentDate)}`,
          found: formatDate(bl.shippedOnBoardDate),
        });
        const elapsed = daysBetween(bl.shippedOnBoardDate, today);
        const left = PRESENTATION_DAYS - elapsed;
        add("presentation.period", "Plazo para presentar", left >= 0 ? "ok" : "warning", left >= 0 ? `Pasaron ${elapsed} días desde el embarque: quedan ${left} para presentar los documentos.` : `Pasaron ${elapsed} días desde el embarque: se superó el plazo habitual de ${PRESENTATION_DAYS}.`, "UCP 600, art. 14(c): hasta 21 días desde el embarque", ["billOfLading"]);
      }
    }

    if (bl.description && missingKeywords(bl.description, po.goodsKeywords).length === po.goodsKeywords.length) {
      add("bl.description", "Descripción en el BL", "warning", "La descripción del BL no menciona la mercadería acordada.", "UCP 600, art. 14(e): puede ser general, pero no contradictoria", ["billOfLading"], {
        found: bl.description,
      });
    }

    if (bl.hsCode && digitsOnly(bl.hsCode).slice(0, 6) !== poNcm.slice(0, 6)) {
      add("bl.hsCode", "Posición arancelaria en el BL", "warning", "El código del Sistema Armonizado del BL no coincide con la orden de compra.", "Sistema Armonizado (6 dígitos)", ["billOfLading"], {
        expected: formatNcm(po.hsCode),
        found: bl.hsCode,
      });
    }
  }

  if (pl && bl) {
    if (pl.grossWeightKg == null || bl.grossWeightKg == null) {
      add("weight.consistency", "Peso bruto entre documentos", "warning", "Falta el peso bruto en el packing list o en el BL.", "UCP 600, art. 14(d)", ["packingList", "billOfLading"], {
        found: `Packing list: ${kg(pl.grossWeightKg)} · BL: ${kg(bl.grossWeightKg)}`,
      });
    } else {
      const diff = pctDiff(pl.grossWeightKg, bl.grossWeightKg);
      const ok = diff <= WEIGHT_MATCH_PCT;
      add("weight.consistency", "Peso bruto entre documentos", ok ? "ok" : "error", ok ? "El packing list y el BL indican el mismo peso." : `El BL y el packing list no coinciden: hay ${kg(Math.abs(bl.grossWeightKg - pl.grossWeightKg))} de diferencia.`, "UCP 600, art. 14(d): los datos no pueden contradecirse", ["packingList", "billOfLading"], {
        expected: `Packing list: ${kg(pl.grossWeightKg)}`,
        found: `BL: ${kg(bl.grossWeightKg)}`,
        ...(ok ? {} : { fix: "Es la discrepancia más común. Pedí que la naviera o el proveedor corrijan el documento equivocado." }),
      });
    }

    if (pl.packages != null && bl.packages != null) {
      const ok = pl.packages === bl.packages;
      add("packages.consistency", "Bultos entre documentos", ok ? "ok" : "error", ok ? "El packing list y el BL indican los mismos bultos." : "El packing list y el BL indican cantidades de bultos distintas.", "UCP 600, art. 14(d)", ["packingList", "billOfLading"], {
        expected: `Packing list: ${formatNumber(pl.packages)}`,
        found: `BL: ${formatNumber(bl.packages)}`,
      });
    }
  }

  const gross = pl?.grossWeightKg ?? bl?.grossWeightKg;
  if (gross != null) {
    const diff = pctDiff(gross, po.grossWeightKg);
    add("weight.expected", "Peso bruto esperado", diff <= po.weightTolerancePct ? "ok" : "warning", diff <= po.weightTolerancePct ? "El peso declarado está dentro de lo esperado." : `El peso declarado se aparta un ${formatNumber(diff, 1)}% de lo esperado.`, "Control de razonabilidad de la orden de compra", pl ? ["packingList"] : ["billOfLading"], {
      expected: `${kg(po.grossWeightKg)} ± ${formatNumber(po.weightTolerancePct)}%`,
      found: kg(gross),
    });
  }

  const origin = docs.certificateOfOrigin;
  if (origin) {
    companyCheck(add, {
      id: "origin.exporter",
      label: "Exportador en el certificado de origen",
      found: origin.exporter,
      expected: po.sellerName,
      rule: "Acuerdo de origen: el certificado lo emite el exportador de la factura",
      doc: "certificateOfOrigin",
      fix: "El certificado tiene que estar a nombre del mismo proveedor.",
    });
    companyCheck(add, {
      id: "origin.importer",
      label: "Importador en el certificado de origen",
      found: origin.importer,
      expected: po.buyerName,
      rule: "El certificado de origen se emite para el importador de la operación",
      doc: "certificateOfOrigin",
      fix: "Pedí que corrijan la razón social del importador.",
    });
    if (!origin.countryOfOrigin) {
      add("origin.country", "País de origen", "error", "El certificado no indica el país de origen.", "Certificado de origen", ["certificateOfOrigin"], {
        fix: "Sin el país de origen no se puede aplicar la preferencia arancelaria.",
      });
    } else {
      add("origin.country", "País de origen", "ok", "El certificado indica el país de origen.", "Certificado de origen", ["certificateOfOrigin"], {
        found: origin.countryOfOrigin,
      });
    }
    if (origin.hsCode && digitsOnly(origin.hsCode).slice(0, 8) !== poNcm.slice(0, 8)) {
      add("origin.hsCode", "Posición arancelaria en el origen", "error", "La posición del certificado de origen no es la de la orden de compra.", "Nomenclatura Común del MERCOSUR", ["certificateOfOrigin"], {
        expected: formatNcm(po.hsCode),
        found: formatNcm(origin.hsCode),
        fix: "El certificado y la factura tienen que usar la misma posición.",
      });
    } else if (origin.hsCode) {
      add("origin.hsCode", "Posición arancelaria en el origen", "ok", "Coincide con la orden de compra.", "Nomenclatura Común del MERCOSUR", ["certificateOfOrigin"], {
        found: formatNcm(origin.hsCode),
      });
    }
    if (origin.invoiceNumber && inv?.invoiceNumber && origin.invoiceNumber !== inv.invoiceNumber) {
      add("origin.invoice", "Factura citada en el origen", "error", "El certificado de origen cita otra factura.", "El certificado tiene que corresponder a esta factura", ["certificateOfOrigin", "invoice"], {
        expected: inv.invoiceNumber,
        found: origin.invoiceNumber,
      });
    } else if (origin.invoiceNumber) {
      add("origin.invoice", "Factura citada en el origen", "ok", "El certificado corresponde a la factura.", "El certificado tiene que corresponder a esta factura", ["certificateOfOrigin"], {
        found: origin.invoiceNumber,
      });
    }
  }

  const policy = docs.insurance;
  if (policy || needsInsurance(po)) {
    if (policy) {
      companyCheck(add, {
        id: "insurance.insured",
        label: "Asegurado",
        found: policy.insured,
        expected: po.buyerName,
        rule: "Incoterms 2020, CIF/CIP: el seguro cubre al comprador",
        doc: "insurance",
        fix: "La póliza tiene que estar a nombre del importador, o endosada a su favor.",
      });
      if (policy.amount == null) {
        add("insurance.amount", "Suma asegurada", "error", "La póliza no indica la suma asegurada.", "Incoterms 2020, CIF/CIP: cobertura mínima del 110 % del valor", ["insurance"], {
          expected: money(po.amount, po.currency),
          fix: "Pedí la póliza con el importe cubierto.",
        });
      } else if (policy.amount + 0.01 < po.amount) {
        add("insurance.amount", "Suma asegurada", "error", "La suma asegurada no cubre el valor de la factura.", "Incoterms 2020, CIF/CIP", ["insurance"], {
          expected: money(po.amount, po.currency),
          found: money(policy.amount, policy.currency ?? po.currency),
          fix: "El seguro tiene que cubrir al menos el importe de la operación.",
        });
      } else {
        add("insurance.amount", "Suma asegurada", "ok", "La póliza cubre el valor de la operación.", "Incoterms 2020, CIF/CIP", ["insurance"], {
          found: money(policy.amount, policy.currency ?? po.currency),
        });
      }
      if (policy.currency && normalizeCurrency(policy.currency) !== po.currency) {
        add("insurance.currency", "Moneda del seguro", "error", "La póliza está en otra moneda.", "La cobertura tiene que estar en la moneda del pago", ["insurance"], {
          expected: po.currency,
          found: policy.currency,
        });
      }
      if (!policy.coverage) {
        add("insurance.coverage", "Cobertura", "error", "La póliza no dice qué cubre.", "Incoterms 2020, CIF/CIP: cláusulas de carga (A), como mínimo", ["insurance"], {
          fix: "Pedí una cobertura de cláusulas de carga A, o la que acuerden.",
        });
      } else {
        add("insurance.coverage", "Cobertura", "ok", "La póliza indica la cobertura.", "Incoterms 2020, CIF/CIP", ["insurance"], { found: policy.coverage });
      }
    }
  }

  const sanitary = docs.sanitary;
  if (sanitary || needsSanitary(po)) {
    if (sanitary) {
      companyCheck(add, {
        id: "sanitary.exporter",
        label: "Exportador en el certificado sanitario",
        found: sanitary.exporter,
        expected: po.sellerName,
        rule: "El certificado sanitario corresponde al exportador de la mercadería",
        doc: "sanitary",
        fix: "El certificado tiene que estar a nombre del proveedor.",
      });
      const missingGoods = missingKeywords(sanitary.description, po.goodsKeywords);
      if (!sanitary.description || missingGoods.length === po.goodsKeywords.length) {
        add("sanitary.goods", "Mercadería en el certificado sanitario", "error", "El certificado sanitario no describe la mercadería acordada.", "El certificado tiene que cubrir esta mercadería", ["sanitary"], {
          expected: po.goodsDescription,
          found: sanitary.description ?? "—",
          fix: "Pedí un certificado que mencione esta mercadería.",
        });
      } else {
        add("sanitary.goods", "Mercadería en el certificado sanitario", "ok", "El certificado cubre la mercadería.", "El certificado tiene que cubrir esta mercadería", ["sanitary"], {
          found: sanitary.description,
        });
      }
      if (!sanitary.issuedOn) {
        add("sanitary.date", "Fecha del certificado sanitario", "warning", "El certificado no tiene fecha de emisión.", "Certificado sanitario", ["sanitary"]);
      }
    }
  }

  const errors = checks.filter((c) => c.status === "error").length;
  const warnings = checks.filter((c) => c.status === "warning").length;
  const verdict = missingDocs.length > 0 ? "incompleto" : errors > 0 ? "observado" : "conforme";

  return { verdict, checks, errors, warnings, checkedAt: new Date().toISOString() };
}

type AddFn = (
  id: string,
  label: string,
  status: CheckStatus,
  detail: string,
  rule: string,
  documents: DocKind[],
  extra?: Partial<Pick<Check, "expected" | "found" | "fix">>,
) => void;

function companyCheck(
  add: AddFn,
  args: { id: string; label: string; found: string | null; expected: string; rule: string; doc: DocKind; fix: string },
) {
  const { id, label, found, expected, rule, doc, fix } = args;
  if (!found) {
    add(id, label, "error", "No encontramos este dato en el documento.", rule, [doc], { expected, fix });
    return;
  }
  const score = sameCompany(found, expected);
  if (score >= COMPANY_MATCH) {
    add(id, label, "ok", "Coincide con la orden de compra.", rule, [doc], { found });
  } else if (score >= COMPANY_SIMILAR) {
    add(id, label, "warning", "El nombre se parece pero no es igual. Un banco puede observarlo.", rule, [doc], { expected, found, fix });
  } else {
    add(id, label, "error", "No coincide con la orden de compra.", rule, [doc], { expected, found, fix });
  }
}

function portCheck(add: AddFn, id: string, label: string, found: string | null, expected: string, rule: string) {
  if (!found) {
    add(id, label, "error", "El BL no indica este puerto.", rule, ["billOfLading"], { expected });
  } else if (samePlace(found, expected)) {
    add(id, label, "ok", "Es el puerto acordado.", rule, ["billOfLading"], { found });
  } else {
    add(id, label, "error", "No es el puerto acordado.", rule, ["billOfLading"], {
      expected,
      found,
      fix: "Confirmá la ruta con el proveedor: si el puerto cambió, los costos y el riesgo también.",
    });
  }
}
