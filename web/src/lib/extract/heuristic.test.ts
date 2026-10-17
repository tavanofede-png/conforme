import { describe, expect, it } from "vitest";
import { extractFieldsHeuristic } from "./heuristic";

describe("extractFieldsHeuristic", () => {
  it("lee una factura en castellano con etiquetas en la misma línea", () => {
    const text = [
      "FACTURA COMERCIAL",
      "Factura Nro: A-0001-00012345 Fecha: 05/10/2026",
      "Vendedor: Ningbo Speedcycle Rubber Co., Ltd.",
      "Comprador: Rodados del Litoral S.A.",
      "Descripción: Neumáticos para bicicleta rodado 29",
      "NCM: 4011.50.00 Cantidad: 20.000 unidades",
      "Precio unitario: US$ 1,20",
      "Importe total: US$ 24.000,00",
      "Condición de venta: FOB Ningbo",
    ].join("\n");

    expect(extractFieldsHeuristic("invoice", text)).toEqual({
      invoiceNumber: "A-0001-00012345",
      date: "2026-10-05",
      seller: "Ningbo Speedcycle Rubber Co., Ltd.",
      buyer: "Rodados del Litoral S.A.",
      description: "Neumáticos para bicicleta rodado 29",
      hsCode: "4011.50.00",
      quantity: 20000,
      unitPrice: 1.2,
      totalAmount: 24000,
      currency: "USD",
      incoterm: "FOB",
      incotermPlace: "Ningbo",
    });
  });

  it("lee un BL con el valor en la línea siguiente y corta en Notify Party", () => {
    const text = [
      "BILL OF LADING",
      "Shipper:",
      "NINGBO SPEEDCYCLE RUBBER CO., LTD",
      "Consignee: TO ORDER Notify Party: RODADOS DEL LITORAL S.A.",
      "Port of Loading: NINGBO, CHINA Port of Discharge: BUENOS AIRES",
      "Shipped on Board: 13 OCT 2026",
      "Gross Weight: 18,400.00 KGS",
      "Packages: 800 CTNS",
    ].join("\n");

    const fields = extractFieldsHeuristic("billOfLading", text);
    expect(fields.shipper).toBe("NINGBO SPEEDCYCLE RUBBER CO., LTD");
    expect(fields.consignee).toBe("TO ORDER");
    expect(fields.portOfLoading).toBe("NINGBO, CHINA");
    expect(fields.portOfDischarge).toBe("BUENOS AIRES");
    expect(fields.shippedOnBoardDate).toBe("2026-10-13");
    expect(fields.grossWeightKg).toBe(18400);
    expect(fields.packages).toBe(800);
    expect(fields.blNumber).toBeNull();
  });
});
