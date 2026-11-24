import { describe, expect, it } from "vitest";
import { createRefreshGate } from "@/lib/refresh-gate";

function setup(visible = true) {
  let t = 0;
  const q: { at: number; cb: () => void; id: number }[] = [];
  let id = 0;
  const state = { visible, runs: 0 };
  const gate = createRefreshGate({
    run: () => void state.runs++,
    waitMs: 400,
    minGapMs: 1500,
    isVisible: () => state.visible,
    now: () => t,
    timers: {
      set: (cb, ms) => {
        q.push({ at: t + ms, cb, id: ++id });
        return id;
      },
      clear: (h) => {
        const i = q.findIndex((x) => x.id === h);
        if (i >= 0) q.splice(i, 1);
      },
    },
  });
  const advance = (ms: number) => {
    const end = t + ms;
    for (;;) {
      q.sort((a, b) => a.at - b.at);
      if (!q.length || q[0].at > end) break;
      const n = q.shift()!;
      t = n.at;
      n.cb();
    }
    t = end;
  };
  return { gate, state, advance };
}

describe("createRefreshGate", () => {
  it("agrupa avisos seguidos en un refresco", () => {
    const { gate, state, advance } = setup();
    gate.trigger();
    gate.trigger();
    advance(400);
    expect(state.runs).toBe(1);
  });
  it("respeta el hueco mínimo entre refrescos", () => {
    const { gate, state, advance } = setup();
    gate.trigger();
    advance(400);
    gate.trigger();
    advance(400);
    expect(state.runs).toBe(1);
    advance(1200);
    expect(state.runs).toBe(2);
  });
  it("no refresca oculto y refresca una vez al volver", () => {
    const { gate, state, advance } = setup(false);
    gate.trigger();
    gate.trigger();
    advance(5000);
    expect(state.runs).toBe(0);
    state.visible = true;
    gate.onVisible();
    advance(400);
    expect(state.runs).toBe(1);
  });
  it("cancel descarta lo pendiente", () => {
    const { gate, state, advance } = setup();
    gate.trigger();
    gate.cancel();
    advance(5000);
    expect(state.runs).toBe(0);
  });
});
