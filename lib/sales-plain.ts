import type { listRecentSales } from "@/lib/actions/sales";

type Sale = Awaited<ReturnType<typeof listRecentSales>>[number];

// Decimal columns can't cross into a Client Component, so every sale handed
// to one (the document buttons, the desktop list + detail panel) goes through
// this same conversion.
export function toPlainSale(sale: Sale) {
  return {
    ...sale,
    exchangeRate: sale.exchangeRate != null ? Number(sale.exchangeRate) : null,
    paidExchangeRate: sale.paidExchangeRate != null ? Number(sale.paidExchangeRate) : null,
    payments: sale.payments.map((p) => ({
      ...p,
      exchangeRate: p.exchangeRate != null ? Number(p.exchangeRate) : null,
    })),
  };
}

export type PlainSale = ReturnType<typeof toPlainSale>;
