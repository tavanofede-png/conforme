import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { CaseList } from "@/components/CaseList";
import { NewOperationForm } from "@/components/NewOperationForm";
import { addDays } from "@/lib/normalize";
import { todayIso } from "@/lib/rules";
import { exampleOrders } from "@/lib/samples";
import { listOperations } from "@/lib/store";

export const metadata: Metadata = {
  title: "Nueva operación · Conforme",
};

export default function NewOperationPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 pt-10 pb-24 md:pt-14">
      <h1 className="text-3xl font-[450] tracking-[-0.03em] md:text-4xl">Nueva operación</h1>
      <Suspense fallback={<PageSkeleton />}>
        <Content />
      </Suspense>
    </div>
  );
}

async function Content() {
  await connection();
  const today = todayIso();
  const [last] = await listOperations();
  return (
    <>
      <section aria-labelledby="casos" className="mt-8 max-w-2xl">
        <h2 id="casos" className="text-[17px] font-medium">
          Probá con un caso real
        </h2>
        <p className="mt-1 text-sm text-ink-2">Abre la operación con la orden de compra ya cargada.</p>
        <div className="mt-4">
          <CaseList cases={exampleOrders(today)} />
        </div>
      </section>

      <section id="orden-de-compra" aria-labelledby="orden" className="mt-14 scroll-mt-4 border-t border-line pt-10">
        <h2 id="orden" className="text-xl font-[450] tracking-[-0.02em]">
          O cargá tu orden de compra
        </h2>
        <NewOperationForm defaults={{ buyerName: last?.po.buyerName ?? "", latestShipmentDate: addDays(today, 30) }} />
      </section>
    </>
  );
}

function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Cargando">
      <div className="mt-8 max-w-2xl">
        <div className="h-5 w-48 animate-pulse rounded bg-subtle" />
        <div className="panel mt-4 h-[13.5rem] animate-pulse" />
      </div>
      <div className="mt-14 border-t border-line pt-10">
        <div className="h-6 w-64 animate-pulse rounded bg-subtle" />
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <div className="h-16 animate-pulse rounded bg-subtle sm:col-span-2" />
          <div className="h-16 animate-pulse rounded bg-subtle sm:col-span-2" />
          <div className="h-16 animate-pulse rounded bg-subtle" />
          <div className="h-16 animate-pulse rounded bg-subtle" />
        </div>
      </div>
    </div>
  );
}
