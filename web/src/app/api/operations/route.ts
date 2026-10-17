import { connection } from "next/server";
import { purchaseOrderSchema } from "@/lib/domain";
import { handle, readJson } from "@/lib/http";
import { createOperation, listOperations } from "@/lib/store";

export async function GET() {
  await connection();
  return handle(async () => Response.json({ operations: await listOperations() }));
}

export async function POST(req: Request) {
  return handle(async () => {
    const po = purchaseOrderSchema.parse(await readJson(req));
    const operation = await createOperation(po);
    return Response.json({ operation }, { status: 201 });
  });
}
