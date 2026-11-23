// Aviso de renovación: los últimos días antes de que venza la suscripción.
// Se cuenta en días calendario de Venezuela (UTC-4, sin horario de verano), no
// en bloques de 24 h, para que «hoy» signifique hoy hasta las 11:59 p. m.

export const RENEWAL_NOTICE_DAYS = 5;

const VE_OFFSET_MS = 4 * 3600 * 1000;

function veDayNumber(d: Date): number {
  return Math.floor((d.getTime() - VE_OFFSET_MS) / 86_400_000);
}

export type RenewalNotice = { days: number; text: string };

// «trial»: la empresa todavía no ha pagado nada, así que lo que vence es su prueba gratis (incluidos los días
// que el administrador le haya regalado), no una renovación.
export function renewalNotice(
  dueDate: Date | null,
  isExempt: boolean,
  now: Date = new Date(),
  trial = false
): RenewalNotice | null {
  if (isExempt || !dueDate) return null;
  const days = veDayNumber(dueDate) - veDayNumber(now);
  if (days < 0 || days > RENEWAL_NOTICE_DAYS) return null;
  if (trial) {
    if (days === 0) return { days, text: "Tu prueba gratis termina hoy" };
    if (days === 1) return { days, text: "Mañana termina tu prueba gratis" };
    return { days, text: `Tu prueba gratis termina en ${days} días` };
  }
  if (days === 0) return { days, text: "Tu plan vence hoy" };
  if (days === 1) return { days, text: "Mañana vence tu plan" };
  return { days, text: `Te quedan ${days} días para renovar` };
}
