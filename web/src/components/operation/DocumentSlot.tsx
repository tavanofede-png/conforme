"use client";

import { CaretDownIcon, CircleNotchIcon } from "@phosphor-icons/react";
import { useRef, useState, type DragEvent } from "react";
import type { FieldFlags } from "@/lib/check-fields";
import { shortHash } from "@/lib/client";
import { DATE_FIELDS, DOC_LABELS, FIELD_LABELS, NUMERIC_FIELDS, type DocKind, type StoredDoc } from "@/lib/domain";
import { formatDate, formatNumber } from "@/lib/normalize";

const DOC_HINTS: Record<DocKind, string> = {
  invoice: "La emite el proveedor. Precio, cantidad, Incoterm y posición arancelaria.",
  packingList: "Bultos y pesos. Tiene que coincidir con la factura y el BL.",
  billOfLading: "Lo emite la naviera. Prueba el embarque y a quién se entrega la mercadería.",
};

/** Los datos que mejor resumen cada documento, en el orden en que se leen. */
const KEY_FACTS: Record<DocKind, string[]> = {
  invoice: ["totalAmount", "quantity", "hsCode", "incoterm"],
  packingList: ["quantity", "packages", "netWeightKg", "grossWeightKg"],
  billOfLading: ["portOfLoading", "portOfDischarge", "shippedOnBoardDate", "grossWeightKg"],
};

const FACT_LABELS: Record<string, string> = {
  totalAmount: "Importe",
  quantity: "Cantidad",
  hsCode: "NCM",
  incoterm: "Incoterm",
  packages: "Bultos",
  netWeightKg: "Peso neto",
  grossWeightKg: "Peso bruto",
  portOfLoading: "Carga",
  portOfDischarge: "Descarga",
  shippedOnBoardDate: "A bordo",
};

const ACCEPT = "application/pdf,image/png,image/jpeg,image/webp";

function display(key: string, value: unknown): string {
  if (value == null || value === "") return "—";
  if (NUMERIC_FIELDS.has(key) && typeof value === "number") {
    return formatNumber(value, key === "unitPrice" ? 4 : Number.isInteger(value) ? 0 : 2);
  }
  if (DATE_FIELDS.has(key) && typeof value === "string") return formatDate(value);
  return String(value);
}

function factValue(key: string, fields: Record<string, unknown>): string {
  if (key === "totalAmount" && fields.totalAmount != null) {
    return `${fields.currency ?? ""} ${display(key, fields.totalAmount)}`.trim();
  }
  if (key === "incoterm" && fields.incoterm) return `${fields.incoterm} ${fields.incotermPlace ?? ""}`.trim();
  if ((key === "grossWeightKg" || key === "netWeightKg") && fields[key] != null) return `${display(key, fields[key])} kg`;
  return display(key, fields[key]);
}

const FLAG_TEXT = { error: "text-bad font-semibold", warning: "text-warn" } as const;
const FLAG_ROW = { error: "bg-bad-soft", warning: "bg-warn-soft" } as const;

