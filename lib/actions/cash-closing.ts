"use server";

import { revalidatePath } from "next/cache";
import { requireManager, requireSession } from "@/lib/session";
import { withTenant } from "@/lib/tenant-db";
import { SHOP_TIME_ZONE, dayBoundsUtc, selectionToWindows, type DateRangeSelection } from "@/lib/report-types";
import { closingDateFromString, openDayList } from "@/lib/closed-days";
import type { ActionResult } from "@/lib/types";
import { Prisma, type PaymentMethod } from "@prisma/client";

export type CashOutflowRow = { id: string; concept: string; amountCents: number; createdAt: Date };

export type CashClosingSummary = {
  date: string;
  // Caja Chica: efectivo de apertura, efectivo cobrado en ventas, salidas y
  // efectivo esperado en caja (apertura + ventas en efectivo − salidas).
  openingCents: number | null;
  cashSalesCents: number;
  outflows: CashOutflowRow[];
  outflowsCents: number;
  expectedCashCents: number;
  totalCents: number;
  salesCount: number;
  // Desglose de lo vendido: ya cobrado vs. a crédito (por cobrar).
  paidCents: number;
  paidCount: number;
  creditCents: number;
  creditCount: number;
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
    const [totals, byStatus, byMethodRows, closings, activeBranchCount, openings, outflows] = await Promise.all([
      tx.sale.aggregate({
        where: { companyId, ...(branchId ? { branchId } : {}), createdAt: { gte: start, lt: end }, voided: false },
        _sum: { totalCents: true },
        _count: true,
      }),
      tx.sale.groupBy({
        by: ["paymentStatus"],
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
      tx.cashOpening.findMany({ where: { companyId, date: closingDate, ...(branchId ? { branchId } : {}) } }),
      tx.cashOutflow.findMany({
        where: { companyId, date: closingDate, ...(branchId ? { branchId } : {}) },
        orderBy: { createdAt: "asc" },
        select: { id: true, concept: true, amountCents: true, createdAt: true },
      }),
    ]);
    const openingCents = openings.length > 0 ? openings.reduce((a, o) => a + o.amountCents, 0) : null;
    const cashSalesCents = Number(byMethodRows.find((r) => r.paymentMethod === "CASH")?.total_cents ?? 0);
    const outflowsCents = outflows.reduce((a, o) => a + o.amountCents, 0);

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
      openingCents,
      cashSalesCents,
      outflows,
      outflowsCents,
      expectedCashCents: (openingCents ?? 0) + cashSalesCents - outflowsCents,
      totalCents: totals._sum.totalCents ?? 0,
      salesCount: totals._count,
      paidCents: byStatus.find((r) => r.paymentStatus === "PAID")?._sum.totalCents ?? 0,
      paidCount: byStatus.find((r) => r.paymentStatus === "PAID")?._count ?? 0,
      creditCents: byStatus.find((r) => r.paymentStatus === "CREDIT")?._sum.totalCents ?? 0,
      creditCount: byStatus.find((r) => r.paymentStatus === "CREDIT")?._count ?? 0,
      byMethod: byMethodRows.map((r) => ({ paymentMethod: r.paymentMethod, totalCents: Number(r.total_cents) })),
      closed,
    };
  });
}

export async function closeCashRegister(dateStr: string, note?: string): Promise<ActionResult> {
  // Closing the day is the manager's call (KRPOS-SEC-004); sellers still see
  // the summary through the read actions below.
  const session = await requireManager();
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
      SELECT to_char(s."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${SHOP_TIME_ZONE}, 'YYYY-MM-DD') AS day,
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

async function requireOpenBranchDay(dateStr: string) {
  const session = await requireManager();
  if (!session.branchId) {
    return { ok: false, error: 'Selecciona una sucursal — no se puede con "Todas las sucursales".' } as const;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return { ok: false, error: "Fecha inválida" } as const;
  const closingDate = closingDateFromString(dateStr);
  const closed = await withTenant(session.companyId, (tx) =>
    tx.cashClosing.findUnique({
      where: { branchId_closingDate: { branchId: session.branchId as string, closingDate } },
      select: { id: true },
    })
  );
  if (closed) return { ok: false, error: "Ese día ya fue cerrado." } as const;
  return { ok: true, session, branchId: session.branchId as string, closingDate } as const;
}

// Fija (o corrige) el efectivo con el que abre la caja ese día.
export async function setCashOpening(dateStr: string, amountCents: number): Promise<ActionResult> {
  const ctx = await requireOpenBranchDay(dateStr);
  if (!ctx.ok) return { success: false, error: ctx.error };
  if (!Number.isInteger(amountCents) || amountCents < 0) {
    return { success: false, error: "El monto de apertura no puede ser negativo" };
  }
  const { session, branchId, closingDate } = ctx;
  await withTenant(session.companyId, (tx) =>
    tx.cashOpening.upsert({
      where: { branchId_date: { branchId, date: closingDate } },
      create: { companyId: session.companyId, branchId, date: closingDate, amountCents, setById: session.userId },
      update: { amountCents, setById: session.userId },
    })
  );
  revalidatePath("/reports");
  return { success: true };
}

export async function addCashOutflow(dateStr: string, concept: string, amountCents: number): Promise<ActionResult> {
  const ctx = await requireOpenBranchDay(dateStr);
  if (!ctx.ok) return { success: false, error: ctx.error };
  const text = concept.trim();
  if (!text) return { success: false, error: "Escribe el concepto de la salida" };
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return { success: false, error: "El monto debe ser mayor a 0" };
  }
  const { session, branchId, closingDate } = ctx;
  await withTenant(session.companyId, (tx) =>
    tx.cashOutflow.create({
      data: {
        companyId: session.companyId,
        branchId,
        date: closingDate,
        concept: text,
        amountCents,
        createdById: session.userId,
      },
    })
  );
  revalidatePath("/reports");
  return { success: true };
}

export async function deleteCashOutflow(dateStr: string, id: string): Promise<ActionResult> {
  const ctx = await requireOpenBranchDay(dateStr);
  if (!ctx.ok) return { success: false, error: ctx.error };
  const { session, branchId, closingDate } = ctx;
  await withTenant(session.companyId, (tx) =>
    tx.cashOutflow.deleteMany({ where: { id, companyId: session.companyId, branchId, date: closingDate } })
  );
  revalidatePath("/reports");
  return { success: true };
}
