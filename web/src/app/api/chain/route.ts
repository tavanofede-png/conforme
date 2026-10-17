import { connection } from "next/server";
import { getChainInfo } from "@/lib/chain";
import { handle } from "@/lib/http";

export async function GET() {
  await connection();
  return handle(async () => Response.json(await getChainInfo()));
}
