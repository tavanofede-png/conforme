import { handle } from "@/lib/http";
import { runVerification } from "@/lib/operations";

export async function POST(_req: Request, ctx: RouteContext<"/api/operations/[id]/verify">) {
  return handle(async () => {
    const { id } = await ctx.params;
    return Response.json({ operation: await runVerification(id) });
  });
}
