import "server-only";
import type { Prisma } from "@prisma/client";
import { isDayClosed } from "@/lib/cash-shifts";
import { SHOP_TIME_ZONE, zonedDateParts, zonedMidnightUtc } from "@/lib/report-types";

// Prisma's CashClosing.closingDate is a @db.Date column — Postgres drops the
// time-of-day entirely, so this only ever needs to carry a plain calendar
// date, not a real instant. Shared with lib/actions/cash-closing.ts so both
// files agree on exactly which UTC-midnight Date object represents a given
// "YYYY-MM-DD".
export function closingDateFromString(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function dateStringFromParts(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Every window from selectionToWindows()/rangeToDates() is already aligned
// to shop-timezone day boundaries — this walks each one a day at a time and
// keeps only the days a cierre de caja actually closed. Branch-scoped: a day
// counts once its own CashClosing row exists. Consolidated ("todas las
// sucursales", branchId null): a day only counts once EVERY active branch
// has closed it — the same threshold getDailyClosingSummary uses — so one
// still-open branch doesn't let its sales slip into the total.
//
// Used everywhere a Finance/Reports aggregate sums Sale rows over a period,
// so "sin cierre de caja no se suma" applies uniformly instead of each query
// re-deriving it. Expenses are deliberately NOT gated by this — a gasto
// isn't part of what a cash-register closing reconciles.
type Day = { start: Date; end: Date; dateStr: string };

function walkDays(windows: { start: Date; end: Date }[]): Day[] {
  const days: Day[] = [];
  for (const w of windows) {
    const { year, month, day } = zonedDateParts(w.start, SHOP_TIME_ZONE);
    for (let offset = 0; ; offset++) {
      const dayStart = zonedMidnightUtc(w.start, SHOP_TIME_ZONE, offset);
      if (dayStart >= w.end) break;
      const dayEnd = zonedMidnightUtc(w.start, SHOP_TIME_ZONE, offset + 1);
      const d = new Date(Date.UTC(year, month - 1, day + offset));
      days.push({
        start: dayStart,
        end: dayEnd,
        dateStr: dateStringFromParts(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()),
      });
    }
  }
  return days;
}

async function closedDateSet(
  tx: Prisma.TransactionClient,
  companyId: string,
  branchId: string | null,
  days: Day[]
): Promise<Set<string>> {
  if (days.length === 0) return new Set();
  const closingDates = days.map((d) => closingDateFromString(d.dateStr));
  const [closings, openings] = await Promise.all([
    tx.cashClosing.findMany({
      where: { companyId, closingDate: { in: closingDates }, ...(branchId ? { branchId } : {}) },
      select: { branchId: true, closingDate: true, shiftNumber: true, closedAt: true },
    }),
    tx.cashOpening.findMany({
      where: { companyId, date: { in: closingDates }, ...(branchId ? { branchId } : {}) },
      select: { branchId: true, date: true, shiftNumber: true },
    }),
  ]);

  // Un día de una sede cuenta como cerrado cuando tiene al menos un cierre y ningún
  // turno sigue abierto (varios turnos por día: se cierra el último).
  const key = (b: string, d: Date) => `${b}|${d.toISOString().slice(0, 10)}`;
  const byBranchDay = new Map<string, { branchId: string; date: string; openings: { shiftNumber: number }[]; closings: { shiftNumber: number; closedAt: Date }[] }>();
  const entry = (b: string, d: Date) => {
    const k = key(b, d);
    let e = byBranchDay.get(k);
    if (!e) byBranchDay.set(k, (e = { branchId: b, date: d.toISOString().slice(0, 10), openings: [], closings: [] }));
    return e;
  };
  for (const c of closings) entry(c.branchId, c.closingDate).closings.push(c);
  for (const o of openings) entry(o.branchId, o.date).openings.push(o);
  const closedEntries = [...byBranchDay.values()].filter((e) => isDayClosed(e.openings, e.closings));

  if (branchId) return new Set(closedEntries.map((e) => e.date));

  const activeBranchCount = await tx.branch.count({ where: { companyId, isActive: true } });
  if (activeBranchCount === 0) return new Set();
  const countByDate = new Map<string, number>();
  for (const e of closedEntries) countByDate.set(e.date, (countByDate.get(e.date) ?? 0) + 1);
  return new Set([...countByDate].filter(([, count]) => count >= activeBranchCount).map(([date]) => date));
}

export async function closedDayWindows(
  tx: Prisma.TransactionClient,
  companyId: string,
  branchId: string | null,
  windows: { start: Date; end: Date }[]
): Promise<{ start: Date; end: Date }[]> {
  const days = walkDays(windows);
  const closedSet = await closedDateSet(tx, companyId, branchId, days);
  return days.filter((d) => closedSet.has(d.dateStr)).map(({ start, end }) => ({ start, end }));
}

// The actual open days (not just a count) — for /reports' "días pendientes
// por cerrar" list, so a manager can find and close them without guessing
// dates one at a time in the date picker.
export async function openDayList(
  tx: Prisma.TransactionClient,
  companyId: string,
  branchId: string | null,
  windows: { start: Date; end: Date }[]
): Promise<Day[]> {
  const days = walkDays(windows);
  const closedSet = await closedDateSet(tx, companyId, branchId, days);
  return days.filter((d) => !closedSet.has(d.dateStr)).sort((a, b) => (a.dateStr < b.dateStr ? 1 : -1));
}
