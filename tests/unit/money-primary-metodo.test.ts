import { describe, expect, it } from "vitest";
import { dualForMethod, dualForPayments, dualInline, type MoneyCtx } from "@/lib/money-primary";

const c: MoneyCtx = { rate: 100, localCurrencyCode: "VES", referenceCurrency: "EUR", exchangeRateEnabled: true };

describe("dualForMethod", () => {
  it("pago móvil, punto de venta, transferencia y efectivo Bs: bolívares primero", () => {
    for (const m of [
      { method: "CARD", foreign: false },
      { method: "POS", foreign: false },
      { method: "TRANSFER", foreign: false },
      { method: "CASH", foreign: false },
    ] as const) {
      const d = dualForMethod(1000, m, c);
      expect(d.primaryIsLocal).toBe(true);
      expect(d.primary).toMatch(/1\.000,00/);
      expect(d.secondary).toMatch(/10,00/);
    }
  });
  it("Zelle y efectivo $: referencia primero y bolívares debajo", () => {
    for (const m of [
      { method: "ZELLE", foreign: false },
      { method: "CASH", foreign: true },
    ] as const) {
      const d = dualForMethod(1000, m, c);
      expect(d.primaryIsLocal).toBe(false);
      expect(d.primary).toMatch(/10,00/);
      expect(d.secondary).toMatch(/1\.000,00/);
    }
  });
  it("sin método: referencia habitual; sin tasa: solo referencia", () => {
    expect(dualForMethod(1000, null, c).primaryIsLocal).toBe(false);
    const d = dualForMethod(1000, { method: "CARD", foreign: false }, { ...c, rate: null });
    expect(d.secondary).toBeNull();
    expect(dualInline(d)).not.toContain("·");
  });
});

describe("dualForPayments", () => {
  it("misma moneda local: Bs primero; mezcla o sin pagos: referencia", () => {
    expect(dualForPayments(1000, [{ currencyCode: "VES" }, { currencyCode: "VES" }], c).primaryIsLocal).toBe(true);
    expect(dualForPayments(1000, [{ currencyCode: "VES" }, { currencyCode: "EUR" }], c).primaryIsLocal).toBe(false);
    expect(dualForPayments(1000, [], c).primaryIsLocal).toBe(false);
  });
});
