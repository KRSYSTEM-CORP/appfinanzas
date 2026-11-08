// Punto de equilibrio: cuánto hay que vender para que el margen cubra los
// gastos del período (y, opcionalmente, una meta de ganancia). Todo en centavos
// de la divisa referencial.

// Margen de contribución: qué parte de cada unidad vendida queda después del costo.
export function marginRatio(revenueCents: number, cogsCents: number): number {
  if (revenueCents <= 0) return 0;
  return Math.max(0, (revenueCents - cogsCents) / revenueCents);
}

// Ventas necesarias para cubrir `targetCents` (gastos, o gastos + meta).
// null cuando no hay margen con el que calcularlo.
export function revenueNeeded(targetCents: number, margin: number): number | null {
  if (margin <= 0) return null;
  return Math.ceil(targetCents / margin);
}

export type CategoryMargin = { category: string; revenueCents: number; cogsCents: number };
export type CategoryBreakeven = CategoryMargin & {
  margin: number;
  allocatedExpensesCents: number;
  breakevenCents: number | null;
  covered: boolean;
};

// Reparte los gastos entre categorías según su peso en las ventas y calcula el
// equilibrio de cada una.
export function breakevenByCategory(rows: CategoryMargin[], expensesCents: number): CategoryBreakeven[] {
  const total = rows.reduce((a, r) => a + r.revenueCents, 0);
  return rows
    .map((r) => {
      const margin = marginRatio(r.revenueCents, r.cogsCents);
      const allocated = total > 0 ? Math.round((expensesCents * r.revenueCents) / total) : 0;
      const breakevenCents = revenueNeeded(allocated, margin);
      return {
        ...r,
        margin,
        allocatedExpensesCents: allocated,
        breakevenCents,
        covered: breakevenCents != null && r.revenueCents >= breakevenCents,
      };
    })
    .sort((a, b) => b.revenueCents - a.revenueCents);
}
