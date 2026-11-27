export const RESTOCK_COVER_DAYS = 14;
export const RESTOCK_WINDOW_DAYS = 30;
// Un producto con pocos días de vida no puede dar un ritmo de venta fiable (un día de buenas ventas
// no es el ritmo real): el ritmo se calcula sobre al menos esta cantidad de días.
export const RESTOCK_MIN_DAYS = 7;

// Redondeo hacia arriba: a enteros en unidades de conteo, a milésimas en las que admiten decimales (litros, kg).
function ceilQty(n: number, decimals: boolean): number {
  return decimals ? Math.ceil(Math.round(n * 1e6) / 1e3) / 1000 : Math.ceil(n);
}

/**
 * Nivel ideal y cantidad a pedir (puro, para probar).
 * - Ritmo = vendido ÷ max(días con el producto, 7).
 * - Ideal = ritmo × 14 días de cobertura, nunca menos que el mínimo configurado del producto y
 *   nunca más de lo vendido en toda la ventana de 30 días (no se compra más de lo que se vendió).
 * - Pedir = ideal − existencia actual (solo si es positivo).
 * `decimals`: el producto se mide en una unidad con decimales (litro, kg...).
 */
export function restockPlan(input: { sold: number; activeDays: number; stock: number; minStock: number; decimals?: boolean }) {
  const decimals = input.decimals ?? false;
  const perDay = input.sold / Math.max(RESTOCK_MIN_DAYS, input.activeDays);
  const byCover = ceilQty(perDay * RESTOCK_COVER_DAYS, decimals);
  const ideal = Math.max(Math.max(0, input.minStock), Math.min(byCover, Math.max(0, input.sold)));
  const need = Math.max(0, ceilQty(ideal - Math.max(0, input.stock), decimals));
  return { perDay, ideal, need };
}
