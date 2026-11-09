// Lectura y fechas de la tasa oficial del BCV (www.bcv.org.ve). Todo aquí es
// puro (sin red) para poder probarlo. A diferencia de los agregadores, el BCV
// publica la tasa del día hábil siguiente por la tarde («Fecha Valor»), así que
// se puede adelantar a las 7:00 p. m. de Venezuela.

export type BcvHome = { usd: number; eur: number; valueDate: string };

const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

function parseVeNumber(s: string): number {
  // «1.001,18602288» → 1001.18602288
  return Number(s.replace(/\./g, "").replace(",", "."));
}

// Lee de la página principal del BCV las tasas USD y EUR y su fecha valor.
// Devuelve null si algo no cuadra (nunca adivina).
export function parseBcvHome(html: string): BcvHome | null {
  const text = html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");

  const rateOf = (code: string): number | null => {
    const m = text.match(new RegExp(`\\b${code}\\s+([0-9]{1,3}(?:\\.[0-9]{3})*,[0-9]+)`));
    if (!m) return null;
    const n = parseVeNumber(m[1]);
    return Number.isFinite(n) && n > 1 && n < 1_000_000 ? n : null;
  };
  const usd = rateOf("USD");
  const eur = rateOf("EUR");

  const d = text.match(/Fecha Valor:?\s*(?:[A-Za-zÁÉÍÓÚáéíóúñÑ]+,?\s*)?(\d{1,2})\s+([A-Za-zÁÉÍÓÚáéíóúñÑ]+)\s+(\d{4})/i);
  if (!usd || !eur || !d) return null;
  const month = MONTHS[d[2].normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()];
  if (!month) return null;
  const valueDate = `${d[3]}-${String(month).padStart(2, "0")}-${d[1].padStart(2, "0")}`;
  return { usd, eur, valueDate };
}

// Venezuela es UTC-4 todo el año (sin horario de verano).
const VE_OFFSET_MS = 4 * 3600 * 1000;

function veDateString(ms: number): string {
  return new Date(ms - VE_OFFSET_MS).toISOString().slice(0, 10);
}

export function todayVe(now: Date = new Date()): string {
  return veDateString(now.getTime());
}

// «Día de tasa»: cambia a las 7:00 p. m. de Venezuela, cuando el BCV ya publicó
// la tasa del día siguiente. Dos momentos con el mismo día de tasa usan la misma
// tasa; al cruzar las 7 p. m. hay que renovarla.
export function rateDay(d: Date): string {
  return veDateString(d.getTime() + 5 * 3600 * 1000);
}

// Una tasa guardada hay que renovarla si es de otro día de tasa.
export function isRateStale(updatedAt: Date | null, now: Date = new Date()): boolean {
  return updatedAt == null || rateDay(updatedAt) !== rateDay(now);
}

// Una fecha valor sirve si es de hoy o posterior (la de mañana adelantada es válida).
export function isValueDateCurrent(valueDate: string, now: Date = new Date()): boolean {
  return valueDate >= todayVe(now);
}

