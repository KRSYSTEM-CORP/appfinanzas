"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { requireManager, requireAccountingPlan, requireManagerOrPermission, requireAccountingManagerOrPermission } from "@/lib/session";
import { bq, jsDate } from "@/lib/batch-sql";
import type { Expense } from "@prisma/client";
import { withTenant } from "@/lib/tenant-db";
import { selectionToWindows, type DateRangeSelection } from "@/lib/report-types";
import { closedDayWindows } from "@/lib/closed-days";
import { ExpenseSchema } from "@/lib/validations";
import { getExchangeRateInfo } from "@/lib/actions/settings";
import type { ActionResult } from "@/lib/types";
import { assertAccountFunds, expenseDebitCents, toActionResult } from "@/lib/account-balance";
import { methodForAccountKind } from "@/lib/account-money";
import type { CategoryMargin } from "@/lib/breakeven";

// Same raw-SQL OR-of-windows builder as lib/actions/reports.ts — kept local
// rather than shared since each file's Prisma import differs only in this
// one helper's use of it.
function windowsSql(column: string, windows: { start: Date; end: Date }[]): Prisma.Sql {
  const parts = windows.map((w) => Prisma.sql`(${Prisma.raw(column)} >= ${w.start} AND ${Prisma.raw(column)} < ${w.end})`);
  return Prisma.sql`(${Prisma.join(parts, " OR ")})`;
}

// Sum of quantity * product.costCents for non-voided sale items in range —
// products deleted since the sale keep no cost snapshot on SaleItem, so
// those lines are excluded (treated as $0 cost) rather than guessed at.
export async function costOfGoodsSold(range: DateRangeSelection): Promise<number> {
  const { companyId, branchId } = await requireManagerOrPermission("stats", "admin");
  const requestedWindows = selectionToWindows(range);

  return withTenant(companyId, async (tx) => {
    const windows = await closedDayWindows(tx, companyId, branchId, requestedWindows);
    if (windows.length === 0) return 0;

    const [row] = await bq<{ cogs_cents: bigint | null }>(tx)`
      SELECT SUM(si."quantity" * p."costCents")::bigint AS cogs_cents
      FROM "SaleItem" si
      JOIN "Sale" s ON s.id = si."saleId"
      JOIN "Product" p ON p.id = si."productId"
      WHERE s."companyId" = ${companyId}
        ${branchId ? Prisma.sql`AND s."branchId" = ${branchId}` : Prisma.empty}
        AND ${windowsSql('s."createdAt"', windows)}
        AND s."voided" = false
        AND p."costCents" IS NOT NULL
    `;
    return Number(row?.cogs_cents ?? 0);
  });
}

// Ventas netas del período: lo vendido sin IVA (el IVA y el IGTF se cobran por cuenta del Estado
// y no son ingreso). Es la base correcta para restar el costo y los gastos y obtener la utilidad.
// Solo cuenta días con cierre de caja, igual que las demás cifras de Estadísticas.
export async function netSalesCents(range: DateRangeSelection): Promise<number> {
  const { companyId, branchId } = await requireAccountingManagerOrPermission("stats", "admin");
  const requestedWindows = selectionToWindows(range);
  return withTenant(companyId, async (tx) => {
    const windows = await closedDayWindows(tx, companyId, branchId, requestedWindows);
    if (windows.length === 0) return 0;
    const [row] = await bq<{ net: bigint | null }>(tx)`
      SELECT SUM(si."baseCents")::bigint AS net
      FROM "SaleItem" si
      JOIN "Sale" s ON s.id = si."saleId"
      WHERE s."companyId" = ${companyId}
        ${branchId ? Prisma.sql`AND s."branchId" = ${branchId}` : Prisma.empty}
        AND ${windowsSql('s."createdAt"', windows)}
        AND s."voided" = false
    `;
    return Number(row?.net ?? 0);
  });
}

// Ventas netas de productos que no tienen costo cargado (o ya no existen): su costo no se puede
// restar, así que la utilidad real puede ser menor a la mostrada. Sirve para avisarlo.
export async function netSalesWithoutCost(range: DateRangeSelection): Promise<number> {
  const { companyId, branchId } = await requireAccountingManagerOrPermission("stats", "admin");
  const requestedWindows = selectionToWindows(range);
  return withTenant(companyId, async (tx) => {
    const windows = await closedDayWindows(tx, companyId, branchId, requestedWindows);
    if (windows.length === 0) return 0;
    const [row] = await bq<{ net: bigint | null }>(tx)`
      SELECT SUM(si."baseCents")::bigint AS net
      FROM "SaleItem" si
      JOIN "Sale" s ON s.id = si."saleId"
      LEFT JOIN "Product" p ON p.id = si."productId"
      WHERE s."companyId" = ${companyId}
        ${branchId ? Prisma.sql`AND s."branchId" = ${branchId}` : Prisma.empty}
        AND ${windowsSql('s."createdAt"', windows)}
        AND s."voided" = false
        AND (p.id IS NULL OR p."costCents" IS NULL OR p."costCents" = 0)
    `;
    return Number(row?.net ?? 0);
  });
}

