"use client";

import { CaretDownIcon, CircleNotchIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { postJson, type OperationResponse } from "@/lib/client";
import { NCM_TO_DEFINE, TO_DEFINE, type PurchaseOrder } from "@/lib/domain";
import { formatDate, formatNumber, parseNumber } from "@/lib/normalize";

const INCOTERMS = ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"];
/** En estos Incoterms la entrega es en origen; en el resto, en destino. */
const DELIVERED_AT_ORIGIN = new Set(["EXW", "FCA", "FAS", "FOB"]);

const STOPWORDS = new Set(["para", "desde", "hasta", "como", "entre", "sobre", "tipo", "marca", "modelo", "unidades", "pulgada", "pulgadas"]);

type Key = Exclude<keyof PurchaseOrder, "requiresSanitary">;
type FormState = Record<Key, string>;

const MAIN: Key[] = ["sellerName", "goodsDescription", "amount", "portOfDischarge"];

export interface FormDefaults {
  buyerName: string;
  latestShipmentDate: string;
}

function initialForm(defaults: FormDefaults): FormState {
  return {
    sellerName: "",
    goodsDescription: "",
    amount: "",
    portOfDischarge: "Buenos Aires",
    buyerName: defaults.buyerName,
    goodsKeywords: "",
    hsCode: "",
    quantity: "1",
    unit: "lote",
    packages: "1",
    grossWeightKg: "1000",
    incoterm: "FOB",
    incotermPlace: "",
    portOfLoading: "",
    latestShipmentDate: defaults.latestShipmentDate,
    currency: "USD",
    quantityTolerancePct: "0",
    weightTolerancePct: "5",
  };
}

/** Las primeras palabras con significado de la descripción, para buscarlas en la factura. */
function keywordsFrom(description: string): string[] {
  const words = description.toLowerCase().split(/[^\p{L}]+/u);
  const significant = words.filter((w) => w.length >= 4 && !STOPWORDS.has(w));
  return Array.from(new Set(significant.length > 0 ? significant : words.filter(Boolean))).slice(0, 2);
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

function validate(form: FormState, keywords: string[]): Partial<Record<Key, string>> {
  const errors: Partial<Record<Key, string>> = {};
  for (const key of ["sellerName", "goodsDescription", "portOfDischarge", "buyerName", "unit"] as const) {
    if (form[key].trim().length < (key === "unit" ? 1 : 2)) errors[key] = "Completá este dato.";
  }
  for (const key of ["amount", "quantity", "packages", "grossWeightKg"] as const) {
    const n = parseNumber(form[key]);
    if (!form[key].trim()) errors[key] = "Completá este dato.";
    else if (n == null) errors[key] = "Ingresá un número.";
    else if (n <= 0) errors[key] = "Tiene que ser mayor que cero.";
  }
  if (!errors.packages && !Number.isInteger(parseNumber(form.packages))) errors.packages = "Los bultos van sin decimales.";
  if (form.hsCode.trim() && !/^[\d.\s]{6,12}$/.test(form.hsCode.trim())) errors.hsCode = "Usá el formato 0000.00.00.";
  if (form.goodsDescription.trim() && keywords.length === 0) errors.goodsKeywords = "Indicá al menos una palabra.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.latestShipmentDate)) errors.latestShipmentDate = "Elegí una fecha.";
  if (form.currency.trim().length !== 3) errors.currency = "Código de 3 letras, como USD.";
  for (const [key, max] of [
    ["quantityTolerancePct", 10],
    ["weightTolerancePct", 20],
  ] as const) {
    const n = parseNumber(form[key] || "0");
    if (n == null || n < 0 || n > max) errors[key] = `Entre 0 y ${max} %.`;
  }
  return errors;
}

export function NewOperationForm({ defaults }: { defaults: FormDefaults }) {
  const router = useRouter();
  const [initial] = useState(() => initialForm(defaults));
  const [form, setForm] = useState<FormState>(initial);
  const [errors, setErrors] = useState<Partial<Record<Key, string>>>({});
  const [advanced, setAdvanced] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sanitary, setSanitary] = useState(false);
  const created = useRef(false);

  // Next conserva la página oculta al navegar: después de crear la operación, la próxima visita empieza de cero.
  useLayoutEffect(
    () => () => {
      if (!created.current) return;
      created.current = false;
      setForm(initial);
      setErrors({});
      setAdvanced(false);
      setSanitary(false);
      setSending(false);
    },
    [initial],
  );

  const derivedKeywords = keywordsFrom(form.goodsDescription);
  const keywords = form.goodsKeywords.trim() ? splitList(form.goodsKeywords) : derivedKeywords;
  const portOfLoading = form.portOfLoading.trim() || TO_DEFINE;
  const derivedPlace = DELIVERED_AT_ORIGIN.has(form.incoterm) ? portOfLoading : form.portOfDischarge.trim() || TO_DEFINE;
  const incotermPlace = form.incotermPlace.trim() || derivedPlace;
  const amount = parseNumber(form.amount);

  const set = (key: Key) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setApiError(null);
    const found = validate(form, keywords);
    setErrors(found);
    const invalid = Object.keys(found) as Key[];
    if (invalid.length > 0) {
      if (invalid.some((k) => !MAIN.includes(k))) setAdvanced(true);
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    setSending(true);
    try {
      const num = (s: string) => parseNumber(s) ?? 0;
      const po: PurchaseOrder = {
        buyerName: form.buyerName.trim(),
        sellerName: form.sellerName.trim(),
        goodsDescription: form.goodsDescription.trim(),
        goodsKeywords: keywords,
        hsCode: form.hsCode.trim() || NCM_TO_DEFINE,
        quantity: num(form.quantity),
        unit: form.unit.trim(),
        packages: num(form.packages),
        grossWeightKg: num(form.grossWeightKg),
        incoterm: form.incoterm,
        incotermPlace,
        portOfLoading,
        portOfDischarge: form.portOfDischarge.trim(),
        latestShipmentDate: form.latestShipmentDate,
        amount: num(form.amount),
        currency: form.currency.trim().toUpperCase(),
        quantityTolerancePct: num(form.quantityTolerancePct || "0"),
        weightTolerancePct: num(form.weightTolerancePct || "0"),
        ...(sanitary ? { requiresSanitary: true } : {}),
      };
      const { operation } = await postJson<OperationResponse>("/api/operations", po);
      created.current = true;
      router.push(`/operaciones/${operation.id}`);
    } catch (err) {
      setApiError((err as Error).message);
      setSending(false);
    }
  }

  const field = (key: Key) => ({ value: form[key], onChange: set(key), error: errors[key], id: `po-${key}` });
  const changed = (...keys: Key[]) => keys.some((k) => form[k].trim() !== initial[k]);

  const summary: [string, string][] = [];
  if (form.sellerName.trim()) summary.push(["Proveedor", form.sellerName.trim()]);
  if (form.buyerName.trim()) summary.push(["Comprador", form.buyerName.trim()]);
  if (form.goodsDescription.trim()) summary.push(["Mercadería", form.goodsDescription.trim()]);
  if (changed("quantity", "unit") && parseNumber(form.quantity)) {
    summary.push(["Cantidad", `${formatNumber(parseNumber(form.quantity))} ${form.unit.trim()}`]);
  }
  if (form.hsCode.trim()) summary.push(["Posición NCM", form.hsCode.trim()]);
  if (changed("packages") && parseNumber(form.packages)) summary.push(["Bultos", formatNumber(parseNumber(form.packages))]);
  if (changed("grossWeightKg") && parseNumber(form.grossWeightKg)) {
    summary.push(["Peso bruto", `${formatNumber(parseNumber(form.grossWeightKg))} kg`]);
  }
  if (form.portOfLoading.trim()) summary.push(["Puerto de carga", form.portOfLoading.trim()]);
  if (form.portOfDischarge.trim()) summary.push(["Puerto de descarga", form.portOfDischarge.trim()]);
  if ((changed("incoterm") || form.incotermPlace.trim()) && incotermPlace !== TO_DEFINE) {
    summary.push(["Incoterm", `${form.incoterm} ${incotermPlace}`]);
  }
  if (changed("latestShipmentDate") && form.latestShipmentDate) summary.push(["Embarque hasta", formatDate(form.latestShipmentDate)]);
  if (changed("quantityTolerancePct", "weightTolerancePct")) {
    summary.push(["Tolerancias", `Cantidad ${form.quantityTolerancePct || "0"} %, peso ${form.weightTolerancePct || "0"} %`]);
  }
  if (form.goodsKeywords.trim()) summary.push(["Palabras clave", splitList(form.goodsKeywords).join(", ")]);

  const defaultsLine = [
    form.buyerName.trim() || "Falta el comprador",
    incotermPlace === TO_DEFINE ? form.incoterm : `${form.incoterm} ${incotermPlace}`,
    form.hsCode.trim() ? `NCM ${form.hsCode.trim()}` : "NCM a definir",
    form.latestShipmentDate && `Embarque hasta ${formatDate(form.latestShipmentDate)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <form onSubmit={submit} noValidate className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-16">
      <div className="min-w-0">
        <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
          <Field label="Proveedor" className="sm:col-span-2" placeholder="Razón social, como figura en la factura" {...field("sellerName")} />
          <Field label="Mercadería" className="sm:col-span-2" placeholder="Por ejemplo, válvulas hidráulicas de 3/8 pulgada" {...field("goodsDescription")} />
          <Field label="Monto" mono inputMode="decimal" prefix={form.currency || "USD"} placeholder="0,00" {...field("amount")} />
          <Field label="Puerto de descarga" {...field("portOfDischarge")} />
        </div>

        <details className="group mt-8 border-y border-line" open={advanced} onToggle={(e) => setAdvanced(e.currentTarget.open)}>
          <summary className="flex items-center justify-between gap-4 py-4">
            <span className="min-w-0">
              <span className="block font-medium">Ajustes avanzados</span>
              <span className={`mt-0.5 block text-sm ${form.buyerName.trim() ? "text-muted" : "text-bad"}`}>{defaultsLine}</span>
            </span>
            <CaretDownIcon size={16} className="shrink-0 text-muted transition-transform group-open:rotate-180" />
          </summary>

          <div className="space-y-7 pt-1 pb-8">
            <p className="max-w-xl text-sm text-ink-2">
              Los valores por defecto alcanzan para simular los documentos del proveedor. Para revisar documentos reales,
              completá la posición NCM, el puerto de carga y las palabras clave.
            </p>

            <Group title="Partes">
              <Field label="Comprador (importador)" className="sm:col-span-4" placeholder="Tu empresa" {...field("buyerName")} />
            </Group>

            <Group title="Mercadería">
              <Field
                label="Palabras clave de la factura"
                hint="Tienen que aparecer en la descripción de la factura. Separalas con comas; para alternativas, barra: neumático/tyre."
                className="sm:col-span-6"
                placeholder={derivedKeywords.length > 0 ? derivedKeywords.join(", ") : "Se toman de la mercadería"}
                {...field("goodsKeywords")}
              />
              <Field label="Posición NCM" className="sm:col-span-2" mono placeholder={TO_DEFINE} {...field("hsCode")} />
              <Field label="Cantidad" className="sm:col-span-2" mono inputMode="decimal" {...field("quantity")} />
              <Field label="Unidad" className="sm:col-span-2" {...field("unit")} />
              <label className="flex items-start gap-3 text-sm sm:col-span-6">
                <input type="checkbox" className="mt-1" checked={sanitary} onChange={(e) => setSanitary(e.target.checked)} />
                <span>Esta mercadería necesita certificado sanitario o fitosanitario.</span>
              </label>
              <Field label="Bultos" className="sm:col-span-2" mono inputMode="numeric" {...field("packages")} />
              <Field label="Peso bruto" className="sm:col-span-2" mono inputMode="decimal" suffix="kg" {...field("grossWeightKg")} />
            </Group>

            <Group title="Entrega">
              <div className="sm:col-span-2">
                <label htmlFor="po-incoterm" className="label">
                  Incoterm
                </label>
                <select id="po-incoterm" className="field font-mono" value={form.incoterm} onChange={set("incoterm")}>
                  {INCOTERMS.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
              <Field label="Lugar del Incoterm" className="sm:col-span-4" placeholder={derivedPlace} {...field("incotermPlace")} />
              <Field label="Puerto de carga" className="sm:col-span-4" placeholder={TO_DEFINE} {...field("portOfLoading")} />
              <Field label="Embarque a más tardar" className="sm:col-span-2" mono type="date" {...field("latestShipmentDate")} />
            </Group>

            <Group title="Pago">
              <Field label="Moneda" className="sm:col-span-2" mono maxLength={3} {...field("currency")} />
              <Field
                label="Tolerancia de cantidad"
                hint="Hasta 10 %."
                className="sm:col-span-2"
                mono
                inputMode="decimal"
                suffix="%"
                {...field("quantityTolerancePct")}
              />
              <Field
                label="Tolerancia de peso"
                hint="Hasta 20 %."
                className="sm:col-span-2"
                mono
                inputMode="decimal"
                suffix="%"
                {...field("weightTolerancePct")}
              />
            </Group>
          </div>
        </details>
      </div>

      <aside className="lg:sticky lg:top-8 lg:self-start">
        <h3 className="text-[15px] font-medium">Orden de compra</h3>
        {amount != null && amount > 0 && (
          <p className="mt-3 whitespace-nowrap">
            <span className="mr-1 text-sm font-medium text-muted">{form.currency || "USD"}</span>
            <span className="numeral text-[2rem]">{formatNumber(amount, 2)}</span>
          </p>
        )}
        {summary.length > 0 && (
          <dl className="mt-4 divide-y divide-line border-y border-line text-sm">
            {summary.map(([label, value]) => (
              <div key={label} className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-3 py-2">
                <dt className="text-muted">{label}</dt>
                <dd className="break-words">{value}</dd>
              </div>
            ))}
          </dl>
        )}
        <button type="submit" className="btn btn-primary btn-lg mt-5 w-full" disabled={sending}>
          {sending && <CircleNotchIcon size={16} className="animate-spin" />}
          {sending ? "Creando…" : "Crear operación"}
        </button>
        {Object.keys(errors).length > 0 && (
          <p role="alert" className="mt-3 text-sm text-bad">
            Revisá los datos marcados en rojo.
          </p>
        )}
        {apiError && (
          <p role="alert" className="mt-3 text-sm text-bad">
            {apiError}
          </p>
        )}
      </aside>
    </form>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="border-t border-line pt-5">
      <legend className="float-left mb-4 w-full text-sm font-medium">{title}</legend>
      <div className="clear-left grid gap-x-4 gap-y-4 sm:grid-cols-6">{children}</div>
    </fieldset>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  prefix,
  suffix,
  mono,
  className = "",
  ...input
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  prefix?: string;
  suffix?: string;
  mono?: boolean;
  className?: string;
  value: string;
  onChange: (e: { target: { value: string } }) => void;
  placeholder?: string;
  inputMode?: "decimal" | "numeric";
  type?: string;
  maxLength?: number;
}) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center font-mono text-sm text-muted">
            {prefix}
          </span>
        )}
        <input
          id={id}
          className={`field ${mono ? "font-mono tabular-nums" : ""} ${prefix ? "pl-14" : ""} ${suffix ? "pr-10" : ""}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...input}
        />
        {suffix && (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted">{suffix}</span>
        )}
      </div>
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-bad">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="mt-1.5 text-xs text-muted">
            {hint}
          </p>
        )
      )}
    </div>
  );
}
