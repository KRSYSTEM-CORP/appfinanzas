"use server";

import { revalidatePath } from "next/cache";
import { userErrorMessage } from "@/lib/user-error";
import { requireManager, requireSession } from "@/lib/session";
import { withTenant } from "@/lib/tenant-db";
import { SHOP_TIME_ZONE, dayBoundsUtc, selectionToWindows, type DateRangeSelection } from "@/lib/report-types";
import { closingDateFromString, openDayList } from "@/lib/closed-days";
import { activeShiftNumber, isDayClosed, nextShiftNumber, shiftWindow } from "@/lib/cash-shifts";
import type { ActionResult } from "@/lib/types";
import { Prisma, type PaymentMethod } from "@prisma/client";

export type CashOutflowRow = { id: string; concept: string; amountCents: number; createdAt: Date };

export type CashShiftRow = {
  shiftNumber: number;
  responsibleName: string | null;
  openedAt: Date | null;
  closedAt: Date | null;
};

// Cobros del turno por cuenta (o sin cuenta: efectivo, cobros antiguos) y método.
export type AccountIncomeRow = {
  accountId: string | null;
  kind: string | null;
  bankKey: string | null;
  bankName: string | null;
  accountNumber: string | null;
  paymentMethod: PaymentMethod;
  count: number;
  refCents: number;
  currencyCode: string;
  cents: number;
};

export type CashClosingSummary = {
  date: string;
  // Turno que se muestra (el abierto o, si no hay, el último cerrado). En la vista
  // de «Todas las sucursales» es null y los totales abarcan todo el día.
  shiftNumber: number | null;
  responsibleName: string | null;
  openedAt: Date | null;
  // Hay un turno abierto ahora mismo (se puede vender / registrar salidas).
  shiftOpen: boolean;
  // Todos los turnos del día (sede activa), para mostrarlos en el panel.
  shifts: CashShiftRow[];
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
  // Lo realmente cobrado en cada moneda (Bs en Bs, divisas en divisas); refCents es solo referencia.
  byCurrency: { currencyCode: string; cents: number; refCents: number }[];
  byAccount: AccountIncomeRow[];
  closed: { closedAt: Date; note: string | null } | null;
};

const MAX_RESPONSIBLE_LENGTH = 80;

