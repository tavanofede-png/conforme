import { handle } from "@/lib/http";
import { NotFoundError } from "@/lib/operations";
import { getOperation } from "@/lib/store";

export async function GET(_req: Request, ctx: RouteContext<"/api/operations/[id]">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const operation = await getOperation(id);
    if (!operation) throw new NotFoundError(id);
    return Response.json({ operation });
  });
}
