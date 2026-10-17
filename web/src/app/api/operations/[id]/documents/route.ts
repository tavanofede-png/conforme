import { handle, isDocKind } from "@/lib/http";
import { attachDocument, UserError } from "@/lib/operations";

export async function POST(req: Request, ctx: RouteContext<"/api/operations/[id]/documents">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const form = await req.formData().catch(() => {
      throw new UserError("Mandá el archivo como formulario (multipart/form-data).");
    });
    const kind = form.get("kind");
    const file = form.get("file");
    if (!isDocKind(kind)) throw new UserError("Indicá qué documento es: invoice, packingList o billOfLading.");
    if (!(file instanceof File)) throw new UserError("Falta el archivo.");

    const operation = await attachDocument(id, kind, {
      name: file.name,
      type: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    return Response.json({ operation });
  });
}
