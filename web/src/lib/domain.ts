import { z } from "zod";

export const DOC_KINDS = ["invoice", "packingList", "billOfLading", "certificateOfOrigin", "insurance", "sanitary"] as const;
export type DocKind = (typeof DOC_KINDS)[number];

export const DOC_LABELS: Record<DocKind, string> = {
  invoice: "Factura comercial",
  packingList: "Packing list",
  billOfLading: "Conocimiento de embarque (BL)",
  certificateOfOrigin: "Certificado de origen",
  insurance: "Póliza de seguro",
  sanitary: "Certificado sanitario",
};

/** CIF y CIP incluyen el seguro en el precio: sin póliza el juego está incompleto. */
export function needsInsurance(po: Pick<PurchaseOrder, "incoterm">): boolean {
  return po.incoterm.toUpperCase() === "CIF" || po.incoterm.toUpperCase() === "CIP";
}

export function needsSanitary(po: Pick<PurchaseOrder, "requiresSanitary">): boolean {
  return po.requiresSanitary === true;
}

/** Documentos sin los cuales no se libera el pago. El resto solo entra si la orden lo pide. */
export function requiredDocKinds(po: PurchaseOrder): DocKind[] {
  const kinds: DocKind[] = ["invoice", "packingList", "billOfLading", "certificateOfOrigin"];
  if (needsInsurance(po)) kinds.push("insurance");
  if (needsSanitary(po)) kinds.push("sanitary");
  return kinds;
}

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
  /** Certificado sanitario o fitosanitario, cuando la mercadería lo exige. */
  requiresSanitary: z.boolean().optional(),
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

export interface CertificateOfOriginFields {
  certificateNumber: string | null;
  exporter: string | null;
  importer: string | null;
  countryOfOrigin: string | null;
  invoiceNumber: string | null;
  description: string | null;
  hsCode: string | null;
}

export interface InsuranceFields {
  policyNumber: string | null;
  insured: string | null;
  amount: number | null;
  currency: string | null;
  coverage: string | null;
  invoiceNumber: string | null;
  description: string | null;
}

export interface SanitaryFields {
  certificateNumber: string | null;
  exporter: string | null;
  importer: string | null;
  description: string | null;
  authority: string | null;
  issuedOn: string | null;
}

export interface DocFieldsByKind {
  invoice: InvoiceFields;
  packingList: PackingListFields;
  billOfLading: BillOfLadingFields;
  certificateOfOrigin: CertificateOfOriginFields;
  insurance: InsuranceFields;
  sanitary: SanitaryFields;
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
  certificateOfOrigin: {
    certificateNumber: "Número de certificado",
    exporter: "Exportador",
    importer: "Importador",
    countryOfOrigin: "País de origen",
    invoiceNumber: "Factura de referencia",
    description: "Descripción",
    hsCode: "Posición arancelaria",
  },
  insurance: {
    policyNumber: "Número de póliza",
    insured: "Asegurado",
    amount: "Suma asegurada",
    currency: "Moneda",
    coverage: "Cobertura",
    invoiceNumber: "Factura de referencia",
    description: "Descripción",
  },
  sanitary: {
    certificateNumber: "Número de certificado",
    exporter: "Exportador",
    importer: "Importador",
    description: "Descripción",
    authority: "Autoridad",
    issuedOn: "Fecha de emisión",
  },
};

export const NUMERIC_FIELDS = new Set([
  "quantity",
  "unitPrice",
  "totalAmount",
  "packages",
  "netWeightKg",
  "grossWeightKg",
  "amount",
]);

export const DATE_FIELDS = new Set(["date", "shippedOnBoardDate", "issuedOn"]);

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

/** Enlaces que no se adivinan. El del proveedor permite subir; el del informe es de solo lectura. */
export interface OperationAccess {
  supplierToken: string;
  reportToken: string;
}

/** Cierre del seguimiento cuando la mercadería ya ingresó. */
export interface CustomsEntry {
  declarationNumber: string;
  enteredAt: string;
  recordedAt: string;
}

export interface Operation {
  id: string;
  createdAt: string;
  po: PurchaseOrder;
  documents: { [K in DocKind]?: StoredDoc<K> };
  verification?: VerificationResult;
  escrow: EscrowState;
  events: OperationEvent[];
  access?: OperationAccess;
  customs?: CustomsEntry;
}
