import { describe, expect, it } from "vitest";
import { monthProgressLabel, selectionLabel, shortDay } from "@/lib/period-label";
import { bsOf, money, pct } from "@/lib/money-display";
import { ADMIN_GROUPS, statementTab } from "@/lib/admin-nav";

describe("periodo", () => {
  it("etiqueta del mes en curso", () => {
    expect(monthProgressLabel("2026-11-18")).toBe("Noviembre · día 18 de 30");
    expect(monthProgressLabel("2028-02-03")).toBe("Febrero · día 3 de 29");
  });
  it("etiquetas de cada tipo de selección", () => {
    expect(selectionLabel({ kind: "preset", preset: "month" }, "2026-11-18")).toBe("Noviembre · día 18 de 30");
    expect(selectionLabel({ kind: "preset", preset: "today" }, "2026-11-18")).toBe("Hoy · 18 nov");
    expect(selectionLabel({ kind: "preset", preset: "7d" }, "2026-11-18")).toBe("Últimos 7 días");
    expect(selectionLabel({ kind: "months", year: 2026, months: [10] }, "2026-11-18")).toBe("Octubre 2026");
    expect(selectionLabel({ kind: "months", year: 2026, months: [9, 10] }, "2026-11-18")).toBe("2 meses de 2026");
    expect(selectionLabel({ kind: "range", from: "2026-11-01", to: "2026-11-15" }, "2026-11-18")).toBe("1 nov – 15 nov");
    expect(shortDay("2026-12-01")).toBe("1 dic");
  });
});

describe("montos", () => {
  it("formatea como la preview", () => {
    expect(money("USD", 112000)).toBe("$1.120,00");
    expect(money("USD", 482000, 0)).toBe("$4.820");
    expect(money("USD", -15000)).toBe("−$150,00");
    expect(money("VES", 100524300, 0)).toBe("Bs 1.005.243");
    expect(bsOf(112000, 897.54)).toBe("Bs 1.005.245");
    expect(bsOf(100, null)).toBeNull();
    expect(pct(1120, 4820)).toBe("23,2 %");
    expect(pct(1, 0)).toBe("0,0 %");
  });
});

describe("navegación de Administración", () => {
  it("tiene los cinco grupos de la preview en orden", () => {
    expect(ADMIN_GROUPS.map((g) => g.label)).toEqual(["Balance", "Cuentas Bancarias", "Compras", "Consumo Interno", "Contabilidad"]);
    expect(ADMIN_GROUPS[4].subs.map((s) => s.label)).toEqual([
      "Movimientos",
      "Estado de resultados",
      "Situación financiera",
      "Análisis de costo",
      "Nómina",
      "Libro de ventas",
      "Libro de compras",
      "Resumen de IVA",
    ]);
  });
  it("normaliza la pestaña de Contabilidad", () => {
    expect(statementTab("sit")).toBe("sit");
    expect(statementTab("x")).toBe("mov");
    expect(statementTab(undefined)).toBe("mov");
  });
});
