"use server";

import { requireManager } from "@/lib/session";
import { withTenant } from "@/lib/tenant-db";
import { closedDayWindows } from "@/lib/closed-days";
import { selectionToWindows, type DateRangeSelection } from "@/lib/report-types";

export type CollectionRow = {
  method: string; // PaymentMethod
  local: boolean; // cobrado en la moneda local (Bs) en vez de divisa
  refCents: number; // en la divisa de referencia
  currencyCents: number; // en la moneda en que se cobró
  currencyCode: string;
};

// Administración → Balance → Cobros: lo cobrado por método y moneda (bolívares en Bs, divisas
// con su referencia), con los mismos días con cierre de caja que el resto de los reportes.
export async function collectionsByMethod(range: DateRangeSelection): Promise<CollectionRow[]> {
  const { companyId, branchId } = await requireManager();
  return withTenant(companyId, async (tx) => {
    const windows = await closedDayWindows(tx, companyId, branchId, selectionToWindows(range));
    if (windows.length === 0) return [];
    const [pays, company] = await Promise.all([
      tx.salePayment.findMany({
        where: {
          sale: { companyId, voided: false, ...(branchId ? { branchId } : {}) },
          OR: windows.map((w) => ({ createdAt: { gte: w.start, lt: w.end } })),
        },
        select: { paymentMethod: true, amountEurCents: true, amountCurrencyCents: true, currencyCode: true, paidInForeignCurrency: true },
      }),
      tx.company.findUnique({ where: { id: companyId }, select: { localCurrencyCode: true } }),
    ]);
    const localCode = company?.localCurrencyCode ?? "VES";
    const map = new Map<string, CollectionRow>();
    for (const p of pays) {
      const code = p.currencyCode ?? (["ZELLE", "BINANCE", "PAYPAL"].includes(p.paymentMethod) ? "USD" : localCode);
      const local = code === localCode && !p.paidInForeignCurrency;
      const key = `${p.paymentMethod}|${local ? "L" : "D"}`;
      const row = map.get(key) ?? { method: p.paymentMethod, local, refCents: 0, currencyCents: 0, currencyCode: local ? localCode : code };
      row.refCents += p.amountEurCents;
      row.currencyCents += p.amountCurrencyCents ?? p.amountEurCents;
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) => b.refCents - a.refCents);
  });
}
