"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/tenant-db";
import { SHOP_TIME_ZONE, dayBoundsUtc, selectionToWindows, type DateRangeSelection } from "@/lib/report-types";
import { closingDateFromString, openDayList } from "@/lib/closed-days";
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

export type PendingClosing = { date: string; totalCents: number; salesCount: number };

// Days in the selected range that have real sales but no cierre de caja yet
// — the list /reports shows so a manager can find and close a backlog of
// open days instead of guessing dates one at a time in the date picker. A
// day with zero sales isn't "pending" in any useful sense, so it's left out.
export async function listPendingClosings(range: DateRangeSelection): Promise<PendingClosing[]> {
  const { companyId, branchId } = await requireSession();
  const windows = selectionToWindows(range);

  return withTenant(companyId, async (tx) => {
    const openDays = await openDayList(tx, companyId, branchId, windows);
    if (openDays.length === 0) return [];

    // One grouped query over the whole span instead of one aggregate per open
    // day: a long range (e.g. 10 months) meant hundreds of sequential queries
    // on the single transaction connection and blew the transaction timeout.
    const spanStart = openDays.reduce((m, d) => (d.start < m ? d.start : m), openDays[0].start);
    const spanEnd = openDays.reduce((m, d) => (d.end > m ? d.end : m), openDays[0].end);
    const rows = await tx.$queryRaw<{ day: string; total_cents: bigint; sales_count: bigint }[]>`
      SELECT to_char(s."createdAt" AT TIME ZONE ${SHOP_TIME_ZONE}, 'YYYY-MM-DD') AS day,
             COALESCE(SUM(s."totalCents"), 0)::bigint AS total_cents,
             COUNT(*)::bigint AS sales_count
      FROM "Sale" s
      WHERE s."companyId" = ${companyId}
        ${branchId ? Prisma.sql`AND s."branchId" = ${branchId}` : Prisma.empty}
        AND s."createdAt" >= ${spanStart} AND s."createdAt" < ${spanEnd}
        AND s."voided" = false
      GROUP BY 1
    `;
    const byDay = new Map(rows.map((r) => [r.day, r]));
    const results: PendingClosing[] = [];
    for (const day of openDays) {
      const r = byDay.get(day.dateStr);
      if (r && Number(r.sales_count) > 0) {
        results.push({ date: day.dateStr, totalCents: Number(r.total_cents), salesCount: Number(r.sales_count) });
      }
    }
    return results;
  });
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
