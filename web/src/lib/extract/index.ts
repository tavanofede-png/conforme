import { extractText } from "unpdf";
import type { DocFieldsByKind, DocKind } from "../domain";
import { extractFieldsHeuristic } from "./heuristic";
import { extractFieldsLlm, llmConfig } from "./llm";

export interface Extraction<K extends DocKind> {
  fields: DocFieldsByKind[K];
  extractedBy: "reglas" | "ia";
  textPreview: string;
  notes: string[];
}

export const ACCEPTED_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

export async function pdfToText(data: Uint8Array): Promise<string> {
  const { text } = await extractText(new Uint8Array(data), { mergePages: true });
  return text;
}

export async function extractDocument<K extends DocKind>(kind: K, data: Uint8Array, mimeType: string): Promise<Extraction<K>> {
  const notes: string[] = [];
  const isPdf = mimeType === "application/pdf";
  const text = isPdf ? await pdfToText(data) : "";
  const textPreview = text.slice(0, 1500);

  if (isPdf && text.trim().length < 20 && !llmConfig()) {
    throw new Error("El PDF no tiene texto (parece escaneado). Configurá LLM_API_KEY para leerlo con IA o cargá los datos a mano.");
  }
  if (!isPdf && !llmConfig()) {
    throw new Error("Para leer imágenes hace falta configurar LLM_API_KEY. Mientras tanto, subí el PDF.");
  }

  if (llmConfig()) {
    try {
      const imageDataUrl = isPdf ? undefined : `data:${mimeType};base64,${Buffer.from(data).toString("base64")}`;
      const fields = await extractFieldsLlm(kind, { text, imageDataUrl });
      return { fields, extractedBy: "ia", textPreview, notes };
    } catch (err) {
      if (!isPdf) throw err;
      notes.push(`La lectura con IA falló (${(err as Error).message}); usamos el lector por reglas.`);
    }
  }

  return { fields: extractFieldsHeuristic(kind, text), extractedBy: "reglas", textPreview, notes };
}
