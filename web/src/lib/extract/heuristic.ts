import type { DocFieldsByKind, DocKind } from "../domain";
import { normalizeCurrency } from "../normalize";
import { INCOTERMS, coerceFields, splitIncoterm } from "./coerce";

const NO = String.raw`(?:no\.?|nro\.?|n[º°o]\.?|number|num\.?|#)`;
const HS = [String.raw`h\.?\s?s\.?\s*code`, String.raw`hs`, String.raw`ncm`, String.raw`tariff\s*code`, String.raw`posici[oó]n\s*arancelaria`];
const DESCRIPTION = [
  String.raw`description\s*of\s*(?:packages\s*and\s*)?goods`,
  String.raw`goods\s*description`,
  String.raw`description`,
  String.raw`descripci[oó]n(?:\s*de\s*la\s*mercader[ií]a)?`,
  String.raw`mercader[ií]a`,
];
const QUANTITY = [String.raw`total\s*quantity`, String.raw`quantity`, String.raw`qty\.?`, String.raw`cantidad`];
const PACKAGES = [
  String.raw`total\s*packages`,
  String.raw`(?:no\.?|number)\s*of\s*packages`,
  String.raw`packages`,
  String.raw`cartons`,
  String.raw`ctns\.?`,
  String.raw`(?:cantidad\s*de\s*)?bultos`,
];
const GROSS = [String.raw`total\s*gross\s*weight`, String.raw`gross\s*weight`, String.raw`g\.?\s?w\.?`, String.raw`peso\s*bruto`];
const NET = [String.raw`total\s*net\s*weight`, String.raw`net\s*weight`, String.raw`n\.?\s?w\.?`, String.raw`peso\s*neto`];

type LabelSpec = Record<string, string[]>;

const LABELS: { [K in DocKind]: LabelSpec } = {
  invoice: {
    invoiceNumber: [String.raw`(?:commercial\s*)?invoice\s*${NO}`, String.raw`factura\s*${NO}`, String.raw`n[uú]mero\s*de\s*factura`],
    date: [String.raw`invoice\s*date`, String.raw`date\s*of\s*issue`, String.raw`fecha\s*de\s*emisi[oó]n`, String.raw`fecha`, String.raw`date`],
    seller: [String.raw`seller`, String.raw`exporter`, String.raw`beneficiary`, String.raw`vendedor`, String.raw`exportador`],
    buyer: [String.raw`buyer`, String.raw`importer`, String.raw`sold\s*to`, String.raw`bill\s*to`, String.raw`messrs\.?`, String.raw`comprador`, String.raw`importador`],
    description: DESCRIPTION,
    hsCode: HS,
    quantity: QUANTITY,
    unitPrice: [String.raw`unit\s*price`, String.raw`precio\s*unitario`],
    totalAmount: [String.raw`total\s*amount`, String.raw`total\s*value`, String.raw`invoice\s*total`, String.raw`amount`, String.raw`importe\s*total`, String.raw`total`],
    currency: [String.raw`currency`, String.raw`moneda`],
    incoterm: [
      String.raw`incoterms?(?:\s*2020)?`,
      String.raw`terms\s*of\s*delivery`,
      String.raw`delivery\s*terms`,
      String.raw`price\s*terms`,
      String.raw`condici[oó]n\s*de\s*(?:venta|entrega)`,
    ],
  },
  packingList: {
    invoiceNumber: [String.raw`invoice\s*(?:ref\.?|reference|${NO})`, String.raw`ref\.?\s*invoice`, String.raw`factura(?:\s*${NO})?`],
    seller: [String.raw`seller`, String.raw`exporter`, String.raw`vendedor`, String.raw`exportador`],
    buyer: [String.raw`buyer`, String.raw`importer`, String.raw`comprador`, String.raw`importador`],
    description: DESCRIPTION,
    quantity: QUANTITY,
    packages: PACKAGES,
    netWeightKg: NET,
    grossWeightKg: GROSS,
  },
  billOfLading: {
    blNumber: [String.raw`b\/?l\s*${NO}`, String.raw`bill\s*of\s*lading\s*${NO}`, String.raw`n[uú]mero\s*de\s*bl`, String.raw`conocimiento\s*${NO}`],
    shipper: [String.raw`shipper(?:\s*\/\s*exporter)?`, String.raw`cargador`, String.raw`embarcador`],
    consignee: [String.raw`consignee`, String.raw`consignatario`],
    vessel: [String.raw`(?:ocean\s*)?vessel(?:\s*\/\s*voy(?:age)?\.?)?`, String.raw`buque`],
    portOfLoading: [String.raw`port\s*of\s*loading`, String.raw`puerto\s*de\s*(?:carga|embarque)`, String.raw`pol`],
    portOfDischarge: [String.raw`port\s*of\s*discharge`, String.raw`puerto\s*de\s*(?:descarga|destino)`, String.raw`pod`],
    shippedOnBoardDate: [
      String.raw`shipped\s*on\s*board(?:\s*date)?`,
      String.raw`laden\s*on\s*board(?:\s*date)?`,
      String.raw`on\s*board\s*date`,
      String.raw`fecha\s*(?:a\s*bordo|de\s*embarque)`,
    ],
    description: DESCRIPTION,
    hsCode: HS,
    packages: PACKAGES,
    grossWeightKg: GROSS,
  },
  certificateOfOrigin: {
    certificateNumber: [String.raw`certificate\s*${NO}`, String.raw`certificado\s*${NO}`],
    exporter: [String.raw`exporter`, String.raw`exportador`],
    importer: [String.raw`importer`, String.raw`importador`, String.raw`consignee`],
    countryOfOrigin: [String.raw`country\s*of\s*origin`, String.raw`pa[ií]s\s*de\s*origen`, String.raw`origin`],
    invoiceNumber: [String.raw`invoice\s*(?:ref\.?|reference|${NO})`, String.raw`factura\s*${NO}`],
    description: DESCRIPTION,
    hsCode: HS,
  },
  insurance: {
    policyNumber: [String.raw`policy\s*${NO}`, String.raw`p[oó]liza\s*${NO}`],
    insured: [String.raw`insured`, String.raw`assured`, String.raw`asegurado`],
    amount: [String.raw`sum\s*insured`, String.raw`insured\s*amount`, String.raw`suma\s*asegurada`],
    currency: [String.raw`currency`, String.raw`moneda`],
    coverage: [String.raw`coverage`, String.raw`coberturas?`, String.raw`clauses?`],
    invoiceNumber: [String.raw`invoice\s*(?:ref\.?|reference|${NO})`, String.raw`factura\s*${NO}`],
    description: DESCRIPTION,
  },
  sanitary: {
    certificateNumber: [String.raw`certificate\s*${NO}`, String.raw`certificado\s*${NO}`],
    exporter: [String.raw`exporter`, String.raw`exportador`],
    importer: [String.raw`importer`, String.raw`importador`],
    description: DESCRIPTION,
    authority: [String.raw`authority`, String.raw`autoridad`, String.raw`issued\s*by`],
    issuedOn: [String.raw`date\s*of\s*issue`, String.raw`fecha\s*de\s*emisi[oó]n`, String.raw`issued\s*on`],
  },
};

