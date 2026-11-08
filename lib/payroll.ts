// Cálculo de la nómina quincenal. Porcentajes de ley de ejemplo (sobre el
// sueldo base): ajústalos aquí si cambian. Todo en centavos de la divisa referencial.
// Deducciones en % sobre el sueldo base. Cada empresa puede cambiarlas en
// Nómina; estos son los valores de ejemplo con los que arrancan.
export type PayrollRates = { ivssPct: number; paroPct: number; faovPct: number };
export const DEFAULT_PAYROLL_RATES: PayrollRates = { ivssPct: 4, paroPct: 0.5, faovPct: 1 };

export type PayrollCalc = {
  commissionCents: number;
  grossCents: number;
  deductionsCents: number;
  advanceCents: number;
  netCents: number;
};

// Una quincena = la mitad del sueldo base y del bono de alimentación. Las
// deducciones se calculan sobre la mitad del sueldo base. El adelanto se
// descuenta del neto, sin dejarlo en negativo.
export function computeFortnight(
  baseCents: number,
  foodBonusCents: number,
  advanceCents = 0,
  rates: PayrollRates = DEFAULT_PAYROLL_RATES,
  commissionCents = 0
): PayrollCalc {
  const halfBase = Math.round(baseCents / 2);
  // La comisión se suma a las asignaciones; las deducciones de ley se calculan
  // solo sobre el sueldo base.
  const commission = Math.max(0, Math.round(commissionCents));
  const gross = halfBase + Math.round(foodBonusCents / 2) + commission;
  const rate = (rates.ivssPct + rates.paroPct + rates.faovPct) / 100;
  const deductions = Math.round(halfBase * rate);
  const advance = Math.max(0, Math.min(advanceCents, gross - deductions));
  return {
    commissionCents: commission,
    grossCents: gross,
    deductionsCents: deductions,
    advanceCents: advance,
    netCents: gross - deductions - advance,
  };
}

// "2026-11-1" para la 1.ª quincena (días 1 al 15) y "2026-11-2" para la 2.ª.
export function periodFor(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-${date.getDate() <= 15 ? 1 : 2}`;
}

export function isValidPeriod(period: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])-[12]$/.test(period);
}

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function periodLabel(period: string): string {
  const [y, m, q] = period.split("-");
  return `${q === "1" ? "1.ª" : "2.ª"} quincena de ${MONTHS[Number(m) - 1] ?? m} ${y}`;
}

// Provisiones: lo que la empresa debe ir apartando para utilidades y vacaciones.
// Ejemplo: un mes de sueldo base al año para cada una, acumulado mes a mes.
export function monthlyProvisionCents(baseCents: number): number {
  return Math.round(baseCents / 12);
}

// `monthsElapsed` = meses del año ya transcurridos (1–12).
export function accruedProvisionCents(baseCents: number, monthsElapsed: number): number {
  const months = Math.min(12, Math.max(0, Math.floor(monthsElapsed)));
  return monthlyProvisionCents(baseCents) * months;
}

// Comisión = porcentaje de lo vendido en la quincena. Redondea al centavo.
export function commissionFor(salesCents: number, commissionPct: number): number {
  if (!(salesCents > 0) || !(commissionPct > 0)) return 0;
  return Math.round((salesCents * commissionPct) / 100);
}

// Rango de fechas (AAAA-MM-DD, ambos incluidos) de una quincena "AAAA-MM-1|2".
export function periodDateRange(period: string): { from: string; to: string } {
  const [y, m, q] = period.split("-").map(Number);
  const mm = String(m).padStart(2, "0");
  if (q === 1) return { from: `${y}-${mm}-01`, to: `${y}-${mm}-15` };
  const lastDay = new Date(y, m, 0).getDate();
  return { from: `${y}-${mm}-16`, to: `${y}-${mm}-${String(lastDay).padStart(2, "0")}` };
}
