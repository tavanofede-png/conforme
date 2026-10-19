import { handle, isDocKind } from "@/lib/http";
import { attachDocument, UserError } from "@/lib/operations";
import { findByToken } from "@/lib/store";

/** El proveedor sube un documento con el enlace que le pasó el importador. No puede mover el pago. */
export async function POST(req: Request, ctx: RouteContext<"/api/access/[token]/documents">) {
  return handle(async () => {
    const { token } = await ctx.params;
    const found = await findByToken(token);
    if (!found || found.role !== "supplier") throw new UserError("Este enlace no permite cargar documentos.");
    const form = await req.formData().catch(() => {
      throw new UserError("Mandá el archivo como formulario (multipart/form-data).");
    });
    const kind = form.get("kind");
    const file = form.get("file");
    if (!isDocKind(kind)) throw new UserError("Indicá qué documento es.");
    if (!(file instanceof File)) throw new UserError("Falta el archivo.");
    const operation = await attachDocument(found.operation.id, kind, {
      name: file.name,
      type: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    return Response.json({ operation });
  });
}
