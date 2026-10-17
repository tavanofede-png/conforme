import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { OperationView } from "@/components/operation/OperationView";
import { getOperation } from "@/lib/store";

export async function generateMetadata({ params }: PageProps<"/operaciones/[id]">): Promise<Metadata> {
  const { id } = await params;
  const operation = await getOperation(id);
  return { title: operation ? `${operation.po.sellerName} · ${id} · Conforme` : "Operación no encontrada · Conforme" };
}

export default function OperationPage({ params }: PageProps<"/operaciones/[id]">) {
  return (
    <Suspense fallback={<OperationSkeleton />}>
      <LoadOperation params={params} />
    </Suspense>
  );
}

async function LoadOperation({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await connection();
  const operation = await getOperation(id);
  if (!operation) notFound();
  return <OperationView initial={operation} />;
}

function OperationSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-5 pt-8 pb-24" aria-busy="true" aria-label="Cargando la operación">
      <div className="h-4 w-56 animate-pulse rounded bg-subtle" />
      <div className="mt-6 space-y-2.5">
        <div className="h-9 w-2/3 max-w-md animate-pulse rounded bg-subtle" />
        <div className="h-4 w-1/2 max-w-sm animate-pulse rounded bg-subtle" />
      </div>
      <div className="mt-8 grid grid-cols-5 gap-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-[3px] animate-pulse rounded-full bg-line" />
        ))}
      </div>
      <div className="panel mt-14 h-36 animate-pulse" />
      <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-16">
        <div className="h-80 animate-pulse rounded bg-subtle" />
        <div className="h-72 animate-pulse rounded bg-subtle" />
      </div>
    </div>
  );
}