// Cobros (efectivo esperado, métodos, cuentas): se agrupan por la fecha del COBRO
// (sp.createdAt), no de la venta, para que los abonos de créditos viejos entren al
// turno donde se cobran. Para cobros hechos al vender coincide con la venta.
// Computed live (not just read from the CashClosing row) even for an
// already-closed shift. Con una sede seleccionada el resumen es el del TURNO
// abierto (o el último cerrado): solo sus ventas, salidas y apertura. Con
// «Todas las sucursales» se agrega el día completo.
export async function getDailyClosingSummary(dateStr: string): Promise<CashClosingSummary> {
  const { companyId, branchId } = await requireSession();
  const { start: dayStart, end: dayEnd } = dayBoundsUtc(dateStr);
  const closingDate = closingDateFromString(dateStr);

  return withTenant(companyId, async (tx) => {
    const [closings, activeBranches, openings] = await Promise.all([
      tx.cashClosing.findMany({
        where: { companyId, closingDate, ...(branchId ? { branchId } : {}) },
        orderBy: [{ shiftNumber: "asc" }, { closedAt: "asc" }],
      }),
      branchId
        ? Promise.resolve([{ id: branchId }])
        : tx.branch.findMany({ where: { companyId, isActive: true }, select: { id: true } }),
      tx.cashOpening.findMany({
        where: { companyId, date: closingDate, ...(branchId ? { branchId } : {}) },
        orderBy: { shiftNumber: "asc" },
      }),
    ]);

    // Turno a mostrar (solo con sede seleccionada).
    let viewShift: number | null = null;
    let shiftOpen = false;
    let window = { start: dayStart, end: dayEnd };
    if (branchId) {
      const active = activeShiftNumber(openings, closings);
      shiftOpen = active != null;
      viewShift = active ?? (closings.length > 0 ? Math.max(...closings.map((c) => c.shiftNumber)) : null);
      if (viewShift != null) window = shiftWindow(viewShift, dayStart, dayEnd, closings);
    }
    const viewOpenings = viewShift != null ? openings.filter((o) => o.shiftNumber === viewShift) : openings;
    const viewClosing = viewShift != null ? closings.find((c) => c.shiftNumber === viewShift) ?? null : null;
    const viewOpening = viewShift != null ? viewOpenings[0] ?? null : null;

    const [totals, byStatus, byMethodRows, byCurrencyRows, byAccountRows, outflows] = await Promise.all([
      tx.sale.aggregate({
        where: { companyId, ...(branchId ? { branchId } : {}), createdAt: { gte: window.start, lt: window.end }, voided: false },
        _sum: { totalCents: true },
        _count: true,
      }),
      tx.sale.groupBy({
        by: ["paymentStatus"],
        where: { companyId, ...(branchId ? { branchId } : {}), createdAt: { gte: window.start, lt: window.end }, voided: false },
        _sum: { totalCents: true },
        _count: true,
      }),
      tx.$queryRaw<{ paymentMethod: PaymentMethod; total_cents: bigint }[]>`
        SELECT sp."paymentMethod", SUM(sp."amountEurCents")::bigint AS total_cents
        FROM "SalePayment" sp
        JOIN "Sale" s ON s.id = sp."saleId"
        WHERE s."companyId" = ${companyId}
          ${branchId ? Prisma.sql`AND s."branchId" = ${branchId}` : Prisma.empty}
          AND sp."createdAt" >= ${window.start} AND sp."createdAt" < ${window.end}
          AND s."voided" = false
        GROUP BY sp."paymentMethod"
        ORDER BY total_cents DESC
      `,
      tx.$queryRaw<{ currency: string; cents: bigint; ref: bigint }[]>`
        SELECT COALESCE(sp."currencyCode", CASE WHEN sp."paymentMethod"::text IN ('ZELLE','BINANCE','PAYPAL') THEN 'USD' ELSE 'EUR' END) AS currency,
               SUM(COALESCE(sp."amountCurrencyCents", sp."amountEurCents"))::bigint AS cents, SUM(sp."amountEurCents")::bigint AS ref
        FROM "SalePayment" sp
        JOIN "Sale" s ON s.id = sp."saleId"
        WHERE s."companyId" = ${companyId}
          ${branchId ? Prisma.sql`AND s."branchId" = ${branchId}` : Prisma.empty}
          AND sp."createdAt" >= ${window.start} AND sp."createdAt" < ${window.end}
          AND s."voided" = false
        GROUP BY 1
        ORDER BY ref DESC
      `,
      tx.$queryRaw<
        {
          accountId: string | null; kind: string | null; bankKey: string | null; bankName: string | null;
          accountNumber: string | null; paymentMethod: PaymentMethod;
          count: bigint; ref: bigint; currency: string; cents: bigint;
        }[]
      >`
        SELECT sp."paymentAccountId" AS "accountId", pa.kind::text AS kind, pa."bankKey" AS "bankKey", pa."bankName" AS "bankName",
               pa."accountNumber" AS "accountNumber", sp."paymentMethod" AS "paymentMethod",
               COUNT(*)::bigint AS count, SUM(sp."amountEurCents")::bigint AS ref,
               COALESCE(sp."currencyCode", CASE WHEN sp."paymentMethod"::text IN ('ZELLE','BINANCE','PAYPAL') THEN 'USD' ELSE 'EUR' END) AS currency,
               SUM(COALESCE(sp."amountCurrencyCents", sp."amountEurCents"))::bigint AS cents
        FROM "SalePayment" sp
        JOIN "Sale" s ON s.id = sp."saleId"
        LEFT JOIN "PaymentAccount" pa ON pa.id = sp."paymentAccountId"
        WHERE s."companyId" = ${companyId}
          ${branchId ? Prisma.sql`AND s."branchId" = ${branchId}` : Prisma.empty}
          AND sp."createdAt" >= ${window.start} AND sp."createdAt" < ${window.end}
          AND s."voided" = false
        GROUP BY 1, 2, 3, 4, 5, 6, 9
        ORDER BY ref DESC
      `,
      tx.cashOutflow.findMany({
        where: {
          companyId,
          date: closingDate,
          ...(branchId ? { branchId } : {}),
          ...(viewShift != null ? { shiftNumber: viewShift } : {}),
        },
        orderBy: { createdAt: "asc" },
        select: { id: true, concept: true, amountCents: true, createdAt: true },
      }),
    ]);
    const openingCents = viewOpenings.length > 0 ? viewOpenings.reduce((a, o) => a + o.amountCents, 0) : null;
    const cashSalesCents = Number(byMethodRows.find((r) => r.paymentMethod === "CASH")?.total_cents ?? 0);
    const outflowsCents = outflows.reduce((a, o) => a + o.amountCents, 0);

    // En la vista consolidada el día solo cuenta como «cerrado» cuando TODAS las
    // sedes activas lo cerraron (y ninguna tiene un turno abierto).
    let closed: CashClosingSummary["closed"];
    if (branchId) {
      closed = !shiftOpen && viewClosing ? { closedAt: viewClosing.closedAt, note: viewClosing.note } : null;
    } else {
      const allClosed =
        activeBranches.length > 0 &&
        activeBranches.every((b) =>
          isDayClosed(
            openings.filter((o) => o.branchId === b.id),
            closings.filter((c) => c.branchId === b.id)
          )
        );
      closed = allClosed
        ? {
            closedAt: closings.reduce((m, c) => (c.closedAt > m ? c.closedAt : m), closings[0].closedAt),
            note: closings.map((c) => c.note).filter(Boolean).join("; ") || null,
          }
        : null;
      shiftOpen = openings.some((o) => !closings.some((c) => c.branchId === o.branchId && c.shiftNumber === o.shiftNumber));
    }

    const shifts: CashShiftRow[] = branchId
      ? [...new Set([...openings.map((o) => o.shiftNumber), ...closings.map((c) => c.shiftNumber)])]
          .sort((a, b) => a - b)
          .map((n) => {
            const o = openings.find((x) => x.shiftNumber === n);
            const c = closings.find((x) => x.shiftNumber === n);
            return {
              shiftNumber: n,
              responsibleName: o?.responsibleName ?? c?.responsibleName ?? null,
              openedAt: o?.createdAt ?? c?.openedAt ?? null,
              closedAt: c?.closedAt ?? null,
            };
          })
      : [];

    return {
      date: dateStr,
      shiftNumber: viewShift,
      responsibleName: viewOpening?.responsibleName ?? viewClosing?.responsibleName ?? null,
      openedAt: viewOpening?.createdAt ?? viewClosing?.openedAt ?? null,
      shiftOpen,
      shifts,
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
      byCurrency: byCurrencyRows.map((r) => ({ currencyCode: r.currency, cents: Number(r.cents), refCents: Number(r.ref) })),
      byAccount: byAccountRows.map((r) => ({
        accountId: r.accountId,
        kind: r.kind,
        bankKey: r.bankKey,
        bankName: r.bankName,
        accountNumber: r.accountNumber,
        paymentMethod: r.paymentMethod,
        count: Number(r.count),
        refCents: Number(r.ref),
        currencyCode: r.currency,
        cents: Number(r.cents),
      })),
      closed,
    };
  });
}

