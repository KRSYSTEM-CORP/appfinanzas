"use server";

import { requireAccountingManagerOrPermission } from "@/lib/session";
import { outsideScope, withTenant } from "@/lib/tenant-db";
import { incomeStatement, ivaPosition, purchasesCost } from "@/lib/statements-math";
import { caracasDateString, selectionToWindows, SHOP_TIME_ZONE, type DateRangeSelection } from "@/lib/report-types";
import { receivablesTotals } from "@/lib/actions/reports";
import { costOfGoodsSold, expensesTotal, netSalesCents } from "@/lib/actions/finance";
import { commissionsTotal } from "@/lib/actions/seller-reports";
import { Prisma } from "@prisma/client";
import { bq, jsDate } from "@/lib/batch-sql";
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

type TaxPart = { baseImponibleCents: number; taxCents: number; totalCents: number };

// Base, IVA y total del Libro de Ventas (facturas, notas de crédito y de débito) y del de Compras en el período,
// en una sola sentencia agrupada. Solo se necesitan las sumas: antes se traían todas las filas de los cuatro libros.
async function ivaTotals(range: DateRangeSelection, ivaEnabled: boolean) {
  const { companyId, branchId } = await requireAccountingManagerOrPermission("admin");
  const windows = selectionToWindows(range);
  const win = (col: string) => Prisma.sql`(${Prisma.join(windows.map((w) => Prisma.sql`(${Prisma.raw(col)} >= ${w.start} AND ${Prisma.raw(col)} < ${w.end})`), " OR ")})`;
  const br = (col: string) => (branchId ? Prisma.sql`AND ${Prisma.raw(col)} = ${branchId}` : Prisma.empty);
  const part = async (promise: Promise<{ base: number | null; tax: number | null; total: number | null }[]>): Promise<TaxPart[]> => {
    const [r] = await promise;
    return [{ baseImponibleCents: Number(r?.base ?? 0), taxCents: Number(r?.tax ?? 0), totalCents: Number(r?.total ?? 0) }];
  };
  return withTenant(companyId, async (tx) => {
    const none = Promise.resolve<TaxPart[]>([]);
    const [sales, creditNotes, debitNotes, purchases] = await Promise.all([
      ivaEnabled
        ? part(bq<{ base: number | null; tax: number | null; total: number | null }>(tx)`
            SELECT SUM(s."baseImponibleCents")::bigint AS base, SUM(s."taxCents")::bigint AS tax, SUM(s."totalCents")::bigint AS total
            FROM "Sale" s
            WHERE s."companyId" = ${companyId} ${br('s."branchId"')} AND ${win('s."createdAt"')}
              AND (s."voided" = false OR EXISTS (SELECT 1 FROM "CreditNote" cn WHERE cn."saleId" = s."id"))`)
        : none,
      ivaEnabled
        ? part(bq<{ base: number | null; tax: number | null; total: number | null }>(tx)`
            SELECT SUM("baseImponibleCents")::bigint AS base, SUM("taxCents")::bigint AS tax, SUM("totalCents")::bigint AS total
            FROM "CreditNote" WHERE "companyId" = ${companyId} ${br('"branchId"')} AND ${win('"createdAt"')}`)
        : none,
      ivaEnabled
        ? part(bq<{ base: number | null; tax: number | null; total: number | null }>(tx)`
            SELECT SUM("baseImponibleCents")::bigint AS base, SUM("taxCents")::bigint AS tax, SUM("totalCents")::bigint AS total
            FROM "DebitNote" WHERE "companyId" = ${companyId} ${br('"branchId"')} AND ${win('"createdAt"')}`)
        : none,
      part(bq<{ base: number | null; tax: number | null; total: number | null }>(tx)`
        SELECT SUM("baseImponibleCents")::bigint AS base, SUM("taxCents")::bigint AS tax, SUM("totalCents")::bigint AS total
        FROM "Purchase" WHERE "companyId" = ${companyId} ${br('"branchId"')} AND ${win('"createdAt"')} AND "voided" = false`),
    ]);
    return { sales, creditNotes, debitNotes, purchases };
  });
}

