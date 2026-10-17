import { DOC_LABELS } from "@/lib/domain";
import { handle, isDocKind, readJson } from "@/lib/http";
import { correctFields, NotFoundError, UserError } from "@/lib/operations";
import { getOperation, readUpload } from "@/lib/store";

/** Devuelve el archivo original para verlo en el navegador. */
export async function GET(_req: Request, ctx: RouteContext<"/api/operations/[id]/documents/[kind]">) {
  return handle(async () => {
    const { id, kind } = await ctx.params;
    if (!isDocKind(kind)) throw new NotFoundError(id);
    const op = await getOperation(id);
    const doc = op?.documents[kind];
    if (!op || !doc) throw new NotFoundError(id);
    const bytes = await readUpload(op.id, doc.storedAs);
    const safeName = doc.fileName.replace(/[^\w.-]+/g, "_");
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": doc.mimeType,
        "Content-Disposition": `inline; filename="${safeName}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=60",
      },
    });
  });
}

/** Corrige a mano campos que la lectura automática no tomó bien. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/operations/[id]/documents/[kind]">) {
  return handle(async () => {
    const { id, kind } = await ctx.params;
    if (!isDocKind(kind)) throw new UserError("Documento desconocido.");
    const body = await readJson(req);
    const fields = body.fields;
    if (!fields || typeof fields !== "object") throw new UserError(`Indicá qué campos de ${DOC_LABELS[kind]} corregir.`);
    const operation = await correctFields(id, kind, fields as Record<string, unknown>);
    return Response.json({ operation });
  });
}
