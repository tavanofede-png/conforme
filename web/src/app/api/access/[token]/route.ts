import { handle } from "@/lib/http";
import { UserError } from "@/lib/operations";
import { findByToken } from "@/lib/store";

export async function GET(_req: Request, ctx: RouteContext<"/api/access/[token]">) {
  return handle(async () => {
    const { token } = await ctx.params;
    const found = await findByToken(token);
    if (!found || found.role !== "supplier") throw new UserError("Este enlace no sirve para ver la operación.");
    return Response.json({ operation: found.operation, role: found.role });
  });
}
