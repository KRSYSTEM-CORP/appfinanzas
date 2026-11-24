// Agrupa muchas llamadas seguidas en una sola ejecución al final de la
// ventana `waitMs` (trailing). Lógica pura, con temporizadores inyectables.
export function createCoalescer(
  fn: () => void,
  waitMs: number,
  timers: { set: (cb: () => void, ms: number) => unknown; clear: (h: unknown) => void } = {
    set: (cb, ms) => setTimeout(cb, ms),
    clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  }
) {
  let handle: unknown = null;
  return {
    trigger() {
      if (handle != null) return;
      handle = timers.set(() => {
        handle = null;
        fn();
      }, waitMs);
    },
    cancel() {
      if (handle != null) timers.clear(handle);
      handle = null;
    },
  };
}
