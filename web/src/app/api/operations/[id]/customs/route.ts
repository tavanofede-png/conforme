import { handle, readJson } from "@/lib/http";
import { recordCustoms } from "@/lib/operations";

export async function POST(req: Request, ctx: RouteContext<"/api/operations/[id]/customs">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const body = await readJson(req);
    const operation = await recordCustoms(id, String(body.declarationNumber ?? ""), String(body.enteredAt ?? ""));
    return Response.json({ operation });
  });
}
