import { describe, expect, it } from "vitest";
import { defaultCurrencyForKind, lineInAccountCurrency, methodForAccountKind, payrollDebitCents, refToAccountCents } from "@/lib/account-money";

describe("moneda y método por tipo de cuenta", () => {
  it("pago móvil y transferencia nacen en bolívares; el resto en divisa", () => {
    expect(defaultCurrencyForKind("PAGO_MOVIL")).toBe("VES");
    expect(defaultCurrencyForKind("TRANSFER")).toBe("VES");
    expect(defaultCurrencyForKind("ZELLE")).toBe("USD");
    expect(defaultCurrencyForKind("BINANCE")).toBe("USD");
  });
  it("el pago desde una cuenta de pago móvil se guarda como Pago Móvil, no como efectivo", () => {
    expect(methodForAccountKind("PAGO_MOVIL")).toBe("CARD");
    expect(methodForAccountKind("TRANSFER")).toBe("TRANSFER");
    expect(methodForAccountKind("ZELLE")).toBe("ZELLE");
  });
});

describe("descuento de nómina en la moneda de la cuenta", () => {
  it("cuenta en Bs: 100 $ a tasa 40 descuentan 4000 Bs", () => {
    expect(refToAccountCents(10000, "VES", 40)).toBe(400000);
  });
  it("cuenta en divisa: se descuenta el monto tal cual", () => {
    expect(refToAccountCents(10000, "USD", 40)).toBe(10000);
  });
  it("cuenta en Bs sin tasa: no se puede convertir", () => {
    expect(refToAccountCents(10000, "VES", null)).toBeNull();
  });
  it("usa el débito guardado; sin él, convierte lo pagado con la tasa actual", () => {
    expect(payrollDebitCents({ accountDebitCents: 123, paidCents: 10000 }, "VES", 40)).toBe(123);
    expect(payrollDebitCents({ accountDebitCents: null, paidCents: 10000 }, "VES", 40)).toBe(400000);
    expect(payrollDebitCents({ accountDebitCents: null, paidCents: 10000 }, "USD", 40)).toBe(10000);
  });
});

describe("cobros y pagos en la moneda de la cuenta", () => {
  const bsSale = { currencyCode: "VES", amountCurrencyCents: 200000, amountEurCents: 5000, exchangeRate: 40 };
  it("un cobro en Bs suma Bs a una cuenta en Bs", () => {
    expect(lineInAccountCurrency(bsSale, "VES", 40)).toBe(200000);
  });
  it("un cobro en Bs no se suma crudo a una cuenta en divisa (antes inflaba el saldo)", () => {
    expect(lineInAccountCurrency(bsSale, "USD", 40)).toBe(5000);
  });
  it("un cobro en divisa se convierte con la tasa de la línea para una cuenta en Bs", () => {
    expect(lineInAccountCurrency({ currencyCode: "USD", amountCurrencyCents: 1000, amountEurCents: 1000, exchangeRate: 50 }, "VES", 40)).toBe(50000);
  });
});
