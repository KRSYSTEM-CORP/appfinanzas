import { netSalesTax } from "@/lib/tax";

type TaxParts = { baseImponibleCents: number; taxCents: number };

// Estado de resultados. `netSales` son las ventas NETAS SIN IVA (la misma cifra de Finanzas,
// `netSalesCents`): el IVA nunca es ingreso, se cobra por cuenta del Estado.
export function incomeStatement(i: { netSales: number; cogs: number; commissions: number; expenses: number; islrRate: number }) {
  const gross = i.netSales - i.cogs;
  const operating = gross - i.commissions - i.expenses;
  const islr = operating > 0 ? Math.round(operating * i.islrRate) : 0;
  return { income: i.netSales, gross, operating, islr, net: operating - islr };
}

// Posición de IVA del período. Con IVA apagado todo es 0 (no se calcula ni se muestra).
export function ivaPosition(ivaEnabled: boolean, sales: TaxParts[], creditNotes: TaxParts[], debitNotes: TaxParts[], purchases: TaxParts[]) {
  if (!ivaEnabled) return { debit: 0, credit: 0, balance: 0, payable: 0, salesBase: 0, purchasesBase: 0 };
  const salesNet = netSalesTax(sales, creditNotes, debitNotes);
  const credit = purchases.reduce((n, p) => n + p.taxCents, 0);
  const balance = salesNet.tax - credit;
  return {
    debit: salesNet.tax,
    credit,
    balance,
    payable: Math.max(balance, 0),
    salesBase: salesNet.base,
    purchasesBase: purchases.reduce((n, p) => n + p.baseImponibleCents, 0),
  };
}

// Compras del período para el análisis de costo: sin IVA cuando la empresa lo usa (el crédito
// fiscal no es costo); el total tal cual cuando no hay IVA.
export function purchasesCost(ivaEnabled: boolean, purchases: (TaxParts & { totalCents: number })[]): number {
  return purchases.reduce((n, p) => n + (ivaEnabled ? p.baseImponibleCents : p.totalCents), 0);
}
