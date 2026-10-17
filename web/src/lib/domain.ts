import { z } from "zod";

export const DOC_KINDS = ["invoice", "packingList", "billOfLading"] as const;
export type DocKind = (typeof DOC_KINDS)[number];

export const DOC_LABELS: Record<DocKind, string> = {
  invoice: "Factura comercial",
  packingList: "Packing list",
  billOfLading: "Conocimiento de embarque (BL)",
};

export const purchaseOrderSchema = z.object({
  buyerName: z.string().trim().min(2),
  sellerName: z.string().trim().min(2),
  goodsDescription: z.string().trim().min(2),
  /** Palabras que la factura tiene que mencionar. Cada una puede tener alternativas separadas por "/". */
  goodsKeywords: z.array(z.string().trim().min(1)).min(1),
  hsCode: z.string().trim().regex(/^[\d.\s]{6,12}$/, "Posición NCM inválida"),
  quantity: z.number().positive(),
  unit: z.string().trim().min(1),
  packages: z.number().int().positive(),
  grossWeightKg: z.number().positive(),
  incoterm: z.string().trim().min(3).max(3),
  incotermPlace: z.string().trim().min(2),
  portOfLoading: z.string().trim().min(2),
  portOfDischarge: z.string().trim().min(2),
  latestShipmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().positive(),
  currency: z.string().trim().length(3),
  quantityTolerancePct: z.number().min(0).max(10).default(0),
  weightTolerancePct: z.number().min(0).max(20).default(5),
});

export type PurchaseOrder = z.infer<typeof purchaseOrderSchema>;

/** Lo que se guarda en la orden cuando se carga sin un dato que el esquema exige. */
export const TO_DEFINE = "A definir";
export const NCM_TO_DEFINE = "0000.00.00";

export interface InvoiceFields {
  invoiceNumber: string | null;
  date: string | null;
  seller: string | null;
  buyer: string | null;
  description: string | null;
  hsCode: string | null;
  quantity: number | null;
  unitPrice: number | null;
  totalAmount: number | null;
  currency: string | null;
  incoterm: string | null;
  incotermPlace: string | null;
}

export interface PackingListFields {
  invoiceNumber: string | null;
  seller: string | null;
  buyer: string | null;
  description: string | null;
  quantity: number | null;
  packages: number | null;
  netWeightKg: number | null;
  grossWeightKg: number | null;
}

export interface BillOfLadingFields {
  blNumber: string | null;
  shipper: string | null;
  consignee: string | null;
  vessel: string | null;
  portOfLoading: string | null;
  portOfDischarge: string | null;
  shippedOnBoardDate: string | null;
  description: string | null;
  hsCode: string | null;
  packages: number | null;
  grossWeightKg: number | null;
}

export interface DocFieldsByKind {
  invoice: InvoiceFields;
  packingList: PackingListFields;
  billOfLading: BillOfLadingFields;
}

export type AnyDocFields = InvoiceFields | PackingListFields | BillOfLadingFields;

export const FIELD_LABELS: { [K in DocKind]: Record<keyof DocFieldsByKind[K], string> } = {
  invoice: {
    invoiceNumber: "Número de factura",
    date: "Fecha",
    seller: "Vendedor",
    buyer: "Comprador",
    description: "Descripción",
    hsCode: "Posición arancelaria",
    quantity: "Cantidad",
    unitPrice: "Precio unitario",
    totalAmount: "Importe total",
    currency: "Moneda",
    incoterm: "Incoterm",
    incotermPlace: "Lugar del Incoterm",
  },
  packingList: {
    invoiceNumber: "Factura de referencia",
    seller: "Vendedor",
    buyer: "Comprador",
    description: "Descripción",
    quantity: "Cantidad",
    packages: "Bultos",
    netWeightKg: "Peso neto (kg)",
    grossWeightKg: "Peso bruto (kg)",
  },
  billOfLading: {
    blNumber: "Número de BL",
    shipper: "Cargador",
    consignee: "Consignatario",
    vessel: "Buque",
    portOfLoading: "Puerto de carga",
    portOfDischarge: "Puerto de descarga",
    shippedOnBoardDate: "Fecha a bordo",
    description: "Descripción",
    hsCode: "Posición arancelaria",
    packages: "Bultos",
    grossWeightKg: "Peso bruto (kg)",
  },
};

export const NUMERIC_FIELDS = new Set([
  "quantity",
  "unitPrice",
  "totalAmount",
  "packages",
  "netWeightKg",
  "grossWeightKg",
]);

export const DATE_FIELDS = new Set(["date", "shippedOnBoardDate"]);

export function emptyFields<K extends DocKind>(kind: K): DocFieldsByKind[K] {
  const keys = Object.keys(FIELD_LABELS[kind]);
  return Object.fromEntries(keys.map((k) => [k, null])) as unknown as DocFieldsByKind[K];
}

export type CheckStatus = "ok" | "error" | "warning";

export interface Check {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  rule: string;
  documents: DocKind[];
  expected?: string;
  found?: string;
  fix?: string;
}

export type Verdict = "conforme" | "observado" | "incompleto";

export interface VerificationResult {
  verdict: Verdict;
  checks: Check[];
  errors: number;
  warnings: number;
  checkedAt: string;
}

export interface StoredDoc<K extends DocKind = DocKind> {
  kind: K;
  fileName: string;
  storedAs: string;
  mimeType: string;
  sha256: string;
  uploadedAt: string;
  extractedBy: "reglas" | "ia";
  simulated: boolean;
  fields: DocFieldsByKind[K];
  /** Campos que alguien corrigió a mano después de la lectura automática. */
  editedFields: string[];
  notes: string[];
  textPreview: string;
}

export type EscrowAction = "fund" | "release" | "refund";

export type EscrowStatus = "sin-fondos" | "en-custodia" | "liberado" | "devuelto";

export interface EscrowState {
  status: EscrowStatus;
  dealId: string;
  network?: string;
  amountUnits?: string;
  deadline?: number;
  approveTx?: string;
  fundTx?: string;
  releaseTx?: string;
  refundTx?: string;
  docsHash?: string;
  lastError?: string;
  pending?: { action: EscrowAction; since: string };
}

export interface OperationEvent {
  at: string;
  message: string;
}

export interface Operation {
  id: string;
  createdAt: string;
  po: PurchaseOrder;
  documents: { [K in DocKind]?: StoredDoc<K> };
  verification?: VerificationResult;
  escrow: EscrowState;
  events: OperationEvent[];
}
