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
function zonedMidnightUtc(instant: Date, timeZone: string, dayOffset = 0): Date {
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

export function todayDateString(): string {
  const { year, month, day } = zonedDateParts(new Date(), SHOP_TIME_ZONE);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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
