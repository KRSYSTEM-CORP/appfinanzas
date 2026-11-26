// Aumento porcentual de precios: cálculo puro (sin servidor) para probarlo y para que la vista previa y la
// aplicación den exactamente el mismo resultado. Todo con enteros: el porcentaje va en centésimas de punto
// (10,5 % = 1050) y los precios en centavos, así no hay errores de coma flotante en los .5.

export type PriceRounding = "CENT" | "0.05" | "0.10";
export const ROUNDING_STEP: Record<PriceRounding, number> = { CENT: 1, "0.05": 5, "0.10": 10 };
export const MIN_PERCENT_BP = 1; // 0,01 %
export const MAX_PERCENT_BP = 10000; // 100 %
export const UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;

// "12,5" o "12.5" → 1250. Null si no es un número positivo dentro de 0,01–100 (máx. 2 decimales).
export function parsePercentBp(input: string | number): number | null {
  const raw = String(input).replace("%", "").trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return null;
  const bp = Math.round(Number(raw) * 100);
  return bp >= MIN_PERCENT_BP && bp <= MAX_PERCENT_BP ? bp : null;
}

export function isRounding(v: unknown): v is PriceRounding {
  return v === "CENT" || v === "0.05" || v === "0.10";
}

// Precio nuevo en centavos: cents × (1 + %) redondeado al céntimo y luego al paso elegido (mitad hacia arriba).
// Las mismas cuentas se hacen en SQL al deshacer; aquí es la única fuente del cálculo.
export function increasePrice(cents: number, percentBp: number, rounding: PriceRounding = "CENT"): number {
  if (!Number.isFinite(cents) || cents <= 0) return cents;
  const raised = Math.floor((cents * (10000 + percentBp) * 2 + 10000) / 20000);
  const step = ROUNDING_STEP[rounding];
  if (step === 1) return raised;
  return Math.floor((raised * 2 + step) / (2 * step)) * step;
}

export type PriceTriple = { p: number; w: number | null; b: number | null };

// Los tres precios de un producto (detal, mayor, gran mayor); los vacíos se quedan vacíos.
export function increaseTriple(t: PriceTriple, percentBp: number, rounding: PriceRounding): PriceTriple {
  return {
    p: increasePrice(t.p, percentBp, rounding),
    w: t.w == null ? null : increasePrice(t.w, percentBp, rounding),
    b: t.b == null ? null : increasePrice(t.b, percentBp, rounding),
  };
}

export function canUndoAdjustment(adj: { createdAt: Date; undoneAt: Date | null }, now = new Date()): boolean {
  return adj.undoneAt == null && now.getTime() - adj.createdAt.getTime() <= UNDO_WINDOW_MS;
}
