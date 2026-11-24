import { describe, expect, it } from "vitest";
import { decomposeTax, netSalesTax, rateForCategory } from "@/lib/tax";
import { caracasDateString, caracasDateTimeString } from "@/lib/report-types";
import { csvCell } from "@/lib/accounts-segmentation";

describe("netSalesTax", () => {
  it("suma facturas y notas de débito y resta notas de crédito", () => {
    const r = netSalesTax(
      [{ baseImponibleCents: 10000, taxCents: 1600 }, { baseImponibleCents: 5000, taxCents: 800 }],
      [{ baseImponibleCents: 5000, taxCents: 800 }],
      [{ baseImponibleCents: 1000, taxCents: 160 }]
    );
    expect(r).toEqual({ base: 11000, tax: 1760 });
  });
});

describe("fechas en hora de Venezuela", () => {
  it("una venta a las 9 p. m. de Caracas sigue en su día", () => {
    const d = new Date("2026-11-24T01:30:00Z");
    expect(caracasDateString(d)).toBe("2026-11-23");
    expect(caracasDateTimeString(d)).toBe("2026-11-23 21:30");
  });
});

describe("csvCell", () => {
  it("neutraliza fórmulas", () => {
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("normal")).toBe("normal");
  });
});

describe("decomposeTax", () => {
  it("separa base e IVA general (16%) de un precio con IVA incluido", () => {
    expect(decomposeTax(11600, "GENERAL", 16)).toEqual({ baseCents: 10000, taxCents: 1600 });
  });
  it("aplica la tasa reducida", () => {
    expect(decomposeTax(10800, "REDUCED", 8)).toEqual({ baseCents: 10000, taxCents: 800 });
  });
  it("no calcula IVA a lo exento", () => {
    expect(decomposeTax(5000, "EXEMPT", 16)).toEqual({ baseCents: 5000, taxCents: 0 });
  });
  it("redondea y base + IVA siempre suman el total", () => {
    for (const amount of [1, 99, 101, 12345, 999999]) {
      const { baseCents, taxCents } = decomposeTax(amount, "GENERAL", 16);
      expect(baseCents + taxCents).toBe(amount);
    }
  });
});

describe("rateForCategory", () => {
  it("elige la tasa según la categoría", () => {
    expect(rateForCategory("GENERAL", 16, 8)).toBe(16);
    expect(rateForCategory("REDUCED", 16, 8)).toBe(8);
    expect(rateForCategory("EXEMPT", 16, 8)).toBe(0);
  });
});
