const MONTHS: Record<string, number> = {
  jan: 1, ene: 1, feb: 2, mar: 3, apr: 4, abr: 4, may: 5, jun: 6, jul: 7,
  aug: 8, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dec: 12, dic: 12,
};

/** Convierte "18,400.00", "18.400,00", "18400 KGS" o "USD 24,000" en número. */
export function parseNumber(input: unknown): number | null {
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  if (typeof input !== "string") return null;
  const match = input.match(/-?\d[\d.,\s]*/);
  if (!match) return null;
  let s = match[0].replace(/\s/g, "");
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");

  if (lastDot >= 0 && lastComma >= 0) {
    const decimalSep = lastDot > lastComma ? "." : ",";
    const thousandSep = decimalSep === "." ? "," : ".";
    s = s.split(thousandSep).join("").replace(decimalSep, ".");
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? "," : ".";
    const parts = s.split(sep);
    const groupsOfThree = parts.length > 1 && parts.slice(1).every((p) => p.length === 3);
    s = groupsOfThree ? parts.join("") : parts.slice(0, -1).join("") + "." + parts[parts.length - 1];
  }

  s = s.replace(/[.,]$/, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1) return null;
  return date.toISOString().slice(0, 10);
}

/** Acepta 2026-10-22, 22/10/2026 (día primero), 22 de octubre de 2026, 22 OCT 2026, OCT. 22, 2026 y 22-OCT-2026. */
export function parseDate(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const s = input.trim().toLowerCase();

  let m = s.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);

  m = s.match(/(\d{1,2})[-./](\d{1,2})[-./](\d{4})/);
  if (m) return iso(+m[3], +m[2], +m[1]);

  m = s.match(/(\d{1,2})\s+de\s+([a-z]{3})[a-z]*\s+(?:de\s+|del\s+)?(\d{4})/);
  if (m && MONTHS[m[2]]) return iso(+m[3], MONTHS[m[2]], +m[1]);

  m = s.match(/(\d{1,2})[\s-]+([a-z]{3})[a-z]*\.?[\s-]+(\d{4})/);
  if (m && MONTHS[m[2]]) return iso(+m[3], MONTHS[m[2]], +m[1]);

  m = s.match(/([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (m && MONTHS[m[1]]) return iso(+m[3], MONTHS[m[1]], +m[2]);

  return null;
}

/** "US$", "U$S", "usd" -> "USD"; "RMB" -> "CNY". */
export function normalizeCurrency(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.toUpperCase().replace(/\s/g, "");
  if (/US\$|U\$S|USD|DOLAR|DOLLAR/.test(s)) return "USD";
  if (/RMB|CNY|YUAN/.test(s)) return "CNY";
  if (/EUR|€/.test(s)) return "EUR";
  const code = s.match(/[A-Z]{3}/);
  return code ? code[0] : null;
}

export function digitsOnly(input: string | null | undefined): string {
  return (input ?? "").replace(/\D/g, "");
}

/** 40115000 -> 4011.50.00 */
export function formatNcm(input: string | null | undefined): string {
  const d = digitsOnly(input);
  if (d.length < 8) return input ?? "";
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}`;
}

export function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const CORPORATE_SUFFIXES = new Set([
  "sa", "srl", "sas", "sau", "saic", "ltd", "ltda", "limited", "co", "company", "inc", "corp",
  "corporation", "llc", "gmbh", "spa", "industrial", "trading", "imp", "exp",
]);

const COUNTRY_WORDS = new Set([
  "china", "prc", "argentina", "brasil", "brazil", "chile", "uruguay", "paraguay", "ar", "cn", "br",
]);

export function tokens(s: string | null | undefined): string[] {
  return stripAccents((s ?? "").toLowerCase())
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean);
}

export function companyTokens(s: string | null | undefined): string[] {
  return tokens(s).filter((t) => !CORPORATE_SUFFIXES.has(t));
}

export function placeTokens(s: string | null | undefined): string[] {
  return tokens(s).filter((t) => !COUNTRY_WORDS.has(t) && t !== "port" && t !== "puerto");
}

/** Proporción de tokens de `a` presentes en `b`, en el lado más corto. 1 = coinciden. */
export function overlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  const set = new Set(long);
  return short.filter((t) => set.has(t)).length / short.length;
}

export function sameCompany(a: string | null | undefined, b: string | null | undefined): number {
  return overlap(companyTokens(a), companyTokens(b));
}

export function samePlace(a: string | null | undefined, b: string | null | undefined): boolean {
  return overlap(placeTokens(a), placeTokens(b)) === 1;
}

export function keywordAlternatives(keyword: string): string[] {
  return keyword
    .split("/")
    .map((k) => stripAccents(k.trim().toLowerCase()))
    .filter(Boolean);
}

/** Devuelve las palabras clave (con sus alternativas) que no aparecen en el texto. */
export function missingKeywords(text: string | null | undefined, keywords: string[]): string[] {
  const haystack = ` ${tokens(text).join(" ")} `;
  return keywords.filter((kw) => {
    const alternatives = keywordAlternatives(kw);
    return !alternatives.some((alt) => {
      const needle = tokens(alt).join(" ");
      return needle && (haystack.includes(` ${needle} `) || haystack.includes(` ${needle}s `));
    });
  });
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function formatNumber(n: number | null | undefined, decimals = 0): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("es-AR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function formatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "—";
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}
