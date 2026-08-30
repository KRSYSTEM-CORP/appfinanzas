"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { requireManager } from "@/lib/session";
import { withTenant } from "@/lib/tenant-db";
import { selectionToWindows, type DateRangeSelection } from "@/lib/report-types";
import { closedDayWindows, openDaysCount } from "@/lib/closed-days";
import { ExpenseSchema } from "@/lib/validations";
import type { ActionResult } from "@/lib/types";

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
  const { companyId, branchId } = await requireManager();
  const requestedWindows = selectionToWindows(range);

  return withTenant(companyId, async (tx) => {
    const windows = await closedDayWindows(tx, companyId, branchId, requestedWindows);
    if (windows.length === 0) return 0;

    const [row] = await tx.$queryRaw<{ cogs_cents: bigint | null }[]>`
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

// What actually left the register buying inventory in the period — separate
// from costOfGoodsSold above, which only counts the cost of what was SOLD.
// A purchase counts here the moment it's registered, regardless of whether
// any of it has sold yet (unlike COGS), so a big restock shows up as a real
// hit to "ganancia neta estimada" right away rather than trickling in as
// each unit sells.
export async function purchasesTotal(range: DateRangeSelection): Promise<number> {
  const { companyId, branchId } = await requireManager();
  const windows = selectionToWindows(range);
  return withTenant(companyId, async (tx) => {
    const result = await tx.purchase.aggregate({
      _sum: { totalCents: true },
      where: {
        companyId,
        ...(branchId ? { branchId } : {}),
        OR: windows.map((w) => ({ createdAt: { gte: w.start, lt: w.end } })),
        voided: false,
      },
    });
    return result._sum.totalCents ?? 0;
  });
}

// Surfaced on /finance as a heads-up next to the totals above — see
// openDaysCount's doc-comment.
export async function openDaysInRange(range: DateRangeSelection): Promise<number> {
  const { companyId, branchId } = await requireManager();
  const windows = selectionToWindows(range);
  return withTenant(companyId, (tx) => openDaysCount(tx, companyId, branchId, windows));
}

export async function listExpenses(range: DateRangeSelection) {
  const { companyId } = await requireManager();
  const windows = selectionToWindows(range);
  return withTenant(companyId, (tx) =>
    tx.expense.findMany({
      where: { companyId, OR: windows.map((w) => ({ spentAt: { gte: w.start, lt: w.end } })) },
      orderBy: { spentAt: "desc" },
    })
  );
}

export async function createExpense(formData: FormData): Promise<ActionResult> {
  const { companyId, userId } = await requireManager();
  const parsed = ExpenseSchema.safeParse({
    description: formData.get("description"),
    category: formData.get("category"),
    amount: formData.get("amount"),
    spentAt: formData.get("spentAt"),
  });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  await withTenant(companyId, (tx) =>
    tx.expense.create({
      data: {
        companyId,
        description: parsed.data.description,
        category: parsed.data.category,
        amountCents: parsed.data.amount,
        spentAt: parsed.data.spentAt,
        createdById: userId,
      },
    })
  );

  revalidatePath("/finance");
  return { success: true };
}

export async function deleteExpense(expenseId: string): Promise<ActionResult> {
  const { companyId } = await requireManager();
  const result = await withTenant(companyId, (tx) =>
    tx.expense.deleteMany({ where: { id: expenseId, companyId } })
  );
  if (result.count === 0) {
    return { success: false, error: "Gasto no encontrado" };
  }
  revalidatePath("/finance");
  return { success: true };
}

export async function expensesTotal(range: DateRangeSelection): Promise<number> {
  const { companyId } = await requireManager();
  const windows = selectionToWindows(range);
  return withTenant(companyId, async (tx) => {
    const result = await tx.expense.aggregate({
      _sum: { amountCents: true },
      where: { companyId, OR: windows.map((w) => ({ spentAt: { gte: w.start, lt: w.end } })) },
    });
    return result._sum.amountCents ?? 0;
  });
}
