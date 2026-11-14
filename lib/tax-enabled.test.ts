import { describe, expect, it } from "vitest";
import { decomposeTax, effectiveIvaRates, rateForCategory } from "./tax";

describe("effectiveIvaRates", () => {
  it("conserva las alícuotas con IVA activado", () => {
    expect(effectiveIvaRates(true, 16, 8)).toEqual({ general: 16, reduced: 8 });
  });
  it("devuelve 0 con IVA desactivado", () => {
    expect(effectiveIvaRates(false, 16, 8)).toEqual({ general: 0, reduced: 0 });
  });
  it("con IVA apagado el desglose queda sin IVA y base = total", () => {
    const { general, reduced } = effectiveIvaRates(false, 16, 8);
    for (const c of ["GENERAL", "REDUCED", "EXEMPT"] as const) {
      expect(decomposeTax(11600, c, rateForCategory(c, general, reduced))).toEqual({ baseCents: 11600, taxCents: 0 });
    }
  });
  it("con IVA activado desglosa como antes", () => {
    expect(decomposeTax(11600, "GENERAL", 16)).toEqual({ baseCents: 10000, taxCents: 1600 });
  });
});
