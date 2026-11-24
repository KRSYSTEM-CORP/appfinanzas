// Regla del dueño: no se vende con la caja cerrada. Lógica pura (sin servidor) para probarla en vitest y
// compartirla entre el servidor (completeSale) y el POS (en línea y sin internet).

export const CASH_CLOSED_MESSAGE = "Abre la caja antes de vender (Caja Chica → Abrir caja).";

// ¿Hay que exigir turno abierto? No cuando la venta viene de la cola sin internet (ya ocurrió) ni cuando ya está registrada.
export function mustCheckShift(opts: { queued: boolean; alreadyRegistered: boolean }): boolean {
  return !opts.queued && !opts.alreadyRegistered;
}

// Mensaje de error si la venta no puede hacerse; null si puede. `shiftOpen` null = estado desconocido (no bloquea).
export function cashGateError(shiftOpen: boolean | null | undefined): string | null {
  return shiftOpen === false ? CASH_CLOSED_MESSAGE : null;
}
