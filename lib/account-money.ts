import type { PaymentAccountKind, PaymentMethod } from "@prisma/client";

// Moneda con la que nace una cuenta: pago móvil y transferencia se mueven en bolívares; Zelle,
// Binance y PayPal, en divisa. Antes todas nacían en divisa y un pago móvil figuraba como «Divisa».
export function defaultCurrencyForKind(kind: PaymentAccountKind): "VES" | "USD" {
  return kind === "PAGO_MOVIL" || kind === "TRANSFER" || kind === "PUNTO_DE_VENTA" ? "VES" : "USD";
}

// Método de pago que corresponde a una cuenta de origen (el de nómina o compras sale de ella).
export function methodForAccountKind(kind: PaymentAccountKind): PaymentMethod {
  switch (kind) {
    case "PAGO_MOVIL":
      return "CARD";
    case "TRANSFER":
      return "TRANSFER";
    case "ZELLE":
      return "ZELLE";
    case "BINANCE":
      return "BINANCE";
    case "PAYPAL":
      return "PAYPAL";
    case "PUNTO_DE_VENTA":
      return "POS";
  }
}

// Un monto en moneda referencial (USD/EUR) expresado en la moneda de la cuenta.
export function refToAccountCents(refCents: number, accountCurrency: string, rate: number | null): number | null {
  if (accountCurrency !== "VES") return refCents;
  return rate ? Math.round(refCents * rate) : null;
}

type Line = {
  amountCurrencyCents: number | null;
  amountEurCents: number;
  currencyCode: string | null;
  exchangeRate?: unknown;
};

// Una línea de cobro o de pago, en la moneda de la cuenta: si se hizo en esa misma moneda se
// toma tal cual; si no, se convierte con la tasa de la línea (o la actual si no quedó guardada).
export function lineInAccountCurrency(line: Line, accountCurrency: string, currentRate: number | null): number {
  const rate = line.exchangeRate != null ? Number(line.exchangeRate) : currentRate;
  if (accountCurrency === "VES") {
    if (line.currencyCode === "VES" && line.amountCurrencyCents != null) return line.amountCurrencyCents;
    return rate ? Math.round(line.amountEurCents * rate) : 0;
  }
  if (line.currencyCode === "USD" && line.amountCurrencyCents != null) return line.amountCurrencyCents;
  return line.amountEurCents;
}

// Lo que un pago de nómina descuenta de la cuenta, en la moneda de ella.
export function payrollDebitCents(
  p: { accountDebitCents: number | null; paidCents: number },
  accountCurrency: string,
  currentRate: number | null
): number {
  if (p.accountDebitCents != null) return p.accountDebitCents;
  return refToAccountCents(p.paidCents, accountCurrency, currentRate) ?? 0;
}