export function DocumentSlot({
  kind,
  doc,
  operationId,
  flags,
  busy,
  locked,
  onUpload,
  onSave,
}: {
  kind: DocKind;
  doc: StoredDoc | undefined;
  operationId: string;
  flags: FieldFlags;
  busy: string | null;
  locked: boolean;
  onUpload: (file: File) => void;
  onSave: (fields: Record<string, string>) => Promise<boolean>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [editing, setEditing] = useState<Record<string, string> | null>(null);
  const [expanded, setExpanded] = useState<boolean | null>(null);
  const uploading = busy === `upload:${kind}`;
  const saving = busy === `save:${kind}`;
  const labels = FIELD_LABELS[kind] as Record<string, string>;
  const fields = (doc?.fields ?? {}) as unknown as Record<string, unknown>;
  const problems = Object.values(flags).filter((f) => f === "error").length;
  const open = expanded ?? problems > 0;
  const read = Object.keys(labels).filter((k) => fields[k] != null).length;

  function pick(files: FileList | null) {
    const file = files?.[0];
    if (file) onUpload(file);
    if (input.current) input.current.value = "";
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (!locked) pick(e.dataTransfer.files);
  }

  function startEdit() {
    setEditing(Object.fromEntries(Object.keys(labels).map((k) => [k, fields[k] == null ? "" : String(fields[k])])));
  }

  async function save() {
    if (editing && (await onSave(editing))) setEditing(null);
  }

  return (
    <article
      className={`-mx-3 rounded-md px-3 py-5 transition-colors ${dragging ? "dropzone" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!locked) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <input ref={input} type="file" accept={ACCEPT} className="hidden" onChange={(e) => pick(e.target.files)} />

      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 className="font-medium">{DOC_LABELS[kind]}</h3>
          {doc ? (
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
              <a
                href={`/api/operations/${operationId}/documents/${kind}`}
                target="_blank"
                rel="noreferrer"
                className="max-w-[18rem] truncate font-mono text-ink-2 hover:text-ink hover:underline"
              >
                {doc.fileName}
              </a>
              <span>· {doc.extractedBy === "ia" ? "leído con IA" : "leído por reglas"}</span>
              {doc.simulated && <span>· simulado</span>}
            </p>
          ) : (
            <p className="mt-0.5 text-sm text-muted">{DOC_HINTS[kind]}</p>
          )}
        </div>

        <div className="flex items-center gap-1">
          {problems > 0 && !editing && (
            <span className="mr-2 text-xs font-medium text-bad">
              {problems} {problems === 1 ? "dato con discrepancia" : "datos con discrepancias"}
            </span>
          )}
          {doc && !editing && !locked && (
            <>
              <button className="btn btn-ghost btn-sm" onClick={startEdit} disabled={!!busy}>
                Corregir
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => input.current?.click()} disabled={!!busy}>
                {uploading && <CircleNotchIcon size={14} className="animate-spin" />}
                Reemplazar
              </button>
            </>
          )}
          {!doc && (
            <button className="btn btn-secondary btn-sm" onClick={() => input.current?.click()} disabled={!!busy || locked}>
              {uploading && <CircleNotchIcon size={14} className="animate-spin" />}
              {uploading ? "Leyendo…" : "Subir PDF"}
            </button>
          )}
        </div>
      </header>

      {doc && !editing && (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            {KEY_FACTS[kind].map((key) => {
              const flag = flags[key] ?? (key === "incoterm" ? flags.incotermPlace : undefined);
              return (
                <div key={key} className="min-w-0">
                  <dt className="text-xs text-muted">{FACT_LABELS[key]}</dt>
                  <dd
                    className={`mt-0.5 truncate text-sm tabular-nums ${flag ? FLAG_TEXT[flag] : ""} ${
                      NUMERIC_FIELDS.has(key) || key === "hsCode" || key === "totalAmount" ? "font-mono" : ""
                    }`}
                    title={factValue(key, fields)}
                  >
                    {factValue(key, fields)}
                    {flag === "error" && <span className="sr-only"> (con discrepancia)</span>}
                  </dd>
                </div>
              );
            })}
          </dl>

          <button
            type="button"
            onClick={() => setExpanded(!open)}
            aria-expanded={open}
            className="mt-4 inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink"
          >
            {open ? "Ocultar" : "Ver"} los {read} datos leídos
            <CaretDownIcon size={13} className={`transition-transform ${open ? "rotate-180" : ""}`} />
          </button>

          {open && (
            <div className="mt-3 border-t border-line pt-3">
              <dl className="grid gap-x-8 sm:grid-cols-2">
                {Object.keys(labels).map((key) => {
                  const flag = flags[key];
                  const edited = doc.editedFields.includes(key);
                  const value = fields[key];
                  return (
                    <div
                      key={key}
                      className={`-mx-2 flex items-baseline justify-between gap-3 rounded px-2 py-1.5 ${flag ? FLAG_ROW[flag] : ""}`}
                    >
                      <dt className="shrink-0 text-xs text-muted">{labels[key]}</dt>
                      <dd
                        className={`min-w-0 text-right text-[13px] break-words ${NUMERIC_FIELDS.has(key) || key === "hsCode" ? "font-mono tabular-nums" : ""} ${
                          value == null ? "text-muted" : ""
                        } ${flag === "error" ? "font-semibold text-bad" : ""}`}
                      >
                        {display(key, value)}
                        {edited && <span className="ml-1.5 align-middle font-sans text-[10px] font-medium text-warn">corregido</span>}
                      </dd>
                    </div>
                  );
                })}
              </dl>
              <p className="mt-3 text-[11px] text-muted">
                Huella SHA-256 <span className="font-mono text-ink-2">{shortHash(doc.sha256, 8)}</span>
                {doc.notes.length > 0 && <span className="text-warn"> · {doc.notes.join(" ")}</span>}
              </p>
            </div>
          )}
        </>
      )}

      {doc && editing && (
        <div className="mt-4 border-t border-line pt-4">
          <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
            {Object.keys(labels).map((key) => (
              <label key={key} className="block">
                <span className="label">{labels[key]}</span>
                <input
                  className={`field ${NUMERIC_FIELDS.has(key) || key === "hsCode" ? "font-mono" : ""}`}
                  aria-invalid={flags[key] === "error" ? true : undefined}
                  type={DATE_FIELDS.has(key) ? "date" : "text"}
                  inputMode={NUMERIC_FIELDS.has(key) ? "decimal" : undefined}
                  value={editing[key] ?? ""}
                  onChange={(e) => setEditing((prev) => ({ ...prev!, [key]: e.target.value }))}
                />
              </label>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted">Las correcciones quedan en el historial de la operación.</p>
            <div className="flex gap-2">
              <button className="btn btn-secondary" onClick={() => setEditing(null)} disabled={saving}>
                Cancelar
              </button>
              <button className="btn btn-dark" onClick={save} disabled={saving}>
                {saving && <CircleNotchIcon size={15} className="animate-spin" />}
                {saving ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
