import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { needsInsurance, needsSanitary, type DocKind, type PurchaseOrder } from "./domain";
import { addDays, daysBetween, digitsOnly, formatNcm, stripAccents } from "./normalize";
import { todayIso } from "./rules";

export type SampleSet = "conforme" | "con-errores";

export const SAMPLE_SETS: Record<SampleSet, { label: string; description: string }> = {
  conforme: {
    label: "Documentos sin discrepancias",
    description: "Un juego que coincide con la orden de compra.",
  },
  "con-errores": {
    label: "Documentos con discrepancias",
    description: "El peso del BL no coincide con el packing list, la factura trae otra posición arancelaria y el barco descarga en otro puerto.",
  },
};

export interface ExampleCase {
  id: string;
  title: string;
  origin: string;
  build: (today: string) => PurchaseOrder;
}

/** Casos de importación de pymes argentinas para probar el circuito sin cargar todo a mano. */
export const EXAMPLES: ExampleCase[] = [
  {
    id: "neumaticos",
    title: "Neumáticos de bicicleta",
    origin: "China",
    build: (today) => ({
      buyerName: "Rodados del Litoral S.A.",
      sellerName: "Ningbo Speedcycle Rubber Co., Ltd.",
      goodsDescription: "Neumáticos para bicicleta rodado 29 (29 x 2.10)",
      goodsKeywords: ["neumático/tyre/tire/cubierta", "bicicleta/bicycle", "29"],
      hsCode: "4011.50.00",
      quantity: 20_000,
      unit: "unidades",
      packages: 800,
      grossWeightKg: 18_400,
      incoterm: "FOB",
      incotermPlace: "Ningbo",
      portOfLoading: "Ningbo",
      portOfDischarge: "Buenos Aires",
      latestShipmentDate: addDays(today, 20),
      amount: 24_000,
      currency: "USD",
      quantityTolerancePct: 0,
      weightTolerancePct: 5,
    }),
  },
  {
    id: "valvulas",
    title: "Válvulas hidráulicas",
    origin: "Italia",
    build: (today) => ({
      buyerName: "Hidráulica Pampeana S.R.L.",
      sellerName: "Oleodinamica Bresciana S.r.l.",
      goodsDescription: "Válvulas direccionales hidráulicas de 3/8 pulgada",
      goodsKeywords: ["válvula/valve", "hidráulica/hydraulic"],
      hsCode: "8481.20.90",
      quantity: 1_200,
      unit: "unidades",
      packages: 60,
      grossWeightKg: 4_350,
      incoterm: "CIF",
      incotermPlace: "Buenos Aires",
      portOfLoading: "Génova",
      portOfDischarge: "Buenos Aires",
      latestShipmentDate: addDays(today, 25),
      amount: 93_600,
      currency: "USD",
      quantityTolerancePct: 0,
      weightTolerancePct: 5,
    }),
  },
  {
    id: "denim",
    title: "Tela denim",
    origin: "Vietnam",
    build: (today) => ({
      buyerName: "Textil del Oeste S.R.L.",
      sellerName: "Saigon Denim Mills Co., Ltd.",
      goodsDescription: "Tejido denim 100% algodón, 12 onzas, ancho 150 cm",
      goodsKeywords: ["denim/mezclilla", "algodón/cotton"],
      hsCode: "5209.42.00",
      quantity: 36_000,
      unit: "metros",
      packages: 300,
      grossWeightKg: 14_200,
      incoterm: "CFR",
      incotermPlace: "Buenos Aires",
      portOfLoading: "Ho Chi Minh",
      portOfDischarge: "Buenos Aires",
      latestShipmentDate: addDays(today, 30),
      amount: 118_800,
      currency: "USD",
      quantityTolerancePct: 3,
      weightTolerancePct: 5,
    }),
  },
];

/** Orden de compra de la demo: una pyme de Santa Fe importa neumáticos de bicicleta desde China. */
export function demoPurchaseOrder(today: string = todayIso()): PurchaseOrder {
  return EXAMPLES[0].build(today);
}

export function exampleOrders(today: string = todayIso()) {
  return EXAMPLES.map(({ id, title, origin, build }) => ({ id, title, origin, po: build(today) }));
}

interface Origin {
  country: string;
  address: string;
  phone: string;
  carrier: string;
  vessel: string;
}

