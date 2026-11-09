import { describe, expect, it } from "vitest";
import {
  comparisonWindows,
  dateRangeSelectionToQuery,
  isValidRange,
  parseDateRangeSelection,
  selectionToWindows,
} from "@/lib/report-types";

describe("rango con calendario", () => {
  it("valida fechas reales, en orden y de a lo sumo un año", () => {
    expect(isValidRange("2026-11-01", "2026-11-09")).toBe(true);
    expect(isValidRange("2026-11-09", "2026-11-09")).toBe(true); // un solo día
    expect(isValidRange("2026-11-09", "2026-11-01")).toBe(false); // al revés
    expect(isValidRange("2026-02-30", "2026-03-01")).toBe(false); // fecha inexistente
    expect(isValidRange("2026-1-01", "2026-11-09")).toBe(false); // formato
    expect(isValidRange("2025-01-01", "2026-06-01")).toBe(false); // más de un año
    expect(isValidRange("2026-01-01", "2026-12-31")).toBe(true); // 365 días
  });

  it("la ventana va de la medianoche de Venezuela del primer día a la del día siguiente al último", () => {
    const [w] = selectionToWindows({ kind: "range", from: "2026-11-03", to: "2026-11-05" });
    expect(w.start.toISOString()).toBe("2026-11-03T04:00:00.000Z"); // 00:00 VE = 04:00 UTC
    expect(w.end.toISOString()).toBe("2026-11-06T04:00:00.000Z");
    expect(w.end.getTime() - w.start.getTime()).toBe(3 * 86_400_000);
  });

  it("se compara contra el periodo anterior de la misma duración", () => {
    const c = comparisonWindows({ kind: "range", from: "2026-11-03", to: "2026-11-05" })!;
    expect(c.windows[0].end.toISOString()).toBe("2026-11-03T04:00:00.000Z");
    expect(c.windows[0].start.toISOString()).toBe("2026-10-31T04:00:00.000Z");
    expect(c.label).toBe("vs el periodo anterior");
  });

  it("va y vuelve por la dirección (?range=range&from=&to=)", () => {
    const sel = { kind: "range" as const, from: "2026-11-03", to: "2026-11-05" };
    const q = dateRangeSelectionToQuery(sel);
    expect(q).toEqual({ range: "range", from: "2026-11-03", to: "2026-11-05" });
    expect(parseDateRangeSelection(q)).toEqual(sel);
  });

  it("un rango inválido o incompleto cae al valor por defecto", () => {
    const fb = { kind: "preset" as const, preset: "7d" as const };
    expect(parseDateRangeSelection({ range: "range", from: "2026-11-09", to: "2026-11-01" }, fb)).toEqual(fb);
    expect(parseDateRangeSelection({ range: "range", from: "2026-11-09" }, fb)).toEqual(fb);
    expect(parseDateRangeSelection({ range: "range", from: "malo", to: "peor" }, fb)).toEqual(fb);
  });
});
