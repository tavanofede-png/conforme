import { createHash, randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { id as keccak } from "ethers";
import type { DocKind, Operation, PurchaseOrder } from "./domain";

const DATA_DIR = process.env.CONFORME_DATA_DIR ?? path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

export const OPERATION_ID = /^OP-\d{8}-[A-F0-9]{4}$/;

interface Db {
  operations: Operation[];
}

let queue: Promise<unknown> = Promise.resolve();

/** Serializa lecturas y escrituras para que dos pedidos no se pisen el archivo. */
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

async function readDb(): Promise<Db> {
  try {
    return JSON.parse(await fs.readFile(DB_FILE, "utf8")) as Db;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { operations: [] };
    throw err;
  }
}

async function writeDb(db: Db) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2));
}

export function dealIdOf(operationId: string): string {
  return keccak(operationId);
}

export function sha256Hex(data: Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}

export function addEvent(op: Operation, message: string) {
  op.events.push({ at: new Date().toISOString(), message });
}

export async function listOperations(): Promise<Operation[]> {
  const db = await serialized(readDb);
  return [...db.operations].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getOperation(id: string): Promise<Operation | null> {
  if (!OPERATION_ID.test(id)) return null;
  const db = await serialized(readDb);
  return db.operations.find((op) => op.id === id) ?? null;
}

export async function createOperation(po: PurchaseOrder): Promise<Operation> {
  return serialized(async () => {
    const db = await readDb();
    const now = new Date();
    const id = `OP-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${randomBytes(2).toString("hex").toUpperCase()}`;
    const op: Operation = {
      id,
      createdAt: now.toISOString(),
      po,
      documents: {},
      escrow: { status: "sin-fondos", dealId: dealIdOf(id) },
      events: [],
    };
    addEvent(op, `Orden de compra cargada: ${po.buyerName} le compra a ${po.sellerName.replace(/\.$/, "")}.`);
    db.operations.push(op);
    await writeDb(db);
    return op;
  });
}

/** Lee, modifica y guarda una operación sin que otro pedido escriba en el medio. */
export async function updateOperation(id: string, mutate: (op: Operation) => void | Promise<void>): Promise<Operation> {
  return serialized(async () => {
    const db = await readDb();
    const op = db.operations.find((o) => o.id === id);
    if (!op) throw new NotFoundError(id);
    await mutate(op);
    await writeDb(db);
    return op;
  });
}

export class NotFoundError extends Error {
  constructor(id: string) {
    super(`No existe la operación ${id}`);
  }
}

const EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export async function saveUpload(operationId: string, kind: DocKind, mimeType: string, bytes: Uint8Array) {
  const sha256 = sha256Hex(bytes);
  const dir = path.join(UPLOADS_DIR, operationId);
  await fs.mkdir(dir, { recursive: true });
  const storedAs = `${kind}-${sha256.slice(0, 12)}.${EXTENSIONS[mimeType] ?? "bin"}`;
  await fs.writeFile(path.join(dir, storedAs), bytes);
  return { storedAs, sha256 };
}

export async function readUpload(operationId: string, storedAs: string): Promise<Buffer> {
  if (!OPERATION_ID.test(operationId) || !/^[a-zA-Z]+-[a-f0-9]{12}\.[a-z]+$/.test(storedAs)) {
    throw new NotFoundError(operationId);
  }
  return fs.readFile(path.join(UPLOADS_DIR, operationId, storedAs));
}
