import { describe, expect, it } from "vitest";
import {
  areaPath,
  currencySymbol,
  deltaPct,
  monthProjection,
  periodLabel,
  signedPct,
  hourLabel,
  hourTotals,
  inventoryDays,
  marginTone,
  paretoRows,
  peakWindow,
  percentOf,
  periodDays,
  rotationStatus,
  seriesPoints,
  smoothPath,
  ticketBucketLabels,
  ticketHistogram,
  waterfallSteps,
  weekdayTotals,
} from "@/lib/stats-view";

describe("waterfallSteps", () => {
  it("baja escalón por escalón y termina en la utilidad", () => {
    const s = waterfallSteps(1000, 400, 200, 30);
    expect(s.map((x) => x.label)).toEqual(["Ventas", "Costo", "Gastos", "Comisión", "Utilidad"]);
    expect(s[1]).toMatchObject({ value: -400, from: 600, to: 1000, kind: "down" });
    expect(s[2]).toMatchObject({ from: 400, to: 600 });
    expect(s[3]).toMatchObject({ from: 370, to: 400 });
    expect(s[4]).toMatchObject({ value: 370, from: 0, to: 370, kind: "final" });
  });
  it("utilidad negativa queda por debajo de cero", () => {
    const s = waterfallSteps(100, 80, 50, 0);
    expect(s[4]).toMatchObject({ value: -30, from: -30, to: 0 });
  });
});

describe("paretoRows", () => {
  it("marca la clase A hasta cruzar el 80 %", () => {
    const { rows, total, crossIndex } = paretoRows([{ v: 10 }, { v: 50 }, { v: 30 }, { v: 10 }], (x) => x.v);
    expect(total).toBe(100);
    expect(rows.map((r) => r.value)).toEqual([50, 30, 10, 10]);
    expect(crossIndex).toBe(1);
    expect(rows.map((r) => r.inA)).toEqual([true, true, false, false]);
    expect(rows[3].cumPct).toBeCloseTo(1);
  });
  it("orden ascendente y total cero", () => {
    expect(paretoRows([{ v: 3 }, { v: 1 }], (x) => x.v, "asc").rows[0].value).toBe(1);
    const empty = paretoRows([{ v: 0 }], (x) => x.v);
    expect(empty.crossIndex).toBe(-1);
    expect(empty.rows[0].inA).toBe(false);
  });
});

describe("ticket histogram", () => {
  it("etiquetas con el símbolo", () => {
    expect(ticketBucketLabels("$")).toEqual(["$0-10", "$10-20", "$20-30", "$30-50", "$50-80", "$80+"]);
  });
  it("rellena tramos y halla el par más denso", () => {
    const h = ticketHistogram([
      { bucket: 1, count: 28 },
      { bucket: 2, count: 26 },
      { bucket: 0, count: 12 },
      { bucket: 9, count: 5 },
    ]);
    expect(h.counts).toEqual([12, 28, 26, 0, 0, 0]);
    expect(h.total).toBe(66);
    expect(h.densest).toEqual({ start: 1, pct: 82 });
    expect(ticketHistogram([]).densest).toBeNull();
  });
});

describe("ritmo semanal y por hora", () => {
  const cells = [
    { dow: 4, hour: 17, count: 10 },
    { dow: 4, hour: 18, count: 8 },
    { dow: 0, hour: 9, count: 2 },
    { dow: 6, hour: 22, count: 4 },
  ];
  it("suma por día y por hora", () => {
    expect(weekdayTotals(cells)).toEqual([2, 0, 0, 0, 18, 0, 4]);
    const h = hourTotals(cells);
    expect(h).toHaveLength(13);
    expect(h[9]).toBe(10);
    expect(h[1]).toBe(2);
  });
  it("encuentra la franja pico", () => {
    const p = peakWindow(hourTotals(cells));
    expect(p?.start).toBe(17);
    expect(p?.end).toBe(19);
    expect(p!.ratio).toBeGreaterThan(1);
    expect(peakWindow([0, 0, 0])).toBeNull();
  });
  it("etiqueta de hora", () => {
    expect(hourLabel(9)).toBe("9 a. m.");
    expect(hourLabel(12)).toBe("12 m.");
    expect(hourLabel(17)).toBe("5 p. m.");
  });
});

describe("rotación", () => {
  it("días del periodo sin pasar de hoy", () => {
    const start = new Date("2026-11-01T04:00:00Z");
    const end = new Date("2026-12-01T04:00:00Z");
    expect(periodDays([{ start, end }], new Date("2026-11-11T04:00:00Z"))).toBe(10);
    expect(periodDays([], new Date())).toBe(1);
  });
  it("días de inventario y estado", () => {
    expect(inventoryDays(20, 30, 30)).toBe(20);
    expect(inventoryDays(5, 0, 30)).toBe(999);
    expect(rotationStatus(3)).toEqual({ tone: "bad", label: "Reponer" });
    expect(rotationStatus(15).label).toBe("Vigilar");
    expect(rotationStatus(40).label).toBe("Cubierto");
  });
});

describe("periodo", () => {
  const today = { year: 2026, month: 11, day: 18 };
  it("etiquetas", () => {
    expect(periodLabel({ kind: "preset", preset: "month" }, today)).toBe("Noviembre · día 18 de 30");
    expect(periodLabel({ kind: "preset", preset: "7d" }, today)).toBe("Últimos 7 días");
    expect(periodLabel({ kind: "months", year: 2026, months: [3] }, today)).toBe("Marzo 2026");
    expect(periodLabel({ kind: "months", year: 2026, months: [3, 4] }, today)).toBe("2 meses de 2026");
  });
  it("proyección y formato", () => {
    expect(monthProjection(1800, today)).toBe(3000);
    expect(signedPct(12.4)).toBe("+12,4 %");
    expect(signedPct(-8)).toBe("−8 %");
    expect(currencySymbol("EUR")).toBe("€");
  });
});

describe("utilidades", () => {
  it("tono de margen por tercios", () => {
    expect([0, 1, 2, 3, 4, 5].map((i) => marginTone(i, 6))).toEqual(["ok", "ok", "brand", "brand", "warn", "warn"]);
  });
  it("porcentajes y variación", () => {
    expect(percentOf(34, 125)).toBe(27.2);
    expect(percentOf(1, 0)).toBe(0);
    expect(deltaPct(1124, 1000)).toBe(12.4);
    expect(deltaPct(5, 0)).toBeNull();
  });
  it("rutas del área", () => {
    const pts = seriesPoints([0, 10, 5], 100, 50);
    expect(pts[0]).toEqual([0, 50]);
    expect(pts[1]).toEqual([50, 0]);
    expect(smoothPath(pts).startsWith("M0,50 C")).toBe(true);
    expect(areaPath(pts, 50).endsWith("Z")).toBe(true);
    expect(smoothPath([])).toBe("");
  });
});
