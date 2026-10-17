import { beforeAll, describe, expect, it } from "vitest";
import type { DocKind } from "./domain";
import { extractDocument } from "./extract";
import { verify, type DocsToVerify } from "./rules";
import type { PurchaseOrder } from "./domain";
import { demoPurchaseOrder, EXAMPLES, generateSamples, type SampleSet } from "./samples";

const TODAY = "2026-10-16";
const po = demoPurchaseOrder(TODAY);

async function readSet(set: SampleSet, order: PurchaseOrder = po): Promise<DocsToVerify> {
  const docs: DocsToVerify = {};
  for (const sample of await generateSamples(order, set, TODAY)) {
    const { fields, extractedBy } = await extractDocument(sample.kind, sample.bytes, "application/pdf");
    expect(extractedBy).toBe("reglas");
    (docs as Record<DocKind, unknown>)[sample.kind] = fields;
  }
  return docs;
}

beforeAll(() => {
  delete process.env.LLM_API_KEY;
});

describe("documentos simulados leídos desde PDF", () => {
  it("el juego correcto da CONFORME sin errores", async () => {
    const docs = await readSet("conforme");
    expect(docs.invoice).toMatchObject({
      seller: "NINGBO SPEEDCYCLE RUBBER CO., LTD.",
      quantity: 20000,
      unitPrice: 1.2,
      totalAmount: 24000,
      currency: "USD",
      incoterm: "FOB",
      incotermPlace: "NINGBO",
      hsCode: "4011.50.00",
      date: "2026-10-11",
    });
    expect(docs.packingList).toMatchObject({ packages: 800, grossWeightKg: 18400, quantity: 20000 });
    expect(docs.billOfLading).toMatchObject({
      consignee: "RODADOS DEL LITORAL S.A.",
      shippedOnBoardDate: "2026-10-13",
      portOfDischarge: "BUENOS AIRES, ARGENTINA",
      grossWeightKg: 18400,
    });
    expect(docs.billOfLading?.description).toContain("(29 X 2.10)");

    const result = verify(po, docs, TODAY);
    const problems = result.checks.filter((c) => c.status !== "ok");
    expect(problems).toEqual([]);
    expect(result.verdict).toBe("conforme");
  });

  it("el juego con errores da OBSERVADO con las tres discrepancias plantadas", async () => {
    const result = verify(po, await readSet("con-errores"), TODAY);
    expect(result.verdict).toBe("observado");
    const errors = result.checks.filter((c) => c.status === "error").map((c) => c.id);
    expect(errors.sort()).toEqual(["bl.portOfDischarge", "invoice.hsCode", "weight.consistency"]);
    const weight = result.checks.find((c) => c.id === "weight.consistency");
    expect(weight?.detail).toContain("500 kg");
  });

  it.each(EXAMPLES.map((e) => [e.title, e] as const))("el caso %s da conforme y observa los mismos errores", async (_, example) => {
    const order = example.build(TODAY);
    const good = verify(order, await readSet("conforme", order), TODAY);
    expect(good.checks.filter((c) => c.status !== "ok")).toEqual([]);
    const bad = verify(order, await readSet("con-errores", order), TODAY);
    const errors = bad.checks.filter((c) => c.status === "error").map((c) => c.id);
    expect(errors.sort()).toEqual(["bl.portOfDischarge", "invoice.hsCode", "weight.consistency"]);
  });
});

describe("verify", () => {
  it("sin documentos queda INCOMPLETO", () => {
    const result = verify(po, {}, TODAY);
    expect(result.verdict).toBe("incompleto");
    expect(result.errors).toBe(3);
  });

  it("marca el embarque tardío y el BL a la orden", async () => {
    const docs = await readSet("conforme");
    const late = verify(
      { ...po, latestShipmentDate: "2026-10-10" },
      { ...docs, billOfLading: { ...docs.billOfLading!, consignee: "TO ORDER" } },
      TODAY,
    );
    const onBoard = late.checks.find((c) => c.id === "bl.onBoard");
    expect(onBoard?.status).toBe("error");
    expect(onBoard?.detail).toContain("3 días después");
    expect(late.checks.find((c) => c.id === "bl.consignee")?.status).toBe("warning");
  });

  it("controla que la factura no supere lo acordado", async () => {
    const docs = await readSet("conforme");
    const result = verify(po, { ...docs, invoice: { ...docs.invoice!, totalAmount: 25000 } }, TODAY);
    const ids = result.checks.filter((c) => c.status === "error").map((c) => c.id);
    expect(ids).toContain("invoice.amount");
    expect(ids).toContain("invoice.arithmetic");
  });
});