export async function listExpenses(range: DateRangeSelection, search = "") {
  const { companyId, branchId } = await requireAccountingManagerOrPermission("stats", "admin");
  const windows = selectionToWindows(range);
  const query = search.trim();
  const like = `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = await withTenant(companyId, (tx) =>
    bq<ExpenseJson>(tx)`
      SELECT "id", "companyId", "description", "category", "branchId", "amountCents", "enteredInLocal", "localAmountCents",
             "exchangeRate"::float8 AS "exchangeRate", "spentAt", "createdById", "createdAt", "paymentMethod"::text AS "paymentMethod", "paymentAccountId"
      FROM "Expense"
      WHERE "companyId" = ${companyId}
        ${branchId ? Prisma.sql`AND "branchId" = ${branchId}` : Prisma.empty}
        AND ${windowsSql('"spentAt"', windows)}
        ${query ? Prisma.sql`AND ("description" ILIKE ${like} OR "category" ILIKE ${like})` : Prisma.empty}
      ORDER BY "spentAt" DESC
    `
  );
  return rows.map((e) => ({
    ...e,
    // Decimal(12,4) pasado a número (la pantalla lo vuelve a leer con Number()).
    exchangeRate: e.exchangeRate as unknown as Expense["exchangeRate"],
    spentAt: jsDate(e.spentAt),
    createdAt: jsDate(e.createdAt),
  })) as Expense[];
}

type ExpenseJson = Omit<Expense, "spentAt" | "createdAt" | "exchangeRate" | "paymentMethod"> & {
  spentAt: string;
  createdAt: string;
  exchangeRate: number | null;
  paymentMethod: string | null;
};

export async function createExpense(formData: FormData): Promise<ActionResult> {
  const { companyId, userId, branchId } = await requireAccountingManagerOrPermission("admin");
  const parsed = ExpenseSchema.safeParse({
    description: formData.get("description"),
    category: formData.get("category"),
    amount: formData.get("amount"),
    currency: formData.get("currency") ?? undefined,
    paymentMethod: formData.get("paymentMethod") || undefined,
    paymentAccountId: formData.get("paymentAccountId") || undefined,
    spentAt: formData.get("spentAt"),
  });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  // The rate always comes from the server, never the client. Finanzas sums
  // amountCents in the reference currency, so a local-currency expense is
  // converted once, at the rate of the day it is recorded.
  const info = await getExchangeRateInfo();
  const rate = info.exchangeRateEnabled && info.rate != null && info.rate > 0 ? info.rate : null;
  const enteredInLocal = parsed.data.currency === "LOCAL";

  let amountCents = parsed.data.amount;
  let localAmountCents: number | null = null;
  if (enteredInLocal) {
    if (rate == null) {
      return { success: false, error: "No hay una tasa de cambio activa para registrar el gasto en bolívares." };
    }
    localAmountCents = parsed.data.amount;
    amountCents = Math.round(localAmountCents / rate);
    if (amountCents < 1) {
      return { success: false, error: "El monto es demasiado pequeño para convertirlo a la divisa referencial." };
    }
  } else if (rate != null) {
    localAmountCents = Math.round(amountCents * rate);
  }

  try {
    await withTenant(companyId, async (tx) => {
      let method = parsed.data.paymentMethod ?? null;
      let accountId: string | null = null;
      if (parsed.data.paymentAccountId) {
        const acc = await tx.paymentAccount.findFirst({ where: { id: parsed.data.paymentAccountId, companyId }, select: { id: true, kind: true } });
        if (!acc) throw new Error("La cuenta elegida no existe. Recarga la página e inténtalo de nuevo.");
        accountId = acc.id;
        // El método sale de la cuenta (pago móvil, transferencia, Zelle…).
        method = methodForAccountKind(acc.kind);
        const exp = { amountCents, localAmountCents, enteredInLocal };
        await assertAccountFunds(tx, companyId, [{ accountId: acc.id, debit: (cur, r) => expenseDebitCents(exp, cur, r) }]);
      }
      await tx.expense.create({
        data: {
          companyId,
          description: parsed.data.description,
          category: parsed.data.category,
          branchId: branchId ?? null,
          amountCents,
          enteredInLocal,
          localAmountCents,
          exchangeRate: rate,
          spentAt: parsed.data.spentAt,
          createdById: userId,
          paymentMethod: method,
          paymentAccountId: accountId,
        },
      });
    });
  } catch (err) {
    return toActionResult(err, "No se pudo guardar el gasto");
  }

  revalidatePath("/finance");
  revalidatePath("/accounting/gastos");
  revalidatePath("/accounting/accounts");
  return { success: true };
}

export async function deleteExpense(expenseId: string): Promise<ActionResult> {
  const { companyId } = await requireAccountingManagerOrPermission("admin");
  const result = await withTenant(companyId, async (tx) => {
    // Un gasto de nómina nace de un pago: se anula desde Nómina (revierte la cuenta).
    const payroll = await tx.payrollPayment.findFirst({ where: { companyId, expenseId }, select: { id: true } });
    if (payroll) return "PAYROLL" as const;
    return tx.expense.deleteMany({ where: { id: expenseId, companyId } });
  });
  if (result === "PAYROLL") {
    return { success: false, error: "Este gasto pertenece a un pago de nómina: anula el pago desde Nómina." };
  }
  if (result.count === 0) {
    return { success: false, error: "Gasto no encontrado" };
  }
  revalidatePath("/finance");
  revalidatePath("/accounting/gastos");
  revalidatePath("/accounting/accounts");
  return { success: true };
}

export async function expensesTotal(range: DateRangeSelection): Promise<number> {
  const { companyId, branchId } = await requireManagerOrPermission("stats", "admin");
  const windows = selectionToWindows(range);
  return withTenant(companyId, async (tx) => {
    const [row] = await bq<{ total: number | null }>(tx)`
      SELECT SUM("amountCents")::bigint AS total
      FROM "Expense"
      WHERE "companyId" = ${companyId}
        ${branchId ? Prisma.sql`AND "branchId" = ${branchId}` : Prisma.empty}
        AND ${windowsSql('"spentAt"', windows)}
    `;
    return Number(row?.total ?? 0);
  });
}

// Ventas netas (sin IVA) y costo por categoría del período, para el punto de equilibrio. Las
// ventas sin categoría se agrupan en "Sin categoría".
export async function categoryMargins(range: DateRangeSelection): Promise<CategoryMargin[]> {
  const { companyId, branchId } = await requireAccountingManagerOrPermission("stats", "admin");
  const requestedWindows = selectionToWindows(range);

  return withTenant(companyId, async (tx) => {
    const windows = await closedDayWindows(tx, companyId, branchId, requestedWindows);
    if (windows.length === 0) return [];
    const rows = await bq<{ category: string; revenue: bigint; cogs: bigint | null }>(tx)`
      SELECT COALESCE(NULLIF(si."category", ''), 'Sin categoría') AS category,
             SUM(si."baseCents")::bigint AS revenue,
             SUM(CASE WHEN p."costCents" IS NOT NULL THEN si."quantity" * p."costCents" ELSE 0 END)::bigint AS cogs
      FROM "SaleItem" si
      JOIN "Sale" s ON s.id = si."saleId"
      LEFT JOIN "Product" p ON p.id = si."productId"
      WHERE s."companyId" = ${companyId}
        ${branchId ? Prisma.sql`AND s."branchId" = ${branchId}` : Prisma.empty}
        AND ${windowsSql('s."createdAt"', windows)}
        AND s."voided" = false
      GROUP BY 1
    `;
    return rows.map((r) => ({ category: r.category, revenueCents: Number(r.revenue), cogsCents: Number(r.cogs ?? 0) }));
  });
}

// Mismo cálculo que categoryMargins pero agrupado por producto (los 15 que más
// venden). `category` lleva el nombre del producto para reutilizar el cálculo.
export async function productMargins(range: DateRangeSelection): Promise<CategoryMargin[]> {
  const { companyId, branchId } = await requireAccountingManagerOrPermission("stats", "admin");
  const requestedWindows = selectionToWindows(range);

  return withTenant(companyId, async (tx) => {
    const windows = await closedDayWindows(tx, companyId, branchId, requestedWindows);
    if (windows.length === 0) return [];
    const rows = await bq<{ name: string; revenue: bigint; cogs: bigint | null }>(tx)`
      SELECT si."productName" AS name,
             SUM(si."baseCents")::bigint AS revenue,
             SUM(CASE WHEN p."costCents" IS NOT NULL THEN si."quantity" * p."costCents" ELSE 0 END)::bigint AS cogs
      FROM "SaleItem" si
      JOIN "Sale" s ON s.id = si."saleId"
      LEFT JOIN "Product" p ON p.id = si."productId"
      WHERE s."companyId" = ${companyId}
        ${branchId ? Prisma.sql`AND s."branchId" = ${branchId}` : Prisma.empty}
        AND ${windowsSql('s."createdAt"', windows)}
        AND s."voided" = false
      GROUP BY 1
      ORDER BY revenue DESC
      LIMIT 15
    `;
    return rows.map((r) => ({ category: r.name, revenueCents: Number(r.revenue), cogsCents: Number(r.cogs ?? 0) }));
  });
}

export async function getProfitGoal(): Promise<number | null> {
  const { companyId } = await requireManagerOrPermission("stats", "admin");
  const [company] = await withTenant(companyId, (tx) =>
    bq<{ goal: number | null }>(tx)`SELECT "profitGoalCents" AS goal FROM "Company" WHERE "id" = ${companyId}`
  );
  return company?.goal ?? null;
}

export async function setProfitGoal(amountCents: number | null): Promise<ActionResult> {
  await requireAccountingPlan();
  const { companyId } = await requireManager();
  if (amountCents != null && (!Number.isInteger(amountCents) || amountCents < 0)) {
    return { success: false, error: "La meta no puede ser negativa" };
  }
  await withTenant(companyId, (tx) =>
    tx.company.update({ where: { id: companyId }, data: { profitGoalCents: amountCents } })
  );
  revalidatePath("/finance");
  return { success: true };
}
