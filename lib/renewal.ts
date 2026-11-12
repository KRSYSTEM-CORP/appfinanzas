// Aviso de renovación: los últimos días antes de que venza la suscripción.
// Se cuenta en días calendario de Venezuela (UTC-4, sin horario de verano), no
// en bloques de 24 h, para que «hoy» signifique hoy hasta las 11:59 p. m.

export const RENEWAL_NOTICE_DAYS = 5;

const VE_OFFSET_MS = 4 * 3600 * 1000;

function veDayNumber(d: Date): number {
  return Math.floor((d.getTime() - VE_OFFSET_MS) / 86_400_000);
}

export type RenewalNotice = { days: number; text: string };

export function renewalNotice(
  dueDate: Date | null,
  isExempt: boolean,
  now: Date = new Date()
): RenewalNotice | null {
  if (isExempt || !dueDate) return null;
  const days = veDayNumber(dueDate) - veDayNumber(now);
  if (days < 0 || days > RENEWAL_NOTICE_DAYS) return null;
  if (days === 0) return { days, text: "Tu plan vence hoy" };
  if (days === 1) return { days, text: "Mañana vence tu plan" };
  return { days, text: `Te quedan ${days} días para renovar` };
}
