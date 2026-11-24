import { describe, expect, it } from "vitest";
import { paymentLineAmount, paymentsPrimaryLocal, purchaseStatus, type MoneyCtx } from "@/lib/money-primary";
import { buildPurchasePaymentLine, stockShortfalls } from "@/lib/purchase-payment";

const ctx: MoneyCtx = { rate: 100, localCurrencyCode: "VES", referenceCurrency: "EUR", exchangeRateEnabled: true };

describe("compras: moneda primero", () => {
  it("bolívares primero solo si todos los pagos son en bolívares", () => {
    expect(paymentsPrimaryLocal([{ paymentMethod: "TRANSFER", paidInForeignCurrency: false }], ctx)).toBe(true);
    expect(paymentsPrimaryLocal([{ paymentMethod: "TRANSFER", paidInForeignCurrency: false }, { paymentMethod: "ZELLE", paidInForeignCurrency: false }], ctx)).toBe(false);
    expect(paymentsPrimaryLocal([], ctx)).toBe(false);
  });
  it("línea antigua sin moneda decide por el método; línea nueva usa su moneda", () => {
    const old = paymentLineAmount({ paymentMethod: "POS", paidInForeignCurrency: false, amountEurCents: 1000, amountCurrencyCents: null, currencyCode: null }, ctx);
    expect(old.primary).toMatch(/1\.000,00/);
    expect(old.secondary).toMatch(/10,00/);
    const zelle = paymentLineAmount({ paymentMethod: "ZELLE", paidInForeignCurrency: false, amountEurCents: 1000, amountCurrencyCents: 1000, currencyCode: "USD" }, ctx);
    expect(zelle.primary).toMatch(/10,00/);
  });
  it("estado de la compra", () => {
    expect(purchaseStatus({ voided: true, paymentStatus: "PAID", paidCents: 5 })).toBe("VOIDED");
    expect(purchaseStatus({ voided: false, paymentStatus: "PAID", paidCents: 5 })).toBe("PAID");
    expect(purchaseStatus({ voided: false, paymentStatus: "PENDING", paidCents: 5 })).toBe("PARTIAL");
    expect(purchaseStatus({ voided: false, paymentStatus: "PENDING", paidCents: 0 })).toBe("CREDIT");
  });
});

describe("abono a compra: moneda real del pago", () => {
  it("método en bolívares guarda Bs; Zelle guarda USD", () => {
    expect(buildPurchasePaymentLine("TRANSFER", 1000, ctx)).toEqual({ currencyCode: "VES", amountCurrencyCents: 100000 });
    expect(buildPurchasePaymentLine("ZELLE", 1000, ctx)).toEqual({ currencyCode: "USD", amountCurrencyCents: 1000 });
  });
  it("sin tasa no se puede pagar en bolívares", () => {
    expect(() => buildPurchasePaymentLine("POS", 1000, { ...ctx, rate: null })).toThrow();
  });
});

describe("anular compra: inventario ya vendido", () => {
  it("avisa los productos cuya existencia no alcanza", () => {
    expect(stockShortfalls([{ name: "A", quantity: 5, stock: 3 }, { name: "B", quantity: 2, stock: 2 }, { name: "C", quantity: 1, stock: null }])).toEqual(["A: entraron 5 y quedan 3"]);
  });
});
