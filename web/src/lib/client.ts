import type { Operation } from "./domain";

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Error ${res.status}`);
  return body as T;
}

export function postJson<T>(url: string, data: unknown): Promise<T> {
  return api<T>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
}

export type OperationResponse = { operation: Operation };

export function shortHash(hash: string | null | undefined, size = 6): string {
  if (!hash) return "—";
  const head = hash.startsWith("0x") ? size + 2 : size;
  return `${hash.slice(0, head)}…${hash.slice(-size)}`;
}
