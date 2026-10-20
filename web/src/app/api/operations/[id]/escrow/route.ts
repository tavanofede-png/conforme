import { explainChainError, fundParameters } from "@/lib/chain";
import { handle, readJson } from "@/lib/http";
import { confirmWalletFund, fundOperation, refundOperation, UserError } from "@/lib/operations";
import { getOperation } from "@/lib/store";

export async function GET(_req: Request, ctx: RouteContext<"/api/operations/[id]/escrow">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const operation = await getOperation(id);
    if (!operation) throw new UserError("No existe la operación.");
    if (operation.escrow.status !== "sin-fondos") throw new UserError("El pago de esta operación ya se depositó.");
    try {
      return Response.json(await fundParameters(operation));
    } catch (err) {
      throw new UserError(explainChainError(err));
    }
  });
}

export async function POST(req: Request, ctx: RouteContext<"/api/operations/[id]/escrow">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const body = await readJson(req);
    if (body.action === "fund") return Response.json({ operation: await fundOperation(id) });
    if (body.action === "refund") return Response.json({ operation: await refundOperation(id) });
    if (body.action === "confirm-fund") {
      const operation = await confirmWalletFund(id, String(body.approveTx ?? ""), String(body.fundTx ?? ""));
      return Response.json({ operation });
    }
    throw new UserError('La acción tiene que ser "fund", "confirm-fund" o "refund".');
  });
}
