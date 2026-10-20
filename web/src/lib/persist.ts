import { promises as fs } from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.CONFORME_DATA_DIR ?? path.join(process.cwd(), "data");

/** En Vercel el disco es de solo lectura. Con un Blob Store privado, las operaciones sobreviven al deploy. */
export function usesBlob(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

function localPath(pathname: string): string {
  const full = path.resolve(DATA_DIR, pathname);
  const root = path.resolve(DATA_DIR);
  if (full !== root && !full.startsWith(root + path.sep)) throw new Error("Ruta de datos inválida.");
  return full;
}

async function readBlob(pathname: string): Promise<Buffer | null> {
  const { get } = await import("@vercel/blob");
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  return Buffer.from(await new Response(result.stream).arrayBuffer());
}

async function writeBlob(pathname: string, body: Buffer | string, contentType: string) {
  const { put } = await import("@vercel/blob");
  await put(pathname, body, {
    access: "private",
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType,
  });
}

export async function readJson<T>(pathname: string, fallback: T): Promise<T> {
  if (!usesBlob()) {
    try {
      return JSON.parse(await fs.readFile(localPath(pathname), "utf8")) as T;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return fallback;
      throw err;
    }
  }
  const bytes = await readBlob(pathname);
  if (!bytes) return fallback;
  return JSON.parse(bytes.toString("utf8")) as T;
}

export async function writeJson(pathname: string, value: unknown) {
  const text = JSON.stringify(value, null, 2);
  if (!usesBlob()) {
    const file = localPath(pathname);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, text);
    return;
  }
  await writeBlob(pathname, text, "application/json");
}

export async function writeBytes(pathname: string, bytes: Uint8Array, contentType: string) {
  if (!usesBlob()) {
    const file = localPath(pathname);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, bytes);
    return;
  }
  await writeBlob(pathname, Buffer.from(bytes), contentType);
}

export async function readBytes(pathname: string): Promise<Buffer> {
  if (!usesBlob()) return fs.readFile(localPath(pathname));
  const bytes = await readBlob(pathname);
  if (!bytes) throw new Error("No encontramos el archivo.");
  return bytes;
}
