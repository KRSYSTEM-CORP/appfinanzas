// Espera creciente (exponencial con tope) para reintentar la sincronización
// de ventas en cola. Lógica pura para poder probarla sin navegador.
export function syncBackoffMs(attempt: number, baseMs = 2000, maxMs = 60000): number {
  const n = Math.max(0, Math.floor(attempt));
  return Math.min(maxMs, baseMs * 2 ** Math.min(n, 20));
}