// Cierra el turno abierto de la sede (o, si el día no tuvo apertura ni cierre, el
// día completo como turno 1). Cada cierre guarda su responsable y solo suma las
// ventas de su turno.
export async function closeCashRegister(
  dateStr: string,
  note?: string,
  counted?: { usdCents: number; bsCents: number },
  responsibleName?: string
): Promise<ActionResult> {
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return { success: false, error: "Fecha inválida" };
  const branchId = session.branchId;
  const { start: dayStart, end: dayEnd } = dayBoundsUtc(dateStr);
  const closingDate = closingDateFromString(dateStr);

  const summaryForCount = counted ? await getDailyClosingSummary(dateStr) : null;
  try {
    await withTenant(companyId, async (tx) => {
      const [openings, closings] = await Promise.all([
        tx.cashOpening.findMany({ where: { branchId, date: closingDate } }),
        tx.cashClosing.findMany({ where: { branchId, closingDate } }),
      ]);
      const active = activeShiftNumber(openings, closings);
      if (active == null && closings.length > 0) {
        throw new Error("No hay un turno abierto: ese día ya fue cerrado. Abre un nuevo turno para seguir.");
      }
      const shiftNumber = active ?? nextShiftNumber(openings, closings);
      const opening = openings.find((o) => o.shiftNumber === shiftNumber) ?? null;
      const { start, end } = shiftWindow(shiftNumber, dayStart, dayEnd, closings, new Date());

      const totals = await tx.sale.aggregate({
        where: { companyId, branchId, createdAt: { gte: start, lt: end }, voided: false },
        _sum: { totalCents: true },
        _count: true,
      });

      // Diferencia entre lo contado y el efectivo esperado, en la divisa de referencia.
      let countedFields = {};
      if (counted) {
        if (counted.usdCents < 0 || counted.bsCents < 0) throw new Error("Los montos contados no pueden ser negativos");
        const company = await tx.company.findUnique({ where: { id: companyId }, select: { exchangeRate: true, exchangeRateEnabled: true } });
        const rate = company?.exchangeRateEnabled && company.exchangeRate ? Number(company.exchangeRate) : null;
        if (counted.bsCents > 0 && rate == null) throw new Error("No hay tasa de cambio para convertir los bolívares contados");
        const countedRef = counted.usdCents + (rate ? Math.round(counted.bsCents / rate) : 0);
        countedFields = {
          countedUsdCents: counted.usdCents,
          countedBsCents: counted.bsCents,
          expectedCashCents: summaryForCount!.expectedCashCents,
          differenceCents: countedRef - summaryForCount!.expectedCashCents,
        };
      }

      await tx.cashClosing.create({
        data: {
          ...countedFields,
          companyId,
          branchId,
          closingDate,
          shiftNumber,
          responsibleName: opening?.responsibleName ?? (responsibleName?.trim().slice(0, MAX_RESPONSIBLE_LENGTH) || null),
          openedAt: opening?.createdAt ?? null,
          totalCents: totals._sum.totalCents ?? 0,
          salesCount: totals._count,
          note: note?.trim() || null,
          closedById: userId,
        },
      });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { success: false, error: "Ese turno ya fue cerrado." };
    }
    const message = userErrorMessage(err, "No se pudo cerrar la caja");
    return { success: false, error: message };
  }

  revalidatePath("/reports");
  revalidatePath("/pos");
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

async function requireBranchDay(dateStr: string) {
  const session = await requireManager();
  if (!session.branchId) {
    return { ok: false, error: 'Selecciona una sucursal — no se puede con "Todas las sucursales".' } as const;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return { ok: false, error: "Fecha inválida" } as const;
  return { ok: true, session, branchId: session.branchId as string, closingDate: closingDateFromString(dateStr) } as const;
}

// Abre un turno nuevo o ajusta el abierto. Un turno nuevo exige responsable y falla
// si ya hay otro turno abierto en la sede (nunca dos abiertos a la vez).
export async function setCashOpening(
  dateStr: string,
  amountCents: number,
  byMethod?: { bsCents: number; usdCents: number },
  responsibleName?: string,
  mode: "start" | "adjust" = "start"
): Promise<ActionResult> {
  const ctx = await requireBranchDay(dateStr);
  if (!ctx.ok) return { success: false, error: ctx.error };
  if (!Number.isInteger(amountCents) || amountCents < 0) {
    return { success: false, error: "El monto de apertura no puede ser negativo" };
  }
  const responsible = responsibleName?.trim().slice(0, MAX_RESPONSIBLE_LENGTH) ?? "";
  if (mode === "start" && !responsible) {
    return { success: false, error: "Indica quién es el responsable de la caja en este turno" };
  }
  const { session, branchId, closingDate } = ctx;
  try {
    await withTenant(session.companyId, async (tx) => {
      const [openings, closings] = await Promise.all([
        tx.cashOpening.findMany({ where: { branchId, date: closingDate } }),
        tx.cashClosing.findMany({ where: { branchId, closingDate } }),
      ]);
      const active = activeShiftNumber(openings, closings);
      if (mode === "start" && active != null) {
        const who = openings.find((o) => o.shiftNumber === active)?.responsibleName;
        throw new Error(`Ya hay un turno abierto (Turno ${active}${who ? `, responsable ${who}` : ""}). Ciérralo antes de abrir otro.`);
      }
      if (mode === "adjust" && active == null) throw new Error("No hay un turno abierto para ajustar.");

      let total = amountCents;
      let methodFields = {};
      if (byMethod) {
        if (byMethod.bsCents < 0 || byMethod.usdCents < 0) throw new Error("El monto de apertura no puede ser negativo");
        const company = await tx.company.findUnique({ where: { id: session.companyId }, select: { exchangeRate: true, exchangeRateEnabled: true } });
        const rate = company?.exchangeRateEnabled && company.exchangeRate ? Number(company.exchangeRate) : null;
        total = byMethod.usdCents + (rate ? Math.round(byMethod.bsCents / rate) : 0);
        methodFields = { openingBsCents: byMethod.bsCents, openingUsdCents: byMethod.usdCents };
      }
      if (mode === "adjust") {
        await tx.cashOpening.update({
          where: { branchId_date_shiftNumber: { branchId, date: closingDate, shiftNumber: active as number } },
          data: { amountCents: total, setById: session.userId, ...methodFields, ...(responsible ? { responsibleName: responsible } : {}) },
        });
      } else {
        await tx.cashOpening.create({
          data: {
            companyId: session.companyId,
            branchId,
            date: closingDate,
            shiftNumber: nextShiftNumber(openings, closings),
            amountCents: total,
            setById: session.userId,
            responsibleName: responsible,
            ...methodFields,
          },
        });
      }
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { success: false, error: "Ya hay un turno abierto en esta sede. Actualiza la pantalla." };
    }
    return { success: false, error: userErrorMessage(err, "No se pudo abrir la caja") };
  }
  revalidatePath("/reports");
  revalidatePath("/pos");
  return { success: true };
}

// Las salidas de Caja Chica pertenecen al turno abierto; con el día cerrado no se pueden tocar.
async function activeShiftForOutflow(
  tx: Prisma.TransactionClient,
  branchId: string,
  closingDate: Date
): Promise<number> {
  const [openings, closings] = await Promise.all([
    tx.cashOpening.findMany({ where: { branchId, date: closingDate }, select: { shiftNumber: true } }),
    tx.cashClosing.findMany({ where: { branchId, closingDate }, select: { shiftNumber: true, closedAt: true } }),
  ]);
  const active = activeShiftNumber(openings, closings);
  if (active != null) return active;
  if (closings.length > 0) throw new Error("Ese día ya fue cerrado.");
  return 1;
}

export async function addCashOutflow(dateStr: string, concept: string, amountCents: number): Promise<ActionResult> {
  const ctx = await requireBranchDay(dateStr);
  if (!ctx.ok) return { success: false, error: ctx.error };
  const text = concept.trim();
  if (!text) return { success: false, error: "Escribe el concepto de la salida" };
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return { success: false, error: "El monto debe ser mayor a 0" };
  }
  const { session, branchId, closingDate } = ctx;
  try {
    await withTenant(session.companyId, async (tx) => {
      const shiftNumber = await activeShiftForOutflow(tx, branchId, closingDate);
      await tx.cashOutflow.create({
        data: {
          companyId: session.companyId,
          branchId,
          date: closingDate,
          shiftNumber,
          concept: text,
          amountCents,
          createdById: session.userId,
        },
      });
    });
  } catch (err) {
    return { success: false, error: userErrorMessage(err, "No se pudo registrar la salida") };
  }
  revalidatePath("/reports");
  return { success: true };
}

export async function deleteCashOutflow(dateStr: string, id: string): Promise<ActionResult> {
  const ctx = await requireBranchDay(dateStr);
  if (!ctx.ok) return { success: false, error: ctx.error };
  const { session, branchId, closingDate } = ctx;
  try {
    await withTenant(session.companyId, async (tx) => {
      const shiftNumber = await activeShiftForOutflow(tx, branchId, closingDate);
      await tx.cashOutflow.deleteMany({ where: { id, companyId: session.companyId, branchId, date: closingDate, shiftNumber } });
    });
  } catch (err) {
    return { success: false, error: userErrorMessage(err, "No se pudo eliminar la salida") };
  }
  revalidatePath("/reports");
  return { success: true };
}

export type RecentClosing = {
  id: string;
  date: string;
  shiftNumber: number;
  responsibleName: string | null;
  openedAt: Date | null;
  closedAt: Date;
  totalCents: number;
  salesCount: number;
  note: string | null;
};

// Últimos cierres de caja (de la sede activa o de todas), para el «Historial de cierres».
export async function listRecentClosings(limit = 5): Promise<RecentClosing[]> {
  const { companyId, branchId } = await requireSession();
  const rows = await withTenant(companyId, (tx) =>
    tx.cashClosing.findMany({
      where: { companyId, ...(branchId ? { branchId } : {}) },
      orderBy: [{ closingDate: "desc" }, { closedAt: "desc" }],
      take: limit,
      select: { id: true, closingDate: true, shiftNumber: true, responsibleName: true, openedAt: true, closedAt: true, totalCents: true, salesCount: true, note: true },
    })
  );
  return rows.map((r) => ({
    id: r.id,
    date: r.closingDate.toISOString().slice(0, 10),
    shiftNumber: r.shiftNumber,
    responsibleName: r.responsibleName,
    openedAt: r.openedAt,
    closedAt: r.closedAt,
    totalCents: r.totalCents,
    salesCount: r.salesCount,
    note: r.note,
  }));
}
