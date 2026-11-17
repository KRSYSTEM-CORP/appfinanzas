import { formatCurrencyCents } from "@/lib/currencies";

// Regla de moneda de KR POS: el «monto referencial» (la conversión en $/€ a la tasa BCV) es solo
// REFERENCIA. Lo que realmente importa es lo que se cobró o pagó en cada moneda: bolívares en
// bolívares, divisas en divisas. Este módulo (puro, sin base de datos) agrupa líneas de pago por su
// moneda real y las formatea, para que todos los reportes muestren los totales separados.

export type PaymentLineLike = {
  paymentMethod: string;
  // Referencia en centavos (suma = total de la venta).
  amountEurCents: number;
  // Moneda real de la línea y su monto tal como se cobró; null en filas anteriores al seguimiento por moneda.
  currencyCode?: string | null;
  amountCurrencyCents?: number | null;
};

export type CurrencyTotal = {
  code: string;
  // Monto en la moneda real (centavos de esa moneda).
  cents: number;
  // Su equivalente referencial (centavos de la referencia), solo informativo.
  refCents: number;
  count: number;
};

const USD_METHODS = ["ZELLE", "BINANCE", "PAYPAL"];

// Moneda real de una línea: la guardada, o (filas viejas) USD para Zelle/Binance/PayPal y la referencia para el resto.
export function lineCurrency(line: Pick<PaymentLineLike, "paymentMethod" | "currencyCode">, referenceCurrency: string): string {
  if (line.currencyCode) return line.currencyCode;
  return USD_METHODS.includes(line.paymentMethod) ? "USD" : referenceCurrency;
}

// Monto de la línea en su propia moneda (filas viejas: el equivalente referencial).
export function lineNativeCents(line: Pick<PaymentLineLike, "amountCurrencyCents" | "amountEurCents">): number {
  return line.amountCurrencyCents ?? line.amountEurCents;
}

// Orden de presentación: la moneda local (Bs) primero, luego las divisas (USD, EUR), luego el resto.
export function sortCurrencyCodes(codes: string[], localCurrencyCode: string): string[] {
  const rank = (c: string) => (c === localCurrencyCode ? 0 : c === "USD" ? 1 : c === "EUR" ? 2 : 3);
  return [...codes].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

export function aggregateByCurrency(
  lines: PaymentLineLike[],
  referenceCurrency: string,
  localCurrencyCode: string
): CurrencyTotal[] {
  const map = new Map<string, CurrencyTotal>();
  for (const l of lines) {
    const code = lineCurrency(l, referenceCurrency);
    const cur = map.get(code) ?? { code, cents: 0, refCents: 0, count: 0 };
    cur.cents += lineNativeCents(l);
    cur.refCents += l.amountEurCents;
    cur.count += 1;
    map.set(code, cur);
  }
  const order = sortCurrencyCodes([...map.keys()], localCurrencyCode);
  return order.map((c) => map.get(c)!);
}

// «Bs. 1.234,00 + US$ 50,00»; vacío = «—».
export function formatCurrencyTotals(totals: Pick<CurrencyTotal, "code" | "cents">[]): string {
  const nonZero = totals.filter((t) => t.cents !== 0);
  if (nonZero.length === 0) return "—";
  return nonZero.map((t) => formatCurrencyCents(t.code, t.cents)).join(" + ");
}

// Suma de los equivalentes referenciales de varios totales.
export function sumRefCents(totals: Pick<CurrencyTotal, "refCents">[]): number {
  return totals.reduce((a, t) => a + t.refCents, 0);
}

// Une filas (clave, moneda, centavos) en una matriz clave × moneda para armar tablas con una columna por moneda.
export type PivotCell = { cents: number; refCents: number };
export type Pivot = {
  currencies: string[];
  rows: { key: string; n: number; cells: Record<string, PivotCell>; refCents: number }[];
};

export function pivotByCurrency(
  entries: { key: string; currency: string; cents: number; refCents: number; n: number }[],
  localCurrencyCode: string
): Pivot {
  const currencies = sortCurrencyCodes([...new Set(entries.map((e) => e.currency))], localCurrencyCode);
  const byKey = new Map<string, Pivot["rows"][number]>();
  for (const e of entries) {
    const row = byKey.get(e.key) ?? { key: e.key, n: 0, cells: {}, refCents: 0 };
    const cell = row.cells[e.currency] ?? { cents: 0, refCents: 0 };
    cell.cents += e.cents;
    cell.refCents += e.refCents;
    row.cells[e.currency] = cell;
    row.n += e.n;
    row.refCents += e.refCents;
    byKey.set(e.key, row);
  }
  return { currencies, rows: [...byKey.values()] };
}

// Convierte un monto referencial a la moneda local con una tasa (solo como EQUIVALENTE informativo).
export function refToLocalCents(refCents: number, rate: number | null | undefined): number | null {
  if (!rate || rate <= 0) return null;
  return Math.round(refCents * rate);
}
