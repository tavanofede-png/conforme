/**
 * Escribe los dos juegos de documentos de la demo en ./samples para subirlos a mano.
 *
 *   npm run samples
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { demoPurchaseOrder, generateSamples, SAMPLE_SETS, type SampleSet } from "../src/lib/samples";

async function main() {
  const po = demoPurchaseOrder();
  for (const set of Object.keys(SAMPLE_SETS) as SampleSet[]) {
    const dir = path.join(process.cwd(), "samples", set);
    await mkdir(dir, { recursive: true });
    for (const doc of await generateSamples(po, set)) {
      await writeFile(path.join(dir, doc.fileName), doc.bytes);
      console.log(`${set}/${doc.fileName}`);
    }
  }
  console.log(`\nSirven para una orden de compra con embarque hasta el ${po.latestShipmentDate} (la que viene cargada en el formulario).`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
