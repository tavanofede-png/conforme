import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PrintButton } from "@/components/PrintButton";
import { DOC_LABELS, type Check } from "@/lib/domain";
import { formatDate, formatNumber } from "@/lib/normalize";
import { operationStatus } from "@/lib/status";
import { findByToken } from "@/lib/store";

export const metadata: Metadata = {
  title: "Informe de revisión · Conforme",
};

export default function ReportPage({ params }: PageProps<"/informe/[token]">) {
  return (
    <Suspense fallback={<p className="mx-auto max-w-3xl px-5 py-16 text-sm text-muted">Cargando el informe…</p>}>
      <Load params={params} />
    </Suspense>
  );
}

async function Load({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  await connection();
  const found = await findByToken(token);
  if (!found || found.role !== "report") notFound();
  const op = found.operation;
  const { po } = op;
  const status = operationStatus(op);
  const result = op.verification;
  const problems = result?.checks.filter((c) => c.status !== "ok") ?? [];
  const ok = result?.checks.filter((c) => c.status === "ok").length ?? 0;

  return (
    <article className="mx-auto max-w-3xl px-5 pt-10 pb-20">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs text-muted">{op.id}</p>
          <h1 className="mt-2 text-3xl font-[450] tracking-[-0.03em]">Informe de revisión</h1>
          <p className="mt-2 text-ink-2">
            {po.buyerName} le compra a {po.sellerName.replace(/\.$/, "")}.
          </p>
        </div>
        <PrintButton />
      </div>

      <p className="mt-8 whitespace-nowrap">
        <span className="mr-1.5 text-sm font-medium text-muted">{po.currency}</span>
        <span className="numeral text-5xl">{formatNumber(po.amount, 2)}</span>
      </p>
      <p className="mt-2 text-sm text-ink-2">
        {po.goodsDescription} · {po.incoterm} {po.incotermPlace}
      </p>
      <p className="mt-4 text-sm">
        Pago: <span className="font-medium">{status.label}</span>
        {op.escrow.status === "liberado" && " · el contrato ya le pagó al proveedor."}
        {op.escrow.status === "en-custodia" && " · el dinero sigue protegido en el contrato."}
        {op.escrow.status === "sin-fondos" && " · todavía no se depositó."}
        {op.customs && ` Ingreso ${op.customs.declarationNumber} del ${formatDate(op.customs.enteredAt)}.`}
      </p>

      {!result ? (
        <p className="mt-10 border-t border-line pt-6 text-ink-2">Todavía no hay un dictamen. Faltan documentos o el importador no revisó.</p>
      ) : (
        <section className="mt-10 border-t border-line pt-6">
          <div className="flex items-start justify-between gap-6">
            <div>
              <h2 className="text-xl font-[450]">
                {result.verdict === "conforme" ? "Documentos conformes" : result.verdict === "observado" ? "Con discrepancias" : "Documentación incompleta"}
              </h2>
              <p className="mt-1 text-sm text-muted">
                {formatDate(result.checkedAt.slice(0, 10))} · {ok} controles sin observaciones
              </p>
            </div>
            <span className={`stamp text-xs ${result.verdict === "conforme" ? "text-brand" : "text-ink-2"}`}>
              {result.verdict === "conforme" ? "Conforme" : result.verdict === "observado" ? "Observado" : "Incompleto"}
            </span>
          </div>

          {problems.length === 0 ? (
            <p className="mt-6 text-ink-2">Los documentos coinciden con la orden de compra.</p>
          ) : (
            <ul className="mt-6 border-t border-line">
              {problems.map((check) => (
                <Problem key={check.id} check={check} />
              ))}
            </ul>
          )}
        </section>
      )}

      <p className="mt-12 text-xs text-muted">Informe generado por Conforme. No reemplaza el control del banco ni de la aduana.</p>
    </article>
  );
}

function Problem({ check }: { check: Check }) {
  return (
    <li className="border-b border-line py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium">{check.label}</h3>
        <span className="text-xs text-muted">{check.documents.map((d) => DOC_LABELS[d]).join(" · ")}</span>
      </div>
      <p className="mt-1 text-sm text-ink-2">{check.detail}</p>
      {(check.expected || check.found) && (
        <p className="mt-2 font-mono text-[13px]">
          {check.expected && <span className="text-ink-2">Esperado: {check.expected}. </span>}
          {check.found && <span className={check.status === "error" ? "text-bad" : ""}>Encontrado: {check.found}</span>}
        </p>
      )}
      <p className="mt-2 text-sm">{check.rule}</p>
      {check.fix && <p className="mt-1 text-sm text-ink-2">{check.fix}</p>}
    </li>
  );
}
