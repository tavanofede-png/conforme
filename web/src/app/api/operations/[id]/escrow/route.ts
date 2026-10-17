import { handle, readJson } from "@/lib/http";
import { fundOperation, refundOperation, UserError } from "@/lib/operations";

export async function POST(req: Request, ctx: RouteContext<"/api/operations/[id]/escrow">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { action } = await readJson(req);
    if (action === "fund") return Response.json({ operation: await fundOperation(id) });
    if (action === "refund") return Response.json({ operation: await refundOperation(id) });
    throw new UserError('La acción tiene que ser "fund" o "refund".');
  });
}
