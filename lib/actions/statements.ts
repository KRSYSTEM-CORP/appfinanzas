"use server";

import { requireManager } from "@/lib/session";
import { withTenant } from "@/lib/tenant-db";
import { selectionToWindows, type DateRangeSelection } from "@/lib/report-types";
import { revenueTotals, receivablesTotals } from "@/lib/actions/reports";
import { costOfGoodsSold, expensesTotal } from "@/lib/actions/finance";
import { commissionsTotal } from "@/lib/actions/seller-reports";
import { getSalesTaxBook, getPurchasesTaxBook } from "@/lib/actions/tax-book";
import { getAccountBalances } from "@/lib/actions/payment-accounts";

export type Statements = {
  // Estado de resultados (moneda de referencia, centavos)
  income: number;
  cogs: number;
  gross: number;
  salesExpenses: number; // comisiones
  adminExpenses: number; // gastos registrados
  operating: number;
  islr: number;
  net: number;
  // Situación financiera
  receivables: number;
  inventory: number;
  banks: number; // saldos de cuentas en $ (aprox. como referencia)
  payables: number;
  ivaPayable: number;
  assets: number;
  liabilities: number;
  equity: number;
  // Análisis de costo
  purchases: number;
  internalUse: number;
  unexplained: number;
  // Resumen de IVA
  ivaDebit: number;
  ivaCredit: number;
  ivaBalance: number;
  salesBase: number;
  purchasesBase: number;
};

export async function getStatements(range: DateRangeSelection, islrPercent: number): Promise<Statements> {
  const { companyId, branchId } = await requireManager();
  const windows = selectionToWindows(range);
  const rate = Math.min(Math.max(islrPercent, 0), 60) / 100;

  const [rev, cogs, expenses, commissions, recv, salesBook, purchasesBook, accounts] = await Promise.all([
    revenueTotals(range),
    costOfGoodsSold(range),
    expensesTotal(range),
    commissionsTotal(range),
    receivablesTotals(),
    getSalesTaxBook(range),
    getPurchasesTaxBook(range),
    getAccountBalances().catch(() => []),
  ]);

  const extra = await withTenant(companyId, async (tx) => {
    const products = await tx.product.findMany({
      where: { companyId, ...(branchId ? { branchId } : {}), trackStock: true },
      select: { stock: true, costCents: true },
    });
    const inventory = products.reduce((n, p) => n + Math.max(p.stock, 0) * (p.costCents ?? 0), 0);
    const pending = await tx.purchase.aggregate({
      _sum: { totalCents: true },
      where: { companyId, ...(branchId ? { branchId } : {}), voided: false, paymentStatus: "PENDING" },
    });
    const moves = await tx.stockMovement.findMany({
      where: {
        companyId,
        reason: "INTERNAL_USE",
        ...(branchId ? { branchId } : {}),
        OR: windows.map((w) => ({ createdAt: { gte: w.start, lt: w.end } })),
      },
      select: { productId: true, quantityChange: true },
    });
    const ids = [...new Set(moves.map((m) => m.productId).filter((x): x is string => !!x))];
    const costs = await tx.product.findMany({ where: { companyId, id: { in: ids } }, select: { id: true, costCents: true } });
    const cost = new Map(costs.map((p) => [p.id, p.costCents ?? 0]));
    const internalUse = moves.reduce((n, m) => n + (m.productId ? (cost.get(m.productId) ?? 0) : 0) * Math.abs(m.quantityChange), 0);
    return { inventory, payables: pending._sum.totalCents ?? 0, internalUse };
  });

  const income = rev.totalEurCents;
  const gross = income - cogs;
  const operating = gross - commissions - expenses;
  const islr = operating > 0 ? Math.round(operating * rate) : 0;

  const ivaDebit = salesBook.reduce((n, s) => n + s.taxCents, 0);
  const ivaCredit = purchasesBook.reduce((n, p) => n + p.taxCents, 0);
  const ivaBalance = ivaDebit - ivaCredit;

  const banks = accounts.filter((a) => a.currency === "USD").reduce((n, a) => n + a.balanceCents, 0);
  const assets = recv.totalEurCents + extra.inventory + banks;
  const liabilities = extra.payables + Math.max(ivaBalance, 0);
  const purchases = purchasesBook.reduce((n, p) => n + p.totalCents, 0);

  return {
    income,
    cogs,
    gross,
    salesExpenses: commissions,
    adminExpenses: expenses,
    operating,
    islr,
    net: operating - islr,
    receivables: recv.totalEurCents,
    inventory: extra.inventory,
    banks,
    payables: extra.payables,
    ivaPayable: Math.max(ivaBalance, 0),
    assets,
    liabilities,
    equity: assets - liabilities,
    purchases,
    internalUse: extra.internalUse,
    unexplained: purchases - cogs - extra.internalUse,
    ivaDebit,
    ivaCredit,
    ivaBalance,
    salesBase: salesBook.reduce((n, s) => n + s.baseImponibleCents, 0),
    purchasesBase: purchasesBook.reduce((n, p) => n + p.baseImponibleCents, 0),
  };
}

export type MovementRow = { date: string; kind: "Ingreso" | "Egreso"; label: string; category: string; auto: boolean; amountCents: number };

// Movimientos: ingresos (ventas por día) y egresos (gastos y compras) del período.
export async function listMovements(range: DateRangeSelection): Promise<MovementRow[]> {
  const { companyId, branchId } = await requireManager();
  const windows = selectionToWindows(range);
  return withTenant(companyId, async (tx) => {
    const or = (f: string) => windows.map((w) => ({ [f]: { gte: w.start, lt: w.end } }));
    const [sales, expenses, purchases] = await Promise.all([
      tx.sale.findMany({
        where: { companyId, ...(branchId ? { branchId } : {}), voided: false, OR: or("createdAt") },
        select: { createdAt: true, totalCents: true },
      }),
      tx.expense.findMany({ where: { companyId, OR: or("spentAt") }, select: { spentAt: true, description: true, category: true, amountCents: true } }),
      tx.purchase.findMany({
        where: { companyId, ...(branchId ? { branchId } : {}), voided: false, OR: or("createdAt") },
        select: { createdAt: true, totalCents: true, manualSupplierName: true, supplier: { select: { name: true } } },
      }),
    ]);
    const perDay = new Map<string, number>();
    for (const s of sales) {
      const d = s.createdAt.toISOString().slice(0, 10);
      perDay.set(d, (perDay.get(d) ?? 0) + s.totalCents);
    }
    const rows: MovementRow[] = [
      ...[...perDay.entries()].map(([d, c]) => ({ date: d, kind: "Ingreso" as const, label: "Ventas del día", category: "Ventas", auto: true, amountCents: c })),
      ...expenses.map((e) => ({ date: e.spentAt.toISOString().slice(0, 10), kind: "Egreso" as const, label: e.description, category: e.category ?? "Otros", auto: true, amountCents: e.amountCents })),
      ...purchases.map((p) => ({
        date: p.createdAt.toISOString().slice(0, 10),
        kind: "Egreso" as const,
        label: `Compra a ${p.supplier?.name ?? p.manualSupplierName ?? "Proveedor"}`,
        category: "Compras",
        auto: true,
        amountCents: p.totalCents,
      })),
    ];
    return rows.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 300);
  });
}
