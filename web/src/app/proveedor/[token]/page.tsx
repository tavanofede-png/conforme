import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { OperationView } from "@/components/operation/OperationView";
import { findByToken } from "@/lib/store";

export const metadata: Metadata = {
  title: "Documentos del proveedor · Conforme",
};

export default function SupplierPage({ params }: PageProps<"/proveedor/[token]">) {
  return (
    <Suspense fallback={<p className="mx-auto max-w-6xl px-5 py-16 text-sm text-muted">Cargando la operación…</p>}>
      <Load params={params} />
    </Suspense>
  );
}

async function Load({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  await connection();
  const found = await findByToken(token);
  if (!found || found.role !== "supplier") notFound();
  return <OperationView initial={found.operation} role="supplier" token={token} />;
}