const ORIGINS: Record<string, Origin> = {
  ningbo: {
    country: "China",
    address: "No. 88 Binhai Road, Beilun District",
    phone: "+86 574 8000 0000",
    carrier: "PACIFIC BRIDGE LINES",
    vessel: "PACIFIC HARMONY / 2641E",
  },
  shanghai: {
    country: "China",
    address: "1200 Yanggao Road, Pudong",
    phone: "+86 21 6000 0000",
    carrier: "PACIFIC BRIDGE LINES",
    vessel: "PACIFIC HARMONY / 2641E",
  },
  genova: {
    country: "Italy",
    address: "Via Pionieri e Aviatori d'Italia 46",
    phone: "+39 010 600 0000",
    carrier: "MEDITERRANEAN BRIDGE LINES",
    vessel: "MARE AUSTRALE / 0412W",
  },
  "ho chi minh": {
    country: "Vietnam",
    address: "Lot C4, Tan Thuan Export Processing Zone, District 7",
    phone: "+84 28 3700 0000",
    carrier: "PACIFIC BRIDGE LINES",
    vessel: "MEKONG STAR / 1187S",
  },
};

const DESTINATION_COUNTRIES: Record<string, string> = {
  "buenos aires": "ARGENTINA",
  rosario: "ARGENTINA",
  zarate: "ARGENTINA",
  "bahia blanca": "ARGENTINA",
  montevideo: "URUGUAY",
  santos: "BRAZIL",
};

const UNITS_EN: Record<string, string> = { unidades: "PCS", unidad: "PCS", metros: "MTS", kg: "KGS", pares: "PAIRS" };

function lookup<T>(table: Record<string, T>, place: string): T | undefined {
  const key = stripAccents(place).toLowerCase();
  return Object.entries(table).find(([name]) => key.includes(name))?.[1];
}

/** Iniciales del vendedor para numerar la factura: "Saigon Denim Mills Co., Ltd." da "SDM". */
function sellerInitials(name: string): string {
  const words = stripAccents(name)
    .replace(/[^A-Za-z ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w && !/^(co|ltd|srl|sa|spa|inc|llc|gmbh|s|r|l)$/i.test(w));
  return words.slice(0, 3).map((w) => w[0].toUpperCase()).join("") || "INV";
}

type Row = [label: string, value: string];
interface SampleContent {
  kind: DocKind;
  fileName: string;
  title: string;
  issuer: string;
  issuerLines: string[];
  sections: { heading: string; rows: Row[] }[];
}

const en = (n: number, decimals = 0) =>
  n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const blDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d} ${MONTHS[+m - 1]} ${y}`;
};
const invoiceDateText = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${MONTHS[+m - 1]}. ${+d}, ${y}`;
};

/** Las fuentes estándar de PDF solo codifican WinAnsi: lo demás se translitera. */
const safe = (text: string) =>
  Array.from(text.normalize("NFC"))
    .map((ch) => (ch.charCodeAt(0) <= 0xff ? ch : stripAccents(ch).replace(/[^\x20-\x7e]/g, "?")))
    .join("");

function otherHsCode(hs: string): string {
  const d = digitsOnly(hs).padEnd(8, "0");
  const alt = d.slice(4, 6) === "90" ? "10" : "90";
  return formatNcm(`${d.slice(0, 4)}${alt}${d.slice(6, 8)}`);
}

function otherPort(port: string): string {
  return /montevideo/i.test(port) ? "SANTOS, BRAZIL" : "MONTEVIDEO, URUGUAY";
}

