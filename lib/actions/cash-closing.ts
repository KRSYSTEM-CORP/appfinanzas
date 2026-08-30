"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/tenant-db";
import { dayBoundsUtc } from "@/lib/report-types";
import { closingDateFromString } from "@/lib/closed-days";
import type { ActionResult } from "@/lib/types";
import { Prisma, type PaymentMethod } from "@prisma/client";

export type CashClosingSummary = {
  date: string;
  totalCents: number;
  salesCount: number;
  byMethod: { paymentMethod: PaymentMethod; totalCents: number }[];
  closed: { closedAt: Date; note: string | null } | null;
};

// Computed live (not just read from the CashClosing row) even for an
// already-closed day, so the UI can show "at close time" vs. "right now"
// side by side if they ever drift apart — they shouldn't, since closing a
// day blocks voiding/deleting its sales (see assertDayNotClosed in
// lib/actions/sales.ts), but the frozen CashClosing.totalCents is always the
// source of truth for a closed day once one exists.
export async function getDailyClosingSummary(dateStr: string): Promise<CashClosingSummary> {
  const { companyId, branchId } = await requireSession();
  const { start, end } = dayBoundsUtc(dateStr);
  const closingDate = closingDateFromString(dateStr);

  return withTenant(companyId, async (tx) => {
    const [totals, byMethodRows, closings, activeBranchCount] = await Promise.all([
      tx.sale.aggregate({
        where: { companyId, ...(branchId ? { branchId } : {}), createdAt: { gte: start, lt: end }, voided: false },
        _sum: { totalCents: true },
        _count: true,
      }),
      tx.$queryRaw<{ paymentMethod: PaymentMethod; total_cents: bigint }[]>`
        SELECT sp."paymentMethod", SUM(sp."amountEurCents")::bigint AS total_cents
        FROM "SalePayment" sp
        JOIN "Sale" s ON s.id = sp."saleId"
        WHERE s."companyId" = ${companyId}
          ${branchId ? Prisma.sql`AND s."branchId" = ${branchId}` : Prisma.empty}
          AND s."createdAt" >= ${start} AND s."createdAt" < ${end}
          AND s."voided" = false
        GROUP BY sp."paymentMethod"
        ORDER BY total_cents DESC
      `,
      // Scoped to one branch: at most one row. Consolidated ("Todas las
      // sucursales", branchId null): every branch's closing for this date.
      tx.cashClosing.findMany({
        where: { companyId, closingDate, ...(branchId ? { branchId } : {}) },
        orderBy: { closedAt: "desc" },
      }),
      branchId ? Promise.resolve(1) : tx.branch.count({ where: { companyId, isActive: true } }),
    ]);

    // In consolidated view the day only counts as "closed" once every active
    // branch has closed it — otherwise sales from a still-open branch could
    // keep changing after the day reads as done.
    const allClosed = closings.length > 0 && closings.length >= activeBranchCount;
    const closed = branchId
      ? closings[0]
        ? { closedAt: closings[0].closedAt, note: closings[0].note }
        : null
      : allClosed
        ? {
            closedAt: closings[0].closedAt,
            note: closings.map((c) => c.note).filter(Boolean).join("; ") || null,
          }
        : null;

    return {
      date: dateStr,
      totalCents: totals._sum.totalCents ?? 0,
      salesCount: totals._count,
      byMethod: byMethodRows.map((r) => ({ paymentMethod: r.paymentMethod, totalCents: Number(r.total_cents) })),
      closed,
    };
  });
}

export async function closeCashRegister(dateStr: string, note?: string): Promise<ActionResult> {
  const session = await requireSession();
  const { companyId, userId } = session;
  if (!session.branchId) {
    return {
      success: false,
      error: 'Selecciona una sucursal antes de cerrar caja — no se puede con "Todas las sucursales".',
    };
  }
  const branchId = session.branchId;
  const { start, end } = dayBoundsUtc(dateStr);
  const closingDate = closingDateFromString(dateStr);

  try {
    await withTenant(companyId, async (tx) => {
      const existing = await tx.cashClosing.findUnique({
        where: { branchId_closingDate: { branchId, closingDate } },
      });
      if (existing) throw new Error("Ese día ya fue cerrado.");

      const totals = await tx.sale.aggregate({
        where: { companyId, branchId, createdAt: { gte: start, lt: end }, voided: false },
        _sum: { totalCents: true },
        _count: true,
      });

      await tx.cashClosing.create({
        data: {
          companyId,
          branchId,
          closingDate,
          totalCents: totals._sum.totalCents ?? 0,
          salesCount: totals._count,
          note: note?.trim() || null,
          closedById: userId,
        },
      });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo cerrar la caja";
    return { success: false, error: message };
  }

  revalidatePath("/reports");
  return { success: true };
}

export async function listCashClosings() {
  const { companyId, branchId } = await requireSession();
  return withTenant(companyId, (tx) =>
    tx.cashClosing.findMany({
      where: { companyId, ...(branchId ? { branchId } : {}) },
      orderBy: { closingDate: "desc" },
      take: 30,
    })
  );
}
