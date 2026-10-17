"use client";

import { XIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { flaggedFields } from "@/lib/check-fields";
import { api, postJson, type OperationResponse } from "@/lib/client";
import { DOC_KINDS, TO_DEFINE, type DocKind, type Operation, type StoredDoc } from "@/lib/domain";
import { formatDate, formatNumber } from "@/lib/normalize";
import { documentCount, operationStatus } from "@/lib/status";
import { useChain } from "@/lib/use-chain";
import { StatusText } from "../StatusText";
import { DocumentSlot } from "./DocumentSlot";
import { NextStep } from "./NextStep";
import { explorerTx, ProtectedPayment } from "./ProtectedPayment";
import { ReviewResult } from "./ReviewResult";
import { EventLog, PoSummary } from "./SidePanels";
import { Timeline } from "./Timeline";

export function OperationView({ initial }: { initial: Operation }) {
  const [op, setOp] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { info: chain, refresh: refreshChain } = useChain();
  const reviewRef = useRef<HTMLDivElement>(null);
  const base = `/api/operations/${op.id}`;
  const status = operationStatus(op);
  const docs = documentCount(op);
  const closed = op.escrow.status === "liberado" || op.escrow.status === "devuelto";
  const releaseHref = explorerTx(chain, op.escrow.network, op.escrow.releaseTx);

  const checkedAt = op.verification?.checkedAt;
  const lastCheckedAt = useRef(checkedAt);
  useEffect(() => {
    const el = reviewRef.current;
    if (checkedAt && checkedAt !== lastCheckedAt.current && el && el.getBoundingClientRect().top > window.innerHeight * 0.6) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    lastCheckedAt.current = checkedAt;
  }, [checkedAt]);

  async function run(key: string, action: () => Promise<OperationResponse>, touchesChain = false): Promise<boolean> {
    setBusy(key);
    setError(null);
    try {
      const { operation } = await action();
      setOp(operation);
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setBusy(null);
      if (touchesChain) refreshChain();
    }
  }

  const upload = (kind: DocKind, file: File) =>
    run(`upload:${kind}`, () => {
      const form = new FormData();
      form.set("kind", kind);
      form.set("file", file);
      return api<OperationResponse>(`${base}/documents`, { method: "POST", body: form });
    });

  const save = (kind: DocKind, fields: Record<string, string>) =>
    run(`save:${kind}`, () =>
      api<OperationResponse>(`${base}/documents/${kind}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
      }),
    );

  const simulate = (set: "conforme" | "con-errores") => run(`samples:${set}`, () => postJson(`${base}/samples`, { set }));
  const verify = () => run("verify", () => postJson(`${base}/verify`, {}), true);
  const escrow = (action: "fund" | "refund") => run(action, () => postJson(`${base}/escrow`, { action }), true);

  const { po } = op;

  return (
    <div className="mx-auto max-w-6xl px-5 pt-8 pb-24">
      <nav aria-label="Ruta" className="flex items-center gap-2 text-sm text-muted">
        <Link href="/#operaciones" className="hover:text-ink">
          Operaciones
        </Link>
        <span aria-hidden>/</span>
        <span className="font-mono text-xs text-ink-2">{op.id}</span>
      </nav>

      <header className="mt-6 flex flex-col gap-5 md:flex-row md:items-end md:justify-between md:gap-10">
        <div className="min-w-0">
          <h1 className="text-[2rem] leading-[1.08] font-[450] tracking-[-0.03em] md:text-[2.5rem]">{po.sellerName}</h1>
          <p className="mt-2 text-ink-2">
            {po.goodsDescription} · {formatNumber(po.quantity)} {po.unit}
          </p>
          <p className="mt-1 text-sm text-muted">
            {po.portOfLoading} → {po.portOfDischarge} · {po.incoterm}
            {po.incotermPlace !== TO_DEFINE && ` ${po.incotermPlace}`} · Embarque hasta el {formatDate(po.latestShipmentDate)}
          </p>
        </div>
        <div className="shrink-0 md:text-right">
          <p className="whitespace-nowrap">
            <span className="mr-1.5 text-sm font-medium text-muted">{po.currency}</span>
            <span className="numeral text-[2.75rem] md:text-[3.25rem]">{formatNumber(po.amount, 2)}</span>
          </p>
          <StatusText tone={status.tone} className="mt-2">
            {status.label}
          </StatusText>
        </div>
      </header>

      <Timeline op={op} />

      {error && (
        <div role="alert" className="mt-6 flex items-start justify-between gap-4 rounded-xl bg-bad-soft px-4 py-3 text-sm text-bad">
          <span>{error}</span>
          <button className="shrink-0 rounded p-0.5 hover:bg-bad/10" onClick={() => setError(null)} aria-label="Cerrar el aviso">
            <XIcon size={16} />
          </button>
        </div>
      )}

      <div className="mt-8">
        <NextStep
          op={op}
          chain={chain}
          busy={busy}
          releaseHref={releaseHref}
          onFund={() => escrow("fund")}
          onSimulate={simulate}
          onVerify={verify}
        />
      </div>

      <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-16">
        <div className="min-w-0 space-y-12">
          {op.verification && (
            <div ref={reviewRef} className="scroll-mt-6">
              <ReviewResult op={op} />
            </div>
          )}

          <section aria-labelledby="documentos">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 id="documentos" className="text-2xl leading-tight font-[450] tracking-[-0.02em]">
                Documentos de embarque
              </h2>
              <span className="text-sm text-muted tabular-nums">{docs} de 3</span>
            </div>
            {!closed && <p className="mt-0.5 text-sm text-muted">PDF con texto, hasta 10 MB. También podés arrastrarlos.</p>}
            <div className="mt-2 divide-y divide-line border-y border-line">
              {DOC_KINDS.map((kind) => (
                <DocumentSlot
                  key={kind}
                  kind={kind}
                  doc={op.documents[kind] as StoredDoc | undefined}
                  operationId={op.id}
                  flags={flaggedFields(op.verification, kind)}
                  busy={busy}
                  locked={closed}
                  onUpload={(file) => upload(kind, file)}
                  onSave={(fields) => save(kind, fields)}
                />
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-10">
          <ProtectedPayment op={op} chain={chain} busy={busy} onRefund={() => escrow("refund")} />
          <PoSummary op={op} />
          <EventLog op={op} />
        </aside>
      </div>
    </div>
  );
}
