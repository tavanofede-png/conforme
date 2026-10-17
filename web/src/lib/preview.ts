import { cacheLife } from "next/cache";
import type { DocKind, VerificationResult } from "./domain";
import { pdfToText } from "./extract";
import { extractFieldsHeuristic } from "./extract/heuristic";
import { verify, type DocsToVerify } from "./rules";
import { demoPurchaseOrder, generateSamples } from "./samples";

export interface SamplePreview {
  files: { kind: DocKind; fileName: string }[];
  result: VerificationResult;
}

/** Corre el circuito real (PDF de ejemplo, lectura por reglas, controles) para mostrarlo en la portada. */
export async function samplePreview(today: string): Promise<SamplePreview> {
  "use cache";
  cacheLife("days");
  const po = demoPurchaseOrder(today);
  const files = await generateSamples(po, "con-errores", today);
  const docs: DocsToVerify = {};
  for (const file of files) {
    (docs as Record<DocKind, unknown>)[file.kind] = extractFieldsHeuristic(file.kind, await pdfToText(file.bytes));
  }
  return {
    files: files.map(({ kind, fileName }) => ({ kind, fileName })),
    result: verify(po, docs, today),
  };
}
