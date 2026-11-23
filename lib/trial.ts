// Prueba gratis: los días que el administrador de la plataforma regala a una empresa nueva.
// La prueba no tiene fecha propia: es el vencimiento de la suscripción (Company.nextPaymentDueDate) de una
// empresa que todavía no ha pagado nada. Regalar días mueve ese vencimiento.

// Atajos del módulo «Días gratis» (los meses se cuentan de 30 días, como todo el ciclo de cobro: lib/billing.ts).
export const FREE_DAYS_PRESETS: { label: string; days: number }[] = [
  { label: "+15 días", days: 15 },
  { label: "+1 mes", days: 30 },
  { label: "+2 meses", days: 60 },
  { label: "+3 meses", days: 90 },
];

export const MAX_FREE_DAYS = 730;

// Nuevo vencimiento: se suman los días a lo que le quede de prueba; si ya venció (o no tiene fecha), se cuentan desde hoy
// (así una empresa bloqueada por fin de prueba vuelve a entrar).
export function addFreeDays(due: Date | null, days: number, now: Date = new Date()): Date {
  const base = due && due.getTime() > now.getTime() ? due : now;
  return new Date(base.getTime() + days * 86_400_000);
}

// Días que le quedan hasta el vencimiento (0 si ya venció).
export function trialDaysLeft(due: Date | null, now: Date = new Date()): number | null {
  if (!due) return null;
  return Math.max(0, Math.ceil((due.getTime() - now.getTime()) / 86_400_000));
}
