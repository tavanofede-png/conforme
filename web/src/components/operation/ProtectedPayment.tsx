"use client";

import { ArrowSquareOutIcon, CaretDownIcon } from "@phosphor-icons/react";
import { useState } from "react";
import type { ChainInfo } from "@/lib/chain";
import { shortHash } from "@/lib/client";
import type { EscrowStatus, Operation } from "@/lib/domain";
import { formatNumber } from "@/lib/normalize";

const STATUS_TEXT: Record<EscrowStatus, string> = {
  "sin-fondos": "Todavía no se depositó.",
  "en-custodia": "Depositado en el contrato. Se libera cuando los documentos estén conformes.",
  liberado: "Pagado al proveedor.",
  devuelto: "Devuelto al importador.",
};

const HOLDERS = ["Importador", "Contrato", "Proveedor"];

export function explorerTx(info: ChainInfo | null, network: string | undefined, hash: string | undefined) {
  if (!hash || !info?.explorer || info.network !== network) return null;
  return `${info.explorer}/tx/${hash}`;
}

export function ProtectedPayment({
  op,
  chain,
  busy,
  onRefund,
}: {
  op: Operation;
  chain: ChainInfo | null;
  busy: string | null;
  onRefund: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const { escrow, po } = op;
  const holder = escrow.status === "en-custodia" ? 1 : escrow.status === "liberado" ? 2 : 0;
  const balances = chain && "balances" in chain ? chain.balances : null;
  const symbol = chain && "symbol" in chain ? chain.symbol : "tUSD";
  const blocked = !!busy || !!escrow.pending;

  const txs = [
    { label: "Aprobación del token", hash: escrow.approveTx },
    { label: "Depósito", hash: escrow.fundTx },
    { label: "Pago al proveedor", hash: escrow.releaseTx },
    { label: "Devolución", hash: escrow.refundTx },
  ].filter((t): t is { label: string; hash: string } => !!t.hash);

  return (
    <section aria-labelledby="pago-protegido">
      <h2 id="pago-protegido" className="text-[15px] font-medium">
        Pago protegido
      </h2>
      <p className="mt-3 whitespace-nowrap">
        <span className="mr-1 text-sm font-medium text-muted">{po.currency}</span>
        <span className="numeral text-[2rem]">{formatNumber(po.amount, 2)}</span>
      </p>
      <p className="mt-2 text-sm text-ink-2">{STATUS_TEXT[escrow.status]}</p>

      <ol className="mt-4 grid grid-cols-3 border-t border-line text-xs" aria-label="Dónde está el dinero">
        {HOLDERS.map((label, i) => (
          <li
            key={label}
            aria-current={holder === i ? "location" : undefined}
            className={`-mt-px border-t-2 pt-2 ${holder === i ? "border-ink font-medium text-ink" : "border-transparent text-muted"}`}
          >
            {label}
          </li>
        ))}
      </ol>

      {escrow.status === "en-custodia" && (
        <div className="mt-4">
          {confirming ? (
            <div className="border-l-2 border-ink pl-3 text-sm">
              <p>¿Devolver los fondos al importador? La operación se cancela.</p>
              <div className="mt-2.5 flex gap-2">
                <button
                  className="btn btn-dark btn-sm"
                  onClick={() => {
                    setConfirming(false);
                    onRefund();
                  }}
                  disabled={blocked}
                >
                  Sí, devolver
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setConfirming(false)}>
                  No
                </button>
              </div>
            </div>
          ) : (
            <button className="link text-xs text-ink-2" onClick={() => setConfirming(true)} disabled={blocked}>
              Cancelar y devolver al importador
            </button>
          )}
        </div>
      )}

      <details className="group mt-5 border-y border-line">
        <summary className="flex items-center justify-between gap-3 py-3 text-sm text-ink-2 hover:text-ink">
          Detalle técnico
          <CaretDownIcon size={14} className="text-muted transition-transform group-open:rotate-180" />
        </summary>
        <dl className="space-y-2 pb-4 text-xs">
          <Row label="Red">
            {chain ? (
              <>
                {chain.label}
                {!chain.ready && <span className="text-bad"> · sin conexión</span>}
              </>
            ) : (
              "Consultando…"
            )}
          </Row>
          {chain?.problem && <p className="text-bad">{chain.problem}</p>}
          {chain?.escrow && (
            <Row label="Contrato" mono>
              {chain.escrowUrl ? (
                <a href={chain.escrowUrl} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1">
                  {shortHash(chain.escrow)}
                  <ArrowSquareOutIcon size={11} />
                </a>
              ) : (
                <span title={chain.escrow}>{shortHash(chain.escrow)}</span>
              )}
            </Row>
          )}
          <Row label="Token">{symbol}, 1 = 1 USD</Row>
          {balances && (
            <>
              <Row label="Saldo importador" mono>
                {formatNumber(Number(balances.buyer), 0)} {symbol}
              </Row>
              <Row label="Saldo contrato" mono>
                {formatNumber(Number(balances.escrow), 0)} {symbol}
              </Row>
              <Row label="Saldo proveedor" mono>
                {formatNumber(Number(balances.seller), 0)} {symbol}
              </Row>
            </>
          )}
          {txs.map((t) => {
            const href = explorerTx(chain, escrow.network, t.hash);
            return (
              <Row key={t.label} label={t.label} mono>
                {href ? (
                  <a href={href} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1">
                    {shortHash(t.hash)}
                    <ArrowSquareOutIcon size={11} />
                  </a>
                ) : (
                  <span title={t.hash}>{shortHash(t.hash)}</span>
                )}
              </Row>
            );
          })}
          {escrow.docsHash && (
            <Row label="Huella de los documentos" mono>
              <span title={escrow.docsHash}>{shortHash(escrow.docsHash)}</span>
            </Row>
          )}
          <Row label="Firma del importador">El servidor, en esta demo</Row>
        </dl>
      </details>
    </section>
  );
}

function Row({ label, mono, children }: { label: string; mono?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className={`min-w-0 text-right break-words text-ink-2 ${mono ? "font-mono" : ""}`}>{children}</dd>
    </div>
  );
}
