import "server-only";
import type { Prisma } from "@prisma/client";
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
  const closings = await tx.cashClosing.findMany({
    where: { companyId, closingDate: { in: closingDates }, ...(branchId ? { branchId } : {}) },
    select: { branchId: true, closingDate: true },
  });

  if (branchId) {
    return new Set(closings.map((c) => c.closingDate.toISOString().slice(0, 10)));
  }

  const activeBranchCount = await tx.branch.count({ where: { companyId, isActive: true } });
  if (activeBranchCount === 0) return new Set();
  const countByDate = new Map<string, number>();
  for (const c of closings) {
    const key = c.closingDate.toISOString().slice(0, 10);
    countByDate.set(key, (countByDate.get(key) ?? 0) + 1);
  }
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

// How many calendar days in the requested range have NOT been closed yet —
// shown on /finance as a heads-up so a low total reads as "some days aren't
// closed yet" instead of looking like the app lost sales.
export async function openDaysCount(
  tx: Prisma.TransactionClient,
  companyId: string,
  branchId: string | null,
  windows: { start: Date; end: Date }[]
): Promise<number> {
  const days = walkDays(windows);
  const closedSet = await closedDateSet(tx, companyId, branchId, days);
  return days.filter((d) => !closedSet.has(d.dateStr)).length;
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
