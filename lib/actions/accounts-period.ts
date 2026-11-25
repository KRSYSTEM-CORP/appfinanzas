"use server";

import type { Prisma } from "@prisma/client";
import { requireManager } from "@/lib/session";
import { withTenant } from "@/lib/tenant-db";
import { currentRateOf } from "@/lib/account-balance";
import { accountMovementsMany, type AccountMovement, type TimeWindow } from "@/lib/account-movements";
import { shiftWindow } from "@/lib/cash-shifts";
import { closingDateFromString } from "@/lib/closed-days";
import { buildShiftOptions, parseShiftValue, pickShift, type SegMode, type ShiftInfo, type ShiftOption } from "@/lib/accounts-segmentation";
import { SHOP_TIME_ZONE, dayBoundsUtc, selectionToWindows, todayDateString, type DateRangeSelection } from "@/lib/report-types";

type Tx = Prisma.TransactionClient;

export type PeriodSpec = { seg: SegMode; turno?: string | null; selection: DateRangeSelection };

export type AccountPeriodRow = {
  id: string;
  kind: string;
  bankKey: string | null;
  bankName: string | null;
  accountNumber: string;
  currency: string;
  incomeCents: number;
  expenseCents: number;
  netCents: number;
  count: number;
};

export type AccountsPeriodReport = {
  seg: SegMode;
  // Con «por caja» y sin sede activa no hay turnos que mostrar.
  needsBranch: boolean;
  shifts: ShiftOption[];
  selectedShift: string | null;
  // Días (AAAA-MM-DD) del período mostrado, para el nombre del CSV y la etiqueta.
  from: string;
  to: string;
  label: string;
  accounts: AccountPeriodRow[];
};

const dayStr = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: SHOP_TIME_ZONE }).format(d);
const SHIFT_LOOKBACK_DAYS = 14;

async function recentShifts(tx: Tx, companyId: string, branchId: string, today: string) {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - SHIFT_LOOKBACK_DAYS);
  const since = closingDateFromString(d.toISOString().slice(0, 10));
  const [openings, closings] = await Promise.all([
    tx.cashOpening.findMany({ where: { companyId, branchId, date: { gte: since } }, select: { date: true, shiftNumber: true, responsibleName: true } }),
    tx.cashClosing.findMany({ where: { companyId, branchId, closingDate: { gte: since } }, select: { closingDate: true, shiftNumber: true, closedAt: true, responsibleName: true } }),
  ]);
  const byKey = new Map<string, ShiftInfo>();
  for (const o of openings) {
    const date = o.date.toISOString().slice(0, 10);
    byKey.set(`${date}:${o.shiftNumber}`, { date, shiftNumber: o.shiftNumber, responsibleName: o.responsibleName, closed: false });
  }
  for (const c of closings) {
    const date = c.closingDate.toISOString().slice(0, 10);
    const prev = byKey.get(`${date}:${c.shiftNumber}`);
    byKey.set(`${date}:${c.shiftNumber}`, { date, shiftNumber: c.shiftNumber, responsibleName: prev?.responsibleName ?? c.responsibleName, closed: true });
  }
  return { infos: [...byKey.values()], openings, closings };
}

// Ventanas del período con los datos de la sede de la sesión (el cliente solo manda qué turno o fechas quiere).
async function resolveWindows(tx: Tx, companyId: string, branchId: string | null, spec: PeriodSpec) {
  const today = todayDateString();
  if (spec.seg === "fecha") {
    const windows = selectionToWindows(spec.selection);
    const from = dayStr(windows[0].start);
    const to = dayStr(new Date(windows[windows.length - 1].end.getTime() - 1));
    return { windows, from, to, needsBranch: false, shifts: [] as ShiftOption[], selectedShift: null as string | null, label: from === to ? from : `${from} → ${to}` };
  }
  if (!branchId) return { windows: [] as TimeWindow[], from: today, to: today, needsBranch: true, shifts: [] as ShiftOption[], selectedShift: null as string | null, label: "Elige una sede para ver por caja" };
  const { infos, closings } = await recentShifts(tx, companyId, branchId, today);
  const options = buildShiftOptions(infos, today);
  const picked = pickShift(options, spec.turno);
  if (!picked) return { windows: [] as TimeWindow[], from: today, to: today, needsBranch: false, shifts: options, selectedShift: null, label: "Sin cajas recientes" };
  const { date, shiftNumber } = parseShiftValue(picked.value)!;
  const { start: dayStart, end: dayEnd } = dayBoundsUtc(date);
  const dayClosings = closings.filter((c) => c.closingDate.toISOString().slice(0, 10) === date);
  const w = shiftWindow(shiftNumber, dayStart, dayEnd, dayClosings);
  return { windows: [w], from: date, to: date, needsBranch: false, shifts: options, selectedShift: picked.value, label: picked.label };
}

// Ingresos (cobros + fondos) y egresos (compras, nómina, gastos) de cada cuenta activa dentro del período,
// en la moneda de la cuenta.
export async function getAccountsPeriodReport(spec: PeriodSpec): Promise<AccountsPeriodReport> {
  const { companyId, branchId } = await requireManager();
  return withTenant(companyId, async (tx) => {
    const r = await resolveWindows(tx, companyId, branchId ?? null, spec);
    const base = { seg: spec.seg, needsBranch: r.needsBranch, shifts: r.shifts, selectedShift: r.selectedShift, from: r.from, to: r.to, label: r.label };
    if (r.windows.length === 0) return { ...base, accounts: [] };
    const rate = await currentRateOf(tx, companyId);
    const accounts = await tx.paymentAccount.findMany({ where: { companyId, active: true }, orderBy: { createdAt: "asc" } });
    const rows: AccountPeriodRow[] = [];
    const movements = await accountMovementsMany(tx, companyId, accounts, rate, r.windows);
    for (const a of accounts) {
      const mv = movements.get(a.id) ?? [];
      const income = mv.filter((m) => m.amountCents > 0).reduce((n, m) => n + m.amountCents, 0);
      const expense = mv.filter((m) => m.amountCents < 0).reduce((n, m) => n - m.amountCents, 0);
      rows.push({ id: a.id, kind: a.kind, bankKey: a.bankKey, bankName: a.bankName, accountNumber: a.accountNumber, currency: a.currency, incomeCents: income, expenseCents: expense, netCents: income - expense, count: mv.length });
    }
    return { ...base, accounts: rows };
  });
}

export type PeriodMovement = AccountMovement & { accountId: string };

// Historial completo del período: de una cuenta o (accountId null) de todas.
export async function getAccountsPeriodMovements(spec: PeriodSpec, accountId: string | null): Promise<PeriodMovement[]> {
  const { companyId, branchId } = await requireManager();
  return withTenant(companyId, async (tx) => {
    const r = await resolveWindows(tx, companyId, branchId ?? null, spec);
    if (r.windows.length === 0) return [];
    const rate = await currentRateOf(tx, companyId);
    const accounts = await tx.paymentAccount.findMany({ where: { companyId, active: true, ...(accountId ? { id: accountId } : {}) }, orderBy: { createdAt: "asc" } });
    const out: PeriodMovement[] = [];
    const movements = await accountMovementsMany(tx, companyId, accounts, rate, r.windows);
    for (const a of accounts) {
      const mv = movements.get(a.id) ?? [];
      out.push(...mv.map((m) => ({ ...m, accountId: a.id })));
    }
    return out.sort((x, y) => (x.at < y.at ? 1 : -1));
  });
}
