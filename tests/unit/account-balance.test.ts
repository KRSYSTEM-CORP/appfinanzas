import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { InsufficientFundsError, expenseDebitCents, toActionResult } from "@/lib/account-balance";

describe("saldo de cuentas", () => {
  it("un gasto en bolívares descuenta lo anotado en Bs y en divisa, el monto referencial", () => {
    const e = { amountCents: 1000, localAmountCents: 40_000, enteredInLocal: true };
    expect(expenseDebitCents(e, "VES", 40)).toBe(40_000);
    expect(expenseDebitCents(e, "USD", 40)).toBe(1000);
  });

  it("sin monto en Bs guardado lo convierte con la tasa", () => {
    const e = { amountCents: 1000, localAmountCents: null, enteredInLocal: false };
    expect(expenseDebitCents(e, "VES", 40)).toBe(40_000);
    expect(expenseDebitCents(e, "VES", null)).toBe(0);
  });

  it("fondos insuficientes: dice cuánto falta y lleva la cuenta para el botón «Agregar fondos»", () => {
    const err = new InsufficientFundsError("acc1", "Banesco · 0102", "VES", 10_000, 25_000);
    expect(err.shortfallCents).toBe(15_000);
    const r = toActionResult(err, "x");
    expect(r).toMatchObject({ success: false, code: "INSUFFICIENT_FUNDS", accountId: "acc1", shortfallCents: 15_000, accountCurrency: "VES" });
    expect(r.error).toContain("Fondos insuficientes");
  });

  it("con saldo negativo la falta es el pago completo; otros errores no llevan código", () => {
    expect(new InsufficientFundsError("a", "A", "USD", -500, 2000).shortfallCents).toBe(2000);
    expect(toActionResult(new Error("boom"), "x")).toEqual({ success: false, error: "boom" });
    expect(toActionResult("raro", "No se pudo")).toEqual({ success: false, error: "No se pudo" });
  });
});
