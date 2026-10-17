import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { CaseList } from "@/components/CaseList";
import { StatusText } from "@/components/StatusText";
import type { DocKind, Operation } from "@/lib/domain";
import { formatNumber } from "@/lib/normalize";
import { samplePreview } from "@/lib/preview";
import { todayIso } from "@/lib/rules";
import { EXAMPLES, exampleOrders } from "@/lib/samples";
import { operationStatus } from "@/lib/status";
import { listOperations } from "@/lib/store";

const SHORT_DOC: Record<DocKind, string> = {
  invoice: "Factura",
  packingList: "Packing list",
  billOfLading: "BL",
};

const STEPS = [
  {
    title: "Orden de compra",
    text: "Cargás lo que acordaste con el proveedor: mercadería, monto, Incoterm y puertos.",
  },
  {
    title: "Pago protegido",
    text: "Depositás el monto en un contrato en Rootstock. El proveedor ve que los fondos están.",
  },
  {
    title: "Documentos de embarque",
    text: "El proveedor sube la factura comercial, el packing list y el conocimiento de embarque.",
  },
  {
    title: "Resultado de la revisión",
    text: "Si los documentos están conformes, el contrato le paga al proveedor. Si hay discrepancias, el pago sigue protegido.",
  },
];

export default function Home() {
  return (
    <>
      <section className="mx-auto grid max-w-6xl gap-10 px-5 pt-10 pb-16 sm:gap-12 md:pt-20 md:pb-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:gap-16">
        <div>
          <h1 className="max-w-[18ch] text-[2.25rem] leading-[1.05] font-[450] tracking-[-0.03em] sm:text-[2.5rem] md:text-[3.5rem]">
            Revisá los documentos de embarque antes de liberar el pago.
          </h1>
          <p className="mt-5 max-w-[34rem] leading-relaxed text-ink-2 sm:mt-6 sm:text-lg">
            Conforme compara la factura comercial, el packing list y el conocimiento de embarque con tu orden de compra,
            con los criterios de la UCP 600. Si están conformes, el pago protegido se libera al proveedor. Si no, te dice
            qué discrepancias hay y cómo corregirlas.
          </p>
        </div>

        <div>
          <h2 className="text-[17px] font-medium">Probá con un caso real</h2>
          <p className="mt-1 text-sm text-ink-2">Abre la operación con la orden de compra ya cargada.</p>
          <div className="mt-4">
            <Suspense fallback={<CasesSkeleton />}>
              <Cases />
            </Suspense>
          </div>
          <Link
            href="/operaciones/nueva#orden-de-compra"
            className="group mt-4 inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink"
          >
            O cargá tu propia orden de compra
            <ArrowRightIcon size={14} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </section>

      <Band title="Qué revisa">
        <p className="max-w-2xl text-lg leading-relaxed text-ink-2">
          Entre el 65 y el 80 % de los documentos presentados bajo carta de crédito se rechazan en la primera
          presentación, casi siempre por datos que no coinciden entre sí (ICC).
        </p>
        <Suspense fallback={<div className="mt-10 h-56 animate-pulse rounded-xl bg-subtle" />}>
          <ReviewExample />
        </Suspense>
      </Band>

      <Band title="Cómo funciona">
        <ol className="grid gap-x-10 gap-y-8 sm:grid-cols-2 xl:grid-cols-4 xl:gap-x-8">
          {STEPS.map((step, i) => (
            <li key={step.title}>
              <span className="font-mono text-xs text-muted">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="mt-2 font-medium">{step.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{step.text}</p>
            </li>
          ))}
        </ol>
      </Band>

      <Band title="Últimas operaciones" id="operaciones">
        <Suspense fallback={<OperationsSkeleton />}>
          <RecentOperations />
        </Suspense>
      </Band>

      <footer className="mx-auto w-full max-w-6xl px-5 pb-10">
        <p className="border-t border-line pt-5 text-xs text-muted">
          Prototipo para EDU HUB, LABITCONF 2026. Opera con un token de prueba y no reemplaza a tu despachante ni a tu banco.
        </p>
      </footer>
    </>
  );
}

function Band({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mx-auto max-w-6xl scroll-mt-4 px-5">
      <div className="grid gap-6 border-t border-line py-14 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-12 md:py-20">
        <h2 className="text-xl font-[450] tracking-[-0.02em]">{title}</h2>
        <div className="min-w-0">{children}</div>
      </div>
    </section>
  );
}

async function Cases() {
  await connection();
  return <CaseList cases={exampleOrders(todayIso())} />;
}

async function ReviewExample() {
  await connection();
  const { result } = await samplePreview(todayIso());
  const errors = result.checks.filter((c) => c.status === "error");
  const ok = result.checks.filter((c) => c.status === "ok").length;

  return (
    <figure className="mt-10">
      <div className="flex items-start justify-between gap-6">
        <figcaption>
          <p className="font-medium">Resultado de la revisión: {EXAMPLES[0].title.toLowerCase()}</p>
          <p className="mt-0.5 text-sm text-muted">
            {errors.length} discrepancias y {ok} controles sin observaciones
          </p>
        </figcaption>
        <span className="stamp mt-1 mr-1 shrink-0 text-xs text-ink-2 sm:text-sm">Observado</span>
      </div>
      <div className="mt-6 border-t border-line-strong text-sm">
        <div className="hidden grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)_6.5rem] gap-4 border-b border-line py-2 text-xs text-muted sm:grid">
          <span>Control</span>
          <span>Esperado</span>
          <span>Encontrado</span>
          <span>Documento</span>
        </div>
        <ul>
          {errors.map((c) => (
            <li
              key={c.id}
              className="grid gap-1 border-b border-line py-3.5 sm:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)_6.5rem] sm:gap-4"
            >
              <span className="font-medium">{c.label}</span>
              <span className="font-mono text-[13px] break-words text-ink-2">
                <span className="font-sans text-muted sm:hidden">Esperado: </span>
                {c.expected}
              </span>
              <span className="font-mono text-[13px] break-words text-bad">
                <span className="font-sans text-muted sm:hidden">Encontrado: </span>
                {c.found}
              </span>
              <span className="text-muted">{c.documents.map((d) => SHORT_DOC[d]).join(", ")}</span>
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}

/** Una fila por caso: las operaciones con el mismo proveedor, mercadería y monto cuentan una vez. */
function distinctOperations(operations: Operation[]): Operation[] {
  const seen = new Set<string>();
  return operations.filter(({ po }) => {
    const key = [po.sellerName, po.goodsDescription, po.currency, po.amount].join("|").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function RecentOperations() {
  await connection();
  const operations = distinctOperations(await listOperations()).slice(0, 2);

  if (operations.length === 0) {
    return (
      <p className="text-ink-2">
        Todavía no hay operaciones. Abrí un caso de ejemplo o{" "}
        <Link href="/operaciones/nueva#orden-de-compra" className="link">
          cargá tu orden de compra
        </Link>
        .
      </p>
    );
  }

  return (
    <ul className="border-t border-line-strong">
      {operations.map((op) => {
        const status = operationStatus(op);
        return (
          <li key={op.id} className="border-b border-line">
            <Link
              href={`/operaciones/${op.id}`}
              className="group grid gap-x-6 gap-y-1.5 py-4 sm:grid-cols-[minmax(0,1fr)_auto_11rem] sm:items-center"
            >
              <span className="min-w-0">
                <span className="block font-medium group-hover:underline group-hover:decoration-line-strong group-hover:underline-offset-4">
                  {op.po.sellerName}
                </span>
                <span className="block truncate text-sm text-muted">
                  {op.po.goodsDescription} · {op.po.portOfLoading} → {op.po.portOfDischarge}
                </span>
              </span>
              <span className="font-mono text-sm tabular-nums">
                {op.po.currency} {formatNumber(op.po.amount, 2)}
              </span>
              <StatusText tone={status.tone}>{status.label}</StatusText>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function CasesSkeleton() {
  return (
    <div className="panel divide-y divide-line" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2 px-5 py-4">
          <div className="h-4 w-40 animate-pulse rounded bg-subtle" />
          <div className="h-3.5 w-56 animate-pulse rounded bg-subtle" />
        </div>
      ))}
    </div>
  );
}

function OperationsSkeleton() {
  return (
    <div className="border-t border-line-strong" aria-hidden>
      {[0, 1].map((i) => (
        <div key={i} className="space-y-2 border-b border-line py-4">
          <div className="h-4 w-1/3 animate-pulse rounded bg-subtle" />
          <div className="h-3.5 w-1/2 animate-pulse rounded bg-subtle" />
        </div>
      ))}
    </div>
  );
}
