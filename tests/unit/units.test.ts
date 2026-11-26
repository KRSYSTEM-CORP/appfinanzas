import { describe, expect, it } from "vitest";
import {
  addQty,
  convertQty,
  formatQty,
  formatQtyCompact,
  formatQtyUnit,
  formatStock,
  lineTotalCents,
  normalizeUnitInput,
  parseUnit,
  sellableUnits,
  subQty,
  toBaseQty,
  toMilli,
  toQty,
  validateQty,
} from "@/lib/units";
import { restockPlan } from "@/lib/restock";

describe("catálogo y alias en español", () => {
  it("reconoce nombres, plurales y abreviaturas", () => {
    expect(parseUnit("ml")).toBe("mililitro");
    expect(parseUnit("mL")).toBe("mililitro");
    expect(parseUnit("Litro")).toBe("litro");
    expect(parseUnit("lt")).toBe("litro");
    expect(parseUnit("L")).toBe("litro");
    expect(parseUnit("KG")).toBe("kilogramo");
    expect(parseUnit("g")).toBe("gramo");
    expect(parseUnit("galón")).toBe("galon");
    expect(parseUnit("pza")).toBe("pieza");
    expect(parseUnit("Piezas")).toBe("pieza");
    expect(parseUnit("unidades")).toBe("unidad");
    expect(parseUnit("  Docena ")).toBe("docena");
  });
  it("no adivina unidades desconocidas", () => {
    expect(parseUnit("furlong")).toBeNull();
    expect(parseUnit("")).toBeNull();
    expect(parseUnit(null)).toBeNull();
  });
  it("«otra» exige etiqueta", () => {
    expect(normalizeUnitInput({ unit: "otra" }).ok).toBe(false);
    expect(normalizeUnitInput({ unit: "otra", unitLabel: " rollo " })).toEqual({ ok: true, unit: "otra", unitLabel: "rollo" });
    expect(normalizeUnitInput({ unit: "litro", unitLabel: "x" })).toEqual({ ok: true, unit: "litro", unitLabel: null });
    expect(normalizeUnitInput({})).toEqual({ ok: true, unit: "unidad", unitLabel: null });
  });
  it("las unidades de conteo solo se venden en su propia unidad", () => {
    expect(sellableUnits("unidad").map((u) => u.key)).toEqual(["unidad"]);
    expect(sellableUnits("litro").map((u) => u.key)).toEqual(["litro", "mililitro", "galon"]);
  });
});

describe("conversión y redondeo", () => {
  it("500 ml = 0,5 L y 2 L = 2 L", () => {
    expect(convertQty(500, "mililitro", "litro")).toBe(0.5);
    expect(convertQty(2, "litro", "litro")).toBe(2);
    expect(convertQty(250, "gramo", "kilogramo")).toBe(0.25);
    expect(convertQty(1, "litro", "mililitro")).toBe(1000);
  });
  it("no mezcla familias", () => {
    expect(() => convertQty(1, "litro", "kilogramo")).toThrow();
  });
  it("suma y resta sin error de coma flotante", () => {
    expect(addQty(0.1, 0.2)).toBe(0.3);
    expect(subQty(1, 0.9)).toBe(0.1);
    expect(toMilli(0.0005)).toBe(1);
    expect(toQty("1,25")).toBe(1.25);
  });
  it("total de línea = precio × cantidad redondeado al céntimo", () => {
    expect(lineTotalCents(250, 0.5)).toBe(125);
    expect(lineTotalCents(333, 0.333)).toBe(111); // 110.889 -> 111
    expect(lineTotalCents(100, 3)).toBe(300);
    expect(lineTotalCents(1, 0.5)).toBe(1); // 0,5 céntimos redondea hacia arriba
  });
});

describe("validación de cantidades", () => {
  it("unidades enteras rechazan decimales", () => {
    expect(validateQty(1.5, "unidad").ok).toBe(false);
    expect(validateQty(2, "unidad")).toEqual({ ok: true, qty: 2 });
  });
  it("las unidades con decimales aceptan hasta 3", () => {
    expect(validateQty(0.5, "litro")).toEqual({ ok: true, qty: 0.5 });
    expect(validateQty(0.0004, "litro").ok).toBe(false);
  });
  it("rechaza cero, negativos y NaN", () => {
    expect(validateQty(0, "litro").ok).toBe(false);
    expect(validateQty(-1, "litro").ok).toBe(false);
    expect(validateQty("abc", "litro").ok).toBe(false);
    expect(validateQty(0, "litro", { allowZero: true }).ok).toBe(true);
  });
  it("toBaseQty convierte la cantidad escrita a la unidad base", () => {
    expect(toBaseQty(500, "mililitro", "litro")).toEqual({ ok: true, qty: 0.5 });
    expect(toBaseQty(2, "litro", "litro")).toEqual({ ok: true, qty: 2 });
    expect(toBaseQty(2, undefined, "unidad")).toEqual({ ok: true, qty: 2 });
    expect(toBaseQty(1.5, undefined, "unidad").ok).toBe(false);
    expect(toBaseQty(1, "mililitro", "unidad").ok).toBe(false);
    expect(toBaseQty(1, "kilogramo", "litro").ok).toBe(false);
    expect(toBaseQty(0.4, "mililitro", "litro").ok).toBe(false); // 0,0004 L no cabe en milésimas
  });
});

describe("presentación", () => {
  it("muestra cantidad con su unidad", () => {
    expect(formatQty(0.5)).toBe("0,5");
    expect(formatQtyUnit(0.5, "litro")).toBe("0,5 L");
    expect(formatQtyUnit(2, "unidad")).toBe("2 unidades");
    expect(formatQtyUnit(1, "unidad")).toBe("1 unidad");
    expect(formatQtyUnit(3, "otra", "rollo")).toBe("3 rollo");
    expect(formatQtyUnit(250, "mililitro")).toBe("250 ml");
  });
  it("modo compacto conserva «2» para unidades", () => {
    expect(formatQtyCompact(2, "unidad")).toBe("2");
    expect(formatQtyCompact(2, undefined)).toBe("2");
    expect(formatQtyCompact(1.5, "kilogramo")).toBe("1,5 kg");
    expect(formatStock(5, "unidad")).toBe("5 und.");
    expect(formatStock(5, "caja")).toBe("5 cajas");
  });
});

describe("reposición con decimales", () => {
  it("pide fracciones si la unidad admite decimales", () => {
    const p = restockPlan({ sold: 10.5, activeDays: 30, stock: 0.25, minStock: 1, decimals: true });
    expect(p.need).toBeCloseTo(p.ideal - 0.25, 3);
    const q = restockPlan({ sold: 10, activeDays: 30, stock: 0, minStock: 1 });
    expect(Number.isInteger(q.need)).toBe(true);
  });
});
