import type { PaymentAccountKind, PaymentMethod } from "@prisma/client";

// Tipo de cuenta que corresponde a cada método de pago: los que mueven dinero por un banco o servicio
// (pago móvil, transferencia, Zelle, Binance, PayPal) salen de una cuenta; efectivo, punto de venta y otro, no.
export const KIND_BY_METHOD: Partial<Record<PaymentMethod, PaymentAccountKind>> = {
  CARD: "PAGO_MOVIL",
  TRANSFER: "TRANSFER",
  ZELLE: "ZELLE",
  BINANCE: "BINANCE",
  PAYPAL: "PAYPAL",
  POS: "PUNTO_DE_VENTA",
};

export function accountsForMethod<T extends { kind?: PaymentAccountKind | string }>(method: PaymentMethod, accounts: T[]): T[] {
  const kind = KIND_BY_METHOD[method];
  return kind ? accounts.filter((a) => a.kind === kind) : [];
}

// Si el método sale de una cuenta y hay cuentas de ese tipo, hay que elegir de cuál: así el pago descuenta su saldo.
export function accountChoiceMessage(
  method: PaymentMethod,
  accounts: { id: string; kind?: PaymentAccountKind | string }[],
  accountId: string | undefined | null
): string | null {
  const options = accountsForMethod(method, accounts);
  if (options.length === 0) return null;
  if (accountId && options.some((a) => a.id === accountId)) return null;
  return "Elige la cuenta de la que salió el dinero.";
}
