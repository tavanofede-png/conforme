import { DATE_FIELDS, NUMERIC_FIELDS, emptyFields, type DocFieldsByKind, type DocKind } from "../domain";
import { formatNcm, normalizeCurrency, parseDate, parseNumber } from "../normalize";

export const INCOTERMS = ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"];
const INCOTERM_RE = new RegExp(`\\b(${INCOTERMS.join("|")})\\b[\\s,.-]*(.*)$`, "i");

export function splitIncoterm(raw: string): { incoterm: string | null; incotermPlace: string | null } {
  const m = raw.match(INCOTERM_RE);
  if (!m) return { incoterm: null, incotermPlace: null };
  const place = m[2].replace(/\b(incoterms?|2020|2010)\b/gi, "").replace(/[\s,.;-]+$/, "").trim();
  return { incoterm: m[1].toUpperCase(), incotermPlace: place || null };
}

function cleanText(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).replace(/\s+/g, " ").replace(/^[\s:;,.-]+|[\s:;,-]+$/g, "").trim();
  return s.length ? s : null;
}

/** Normaliza lo que venga del parser o del modelo al formato de cada campo. */
export function coerceFields<K extends DocKind>(kind: K, raw: Record<string, unknown>): DocFieldsByKind[K] {
  const out = emptyFields(kind) as unknown as Record<string, unknown>;
  for (const key of Object.keys(out)) {
    const value = raw[key];
    if (value == null || value === "") continue;
    if (NUMERIC_FIELDS.has(key)) out[key] = parseNumber(value);
    else if (DATE_FIELDS.has(key)) out[key] = parseDate(String(value));
    else if (key === "currency") out[key] = normalizeCurrency(String(value));
    else if (key === "hsCode") out[key] = cleanText(formatNcm(String(value).replace(/[^\d.\s]/g, "").trim()));
    else if (key === "incoterm") {
      const { incoterm, incotermPlace } = splitIncoterm(String(value));
      out[key] = incoterm;
      if (incotermPlace && raw.incotermPlace == null) out.incotermPlace = incotermPlace;
    } else out[key] = cleanText(value);
  }
  return out as unknown as DocFieldsByKind[K];
}
