// Cálculos del Resumen de Balance (Administración): ganancia, composición de gastos y cascada.
// Todo en centavos de la divisa de referencia.

export type BalanceInput = { salesCents: number; cogsCents: number; expensesCents: number; commissionsCents: number };

export function netProfit(b: BalanceInput): number {
  return b.salesCents - b.cogsCents - b.expensesCents - b.commissionsCents;
}

// Composición de gastos: suma por categoría (sin categoría = «Sin categoría»), de mayor a menor.
// Muestra hasta `maxSlices` categorías y agrupa el resto en «Otros».
export type ExpenseSlice = { label: string; cents: number; share: number };
export function expenseComposition(rows: { category: string | null; amountCents: number }[], maxSlices = 5): { slices: ExpenseSlice[]; total: number } {
  const sums = new Map<string, number>();
  for (const r of rows) {
    if (r.amountCents <= 0) continue;
    const key = r.category?.trim() || "Sin categoría";
    sums.set(key, (sums.get(key) ?? 0) + r.amountCents);
  }
  const sorted = [...sums.entries()].sort((x, y) => y[1] - x[1]);
  const total = sorted.reduce((a, [, c]) => a + c, 0);
  const head = sorted.length > maxSlices ? sorted.slice(0, maxSlices - 1) : sorted;
  const rest = sorted.slice(head.length).reduce((a, [, c]) => a + c, 0);
  const all = rest > 0 ? [...head, ["Otros", rest] as [string, number]] : head;
  return { slices: all.map(([label, cents]) => ({ label, cents, share: total > 0 ? cents / total : 0 })), total };
}

// Cascada de utilidad: barras de 220px de alto máximo en un lienzo de 420×290 (como la preview).
export type WaterfallBar = { label: string; value: number; y: number; h: number; tone: "brand" | "bad" | "ok"; sign: "" | "−" };
export function waterfall(b: BalanceInput): WaterfallBar[] {
  const top = Math.max(b.salesCents, 1);
  const scale = (c: number) => (Math.max(0, c) / top) * 220;
  const base = 254;
  const net = netProfit(b);
  let level = b.salesCents;
  const steps: WaterfallBar[] = [{ label: "Ventas", value: b.salesCents, y: base - scale(b.salesCents), h: scale(b.salesCents), tone: "brand", sign: "" }];
  for (const [label, v] of [
    ["Costo", b.cogsCents],
    ["Gastos", b.expensesCents],
    ["Comisión", b.commissionsCents],
  ] as const) {
    const y = base - scale(level);
    level -= v;
    steps.push({ label, value: v, y, h: Math.max(0, scale(level + v) - scale(level)), tone: "bad", sign: "−" });
  }
  steps.push({ label: "Utilidad", value: Math.abs(net), y: base - scale(Math.max(net, 0)), h: scale(Math.abs(net)), tone: net < 0 ? "bad" : "ok", sign: net < 0 ? "−" : "" });
  return steps;
}
