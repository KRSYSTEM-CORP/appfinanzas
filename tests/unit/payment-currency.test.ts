import { describe, expect, it } from "vitest";
import {
  assertPaymentsMatchTotal,
  assertPaymentsWithinRemaining,
  resolveSalePayments,
  toEurCents,
} from "@/lib/payment-currency";

describe("toEurCents", () => {
  it("convierte bolívares con la tasa", () => {
    expect(toEurCents(97500, "VES", 97.5, "USD")).toBe(1000);
  });
  it("USD y la moneda de referencia no se convierten", () => {
    expect(toEurCents(1000, "USD", 97.5, "USD")).toBe(1000);
    expect(toEurCents(1000, "EUR", 97.5, "EUR")).toBe(1000);
  });
  it("exige tasa para convertir moneda local", () => {
    expect(() => toEurCents(1000, "VES", null, "USD")).toThrow();
  });
});

describe("pagos mixtos", () => {
  const payments = resolveSalePayments(
    [
      { paymentMethod: "ZELLE" as const, amount: 500, paidInForeignCurrency: false },
      { paymentMethod: "CASH" as const, amount: 48750, paidInForeignCurrency: false },
    ],
    "VES",
    97.5,
    true,
    "USD"
  );
  it("resuelve la moneda de cada línea", () => {
    expect(payments.map((p) => p.currencyCode)).toEqual(["USD", "VES"]);
    expect(payments.map((p) => p.amountEurCents)).toEqual([500, 500]);
  });
  it("acepta la suma exacta y tolera un céntimo por línea en bolívares", () => {
    expect(() => assertPaymentsMatchTotal(payments, 1000, "USD")).not.toThrow();
    expect(() => assertPaymentsMatchTotal(payments, 1001, "USD")).not.toThrow();
    expect(() => assertPaymentsMatchTotal(payments, 1005, "USD")).toThrow();
  });
  it("un abono no puede superar el saldo", () => {
    expect(assertPaymentsWithinRemaining(payments, 2000, "USD")).toBe(1000);
    expect(() => assertPaymentsWithinRemaining(payments, 500, "USD")).toThrow();
  });
});
