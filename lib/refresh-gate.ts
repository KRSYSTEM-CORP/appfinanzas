// Compuerta de refrescos: agrupa avisos (trailing), exige un hueco mínimo entre
// refrescos y NO refresca mientras la pestaña/app está oculta (en segundo plano
// el WebView del teléfono se congela; al volver se hace UN solo refresco).
// Lógica pura con relojes inyectables para poder probarla.
export type RefreshGateDeps = {
  run: () => void;
  waitMs: number;
  minGapMs: number;
  isVisible: () => boolean;
  now?: () => number;
  timers?: { set: (cb: () => void, ms: number) => unknown; clear: (h: unknown) => void };
};

export function createRefreshGate(deps: RefreshGateDeps) {
  const now = deps.now ?? (() => Date.now());
  const timers = deps.timers ?? {
    set: (cb: () => void, ms: number) => setTimeout(cb, ms),
    clear: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>),
  };
  let handle: unknown = null;
  let dirty = false;
  let lastRun = -Infinity;

  const fire = () => {
    handle = null;
    if (!deps.isVisible()) return; // queda `dirty`; se atiende al volver
    dirty = false;
    lastRun = now();
    deps.run();
  };

  const schedule = () => {
    if (handle != null) return;
    const gap = Math.max(0, lastRun + deps.minGapMs - now());
    handle = timers.set(fire, Math.max(deps.waitMs, gap));
  };

  return {
    trigger() {
      dirty = true;
      if (!deps.isVisible()) return;
      schedule();
    },
    onVisible() {
      if (dirty) schedule();
    },
    cancel() {
      if (handle != null) timers.clear(handle);
      handle = null;
      dirty = false;
    },
  };
}
