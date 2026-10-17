import { handle, readJson } from "@/lib/http";
import { attachSamples, UserError } from "@/lib/operations";
import { SAMPLE_SETS, type SampleSet } from "@/lib/samples";

export async function POST(req: Request, ctx: RouteContext<"/api/operations/[id]/samples">) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { set } = await readJson(req);
    if (typeof set !== "string" || !(set in SAMPLE_SETS)) {
      throw new UserError(`El juego tiene que ser uno de: ${Object.keys(SAMPLE_SETS).join(", ")}.`);
    }
    const operation = await attachSamples(id, set as SampleSet);
    return Response.json({ operation });
  });
}