/** Etiquetas que cortan el valor anterior aunque no las leamos. */
const STOP_LABELS = [
  String.raw`notify\s*party`,
  String.raw`place\s*of\s*(?:receipt|delivery|issue)`,
  String.raw`freight`,
  String.raw`container(?:\s*${NO})?`,
  String.raw`seal(?:\s*${NO})?`,
  String.raw`marks(?:\s*(?:&|and)\s*numbers)?`,
  String.raw`address`,
  String.raw`tel\.?`,
  String.raw`payment\s*terms`,
  String.raw`country\s*of\s*origin`,
];

const BOUNDARY = String.raw`(?<![\p{L}\d])`;
const COLON = String.raw`\s*[:：]`;

function compileSpec(kind: DocKind) {
  const spec = LABELS[kind];
  const entries = Object.entries(spec).flatMap(([field, sources]) => sources.map((source) => ({ field, source })));
  const all = [...entries.map((e) => e.source), ...STOP_LABELS].sort((a, b) => b.length - a.length);
  const splitter = new RegExp(`${BOUNDARY}(${all.join("|")})${COLON}`, "giu");
  const matchers = entries
    .sort((a, b) => b.source.length - a.source.length)
    .map(({ field, source }) => ({ field, re: new RegExp(`^\\s*(?:${source})${COLON}\\s*(.*)$`, "iu") }));
  const anyLabel = new RegExp(`^\\s*(?:${all.join("|")})${COLON}`, "iu");
  return { splitter, matchers, anyLabel };
}

const compiled = new Map<DocKind, ReturnType<typeof compileSpec>>();
function specFor(kind: DocKind) {
  let c = compiled.get(kind);
  if (!c) {
    c = compileSpec(kind);
    compiled.set(kind, c);
  }
  return c;
}

/** Lee campos de un documento buscando etiquetas conocidas ("Gross Weight:", "Puerto de carga:", etc.). */
export function extractFieldsHeuristic<K extends DocKind>(kind: K, text: string): DocFieldsByKind[K] {
  const { splitter, matchers, anyLabel } = specFor(kind);
  const lines = text
    .replace(/\r\n?/g, "\n")
    .replace(splitter, (m) => `\n${m}`)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const isFree = (j: number) => j < lines.length && !anyLabel.test(lines[j]);
  const raw: Record<string, string> = {};
  for (let i = 0; i < lines.length; i++) {
    for (const { field, re } of matchers) {
      const m = lines[i].match(re);
      if (!m) continue;
      let value = m[1].trim();
      let next = i + 1;
      if (!value && isFree(next)) value = lines[next++];
      // Las descripciones largas siguen en las líneas de abajo.
      if (field === "description") {
        for (let extra = 0; extra < 2 && isFree(next); extra++) value += ` ${lines[next++]}`;
      }
      if (value && raw[field] === undefined) raw[field] = value;
      break;
    }
  }

  if (kind === "invoice") {
    if (!raw.currency) {
      const source = raw.totalAmount ?? raw.unitPrice ?? text;
      const currency = normalizeCurrency(source.match(/US\$|U\$S|\b(?:USD|EUR|CNY|RMB|BRL|ARS)\b/i)?.[0] ?? null);
      if (currency) raw.currency = currency;
    }
    if (!raw.incoterm) {
      const line = text.split(/\r?\n/).find((l) => new RegExp(`\\b(${INCOTERMS.join("|")})\\b`).test(l));
      if (line) {
        const { incoterm, incotermPlace } = splitIncoterm(line);
        if (incoterm) {
          raw.incoterm = incoterm;
          if (incotermPlace) raw.incotermPlace = incotermPlace;
        }
      }
    }
  }

  return coerceFields(kind, raw);
}
