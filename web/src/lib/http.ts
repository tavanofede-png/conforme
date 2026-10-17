import { ZodError } from "zod";
import { DOC_KINDS, type DocKind } from "./domain";
import { NotFoundError, UserError } from "./operations";

const PO_LABELS: Record<string, string> = {
  buyerName: "comprador",
  sellerName: "vendedor",
  goodsDescription: "descripción",
  goodsKeywords: "palabras clave",
  hsCode: "posición NCM",
  quantity: "cantidad",
  unit: "unidad",
  packages: "bultos",
  grossWeightKg: "peso bruto",
  incoterm: "Incoterm",
  incotermPlace: "lugar del Incoterm",
  portOfLoading: "puerto de carga",
  portOfDischarge: "puerto de descarga",
  latestShipmentDate: "fecha de embarque",
  amount: "monto",
  currency: "moneda",
  quantityTolerancePct: "tolerancia de cantidad",
  weightTolerancePct: "tolerancia de peso",
};

export function isDocKind(value: unknown): value is DocKind {
  return typeof value === "string" && (DOC_KINDS as readonly string[]).includes(value);
}

/** Convierte los errores conocidos en respuestas JSON con un mensaje para mostrar. */
export async function handle(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof NotFoundError) return Response.json({ error: err.message }, { status: 404 });
    if (err instanceof UserError) return Response.json({ error: err.message }, { status: 400 });
    if (err instanceof ZodError) {
      const fields = Array.from(new Set(err.issues.map((i) => PO_LABELS[String(i.path[0])] ?? i.path.join(".")))).filter(Boolean);
      return Response.json(
        { error: `Revisá estos datos: ${fields.join(", ") || "formulario"}.`, issues: err.issues },
        { status: 400 },
      );
    }
    console.error(err);
    return Response.json({ error: "Error inesperado en el servidor." }, { status: 500 });
  }
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (body && typeof body === "object") return body as Record<string, unknown>;
  } catch {}
  throw new UserError("El pedido no trae un JSON válido.");
}
