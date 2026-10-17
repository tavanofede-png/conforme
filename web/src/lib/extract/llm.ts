import type { DocFieldsByKind, DocKind } from "../domain";
import { coerceFields } from "./coerce";

const FIELD_HINTS: { [K in DocKind]: Record<keyof DocFieldsByKind[K], string> } = {
  invoice: {
    invoiceNumber: "invoice number",
    date: "invoice date, YYYY-MM-DD",
    seller: "seller / exporter company name only (no address)",
    buyer: "buyer / importer company name only (no address)",
    description: "description of goods as written",
    hsCode: "HS / NCM tariff code as written",
    quantity: "total quantity of goods, plain number",
    unitPrice: "unit price, plain number",
    totalAmount: "invoice total amount, plain number",
    currency: "ISO 4217 currency code, e.g. USD",
    incoterm: "Incoterms 2020 three-letter rule, e.g. FOB",
    incotermPlace: "named place of the Incoterm, e.g. Ningbo",
  },
  packingList: {
    invoiceNumber: "referenced invoice number",
    seller: "seller / exporter company name only",
    buyer: "buyer / importer company name only",
    description: "description of goods as written",
    quantity: "total quantity of goods, plain number",
    packages: "total number of packages / cartons, integer",
    netWeightKg: "total net weight in kg, plain number",
    grossWeightKg: "total gross weight in kg, plain number",
  },
  billOfLading: {
    blNumber: "bill of lading number",
    shipper: "shipper company name only",
    consignee: "consignee as written (company name, or 'TO ORDER')",
    vessel: "vessel name and voyage",
    portOfLoading: "port of loading",
    portOfDischarge: "port of discharge",
    shippedOnBoardDate: "shipped on board date, YYYY-MM-DD",
    description: "description of goods as written",
    hsCode: "HS code as written",
    packages: "number of packages, integer",
    grossWeightKg: "gross weight in kg, plain number",
  },
};

const DOC_NAMES: Record<DocKind, string> = {
  invoice: "commercial invoice",
  packingList: "packing list",
  billOfLading: "ocean bill of lading",
};

export function llmConfig() {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: (process.env.LLM_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, ""),
    model: process.env.LLM_MODEL ?? "gpt-4o-mini",
  };
}

export async function extractFieldsLlm<K extends DocKind>(
  kind: K,
  input: { text?: string; imageDataUrl?: string },
): Promise<DocFieldsByKind[K]> {
  const config = llmConfig();
  if (!config) throw new Error("LLM_API_KEY no está configurada");

  const hints = Object.entries(FIELD_HINTS[kind])
    .map(([key, hint]) => `- "${key}": ${hint}`)
    .join("\n");
  const instructions =
    `Extract data from this ${DOC_NAMES[kind]}. Reply with a single JSON object with exactly these keys:\n${hints}\n` +
    "Use null when a value is not in the document. Never guess or compute values that are not printed.";

  const content = input.imageDataUrl
    ? [
        { type: "text", text: instructions },
        { type: "image_url", image_url: { url: input.imageDataUrl } },
      ]
    : `${instructions}\n\nDocument text:\n"""\n${(input.text ?? "").slice(0, 20_000)}\n"""`;

  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You are a meticulous trade-finance document checker. You only output JSON." },
        { role: "user", content },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) throw new Error(`El modelo respondió ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) throw new Error("El modelo no devolvió contenido");
  return coerceFields(kind, JSON.parse(raw) as Record<string, unknown>);
}
