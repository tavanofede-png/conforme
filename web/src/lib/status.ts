import { DOC_KINDS, type Operation } from "./domain";

export type Tone = "ok" | "bad" | "neutral";

export function documentCount(op: Operation): number {
  return DOC_KINDS.filter((k) => op.documents[k]).length;
}

/** Estado de la operación en pocas palabras, para listados y encabezados. */
export function operationStatus(op: Operation): { label: string; tone: Tone } {
  if (op.escrow.status === "liberado") return { label: "Pago liberado", tone: "ok" };
  if (op.escrow.status === "devuelto") return { label: "Cancelada", tone: "neutral" };
  if (op.verification?.verdict === "observado") return { label: "Con discrepancias", tone: "bad" };
  if (op.verification?.verdict === "conforme") return { label: "Documentos conformes", tone: "ok" };
  if (op.escrow.status === "en-custodia") {
    return { label: documentCount(op) === 3 ? "Lista para revisar" : "Esperando documentos", tone: "neutral" };
  }
  return { label: "Falta depositar", tone: "neutral" };
}

export type StepState = "done" | "current" | "blocked" | "todo";

export interface Step {
  key: "po" | "escrow" | "docs" | "verdict" | "payment";
  label: string;
  detail: string;
  state: StepState;
}

/** Las cinco etapas de una operación, con la que toca ahora marcada como actual. */
export function operationSteps(op: Operation): Step[] {
  const funded = op.escrow.status !== "sin-fondos";
  const docs = documentCount(op);
  const verdict = op.verification?.verdict;
  const released = op.escrow.status === "liberado";
  const refunded = op.escrow.status === "devuelto";

  const list: (Omit<Step, "state"> & { done: boolean; blocked?: boolean })[] = [
    { key: "po", label: "Orden de compra", detail: "Cargada", done: true },
    {
      key: "escrow",
      label: "Pago protegido",
      detail: funded ? (refunded ? "Devuelto" : "Depositado") : "Falta depositar",
      done: funded,
    },
    { key: "docs", label: "Documentos", detail: `${docs} de 3`, done: docs === 3 },
    {
      key: "verdict",
      label: "Revisión",
      detail: verdict === "conforme" ? "Conforme" : verdict === "observado" ? "Con discrepancias" : "Pendiente",
      done: verdict === "conforme",
      blocked: verdict === "observado",
    },
    {
      key: "payment",
      label: "Pago al proveedor",
      detail: released ? "Liberado" : refunded ? "Cancelado" : "Pendiente",
      done: released,
      blocked: refunded,
    },
  ];

  let currentAssigned = false;
  return list.map(({ done, blocked, ...s }) => {
    if (done) return { ...s, state: "done" };
    if (blocked) {
      currentAssigned = true;
      return { ...s, state: "blocked" };
    }
    if (!currentAssigned) {
      currentAssigned = true;
      return { ...s, state: "current" };
    }
    return { ...s, state: "todo" };
  });
}
