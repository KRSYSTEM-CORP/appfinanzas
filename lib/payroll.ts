// Cálculo de la nómina quincenal. Porcentajes de ley de ejemplo (sobre el
// sueldo base): ajústalos aquí si cambian. Todo en centavos de la divisa referencial.
export const PAYROLL_DEDUCTION_RATES = { ivss: 0.04, paroForzoso: 0.005, faov: 0.01 } as const;

export type PayrollCalc = {
  grossCents: number;
  deductionsCents: number;
  advanceCents: number;
  netCents: number;
};

// Una quincena = la mitad del sueldo base y del bono de alimentación. Las
// deducciones se calculan sobre la mitad del sueldo base. El adelanto se
// descuenta del neto, sin dejarlo en negativo.
export function computeFortnight(baseCents: number, foodBonusCents: number, advanceCents = 0): PayrollCalc {
  const halfBase = Math.round(baseCents / 2);
  const gross = halfBase + Math.round(foodBonusCents / 2);
  const rate = PAYROLL_DEDUCTION_RATES.ivss + PAYROLL_DEDUCTION_RATES.paroForzoso + PAYROLL_DEDUCTION_RATES.faov;
  const deductions = Math.round(halfBase * rate);
  const advance = Math.max(0, Math.min(advanceCents, gross - deductions));
  return { grossCents: gross, deductionsCents: deductions, advanceCents: advance, netCents: gross - deductions - advance };
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
