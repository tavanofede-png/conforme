"use client";

import { useState } from "react";
import { NCM_TO_DEFINE, TO_DEFINE, type Operation } from "@/lib/domain";
import { formatNcm, formatNumber } from "@/lib/normalize";

/** Lo que el encabezado de la operación no muestra: mercadería, ruta y fecha ya están arriba. */
export function PoSummary({ op }: { op: Operation }) {
  const { po } = op;
  const rows: [string, string][] = [
    ["Comprador", po.buyerName],
    ["Cantidad", `${formatNumber(po.quantity)} ${po.unit}`],
    ["Posición NCM", po.hsCode === NCM_TO_DEFINE ? TO_DEFINE : formatNcm(po.hsCode)],
    ["Bultos", formatNumber(po.packages)],
    ["Peso bruto", `${formatNumber(po.grossWeightKg)} kg`],
    ["Tolerancias", `Cantidad ${formatNumber(po.quantityTolerancePct, 1)} %, peso ${formatNumber(po.weightTolerancePct, 1)} %`],
    ["Palabras clave", po.goodsKeywords.join(", ")],
  ];
  return (
    <section aria-labelledby="orden-de-compra">
      <h2 id="orden-de-compra" className="text-[15px] font-medium">
        Orden de compra
      </h2>
      <dl className="mt-3 divide-y divide-line border-y border-line text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 py-2">
            <dt className="text-muted">{label}</dt>
            <dd className="break-words">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function EventLog({ op }: { op: Operation }) {
  const [all, setAll] = useState(false);
  const events = [...op.events].reverse();
  const shown = all ? events : events.slice(0, 5);
  return (
    <section aria-labelledby="historial">
      <h2 id="historial" className="text-[15px] font-medium">
        Historial
      </h2>
      <ol className="mt-3 divide-y divide-line border-y border-line">
        {shown.map((e, i) => (
          <li key={`${e.at}-${i}`} className="py-2.5">
            <time className="block font-mono text-[11px] text-muted" dateTime={e.at}>
              {new Date(e.at).toLocaleString("es-AR", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                hourCycle: "h23",
                timeZone: "America/Argentina/Buenos_Aires",
              })}
            </time>
            <span className="mt-0.5 block text-[13px] leading-snug text-ink-2">{e.message}</span>
          </li>
        ))}
      </ol>
      {events.length > 5 && (
        <button className="link mt-3 text-xs text-ink-2" onClick={() => setAll((v) => !v)}>
          {all ? "Ver menos" : `Ver los ${events.length} eventos`}
        </button>
      )}
    </section>
  );
}
