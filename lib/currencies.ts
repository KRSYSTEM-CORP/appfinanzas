import { formatEUR, formatUSD } from "@/lib/format";

// Each company picks its own local retail currency from this list (Settings
// → Moneda). Product prices are still stored canonically in EUR cents —
// this only drives how that EUR amount is displayed/converted for a given
// company's own market, the same way VES already worked before this file
// existed.
export type CurrencyOption = {
  code: string; // ISO 4217
  name: string;
  symbol: string;
  locale: string; // drives thousands/decimal separator conventions
};

export const CURRENCIES: CurrencyOption[] = [
  { code: "VES", name: "Bolívares (Venezuela)", symbol: "Bs.", locale: "es-VE" },
  { code: "USD", name: "Dólares (Estados Unidos)", symbol: "US$", locale: "en-US" },
  { code: "MXN", name: "Pesos (México)", symbol: "$", locale: "es-MX" },
  { code: "COP", name: "Pesos (Colombia)", symbol: "$", locale: "es-CO" },
  { code: "PEN", name: "Soles (Perú)", symbol: "S/", locale: "es-PE" },
  { code: "ARS", name: "Pesos (Argentina)", symbol: "$", locale: "es-AR" },
  { code: "CLP", name: "Pesos (Chile)", symbol: "$", locale: "es-CL" },
  { code: "BRL", name: "Reales (Brasil)", symbol: "R$", locale: "pt-BR" },
  { code: "DOP", name: "Pesos (República Dominicana)", symbol: "RD$", locale: "es-DO" },
  { code: "GTQ", name: "Quetzales (Guatemala)", symbol: "Q", locale: "es-GT" },
  { code: "HNL", name: "Lempiras (Honduras)", symbol: "L", locale: "es-HN" },
  { code: "NIO", name: "Córdobas (Nicaragua)", symbol: "C$", locale: "es-NI" },
  { code: "CRC", name: "Colones (Costa Rica)", symbol: "₡", locale: "es-CR" },
  { code: "PAB", name: "Balboas (Panamá)", symbol: "B/.", locale: "es-PA" },
  { code: "UYU", name: "Pesos (Uruguay)", symbol: "$U", locale: "es-UY" },
  { code: "PYG", name: "Guaraníes (Paraguay)", symbol: "₲", locale: "es-PY" },
  { code: "BOB", name: "Bolivianos (Bolivia)", symbol: "Bs", locale: "es-BO" },
  { code: "EUR", name: "Euros", symbol: "€", locale: "de-DE" },
  { code: "GBP", name: "Libras esterlinas", symbol: "£", locale: "en-GB" },
];

export const DEFAULT_CURRENCY_CODE = "VES";

export function getCurrency(code: string | null | undefined): CurrencyOption {
  return CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0];
}

export function formatLocalCurrency(amount: number, currencyCode: string | null | undefined): string {
  const currency = getCurrency(currencyCode);
  const formatted = new Intl.NumberFormat(currency.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `${currency.symbol} ${formatted}`;
}

export function eurCentsToLocal(eurCents: number, rate: number): number {
  return (eurCents / 100) * rate;
}

// The canonical reference price shown on retail documents (delivery notes,
// quotes, payment receipts) mentions BCV only for Venezuelan companies,
// since that's the rate their reference price is actually anchored to;
// everywhere else it's just a generic reference-currency note.
export function referenceNote(
  currencyCode: string | null | undefined,
  referenceCurrency: "EUR" | "USD" = "EUR"
): string {
  return currencyCode === "VES"
    ? `Precio de referencia en ${referenceCurrency}/BCV`
    : `Precio de referencia en ${referenceCurrency}`;
}

// Formats an amount already denominated in `currencyCode` (in cents) — used
// for payment-split lines and income breakdowns, where the code can be a
// company's local currency, "USD" (Zelle/Binance/PayPal/foreign cash), or
// "EUR" (the fallback for payment rows recorded before per-line currency
// tracking existed).
export function formatCurrencyCents(currencyCode: string, cents: number): string {
  if (currencyCode === "EUR") return formatEUR(cents);
  if (currencyCode === "USD") return formatUSD(cents);
  return formatLocalCurrency(cents / 100, currencyCode);
}
