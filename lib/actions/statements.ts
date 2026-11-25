"use server";

import { requireAccountingManagerOrPermission } from "@/lib/session";
import { withTenant } from "@/lib/tenant-db";
import { incomeStatement, ivaPosition, purchasesCost } from "@/lib/statements-math";
import { caracasDateString, selectionToWindows, type DateRangeSelection } from "@/lib/report-types";
import { receivablesTotals } from "@/lib/actions/reports";
import { costOfGoodsSold, expensesTotal, netSalesCents } from "@/lib/actions/finance";
import { commissionsTotal } from "@/lib/actions/seller-reports";
import { getSalesTaxBook, getPurchasesTaxBook, getCreditNotesTaxBook, getDebitNotesTaxBook } from "@/lib/actions/tax-book";
import { getIvaSettings } from "@/lib/actions/settings";
import { getAccountBalances } from "@/lib/actions/payment-accounts";

export type Statements = {
  ivaEnabled: boolean;
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
  const { companyId, branchId } = await requireAccountingManagerOrPermission("admin");
  const windows = selectionToWindows(range);
  const rate = Math.min(Math.max(islrPercent, 0), 60) / 100;

  const { ivaEnabled } = await getIvaSettings();
  const [netSales, cogs, expenses, commissions, recv, salesBook, purchasesBook, creditNotes, debitNotes, accounts] = await Promise.all([
    netSalesCents(range),
    costOfGoodsSold(range),
    expensesTotal(range),
    commissionsTotal(range),
    receivablesTotals(),
    ivaEnabled ? getSalesTaxBook(range) : Promise.resolve([] as Awaited<ReturnType<typeof getSalesTaxBook>>),
    getPurchasesTaxBook(range),
    ivaEnabled ? getCreditNotesTaxBook(range) : Promise.resolve([] as Awaited<ReturnType<typeof getCreditNotesTaxBook>>),
    ivaEnabled ? getDebitNotesTaxBook(range) : Promise.resolve([] as Awaited<ReturnType<typeof getDebitNotesTaxBook>>),
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

  const is = incomeStatement({ netSales, cogs, commissions, expenses, islrRate: rate });
  const iva = ivaPosition(ivaEnabled, salesBook, creditNotes, debitNotes, purchasesBook);

  const banks = accounts.filter((a) => a.currency === "USD").reduce((n, a) => n + a.balanceCents, 0);
  const assets = recv.totalEurCents + extra.inventory + banks;
  const liabilities = extra.payables + iva.payable;
  const purchases = purchasesCost(ivaEnabled, purchasesBook);

  return {
    ivaEnabled,
    income: is.income,
    cogs,
    gross: is.gross,
    salesExpenses: commissions,
    adminExpenses: expenses,
    operating: is.operating,
    islr: is.islr,
    net: is.net,
    receivables: recv.totalEurCents,
    inventory: extra.inventory,
    banks,
    payables: extra.payables,
    ivaPayable: iva.payable,
    assets,
    liabilities,
    equity: assets - liabilities,
    purchases,
    internalUse: extra.internalUse,
    unexplained: purchases - cogs - extra.internalUse,
    ivaDebit: iva.debit,
    ivaCredit: iva.credit,
    ivaBalance: iva.balance,
    salesBase: iva.salesBase,
    purchasesBase: iva.purchasesBase,
  };
}

export type MovementRow = { date: string; kind: "Ingreso" | "Egreso"; label: string; category: string; auto: boolean; amountCents: number };

// Movimientos: ingresos (ventas por día) y egresos (gastos y compras) del período.
export async function listMovements(range: DateRangeSelection): Promise<MovementRow[]> {
  const { companyId, branchId } = await requireAccountingManagerOrPermission("admin");
  const windows = selectionToWindows(range);
  return withTenant(companyId, async (tx) => {
    const or = (f: string) => windows.map((w) => ({ [f]: { gte: w.start, lt: w.end } }));
    const [sales, expenses, purchases] = await Promise.all([
      tx.sale.findMany({
        where: { companyId, ...(branchId ? { branchId } : {}), voided: false, OR: or("createdAt") },
        select: { createdAt: true, totalCents: true },
      }),
      tx.expense.findMany({ where: { companyId, ...(branchId ? { branchId } : {}), OR: or("spentAt") }, select: { spentAt: true, description: true, category: true, amountCents: true } }),
      tx.purchase.findMany({
        where: { companyId, ...(branchId ? { branchId } : {}), voided: false, OR: or("createdAt") },
        select: { createdAt: true, totalCents: true, manualSupplierName: true, supplier: { select: { name: true } } },
      }),
    ]);
    const perDay = new Map<string, number>();
    for (const s of sales) {
      const d = caracasDateString(s.createdAt);
      perDay.set(d, (perDay.get(d) ?? 0) + s.totalCents);
    }
    const rows: MovementRow[] = [
      ...[...perDay.entries()].map(([d, c]) => ({ date: d, kind: "Ingreso" as const, label: "Ventas del día", category: "Ventas", auto: true, amountCents: c })),
      ...expenses.map((e) => ({ date: caracasDateString(e.spentAt), kind: "Egreso" as const, label: e.description, category: e.category ?? "Otros", auto: true, amountCents: e.amountCents })),
      ...purchases.map((p) => ({
        date: caracasDateString(p.createdAt),
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
