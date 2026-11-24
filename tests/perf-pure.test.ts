import { describe, expect, it, vi } from "vitest";
import { syncBackoffMs } from "@/lib/offline/backoff";
import { createCoalescer } from "@/lib/coalesce";

describe("syncBackoffMs", () => {
  it("crece y respeta el tope", () => {
    expect(syncBackoffMs(0)).toBe(2000);
    expect(syncBackoffMs(1)).toBe(4000);
    expect(syncBackoffMs(3)).toBe(16000);
    expect(syncBackoffMs(10)).toBe(60000);
    expect(syncBackoffMs(-5)).toBe(2000);
  });
});

describe("createCoalescer", () => {
  it("agrupa llamadas seguidas en una", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const c = createCoalescer(fn, 400);
    c.trigger();
    c.trigger();
    c.trigger();
    vi.advanceTimersByTime(400);
    expect(fn).toHaveBeenCalledTimes(1);
    c.trigger();
    c.cancel();
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
