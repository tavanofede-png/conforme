import { describe, expect, it } from "vitest";
import {
  formatNcm,
  missingKeywords,
  normalizeCurrency,
  parseDate,
  parseNumber,
  sameCompany,
  samePlace,
} from "./normalize";

describe("parseNumber", () => {
  it.each([
    ["18,400.00 KGS", 18400],
    ["18.400,00", 18400],
    ["USD 24,000", 24000],
    ["20.000 unidades", 20000],
    ["1.20", 1.2],
    ["1,2", 1.2],
    ["800 CARTONS", 800],
    [24000, 24000],
  ])("%s -> %s", (input, expected) => {
    expect(parseNumber(input)).toBe(expected);
  });

  it("devuelve null si no hay número", () => {
    expect(parseNumber("N/A")).toBeNull();
    expect(parseNumber(null)).toBeNull();
  });
});

describe("parseDate", () => {
  it.each([
    ["2026-10-13", "2026-10-13"],
    ["13/10/2026", "2026-10-13"],
    ["13 OCT 2026", "2026-10-13"],
    ["13-Oct-2026", "2026-10-13"],
    ["OCT. 13, 2026", "2026-10-13"],
    ["13 de octubre de 2026", "2026-10-13"],
    ["13 de setiembre 2026", "2026-09-13"],
    ["13 dic 2026", "2026-12-13"],
    ["31/02/2026", null],
  ])("%s -> %s", (input, expected) => {
    expect(parseDate(input)).toBe(expected);
  });
});

describe("comparaciones", () => {
  it("ignora sufijos societarios y puntuación", () => {
    expect(sameCompany("NINGBO SPEEDCYCLE RUBBER CO. LTD", "Ningbo Speedcycle Rubber Co., Ltd.")).toBe(1);
    expect(sameCompany("RODADOS DEL LITORAL SA", "Rodados del Litoral S.A.")).toBe(1);
    expect(sameCompany("Bicicletas del Sur SRL", "Rodados del Litoral S.A.")).toBeLessThan(0.5);
  });

  it("compara puertos sin el país", () => {
    expect(samePlace("BUENOS AIRES, ARGENTINA", "Buenos Aires")).toBe(true);
    expect(samePlace("MONTEVIDEO, URUGUAY", "Buenos Aires")).toBe(false);
  });

  it("busca palabras clave con alternativas, plurales y sin tildes", () => {
    const kws = ["neumático/tyre/tire", "bicicleta/bicycle", "29"];
    expect(missingKeywords("BICYCLE TYRES 29 X 2.10", kws)).toEqual([]);
    expect(missingKeywords("NEUMATICOS PARA BICICLETA RODADO 29", kws)).toEqual([]);
    expect(missingKeywords("BICYCLE TYRES 27.5", kws)).toEqual(["29"]);
  });

  it("normaliza moneda y NCM", () => {
    expect(normalizeCurrency("US$")).toBe("USD");
    expect(normalizeCurrency("U$S")).toBe("USD");
    expect(normalizeCurrency("rmb")).toBe("CNY");
    expect(formatNcm("40115000")).toBe("4011.50.00");
  });
});
