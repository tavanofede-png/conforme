import type { DocKind, VerificationResult } from "./domain";

/** Qué campos de cada documento mira cada control, para marcarlos en pantalla. */
const CHECK_FIELDS: Record<string, Partial<Record<DocKind, string[]>>> = {
  "invoice.seller": { invoice: ["seller"] },
  "invoice.buyer": { invoice: ["buyer"] },
  "invoice.description": { invoice: ["description"] },
  "invoice.hsCode": { invoice: ["hsCode"] },
  "invoice.quantity": { invoice: ["quantity"] },
  "invoice.currency": { invoice: ["currency"] },
  "invoice.arithmetic": { invoice: ["quantity", "unitPrice", "totalAmount"] },
  "invoice.amount": { invoice: ["totalAmount"] },
  "invoice.incoterm": { invoice: ["incoterm", "incotermPlace"] },
  "packing.quantity": { packingList: ["quantity"], invoice: ["quantity"] },
  "packing.description": { packingList: ["description"] },
  "packing.invoiceRef": { packingList: ["invoiceNumber"], invoice: ["invoiceNumber"] },
  "bl.shipper": { billOfLading: ["shipper"] },
  "bl.consignee": { billOfLading: ["consignee"] },
  "bl.portOfLoading": { billOfLading: ["portOfLoading"] },
  "bl.portOfDischarge": { billOfLading: ["portOfDischarge"] },
  "bl.onBoard": { billOfLading: ["shippedOnBoardDate"] },
  "presentation.period": { billOfLading: ["shippedOnBoardDate"] },
  "bl.description": { billOfLading: ["description"] },
  "bl.hsCode": { billOfLading: ["hsCode"] },
  "weight.consistency": { packingList: ["grossWeightKg"], billOfLading: ["grossWeightKg"] },
  "weight.expected": { packingList: ["grossWeightKg"] },
  "packages.consistency": { packingList: ["packages"], billOfLading: ["packages"] },
  "origin.exporter": { certificateOfOrigin: ["exporter"] },
  "origin.importer": { certificateOfOrigin: ["importer"] },
  "origin.country": { certificateOfOrigin: ["countryOfOrigin"] },
  "origin.hsCode": { certificateOfOrigin: ["hsCode"] },
  "origin.invoice": { certificateOfOrigin: ["invoiceNumber"] },
  "insurance.insured": { insurance: ["insured"] },
  "insurance.amount": { insurance: ["amount"] },
  "insurance.currency": { insurance: ["currency"] },
  "insurance.coverage": { insurance: ["coverage"] },
  "sanitary.exporter": { sanitary: ["exporter"] },
  "sanitary.goods": { sanitary: ["description"] },
  "sanitary.date": { sanitary: ["issuedOn"] },
};

export type FieldFlags = Record<string, "error" | "warning">;

export function flaggedFields(result: VerificationResult | undefined, kind: DocKind): FieldFlags {
  const flags: FieldFlags = {};
  for (const check of result?.checks ?? []) {
    if (check.status === "ok") continue;
    for (const field of CHECK_FIELDS[check.id]?.[kind] ?? []) {
      if (flags[field] !== "error") flags[field] = check.status;
    }
  }
  return flags;
}