export function buildSampleContent(po: PurchaseOrder, set: SampleSet, today: string = todayIso()): SampleContent[] {
  const broken = set === "con-errores";
  const latest = po.latestShipmentDate;
  const onBoard = daysBetween(addDays(today, -3), addDays(latest, -2)) < 0 ? addDays(latest, -2) : addDays(today, -3);
  const invoiceDate = addDays(onBoard, -2);
  const invoiceNumber = `${sellerInitials(po.sellerName)}-${onBoard.slice(2, 4)}${onBoard.slice(5, 7)}-${String(Math.round(po.amount) % 10_000).padStart(4, "0")}`;
  const unitPrice = Math.round((po.amount / po.quantity) * 10_000) / 10_000;
  const total = Math.round(unitPrice * po.quantity * 100) / 100;
  const net = Math.round(po.grossWeightKg * 0.94);
  const blGross = broken ? po.grossWeightKg + 500 : po.grossWeightKg;
  const seller = po.sellerName.toUpperCase();
  const buyer = po.buyerName.toUpperCase();
  const description = po.goodsDescription.toUpperCase();
  const origin = lookup(ORIGINS, po.portOfLoading);
  const destination = lookup(DESTINATION_COUNTRIES, po.portOfDischarge);
  const issuerLines = origin
    ? [origin.address, `${po.portOfLoading}, ${origin.country}`, `Tel. ${origin.phone}`]
    : [po.portOfLoading];
  const carrier = origin?.carrier ?? "OCEAN BRIDGE LINES";
  const blPrefix = `${sellerInitials(carrier).slice(0, 3)}U`;
  const unit = UNITS_EN[stripAccents(po.unit).toLowerCase()] ?? po.unit.toUpperCase();
  const packaging = unit === "MTS" ? "ROLLS" : "CARTONS";
  const portOfLoading = [po.portOfLoading.toUpperCase(), origin?.country.toUpperCase()].filter(Boolean).join(", ");
  const portOfDischarge = [po.portOfDischarge.toUpperCase(), destination].filter(Boolean).join(", ");
  const tag = onBoard.replace(/-/g, "");

  return [
    {
      kind: "invoice",
      fileName: `factura-${invoiceNumber}.pdf`,
      title: "COMMERCIAL INVOICE",
      issuer: seller,
      issuerLines,
      sections: [
        {
          heading: "Invoice",
          rows: [
            ["Invoice No.", invoiceNumber],
            ["Invoice Date", invoiceDateText(invoiceDate)],
            ["Seller", seller],
            ["Buyer", buyer],
          ],
        },
        {
          heading: "Goods",
          rows: [
            ["Description of Goods", description],
            ["HS Code", broken ? otherHsCode(po.hsCode) : formatNcm(po.hsCode)],
            ["Quantity", `${en(po.quantity)} ${unit}`],
            ["Unit Price", `${po.currency} ${en(unitPrice, unitPrice < 10 ? 4 : 2)}`],
            ["Total Amount", `${po.currency} ${en(total, 2)}`],
            ["Incoterms 2020", `${po.incoterm} ${po.incotermPlace.toUpperCase()}`],
            ...(origin ? [["Country of Origin", origin.country.toUpperCase()] as Row] : []),
          ],
        },
      ],
    },
    {
      kind: "packingList",
      fileName: `packing-list-${invoiceNumber}.pdf`,
      title: "PACKING LIST",
      issuer: seller,
      issuerLines,
      sections: [
        {
          heading: "Reference",
          rows: [
            ["Invoice No.", invoiceNumber],
            ["Seller", seller],
            ["Buyer", buyer],
          ],
        },
        {
          heading: "Packing",
          rows: [
            ["Description of Goods", description],
            ["Quantity", `${en(po.quantity)} ${unit}`],
            ["Total Packages", `${en(po.packages)} ${packaging}`],
            ["Total Net Weight", `${en(net, 2)} KGS`],
            ["Total Gross Weight", `${en(po.grossWeightKg, 2)} KGS`],
          ],
        },
      ],
    },
    {
      kind: "billOfLading",
      fileName: `bl-${blPrefix}${tag}.pdf`,
      title: "BILL OF LADING",
      issuer: carrier,
      issuerLines: ["Ocean carrier", "Combined transport bill of lading", "Original"],
      sections: [
        {
          heading: "Parties",
          rows: [
            ["B/L No.", `${blPrefix}${tag}`],
            ["Shipper", seller],
            ["Consignee", buyer],
            ["Notify Party", "SAME AS CONSIGNEE"],
          ],
        },
        {
          heading: "Voyage",
          rows: [
            ["Vessel / Voyage", origin?.vessel ?? "OCEAN SPIRIT / 0101E"],
            ["Port of Loading", portOfLoading],
            ["Port of Discharge", broken ? otherPort(po.portOfDischarge) : portOfDischarge],
            ["Shipped on Board Date", blDate(onBoard)],
            ["Freight", ["EXW", "FCA", "FAS", "FOB"].includes(po.incoterm.toUpperCase()) ? "COLLECT" : "PREPAID"],
          ],
        },
        {
          heading: "Cargo",
          rows: [
            ["Description of Goods", `SAID TO CONTAIN: ${description}`],
            ["HS Code", formatNcm(po.hsCode).slice(0, 7)],
            ["Packages", `${en(po.packages)} ${packaging}`],
            ["Gross Weight", `${en(blGross, 2)} KGS`],
          ],
        },
      ],
    },
    {
      kind: "certificateOfOrigin",
      fileName: `origen-${invoiceNumber}.pdf`,
      title: "CERTIFICATE OF ORIGIN",
      issuer: seller,
      issuerLines,
      sections: [
        {
          heading: "Certificate",
          rows: [
            ["Certificate No.", `CO-${invoiceNumber}`],
            ["Exporter", seller],
            ["Importer", buyer],
            ["Invoice No.", invoiceNumber],
            ["Country of Origin", (origin?.country ?? po.portOfLoading).toUpperCase()],
          ],
        },
        {
          heading: "Goods",
          rows: [
            ["Description of Goods", description],
            ["HS Code", formatNcm(po.hsCode)],
          ],
        },
      ],
    },
    ...(needsInsurance(po)
      ? [
          {
            kind: "insurance" as const,
            fileName: `seguro-${invoiceNumber}.pdf`,
            title: "CARGO INSURANCE POLICY",
            issuer: "ATLANTIC CARGO UNDERWRITERS",
            issuerLines: ["Marine cargo policy", "Institute Cargo Clauses (A)"],
            sections: [
              {
                heading: "Policy",
                rows: [
                  ["Policy No.", `POL-${invoiceNumber}`],
                  ["Insured", buyer],
                  ["Invoice No.", invoiceNumber],
                  ["Sum Insured", `${po.currency} ${en(po.amount, 2)}`],
                  ["Currency", po.currency],
                  ["Coverage", "Institute Cargo Clauses (A), all risks"],
                ],
              },
              {
                heading: "Goods",
                rows: [["Description of Goods", description]],
              },
            ],
          } satisfies SampleContent,
        ]
      : []),
    ...(needsSanitary(po)
      ? [
          {
            kind: "sanitary" as const,
            fileName: `sanitario-${invoiceNumber}.pdf`,
            title: "SANITARY CERTIFICATE",
            issuer: "EXPORT HEALTH AUTHORITY",
            issuerLines: ["Official certificate", origin?.country ?? po.portOfLoading],
            sections: [
              {
                heading: "Certificate",
                rows: [
                  ["Certificate No.", `SAN-${invoiceNumber}`],
                  ["Exporter", seller],
                  ["Importer", buyer],
                  ["Authority", "Export Health Authority"],
                  ["Date of Issue", invoiceDateText(invoiceDate)],
                ],
              },
              {
                heading: "Goods",
                rows: [["Description of Goods", description]],
              },
            ],
          } satisfies SampleContent,
        ]
      : []),
  ];
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/)) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > width && current) {
      lines.push(current);
      current = word;
    } else current = next;
  }
  if (current) lines.push(current);
  return lines;
}

