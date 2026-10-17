/**
 * Recorre la demo completa contra el servidor que está corriendo:
 * orden de compra -> depósito -> documentos con errores -> observado -> documentos correctos -> conforme y pago.
 *
 *   npx tsx scripts/smoke.ts [http://localhost:3000]
 */
import type { Operation } from "../src/lib/domain";
import { demoPurchaseOrder } from "../src/lib/samples";

const BASE = process.argv[2] ?? "http://localhost:3000";

async function call(path: string, body?: unknown): Promise<Operation> {
  const res = await fetch(`${BASE}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${path}: ${res.status} ${json.error}`);
  return json.operation;
}

function expect(condition: boolean, message: string) {
  if (!condition) throw new Error(`Falló: ${message}`);
  console.log(`  ok  ${message}`);
}

async function main() {
  console.log(`Demo contra ${BASE}`);
  let op = await call("/api/operations", demoPurchaseOrder());
  console.log(`Operación ${op.id}`);

  op = await call(`/api/operations/${op.id}/escrow`, { action: "fund" });
  expect(op.escrow.status === "en-custodia", `fondos en custodia (tx ${op.escrow.fundTx})`);

  op = await call(`/api/operations/${op.id}/samples`, { set: "con-errores" });
  op = await call(`/api/operations/${op.id}/verify`, {});
  const errors = op.verification!.checks.filter((c) => c.status === "error").map((c) => c.id);
  expect(op.verification!.verdict === "observado", `dictamen observado: ${errors.join(", ")}`);
  expect(op.escrow.status === "en-custodia", "el pago sigue retenido");

  op = await call(`/api/operations/${op.id}/samples`, { set: "conforme" });
  op = await call(`/api/operations/${op.id}/verify`, {});
  expect(op.verification!.verdict === "conforme", "dictamen conforme");
  expect(op.escrow.status === "liberado", `pago liberado (tx ${op.escrow.releaseTx})`);
  expect(!!op.escrow.docsHash, `huella registrada ${op.escrow.docsHash}`);

  const chain = await (await fetch(`${BASE}/api/chain`)).json();
  console.log("Saldos:", chain.balances);
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
