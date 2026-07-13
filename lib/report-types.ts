export type DateRangePreset = "today" | "7d" | "30d" | "month";

export const SHOP_TIME_ZONE = "America/Mexico_City";

function zonedDateParts(instant: Date, timeZone: string) {
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

export type SalesByDayPoint = { day: string; totalCents: number; count: number };

export type TopProductPoint = {
  productId: string | null;
  productName: string;
  quantity: number;
  revenueCents: number;
};
