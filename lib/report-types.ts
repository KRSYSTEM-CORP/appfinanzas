export type DateRangePreset = "today" | "7d" | "30d" | "month";

export const SHOP_TIME_ZONE = "America/Caracas";

export function zonedDateParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

// Returns the UTC instant corresponding to local midnight (in `timeZone`) of the
// given calendar day, offset by `dayOffset` days from that calendar day.
export function zonedMidnightUtc(instant: Date, timeZone: string, dayOffset = 0): Date {
  const { year, month, day } = zonedDateParts(instant, timeZone);
  const guess = new Date(Date.UTC(year, month - 1, day + dayOffset));
  const asUtc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  const asZoned = new Date(guess.toLocaleString("en-US", { timeZone }));
  const offsetMs = asUtc.getTime() - asZoned.getTime();
  return new Date(guess.getTime() + offsetMs);
}

export function rangeToDates(range: DateRangePreset): { start: Date; end: Date } {
  const now = new Date();
  const end = now;
  let start: Date;
  switch (range) {
    case "today":
      start = zonedMidnightUtc(now, SHOP_TIME_ZONE, 0);
      break;
    case "7d":
      start = zonedMidnightUtc(now, SHOP_TIME_ZONE, -6);
      break;
    case "30d":
      start = zonedMidnightUtc(now, SHOP_TIME_ZONE, -29);
      break;
    case "month": {
      const { year, month } = zonedDateParts(now, SHOP_TIME_ZONE);
      const guess = new Date(Date.UTC(year, month - 1, 1));
      const asUtc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
      const asZoned = new Date(guess.toLocaleString("en-US", { timeZone: SHOP_TIME_ZONE }));
      start = new Date(guess.getTime() + (asUtc.getTime() - asZoned.getTime()));
      break;
    }
  }
  return { start, end };
}

// The [start, end) UTC instant boundary for a single business day (given as
// "YYYY-MM-DD" in SHOP_TIME_ZONE) — used by cierre de caja, which closes out
// one specific calendar day rather than a relative range like rangeToDates.
export function dayBoundsUtc(dateStr: string): { start: Date; end: Date } {
  const anchor = new Date(`${dateStr}T12:00:00Z`);
  return {
    start: zonedMidnightUtc(anchor, SHOP_TIME_ZONE, 0),
    end: zonedMidnightUtc(anchor, SHOP_TIME_ZONE, 1),
  };
}

// Interprets a "YYYY-MM-DD" string (e.g. from a plain <input type="date">)
// as a calendar date IN SHOP_TIME_ZONE, not UTC — z.coerce.date() on a bare
// date string parses it as UTC midnight, which in Caracas (UTC-4) is 8pm the
// PREVIOUS day once rendered back through the timezone-correct formatDate(),
// so a gasto registered "today" silently saved with yesterday's date. Same
// anchor-at-noon-UTC trick dayBoundsUtc already uses to sidestep this.
export function zonedDateStringToUtc(dateStr: string, timeZone: string = SHOP_TIME_ZONE): Date {
  const anchor = new Date(`${dateStr}T12:00:00Z`);
  return zonedMidnightUtc(anchor, timeZone, 0);
}

export function todayDateString(): string {
  const { year, month, day } = zonedDateParts(new Date(), SHOP_TIME_ZONE);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// [start, end) UTC bounds of one specific calendar month (1-12) in
// SHOP_TIME_ZONE — the same "1st of the month to 1st of the next" logic the
// "month" branch of rangeToDates uses for the CURRENT month, generalized to
// any month/year so the "Meses" picker (see components/shared/
// DateRangeSwitcher.tsx) can ask for a month that isn't the one in progress.
function monthWindowUtc(year: number, month: number): { start: Date; end: Date } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return {
    start: zonedMidnightUtc(new Date(`${year}-${pad(month)}-01T12:00:00Z`), SHOP_TIME_ZONE, 0),
    end: zonedMidnightUtc(new Date(`${nextYear}-${pad(nextMonth)}-01T12:00:00Z`), SHOP_TIME_ZONE, 0),
  };
}

