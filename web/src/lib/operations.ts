import { ChainError, docsHashOf, explainChainError, fundDeal, refundDeal, releaseDeal } from "./chain";
import {
  DOC_LABELS,
  FIELD_LABELS,
  type DocFieldsByKind,
  type DocKind,
  type EscrowAction,
  type Operation,
  type StoredDoc,
} from "./domain";
import { ACCEPTED_TYPES, extractDocument } from "./extract";
import { coerceFields } from "./extract/coerce";
import { verify, type DocsToVerify } from "./rules";
import { generateSamples, SAMPLE_SETS, type SampleSet } from "./samples";
import { addEvent, getOperation, NotFoundError, saveUpload, updateOperation } from "./store";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const STALE_PENDING_MS = 5 * 60_000;

export class UserError extends Error {}

async function mustGet(id: string): Promise<Operation> {
  const op = await getOperation(id);
  if (!op) throw new NotFoundError(id);
  return op;
}

export async function attachDocument(
  id: string,
  kind: DocKind,
  file: { name: string; type: string; bytes: Uint8Array },
  simulated = false,
): Promise<Operation> {
  if (!ACCEPTED_TYPES.includes(file.type)) throw new UserError("Subí un PDF o una imagen (PNG, JPG o WebP).");
  if (file.bytes.byteLength > MAX_UPLOAD_BYTES) throw new UserError("El archivo supera los 10 MB.");
  await mustGet(id);

  let extraction;
  try {
    extraction = await extractDocument(kind, file.bytes, file.type);
  } catch (err) {
    throw new UserError((err as Error).message);
  }
  const { storedAs, sha256 } = await saveUpload(id, kind, file.type, file.bytes);

  return updateOperation(id, (op) => {
    const doc: StoredDoc = {
      kind,
      fileName: file.name.slice(0, 120),
      storedAs,
      mimeType: file.type,
      sha256,
      uploadedAt: new Date().toISOString(),
      extractedBy: extraction.extractedBy,
      simulated,
      fields: extraction.fields,
      editedFields: [],
      notes: extraction.notes,
      textPreview: extraction.textPreview,
    };
    (op.documents as Record<DocKind, StoredDoc>)[kind] = doc;
    op.verification = undefined;
    const reader = extraction.extractedBy === "ia" ? "con IA" : "por reglas";
    addEvent(op, `${DOC_LABELS[kind]}: documento ${simulated ? "simulado" : "subido"} (${file.name}), leído ${reader}.`);
  });
}

export async function attachSamples(id: string, set: SampleSet): Promise<Operation> {
  const op = await mustGet(id);
  const samples = await generateSamples(op.po, set);
  let latest = op;
  for (const s of samples) {
    latest = await attachDocument(id, s.kind, { name: s.fileName, type: "application/pdf", bytes: s.bytes }, true);
  }
  return updateOperation(latest.id, (o) => addEvent(o, `Se simuló el envío del proveedor: ${SAMPLE_SETS[set].label.toLowerCase()}.`));
}

export async function correctFields(id: string, kind: DocKind, patch: Record<string, unknown>): Promise<Operation> {
  return updateOperation(id, (op) => {
    const doc = op.documents[kind] as StoredDoc | undefined;
    if (!doc) throw new UserError(`Todavía no se cargó: ${DOC_LABELS[kind]}.`);
    const allowed = Object.keys(FIELD_LABELS[kind]);
    const clean = Object.fromEntries(Object.entries(patch).filter(([k]) => allowed.includes(k)));
    const before = doc.fields as unknown as Record<string, unknown>;
    const next = coerceFields(kind, { ...before, ...clean }) as unknown as Record<string, unknown>;
    const changed = allowed.filter((k) => JSON.stringify(next[k]) !== JSON.stringify(before[k]));
    if (changed.length === 0) return;
    doc.fields = next as unknown as DocFieldsByKind[typeof kind];
    doc.editedFields = Array.from(new Set([...doc.editedFields, ...changed]));
    op.verification = undefined;
    const labels = changed.map((k) => (FIELD_LABELS[kind] as Record<string, string>)[k].toLowerCase());
    addEvent(op, `${DOC_LABELS[kind]}: se corrigió a mano ${labels.join(", ")}.`);
  });
}