async function renderPdf(doc: SampleContent): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${doc.title} (demo)`);
  pdf.setCreator("Conforme");
  pdf.setProducer("Conforme");
  const page = pdf.addPage([595.28, 841.89]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.11, 0.11, 0.13);
  const muted = rgb(0.42, 0.42, 0.45);
  const left = 56;
  const valueX = 210;
  const right = 539;

  let y = 780;
  page.drawText(safe(doc.issuer), { x: left, y, size: 13, font: bold, color: ink });
  y -= 16;
  for (const line of doc.issuerLines) {
    page.drawText(safe(line), { x: left, y, size: 9, font: regular, color: muted });
    y -= 12;
  }
  y -= 22;
  page.drawText(doc.title, { x: left, y, size: 20, font: bold, color: ink });
  y -= 12;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 1.2, color: ink });
  y -= 26;

  for (const section of doc.sections) {
    page.drawText(section.heading.toUpperCase(), { x: left, y, size: 8, font: bold, color: muted });
    y -= 16;
    for (const [label, value] of section.rows) {
      page.drawText(`${label}:`, { x: left, y, size: 10, font: bold, color: ink });
      const lines = wrap(safe(value), regular, 10, right - valueX);
      lines.forEach((line, i) => page.drawText(line, { x: valueX, y: y - i * 13, size: 10, font: regular, color: ink }));
      y -= 13 * lines.length + 6;
    }
    y -= 8;
    page.drawLine({ start: { x: left, y: y + 6 }, end: { x: right, y: y + 6 }, thickness: 0.4, color: muted });
    y -= 14;
  }

  page.drawText(safe("Documento de demostración generado por Conforme. Sin validez comercial."), {
    x: left,
    y: 40,
    size: 8,
    font: regular,
    color: muted,
  });
  return pdf.save();
}

export async function generateSamples(
  po: PurchaseOrder,
  set: SampleSet,
  today: string = todayIso(),
): Promise<{ kind: DocKind; fileName: string; bytes: Uint8Array }[]> {
  const contents = buildSampleContent(po, set, today);
  return Promise.all(contents.map(async (c) => ({ kind: c.kind, fileName: c.fileName, bytes: await renderPdf(c) })));
}
