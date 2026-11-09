// Cumpleaños: cuántos días faltan para el próximo, en días calendario de Venezuela.
// La fecha de nacimiento es una fecha sin hora (columna DATE → medianoche UTC),
// por eso se leen sus partes en UTC.

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

// `today` es «AAAA-MM-DD» (ver todayDateString). Devuelve 0 si es hoy.
// Quien nació un 29 de febrero celebra el 28 en los años no bisiestos.
export function daysUntilBirthday(birth: Date, today: string): number {
  const [ty, tm, td] = today.split("-").map(Number);
  const bm = birth.getUTCMonth() + 1;
  const bd = birth.getUTCDate();
  const occurrence = (year: number) => {
    const day = bm === 2 && bd === 29 && !isLeap(year) ? 28 : bd;
    return Date.UTC(year, bm - 1, day);
  };
  const todayMs = Date.UTC(ty, tm - 1, td);
  let next = occurrence(ty);
  if (next < todayMs) next = occurrence(ty + 1);
  return Math.round((next - todayMs) / 86_400_000);
}

export type UpcomingBirthday = { id: string; name: string; phone: string; day: number; month: number; inDays: number };

export function upcomingBirthdays(
  customers: { id: string; firstName: string; lastName: string; phone: string; birthDate: Date | null }[],
  today: string,
  withinDays: number
): UpcomingBirthday[] {
  return customers
    .filter((c): c is typeof c & { birthDate: Date } => c.birthDate != null)
    .map((c) => ({
      id: c.id,
      name: `${c.firstName} ${c.lastName}`.trim(),
      phone: c.phone,
      day: c.birthDate.getUTCDate(),
      month: c.birthDate.getUTCMonth() + 1,
      inDays: daysUntilBirthday(c.birthDate, today),
    }))
    .filter((b) => b.inDays <= withinDays)
    .sort((a, b) => a.inDays - b.inDays || a.name.localeCompare(b.name));
}