function docsOf(op: Operation): DocsToVerify {
  return {
    invoice: op.documents.invoice?.fields,
    packingList: op.documents.packingList?.fields,
    billOfLading: op.documents.billOfLading?.fields,
  };
}

function isBusy(op: Operation): boolean {
  const p = op.escrow.pending;
  return !!p && Date.now() - Date.parse(p.since) < STALE_PENDING_MS;
}

/** Marca la acción en curso para que un doble clic no mande dos transacciones. */
async function claim(id: string, action: EscrowAction, guard: (op: Operation) => void): Promise<Operation> {
  return updateOperation(id, (op) => {
    if (isBusy(op)) throw new UserError("Ya hay una transacción en curso para esta operación. Esperá a que confirme.");
    guard(op);
    op.escrow.pending = { action, since: new Date().toISOString() };
    op.escrow.lastError = undefined;
  });
}

async function fail(id: string, err: unknown, what: string): Promise<Operation> {
  const message = explainChainError(err);
  return updateOperation(id, (op) => {
    op.escrow.pending = undefined;
    op.escrow.lastError = message;
    addEvent(op, `${what}: ${message}`);
  });
}

async function releaseIfReady(id: string): Promise<Operation> {
  let ready = false;
  const op = await updateOperation(id, (o) => {
    ready = o.verification?.verdict === "conforme" && o.escrow.status === "en-custodia" && !isBusy(o);
    if (ready) {
      o.escrow.pending = { action: "release", since: new Date().toISOString() };
      o.escrow.lastError = undefined;
    }
  });
  if (!ready) return op;

  try {
    const docsHash = docsHashOf(op);
    const { network, releaseTx } = await releaseDeal(op, docsHash);
    return updateOperation(id, (o) => {
      Object.assign(o.escrow, { status: "liberado", network, releaseTx, docsHash, pending: undefined });
      addEvent(o, "Documentos conformes: el contrato liberó el pago al proveedor y registró la huella de los documentos.");
    });
  } catch (err) {
    return fail(id, err, "No se pudo liberar el pago");
  }
}

export async function runVerification(id: string): Promise<Operation> {
  await updateOperation(id, (op) => {
    const result = verify(op.po, docsOf(op));
    op.verification = result;
    const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
    const summary =
      result.verdict === "conforme"
        ? "Resultado de la revisión: documentos conformes."
        : result.verdict === "incompleto"
          ? "Faltan documentos para revisar."
          : `Resultado de la revisión: ${plural(result.errors, "discrepancia", "discrepancias")}${
              result.warnings > 0 ? ` y ${plural(result.warnings, "advertencia", "advertencias")}` : ""
            }.`;
    addEvent(op, summary);
  });
  return releaseIfReady(id);
}

export async function fundOperation(id: string): Promise<Operation> {
  const op = await claim(id, "fund", (o) => {
    if (o.escrow.status !== "sin-fondos") throw new UserError("El pago de esta operación ya se depositó.");
  });
  try {
    const result = await fundDeal(op);
    await updateOperation(id, (o) => {
      Object.assign(o.escrow, { status: "en-custodia", ...result, pending: undefined });
      addEvent(o, `Pago protegido: el importador depositó ${o.po.currency} ${o.po.amount.toLocaleString("es-AR")} en el contrato.`);
    });
  } catch (err) {
    return fail(id, err, "No se pudo depositar el pago");
  }
  return releaseIfReady(id);
}

export async function refundOperation(id: string): Promise<Operation> {
  const op = await claim(id, "refund", (o) => {
    if (o.escrow.status !== "en-custodia") throw new UserError("No hay fondos depositados para devolver.");
  });
  try {
    const { network, refundTx } = await refundDeal(op);
    return updateOperation(id, (o) => {
      Object.assign(o.escrow, { status: "devuelto", network, refundTx, pending: undefined });
      addEvent(o, "Se devolvieron los fondos al importador.");
    });
  } catch (err) {
    return fail(id, err, "No se pudo devolver el depósito");
  }
}

export { ChainError, NotFoundError };
