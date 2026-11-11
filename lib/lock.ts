// Bloqueo automático por inactividad. Solo aplica a quien ya tiene PIN (si no,
// no habría con qué desbloquear). El tiempo depende del rol: un vendedor en caja
// se bloquea antes que un gerente.

export const LOCK_AFTER_MS = {
  GERENTE: 15 * 60_000,
  VENDEDOR: 10 * 60_000,
} as const;

// Tiempos que cada equipo puede elegir (minutos). Se guarda en el propio navegador.
export const LOCK_MINUTE_OPTIONS = [5, 10, 15] as const;
export const LOCK_MINUTES_KEY = "kr-lock-minutes";

export function readLockMinutes(): number | null {
  try {
    const v = Number(window.localStorage.getItem(LOCK_MINUTES_KEY));
    return (LOCK_MINUTE_OPTIONS as readonly number[]).includes(v) ? v : null;
  } catch {
    return null;
  }
}

// Cuánto antes del bloqueo se avisa.
export const LOCK_WARNING_MS = 15_000;

export function lockTimeoutFor(role: "GERENTE" | "VENDEDOR"): number {
  return LOCK_AFTER_MS[role];
}

export type LockState = { phase: "active" | "warning" | "locked"; secondsLeft: number };

// Se calcula con marcas de tiempo (no con un temporizador largo) para que siga
// siendo correcto si el navegador pausa la pestaña o la computadora se suspende.
export function lockState(lastActivityMs: number, nowMs: number, timeoutMs: number): LockState {
  const left = timeoutMs - (nowMs - lastActivityMs);
  if (left <= 0) return { phase: "locked", secondsLeft: 0 };
  if (left <= LOCK_WARNING_MS) return { phase: "warning", secondsLeft: Math.ceil(left / 1000) };
  return { phase: "active", secondsLeft: Math.ceil(left / 1000) };
}
