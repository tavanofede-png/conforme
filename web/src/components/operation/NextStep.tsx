"use client";

import { ArrowSquareOutIcon, CircleNotchIcon } from "@phosphor-icons/react";
import type { ChainInfo } from "@/lib/chain";
import type { Operation } from "@/lib/domain";
import { formatNumber } from "@/lib/normalize";
import { documentCount } from "@/lib/status";

type Busy = string | null;

interface Action {
  key: string;
  label: string;
  busyLabel: string;
  run: () => void;
  disabled?: boolean;
}

const PENDING_TEXT = {
  fund: "Depositando el pago…",
  release: "Liberando el pago al proveedor…",
  refund: "Devolviendo los fondos al importador…",
};

export function NextStep({
  op,
  chain,
  busy,
  releaseHref,
  onFund,
  onSimulate,
  onVerify,
}: {
  op: Operation;
  chain: ChainInfo | null;
  busy: Busy;
  releaseHref: string | null;
  onFund: () => void;
  onSimulate: (set: "conforme" | "con-errores") => void;
  onVerify: () => void;
}) {
  const { escrow, po } = op;
  const docs = documentCount(op);
  const verdict = op.verification?.verdict;
  const amount = `${po.currency} ${formatNumber(po.amount, 0)}`;
  const slow = chain?.network === "rskTestnet";
  const pending = escrow.pending?.action ?? (busy === "fund" || busy === "refund" ? busy : null);
  const errors = op.verification?.errors ?? 0;
  const closed = escrow.status === "liberado" || escrow.status === "devuelto";

  let spin = false;
  let title: string;
  let text: string;
  let primary: Action | null = null;
  let simulations: Action[] = [];
  let simulationText = "¿No tenés los PDF? Generá los que mandaría el proveedor.";
  let link: { href: string; label: string } | null = null;

  const simulate = (set: "conforme" | "con-errores", label: string): Action => ({
    key: `samples:${set}`,
    label,
    busyLabel: "Generando los PDF…",
    run: () => onSimulate(set),
  });

  if (pending || busy === "verify") {
    spin = true;
    title = pending ? PENDING_TEXT[pending] : "Revisando los documentos…";
    text = pending
      ? slow
        ? "La red confirma la transacción en unos 30 segundos."
        : "Esperando la confirmación de la red."
      : "Comparando factura, packing list y BL con la orden de compra.";
  } else if (escrow.status === "liberado") {
    title = "Pago liberado al proveedor";
    text = `${po.sellerName} cobró ${po.currency} ${formatNumber(po.amount, 2)}. La huella de los documentos aprobados quedó registrada en el contrato.`;
    if (releaseHref) link = { href: releaseHref, label: "Ver la transacción" };
  } else if (escrow.status === "devuelto") {
    title = "Operación cancelada";
    text = "Los fondos volvieron al importador. El proveedor no cobró.";
  } else if (escrow.status === "sin-fondos") {
    title = verdict === "conforme" ? "Documentos conformes: falta depositar" : "Depositá el pago protegido";
    text =
      verdict === "conforme"
        ? "Apenas deposites, el contrato le paga al proveedor."
        : "El monto queda en un contrato y se libera al proveedor cuando los documentos estén conformes.";
    primary = { key: "fund", label: `Depositar ${amount}`, busyLabel: "Depositando…", run: onFund, disabled: chain?.ready !== true };
  } else if (docs < 3) {
    title = docs === 0 ? "Esperando los documentos de embarque" : `Falta ${3 - docs === 1 ? "un documento" : `${3 - docs} documentos`}`;
    text = "Factura comercial, packing list y conocimiento de embarque. Subilos abajo o simulá el envío del proveedor.";
    simulations = [simulate("con-errores", "Con discrepancias"), simulate("conforme", "Sin discrepancias")];
  } else if (!op.verification) {
    title = "Documentos completos";
    text = "Revisalos contra la orden de compra. Si están conformes, el pago sale en el momento.";
    primary = { key: "verify", label: "Revisar documentos", busyLabel: "Revisando…", run: onVerify };
  } else if (verdict === "observado") {
    title = "Pedile al proveedor que corrija los documentos";
    text = `El pago sigue protegido por ${errors === 1 ? "una discrepancia" : `${errors} discrepancias`}. Si fue un error de lectura, corregí el dato y volvé a revisar.`;
    simulations = [simulate("conforme", "Simular la corrección")];
    simulationText = "Generá el juego corregido que mandaría el proveedor.";
  } else {
    title = "Documentos conformes: falta liberar el pago";
    text = "La liberación no se completó. Probá de nuevo.";
    primary = { key: "verify", label: "Reintentar la liberación", busyLabel: "Liberando…", run: onVerify };
  }

  const locked = !!busy || !!pending;
  const label = (a: Action) => (busy === a.key ? a.busyLabel : a.label);

  return (
    <section className="panel p-5 sm:p-7" aria-live="polite">
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between md:gap-10">
        <div className="min-w-0">
          <p className="text-sm text-muted">{closed ? "Operación cerrada" : "Próximo paso"}</p>
          <h2 className="mt-1 flex items-center gap-2.5 text-xl leading-snug font-semibold tracking-tight md:text-2xl">
            {spin && <CircleNotchIcon size={20} className="shrink-0 animate-spin text-muted" />}
            {title}
          </h2>
          <p className="mt-2 max-w-2xl leading-relaxed text-pretty text-ink-2">{text}</p>
          {escrow.lastError && !pending && (
            <p role="alert" className="mt-3 rounded-md bg-bad-soft px-3 py-2 text-sm text-bad">
              {escrow.lastError}
            </p>
          )}
          {chain && !chain.ready && escrow.status === "sin-fondos" && (
            <p className="mt-3 rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">{chain.problem}</p>
          )}
        </div>

        {(primary || link) && (
          <div className="flex shrink-0 flex-wrap gap-2">
            {primary && (
              <button className="btn btn-primary btn-lg" onClick={primary.run} disabled={locked || primary.disabled}>
                {busy === primary.key && <CircleNotchIcon size={16} className="animate-spin" />}
                {label(primary)}
              </button>
            )}
            {link && (
              <a href={link.href} target="_blank" rel="noreferrer" className="btn btn-secondary">
                {link.label}
                <ArrowSquareOutIcon size={15} />
              </a>
            )}
          </div>
        )}
      </div>

      {simulations.length > 0 && (
        <div className="mt-6 flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink-2">{simulationText}</p>
          <div className="flex flex-wrap gap-2">
            {simulations.map((a) => (
              <button key={a.key + a.label} className="btn btn-secondary btn-sm" onClick={a.run} disabled={locked}>
                {busy === a.key && <CircleNotchIcon size={14} className="animate-spin" />}
                {label(a)}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
