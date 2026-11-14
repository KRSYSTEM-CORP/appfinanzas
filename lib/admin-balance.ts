// Cálculos del Resumen de Balance (Administración): ganancia, punto de equilibrio y proyección.
// Todo en centavos de la divisa de referencia.

export type BalanceInput = { salesCents: number; cogsCents: number; expensesCents: number; commissionsCents: number };

export function netProfit(b: BalanceInput): number {
  return b.salesCents - b.cogsCents - b.expensesCents - b.commissionsCents;
}

// Punto de equilibrio: gastos + comisiones divididos entre el margen bruto (ventas − costo) / ventas.
export function breakevenPoint(b: BalanceInput): number | null {
  if (b.salesCents <= 0) return null;
  const margin = (b.salesCents - b.cogsCents) / b.salesCents;
  if (margin <= 0) return null;
  return Math.round((b.expensesCents + b.commissionsCents) / margin);
}

// Proyección de cierre de mes al ritmo actual: vendido ÷ día × días del mes.
export function monthProjection(soldCents: number, day: number, daysInMonth: number): number {
  if (day <= 0) return soldCents;
  return Math.round((soldCents / day) * daysInMonth);
}

// Posiciones (en %) del medidor de equilibrio: relleno vendido, proyección punteada y marca.
export function breakevenMeter(sold: number, breakeven: number | null, projection: number | null) {
  const max = Math.max(sold, breakeven ?? 0, projection ?? 0) * 1.08 || 1;
  return {
    fill: (sold / max) * 100,
    projection: projection != null ? (projection / max) * 100 : null,
    marker: breakeven != null ? (breakeven / max) * 100 : null,
  };
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
