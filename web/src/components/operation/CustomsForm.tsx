"use client";

import { CircleNotchIcon } from "@phosphor-icons/react";
import { useState } from "react";
import type { Operation } from "@/lib/domain";
import { formatDate } from "@/lib/normalize";

export function CustomsForm({
  op,
  busy,
  onSave,
}: {
  op: Operation;
  busy: boolean;
  onSave: (declarationNumber: string, enteredAt: string) => void;
}) {
  const [number, setNumber] = useState(op.customs?.declarationNumber ?? "");
  const [enteredAt, setEnteredAt] = useState(op.customs?.enteredAt ?? "");
  const done = !!op.customs;

  return (
    <section id="ingreso" aria-labelledby="ingreso-titulo" className="scroll-mt-8">
      <h2 id="ingreso-titulo" className="text-[15px] font-medium">
        Ingreso aduanero
      </h2>
      {done ? (
        <p className="mt-2 text-sm text-ink-2">
          Despacho {op.customs?.declarationNumber}, ingresó el {formatDate(op.customs?.enteredAt ?? "")}. El seguimiento del pago quedó cerrado.
        </p>
      ) : op.escrow.status !== "liberado" ? (
        <p className="mt-2 text-sm text-muted">Se anota cuando el pago ya se liberó y la mercadería entra al país.</p>
      ) : (
        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            onSave(number, enteredAt);
          }}
        >
          <label className="block">
            <span className="label">Número de despacho</span>
            <input className="field font-mono" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="26001IC04000000A" />
          </label>
          <label className="block">
            <span className="label">Fecha de ingreso</span>
            <input className="field font-mono" type="date" value={enteredAt} onChange={(e) => setEnteredAt(e.target.value)} />
          </label>
          <button className="btn btn-secondary btn-sm" type="submit" disabled={busy || number.trim().length < 4 || !enteredAt}>
            {busy && <CircleNotchIcon size={14} className="animate-spin" />}
            Registrar ingreso
          </button>
        </form>
      )}
    </section>
  );
}