export async function getStatements(range: DateRangeSelection, islrPercent: number): Promise<Statements> {
  const { companyId, branchId } = await requireAccountingManagerOrPermission("admin");
  const windows = selectionToWindows(range);
  const rate = Math.min(Math.max(islrPercent, 0), 60) / 100;

  const { ivaEnabled } = await getIvaSettings();
  const [netSales, cogs, expenses, commissions, recv, tax, accounts, extra] = await Promise.all([
    netSalesCents(range),
    costOfGoodsSold(range),
    expensesTotal(range),
    commissionsTotal(range),
    receivablesTotals(),
    ivaTotals(range, ivaEnabled),
    outsideScope(() => getAccountBalances()).catch(() => []),
    withTenant(companyId, async (tx) => {
      // Inventario valorizado, cuentas por pagar y consumo interno: tres sumas en una sola sentencia agrupada
      // (antes: todos los productos, las compras pendientes, los movimientos y el costo de cada producto).
      const branchSql = (col: string) => (branchId ? Prisma.sql`AND ${Prisma.raw(col)} = ${branchId}` : Prisma.empty);
      const [inv, pend, used] = await Promise.all([
        bq<{ v: number | null }>(tx)`
          SELECT COALESCE(SUM(GREATEST("stock", 0)::bigint * COALESCE("costCents", 0)), 0)::bigint AS v FROM "Product"
          WHERE "companyId" = ${companyId} ${branchSql('"branchId"')} AND "trackStock" = true`,
        bq<{ v: number | null }>(tx)`
          SELECT SUM("totalCents")::bigint AS v FROM "Purchase"
          WHERE "companyId" = ${companyId} ${branchSql('"branchId"')} AND "voided" = false AND "paymentStatus"::text = 'PENDING'`,
        bq<{ v: number | null }>(tx)`
          SELECT COALESCE(SUM(COALESCE(p."costCents", 0)::bigint * ABS(m."quantityChange")), 0)::bigint AS v
          FROM "StockMovement" m
          LEFT JOIN "Product" p ON p."id" = m."productId" AND p."companyId" = ${companyId}
          WHERE m."companyId" = ${companyId} AND m."reason"::text = 'INTERNAL_USE' ${branchSql('m."branchId"')}
            AND (${Prisma.join(windows.map((w) => Prisma.sql`(m."createdAt" >= ${w.start} AND m."createdAt" < ${w.end})`), " OR ")})`,
      ]);
      return { inventory: Number(inv[0]?.v ?? 0), payables: Number(pend[0]?.v ?? 0), internalUse: Number(used[0]?.v ?? 0) };
    }),
  ]);

  const is = incomeStatement({ netSales, cogs, commissions, expenses, islrRate: rate });
  const iva = ivaPosition(ivaEnabled, tax.sales, tax.creditNotes, tax.debitNotes, tax.purchases);

  const banks = accounts.filter((a) => a.currency === "USD").reduce((n, a) => n + a.balanceCents, 0);
  const assets = recv.totalEurCents + extra.inventory + banks;
  const liabilities = extra.payables + iva.payable;
  const purchases = purchasesCost(ivaEnabled, tax.purchases);

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
    const win = (col: string) => Prisma.sql`(${Prisma.join(windows.map((w) => Prisma.sql`(${Prisma.raw(col)} >= ${w.start} AND ${Prisma.raw(col)} < ${w.end})`), " OR ")})`;
    const br = (col: string) => (branchId ? Prisma.sql`AND ${Prisma.raw(col)} = ${branchId}` : Prisma.empty);
    const [salesPerDay, expensesRaw, purchasesRaw] = await Promise.all([
      // Ventas del día: el total por día de Venezuela sale agrupado desde SQL (antes: una fila por venta).
      bq<{ day: string; total: number }>(tx)`
        SELECT to_char("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${SHOP_TIME_ZONE}, 'YYYY-MM-DD') AS day, SUM("totalCents")::bigint AS total
        FROM "Sale" WHERE "companyId" = ${companyId} ${br('"branchId"')} AND "voided" = false AND ${win('"createdAt"')}
        GROUP BY 1`,
      bq<{ spentAt: string; description: string; category: string | null; amountCents: number }>(tx)`
        SELECT "spentAt", "description", "category", "amountCents" FROM "Expense"
        WHERE "companyId" = ${companyId} ${br('"branchId"')} AND ${win('"spentAt"')}`,
      bq<{ createdAt: string; totalCents: number; manualSupplierName: string | null; supplierName: string | null }>(tx)`
        SELECT p."createdAt", p."totalCents", p."manualSupplierName", sup."name" AS "supplierName"
        FROM "Purchase" p LEFT JOIN "Supplier" sup ON sup."id" = p."supplierId"
        WHERE p."companyId" = ${companyId} ${br('p."branchId"')} AND p."voided" = false AND ${win('p."createdAt"')}`,
    ]);
    const perDay = new Map<string, number>(salesPerDay.map((r) => [r.day, Number(r.total)]));
    const expenses = expensesRaw.map((e) => ({ ...e, spentAt: jsDate(e.spentAt) }));
    const purchases = purchasesRaw.map((p) => ({ createdAt: jsDate(p.createdAt), totalCents: p.totalCents, manualSupplierName: p.manualSupplierName, supplier: p.supplierName != null ? { name: p.supplierName } : null }));
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
