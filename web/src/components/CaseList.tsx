"use client";

import { ArrowRightIcon, CircleNotchIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson, type OperationResponse } from "@/lib/client";
import type { PurchaseOrder } from "@/lib/domain";
import { formatNumber } from "@/lib/normalize";

export interface CaseOption {
  id: string;
  title: string;
  origin: string;
  po: PurchaseOrder;
}

/** Abre una operación con la orden de compra del caso ya cargada. */
export function CaseList({ cases }: { cases: CaseOption[] }) {
  const router = useRouter();
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function open(option: CaseOption) {
    setOpening(option.id);
    setError(null);
    try {
      const { operation } = await postJson<OperationResponse>("/api/operations", option.po);
      router.push(`/operaciones/${operation.id}`);
    } catch (err) {
      setError((err as Error).message);
      setOpening(null);
    }
  }

  return (
    <div>
      <ul className="panel divide-y divide-line overflow-hidden">
        {cases.map((option) => {
          const { po } = option;
          return (
            <li key={option.id}>
              <button
                type="button"
                onClick={() => open(option)}
                disabled={opening !== null}
                aria-busy={opening === option.id}
                className="group grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-4 px-4 py-4 text-left transition-colors hover:bg-subtle/60 disabled:cursor-wait sm:px-5"
              >
                <span className="font-medium">{option.title}</span>
                <span className="font-mono text-sm text-ink-2 tabular-nums">
                  {po.currency} {formatNumber(po.amount)}
                </span>
                <span className="row-span-2 self-center">
                  {opening === option.id ? (
                    <CircleNotchIcon size={16} className="animate-spin text-ink" aria-label="Abriendo" />
                  ) : (
                    <ArrowRightIcon size={16} className="text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />
                  )}
                </span>
                <span className="col-span-2 mt-0.5 text-sm text-muted">
                  {option.origin} · {po.incoterm} ·{" "}
                  <span className="whitespace-nowrap">
                    {po.portOfLoading} → {po.portOfDischarge}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="mt-3 text-sm text-bad">
          {error}
        </p>
      )}
    </div>
  );
}
