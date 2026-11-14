// Montos con el formato de la preview: símbolo delante y separadores venezolanos
// («$1.120,00», «$4.820», «Bs 1.005.243»). `decimals` 0 redondea (KPI), 2 muestra céntimos.

const SYMBOL: Record<string, string> = { USD: "$", EUR: "€", VES: "Bs " };

export function money(currency: string, cents: number, decimals: 0 | 2 = 2): string {
  const n = new Intl.NumberFormat("es-VE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Math.abs(cents) / 100);
  const sym = SYMBOL[currency] ?? `${currency} `;
  return `${cents < 0 ? "−" : ""}${sym}${n}`;
}

// Bolívares de un monto en divisa de referencia, sin decimales («Bs 1.005.243»).
export function bsOf(cents: number, rate: number | null, decimals: 0 | 2 = 0): string | null {
  if (rate == null || !Number.isFinite(rate) || rate <= 0) return null;
  return money("VES", Math.round(cents * rate), decimals);
}

// «23,2 %»
export function pct(part: number, total: number, decimals = 1): string {
  if (!total) return `0${decimals ? "," + "0".repeat(decimals) : ""} %`;
  return `${new Intl.NumberFormat("es-VE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format((part / total) * 100)} %`;
}
