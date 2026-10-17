"use client";

import { CaretDownIcon } from "@phosphor-icons/react";
import type { Check, DocKind, Operation } from "@/lib/domain";

const STAMP: Record<string, { text: string; className: string }> = {
  conforme: { text: "Conforme", className: "text-brand" },
  observado: { text: "Observado", className: "text-ink-2" },
  incompleto: { text: "Incompleto", className: "text-muted" },
};

const SHORT_DOC: Record<DocKind, string> = {
  invoice: "Factura",
  packingList: "Packing list",
  billOfLading: "BL",
};

export function ReviewResult({ op }: { op: Operation }) {
  const result = op.verification;
  if (!result) return null;
  const errors = result.checks.filter((c) => c.status === "error");
  const warnings = result.checks.filter((c) => c.status === "warning");
  const ok = result.checks.filter((c) => c.status === "ok");
  const stamp = STAMP[result.verdict];
  const conforme = result.verdict === "conforme";
  const edited = Object.values(op.documents).flatMap((d) => (d && d.editedFields.length > 0 ? [SHORT_DOC[d.kind]] : []));
  const when = new Date(result.checkedAt).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "America/Argentina/Buenos_Aires",
  });

  return (
    <section aria-labelledby="revision">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <h2 id="revision" className="text-lg font-semibold tracking-tight">
            Resultado de la revisión
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            {when} · {ok.length} controles sin observaciones
            {warnings.length > 0 && `, ${warnings.length} ${warnings.length === 1 ? "advertencia" : "advertencias"}`}
          </p>
        </div>
        <div key={result.checkedAt} className="animate-stamp shrink-0 pt-1 pr-1">
          <span className={`stamp text-base sm:text-lg ${stamp.className}`}>{stamp.text}</span>
        </div>
      </div>

      <p className="mt-5 text-xl leading-snug font-semibold tracking-tight">
        {conforme
          ? "Los documentos coinciden con la orden de compra."
          : result.verdict === "observado"
            ? `${errors.length} ${errors.length === 1 ? "discrepancia" : "discrepancias"} que el banco o la aduana van a observar.`
            : "Faltan documentos para revisar."}
      </p>
      {edited.length > 0 && <p className="mt-1.5 text-sm text-warn">Con datos corregidos a mano en {edited.join(", ")}.</p>}

      {errors.length > 0 && <CheckList title="Discrepancias" checks={errors} tone="bad" />}
      {warnings.length > 0 && <CheckList title="Advertencias" checks={warnings} tone="warn" />}

      {ok.length > 0 && (
        <details className="group mt-6 border-y border-line" open={conforme}>
          <summary className="flex items-center justify-between gap-3 py-3.5 text-sm font-medium">
            {ok.length} controles sin observaciones
            <CaretDownIcon size={15} className="text-muted transition-transform group-open:rotate-180" />
          </summary>
          <ul className="grid gap-x-8 gap-y-3 pb-5 sm:grid-cols-2">
            {ok.map((c) => (
              <li key={c.id} className="text-sm">
                <span className="font-medium">{c.label}</span>
                <span className="block text-ink-2">{c.detail}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function CheckList({ title, checks, tone }: { title: string; checks: Check[]; tone: "bad" | "warn" }) {
  const bad = tone === "bad";
  return (
    <div className="mt-7">
      <h3 className={`text-sm font-semibold ${bad ? "text-bad" : "text-warn"}`}>{title}</h3>
      <ul className="mt-2 border-t border-line">
        {checks.map((c) => (
          <li key={c.id} className="border-b border-line py-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h4 className="font-semibold tracking-tight">{c.label}</h4>
              <span className="text-xs text-muted">{c.documents.map((d) => SHORT_DOC[d]).join(" · ")}</span>
            </div>
            <p className="mt-1 text-sm text-ink-2">{c.detail}</p>

            {(c.expected || c.found) && (
              <dl className="mt-3 grid max-w-xl gap-3 sm:grid-cols-2 sm:gap-6">
                <div>
                  <dt className="text-xs text-muted">Esperado</dt>
                  <dd className="mt-0.5 font-mono text-sm break-words">{c.expected ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Encontrado</dt>
                  <dd className={`mt-0.5 font-mono text-sm font-medium break-words ${bad ? "text-bad" : "text-warn"}`}>
                    {c.found ?? "—"}
                  </dd>
                </div>
              </dl>
            )}

            {c.fix && (
              <p className="mt-3 text-sm">
                <span className="font-medium">Qué hacer: </span>
                {c.fix}
              </p>
            )}
            <p className="mt-2 font-mono text-[11px] text-muted">{c.rule}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
