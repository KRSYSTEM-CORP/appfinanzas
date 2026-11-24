import type { AccountIncomeRow } from "@/lib/actions/cash-closing";
import { cashOutflowImpact, type CashOutflowLike } from "@/lib/cash-outflow";

// Efectivo de un turno separado por moneda: dólares (moneda de referencia) y bolívares (moneda local).
export type CashByCurrency = { refCents: number; localCents: number };

export type ExpectedCashInput = {
  openingCents: number | null;
  openingRefCents: number | null;
  openingLocalCents: number | null;
  // Cobros del turno; solo se usan los de efectivo.
  incomeRows: Pick<AccountIncomeRow, "paymentMethod" | "currencyCode" | "cents" | "refCents">[];
  // Salidas del turno: solo las de efectivo restan, cada una en su moneda.
  outflows: CashOutflowLike[];
  // Efectivo cobrado en ventas luego anuladas con devolución (sigue en la gaveta).
  refundedCash?: { currencyCode: string; cents: number; refCents: number }[];
  rate?: number | null;
  referenceCurrency: string;
  localCurrency: string;
};

// Efectivo esperado por moneda. La apertura usa el desglose $/Bs si se guardó; si no (aperturas antiguas) todo cuenta
// como referencia. El efectivo cobrado en la moneda local va a bolívares; el resto, en referencia. Las salidas de Caja
// Chica en efectivo restan en la moneda en que salieron; las pagadas desde una cuenta no tocan la caja.
export function expectedCashByCurrency(i: ExpectedCashInput): CashByCurrency {
  const hasSplit = i.openingRefCents != null || i.openingLocalCents != null;
  let ref = hasSplit ? i.openingRefCents ?? 0 : i.openingCents ?? 0;
  let local = hasSplit ? i.openingLocalCents ?? 0 : 0;
  for (const r of i.incomeRows) {
    if (r.paymentMethod !== "CASH") continue;
    if (r.currencyCode === i.localCurrency && r.currencyCode !== i.referenceCurrency) local += r.cents;
    else ref += r.refCents;
  }
  for (const r of i.refundedCash ?? []) {
    if (r.currencyCode === i.localCurrency && r.currencyCode !== i.referenceCurrency) local += r.cents;
    else ref += r.refCents;
  }
  for (const o of i.outflows) {
    const d = cashOutflowImpact(o, i.localCurrency, i.referenceCurrency, i.rate ?? null);
    ref -= d.refCents;
    local -= d.localCents;
  }
  return { refCents: ref, localCents: local };
}

export type CountedDiff = { refDiffCents: number; localDiffCents: number };

// Diferencia contada − esperada por moneda (positivo = sobrante, negativo = faltante).
export function countedDifference(expected: CashByCurrency, counted: { usdCents: number; bsCents: number }): CountedDiff {
  return { refDiffCents: counted.usdCents - expected.refCents, localDiffCents: counted.bsCents - expected.localCents };
}

export function differenceLabel(cents: number): "Sobrante" | "Faltante" | "Cuadra" {
  return cents > 0 ? "Sobrante" : cents < 0 ? "Faltante" : "Cuadra";
}
