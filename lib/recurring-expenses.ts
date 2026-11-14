// Gastos recurrentes detectados del historial: un gasto con la misma descripción y categoría
// registrado en al menos dos meses distintos se espera de nuevo un mes después del último.

export type ExpenseHistoryItem = {
  description: string;
  category: string | null;
  amountCents: number;
  localAmountCents: number | null;
  enteredInLocal: boolean;
  spentAt: string; // AAAA-MM-DD
};

export type RecurringExpense = {
  description: string;
  category: string | null;
  amountCents: number;
  localAmountCents: number | null;
  enteredInLocal: boolean;
  dueDate: string; // AAAA-MM-DD
  daysLeft: number; // negativo = vencido
};

function addMonth(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
}

export function recurringExpenses(history: ExpenseHistoryItem[], today: string, horizonDays = 31): RecurringExpense[] {
  const groups = new Map<string, ExpenseHistoryItem[]>();
  for (const e of history) {
    const key = `${e.description.trim().toLowerCase()}|${(e.category ?? "").toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const out: RecurringExpense[] = [];
  for (const items of groups.values()) {
    const months = new Set(items.map((i) => i.spentAt.slice(0, 7)));
    if (months.size < 2) continue;
    const last = [...items].sort((a, b) => b.spentAt.localeCompare(a.spentAt))[0];
    // Ya se registró este mes: el próximo vence el mes que viene.
    const dueDate = addMonth(last.spentAt);
    const daysLeft = dayDiff(dueDate, today);
    if (daysLeft > horizonDays || daysLeft < -31) continue;
    out.push({
      description: last.description,
      category: last.category,
      amountCents: last.amountCents,
      localAmountCents: last.localAmountCents,
      enteredInLocal: last.enteredInLocal,
      dueDate,
      daysLeft,
    });
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft);
}
