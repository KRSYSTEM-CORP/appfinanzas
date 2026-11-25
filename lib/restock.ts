export const RESTOCK_COVER_DAYS = 14;
export const RESTOCK_WINDOW_DAYS = 30;
// Un producto con pocos días de vida no puede dar un ritmo de venta fiable (un día de buenas ventas
// no es el ritmo real): el ritmo se calcula sobre al menos esta cantidad de días.
export const RESTOCK_MIN_DAYS = 7;

/**
 * Nivel ideal y cantidad a pedir (puro, para probar).
 * - Ritmo = vendido ÷ max(días con el producto, 7).
 * - Ideal = ritmo × 14 días de cobertura, nunca menos que el mínimo configurado del producto y
 *   nunca más de lo vendido en toda la ventana de 30 días (no se compra más de lo que se vendió).
 * - Pedir = ideal − existencia actual (solo si es positivo).
 */
export function restockPlan(input: { sold: number; activeDays: number; stock: number; minStock: number }) {
  const perDay = input.sold / Math.max(RESTOCK_MIN_DAYS, input.activeDays);
  const byCover = Math.ceil(perDay * RESTOCK_COVER_DAYS);
  const ideal = Math.max(Math.max(0, input.minStock), Math.min(byCover, Math.max(0, input.sold)));
  const need = Math.max(0, Math.ceil(ideal - Math.max(0, input.stock)));
  return { perDay, ideal, need };
}
