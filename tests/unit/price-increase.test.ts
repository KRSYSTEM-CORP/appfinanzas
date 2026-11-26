import { describe, expect, it } from "vitest";
import { canUndoAdjustment, increasePrice, increaseTriple, parsePercentBp, UNDO_WINDOW_MS } from "@/lib/price-increase";

describe("parsePercentBp", () => {
  it("acepta decimales con coma o punto", () => {
    expect(parsePercentBp("10")).toBe(1000);
    expect(parsePercentBp("12,5")).toBe(1250);
    expect(parsePercentBp("0.01")).toBe(1);
    expect(parsePercentBp("100")).toBe(10000);
    expect(parsePercentBp("7,5 %")).toBe(750);
  });
  it("rechaza fuera de rango o mal formado", () => {
    for (const v of ["0", "0,001", "100,01", "101", "-5", "abc", "", "1,234"]) expect(parsePercentBp(v)).toBeNull();
  });
});

describe("increasePrice", () => {
  it("redondea al céntimo con mitad hacia arriba", () => {
    expect(increasePrice(1000, 1000)).toBe(1100);
    expect(increasePrice(999, 1000)).toBe(1099); // 1098,9
    expect(increasePrice(1005, 1000)).toBe(1106); // 1105,5 sube
    expect(increasePrice(333, 1500)).toBe(383); // 382,95
  });
  it("redondea al 0,05 y al 0,10 más cercano", () => {
    expect(increasePrice(1000, 1250, "0.05")).toBe(1125);
    expect(increasePrice(1013, 1000, "0.05")).toBe(1115); // 1114,3 -> 1114 -> 1115
    expect(increasePrice(1013, 1000, "0.10")).toBe(1110);
    expect(increasePrice(1025, 1000, "0.10")).toBe(1130); // 1127,5 -> 1128 -> 1130
  });
  it("no toca precios vacíos o en cero", () => {
    expect(increasePrice(0, 1000)).toBe(0);
    expect(increaseTriple({ p: 1000, w: null, b: 800 }, 1000, "CENT")).toEqual({ p: 1100, w: null, b: 880 });
  });
});

describe("canUndoAdjustment", () => {
  const now = new Date("2026-11-26T12:00:00Z");
  it("solo dentro de 24 h y si no se deshizo", () => {
    expect(canUndoAdjustment({ createdAt: new Date(now.getTime() - 3600_000), undoneAt: null }, now)).toBe(true);
    expect(canUndoAdjustment({ createdAt: new Date(now.getTime() - UNDO_WINDOW_MS - 1), undoneAt: null }, now)).toBe(false);
    expect(canUndoAdjustment({ createdAt: now, undoneAt: now }, now)).toBe(false);
  });
});
