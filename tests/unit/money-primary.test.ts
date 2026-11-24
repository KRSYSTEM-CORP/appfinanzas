import { describe, expect, it } from "vitest";
import { dualAmount, isLocalMethod, paidAmount, type MoneyCtx } from "@/lib/money-primary";

const ctx: MoneyCtx = { rate: 100, localCurrencyCode: "VES", referenceCurrency: "EUR", exchangeRateEnabled: true };

describe("moneda del método primero", () => {
  it("pago móvil, punto de venta, transferencia y efectivo en Bs son locales; Zelle, Binance, PayPal y efectivo en $ no", () => {
    for (const m of ["CARD", "POS", "TRANSFER", "CASH", "OTHER"] as const) expect(isLocalMethod(m, false, ctx)).toBe(true);
    for (const m of ["ZELLE", "BINANCE", "PAYPAL"] as const) expect(isLocalMethod(m, false, ctx)).toBe(false);
    expect(isLocalMethod("CASH", true, ctx)).toBe(false);
  });
  it("sin tasa activa no hay moneda local", () => {
    expect(isLocalMethod("CARD", false, { ...ctx, exchangeRateEnabled: false })).toBe(false);
  });
  it("muestra bolívares primero y la referencia debajo (o al revés)", () => {
    const bs = dualAmount(1000, ctx, true);
    expect(bs.primaryIsLocal).toBe(true);
    expect(bs.primary).toMatch(/1\.000,00/);
    expect(bs.secondary).toMatch(/10,00/);
    const ref = dualAmount(1000, ctx, false);
    expect(ref.primary).toMatch(/10,00/);
    expect(ref.secondary).toMatch(/1\.000,00/);
  });
  it("sin tasa solo la referencia", () => {
    expect(dualAmount(1000, { ...ctx, rate: null }, true).secondary).toBeNull();
  });
  it("un cobro registrado en Bs muestra lo pagado en Bs y debajo la referencia", () => {
    const p = paidAmount({ amountEurCents: 1000, amountCurrencyCents: 100000, currencyCode: "VES" }, "EUR");
    expect(p.primary).toMatch(/1\.000,00/);
    expect(p.secondary).toMatch(/10,00/);
    expect(paidAmount({ amountEurCents: 1000, amountCurrencyCents: null, currencyCode: null }, "EUR").secondary).toBeNull();
  });
});
