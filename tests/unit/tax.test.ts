import { describe, expect, it } from "vitest";
import { decomposeTax, rateForCategory } from "@/lib/tax";

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
