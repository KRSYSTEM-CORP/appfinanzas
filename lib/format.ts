import type { PaymentMethod, PaymentStatus, PurchasePaymentStatus, QuoteStatus } from "@prisma/client";
import { SHOP_TIME_ZONE } from "@/lib/report-types";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Efectivo",
  CARD: "Pago Móvil",
  OTHER: "Otro",
  ZELLE: "Zelle (USD)",
  BINANCE: "Binance (USDT)",
  PAYPAL: "PayPal (USD)",
  POS: "Punto de venta",
  TRANSFER: "Transferencia bancaria",
};

// Methods that need a reference/confirmation number, same as Pago Móvil.
export const PAYMENT_METHODS_REQUIRING_REFERENCE: PaymentMethod[] = [
  "CARD",
  "ZELLE",
  "BINANCE",
  "PAYPAL",
  "POS",
  "TRANSFER",
];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PAID: "Pagada",
  CREDIT: "A crédito",
};

export const PURCHASE_PAYMENT_STATUS_LABELS: Record<PurchasePaymentStatus, string> = {
  PAID: "Pagada",
  PENDING: "Por pagar",
};

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  PENDING: "Pendiente",
  CONVERTED: "Aprobado",
  LOST: "Perdido",
};

export function formatEUR(cents: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

// KR System's own maintenance-billing currency — independent of whatever
// local currency a company sells in (see lib/currencies.ts).
export function formatUSD(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

// Zelle, Binance (USDT) and PayPal are USD-denominated payment rails — see
// lib/payment-currency.ts for how this drives each payment-split line's
// actual currency and EUR-cent conversion.
export const USD_DENOMINATED_METHODS: PaymentMethod[] = ["ZELLE", "BINANCE", "PAYPAL"];

// Pinned to SHOP_TIME_ZONE (not the runtime's own clock) so the date/time
// shown is always the real Venezuela-local one — otherwise a server
// component rendered on Vercel (UTC) can show a date up to 4 hours ahead of
// what the user's own device says (e.g. "next day" while it's still evening
// in Caracas), which is exactly what made things like the exchange rate's
// "última actualización" look wrong/inconsistent right after updating it.
export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("es-VE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: SHOP_TIME_ZONE,
  }).format(d);
}

export function formatDateShort(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("es-VE", {
    day: "2-digit",
    month: "short",
    timeZone: SHOP_TIME_ZONE,
  }).format(d);
}

// For a pure calendar-date value (Prisma @db.Date — no time component,
// stored as UTC midnight of that day, e.g. Customer.nextContactDate) —
// unlike formatDate/formatDateShort above, this must NOT convert through
// SHOP_TIME_ZONE, since UTC-4 rolls midnight UTC back to 8pm the PREVIOUS
// day, silently showing the wrong date. Reads the UTC date parts directly
// instead, since that's the calendar day it actually represents.
export function formatDateOnly(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("es-VE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

const SHORT_MONTHS_ES = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

// Formats a plain "YYYY-MM-DD" string without constructing a Date object, so the
// displayed day never shifts due to the browser's local timezone.
export function formatDayLabel(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  return `${day}-${SHORT_MONTHS_ES[Number(month) - 1]}`;
}
