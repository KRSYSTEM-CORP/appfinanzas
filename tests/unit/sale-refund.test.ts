import { describe, expect, it } from "vitest";
import { refundConcept } from "@/lib/sale-refund";
import { FISCAL_NOTES_ENABLED } from "@/lib/fiscal-notes";
import {
  canChooseOutflowCurrency,
  defaultRefundLines,
  lineToSource,
  maxRefundRefCents,
  outflowCurrencyFor,
  outflowDebitCents,
  resolveOutflowAmount,
} from "@/lib/cash-outflow";

const ctx = { rate: 40, rateEnabled: true, localCurrencyCode: "VES", referenceCurrency: "USD" };

describe("devolución por anulación", () => {
  it("concepto claro con el número de venta", () => {
    expect(refundConcept(42)).toBe("Devolución por anulación de venta N.º 42");
  });
  it("las notas fiscales están en Próximamente", () => {
    expect(FISCAL_NOTES_ENABLED).toBe(false);
  });
  it("prellena con lo cobrado: Bs en Bs, divisa en divisa, agrupado por método y cuenta", () => {
    const lines = defaultRefundLines(
      [
        { paymentMethod: "CARD", paymentAccountId: "a1", currencyCode: "VES", amountCurrencyCents: 200_000, amountEurCents: 5000 },
        { paymentMethod: "CARD", paymentAccountId: "a1", currencyCode: "VES", amountCurrencyCents: 40_000, amountEurCents: 1000 },
        { paymentMethod: "ZELLE", paymentAccountId: null, currencyCode: "USD", amountCurrencyCents: 700, amountEurCents: 700 },
      ],
      "VES",
      "USD"
    );
    expect(lines).toEqual([
      { paymentMethod: "CARD", paymentAccountId: "a1", currency: "LOCAL", amountCents: 240_000 },
      { paymentMethod: "ZELLE", paymentAccountId: null, currency: "REFERENCE", amountCents: 700 },
    ]);
  });
  it("el tope tolera que la tasa cambie", () => {
    const pays = [{ paymentMethod: "CARD" as const, paymentAccountId: null, currencyCode: "VES", amountCurrencyCents: 400_000, amountEurCents: 10_000 }];
    expect(maxRefundRefCents(pays, "VES", "USD", 30)).toBeGreaterThanOrEqual(13_333);
    expect(maxRefundRefCents(pays, "VES", "USD", 50)).toBe(10_001);
  });
});

describe("salida con cuenta y moneda", () => {
  it("la cuenta manda sobre la moneda; Zelle siempre es divisa; efectivo escoge", () => {
    expect(outflowCurrencyFor("CARD", "VES", "REFERENCE", ctx)).toBe("LOCAL");
    expect(outflowCurrencyFor("ZELLE", null, "LOCAL", ctx)).toBe("REFERENCE");
    expect(outflowCurrencyFor("CASH", null, "LOCAL", ctx)).toBe("LOCAL");
    expect(outflowCurrencyFor("CASH", null, "LOCAL", { rateEnabled: false })).toBe("REFERENCE");
    expect(canChooseOutflowCurrency("CASH", false, ctx)).toBe(true);
    expect(canChooseOutflowCurrency("CASH", true, ctx)).toBe(false);
  });
  it("guarda la moneda original, el equivalente en referencia y la tasa", () => {
    expect(resolveOutflowAmount("LOCAL", 400_000, ctx)).toEqual({ currencyCode: "VES", amountCurrencyCents: 400_000, amountCents: 10_000, exchangeRate: 40 });
    expect(resolveOutflowAmount("REFERENCE", 500, ctx)).toMatchObject({ currencyCode: "USD", amountCents: 500 });
    expect(() => resolveOutflowAmount("LOCAL", 100, { ...ctx, rate: null })).toThrow(/tasa/);
    expect(() => resolveOutflowAmount("REFERENCE", 0, ctx)).toThrow();
  });
  it("descuenta de la cuenta en su moneda", () => {
    const o = { amountCents: 10_000, amountCurrencyCents: 400_000, currencyCode: "VES", exchangeRate: 40 };
    expect(outflowDebitCents(o, "VES", 50)).toBe(400_000);
    expect(outflowDebitCents(o, "USD", 50)).toBe(10_000);
  });
  it("convierte la línea del formulario", () => {
    const s = lineToSource({ method: "CARD", accountId: "a1", currency: "REFERENCE", amount: "12,5" }, [{ id: "a1", currency: "VES" }], true);
    expect(s).toEqual({ paymentMethod: "CARD", paymentAccountId: "a1", currency: "LOCAL", amountCents: 1250 });
  });
});