// A date-range choice as made through the shared switcher: either one of the
// three relative presets (Hoy/7 días/Este mes — "30 días" was retired in
// favor of the true calendar-month "month" preset), or a hand-picked set of
// specific months within one year — see components/shared/
// DateRangeSwitcher.tsx. "months" is deliberately a list of exact months
// rather than a from/to span: selecting enero + marzo must NOT pull in
// febrero.
export type DateRangeSelection =
  | { kind: "preset"; preset: "today" | "7d" | "month" }
  | { kind: "months"; year: number; months: number[] };

// Expands a selection into one or more disjoint [start, end) windows — a
// single window for a preset, one window per chosen month for "months".
// Every report/finance/tax-book query that used to filter on a single
// {start,end} range now ORs across these windows instead (see e.g.
// revenueTotals in lib/actions/reports.ts), so picking enero + marzo sums
// exactly those two months and nothing in between.
export function selectionToWindows(selection: DateRangeSelection): { start: Date; end: Date }[] {
  if (selection.kind === "preset") return [rangeToDates(selection.preset)];
  return selection.months.map((m) => monthWindowUtc(selection.year, m));
}

const PRESET_VALUES = new Set(["today", "7d", "month"]);

// Parses `?range=...` (+`&year=`/`&months=` for the "months" kind) back into
// a DateRangeSelection — the inverse of dateRangeSelectionToQuery. Falls
// back to `fallback` for anything missing/malformed, same "validate against
// a known-good set, else default" pattern every page using DateRangePreset
// already followed.
export function parseDateRangeSelection(
  params: { range?: string; year?: string; months?: string },
  fallback: DateRangeSelection = { kind: "preset", preset: "month" }
): DateRangeSelection {
  if (params.range === "months") {
    const year = Number(params.year);
    const months = [
      ...new Set(
        (params.months ?? "")
          .split(",")
          .map((m) => Number(m))
          .filter((m) => Number.isInteger(m) && m >= 1 && m <= 12)
      ),
    ].sort((a, b) => a - b);
    if (Number.isInteger(year) && year > 0 && months.length > 0) {
      return { kind: "months", year, months };
    }
    return fallback;
  }
  if (params.range && PRESET_VALUES.has(params.range)) {
    return { kind: "preset", preset: params.range as "today" | "7d" | "month" };
  }
  return fallback;
}

export function dateRangeSelectionToQuery(selection: DateRangeSelection): Record<string, string> {
  if (selection.kind === "preset") return { range: selection.preset };
  return { range: "months", year: String(selection.year), months: selection.months.join(",") };
}

export type SalesByDayPoint = {
  day: string;
  totalEurCents: number;
  totalVES: number;
  count: number;
};

export type TopProductPoint = {
  productId: string | null;
  productName: string;
  // Products can share a name but differ by category — kept alongside the
  // name so the chart/list never conflates two distinct products together.
  category: string | null;
  quantity: number;
  revenueCents: number;
};

// Unlike TopProductPoint (grouped from actual SaleItem rows, so a product
// with zero sales never appears at all), this includes every active
// product — quantity is 0 for anything that didn't sell in the range, which
// is the whole point: surfacing dead stock, not just "the worst of what
// sold."
export type BottomProductPoint = {
  productId: string;
  productName: string;
  category: string | null;
  quantity: number;
};

// Label used everywhere these points are displayed (chart axis, tooltip,
// legend) — appends the category in parentheses when set, matching
// itemDescription() in lib/delivery-note.ts for the same "same name,
// different category" disambiguation on documents.
export function productPointLabel(p: { productName: string; category: string | null }): string {
  return p.category ? `${p.productName} (${p.category})` : p.productName;
}
