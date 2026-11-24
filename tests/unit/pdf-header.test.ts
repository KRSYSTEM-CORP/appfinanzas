import { describe, expect, it, vi } from "vitest";
import { jsPDF } from "jspdf";
import { renderCompanyHeader } from "@/lib/delivery-note";
import { layoutCompanyName } from "@/lib/pdf-header-layout";

const LONG = "Inversiones y Distribuciones Comerciales Hermanos Rodríguez Pérez de Occidente, C.A.";

// Medidor falso: cada carácter mide 0.5 × tamaño; parte por palabras.
const fake = (text: string, size: number, width: number) => {
  const per = size * 0.5;
  const lines: string[] = [];
  let cur = "";
  for (const w of text.split(" ")) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length * per > width && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  lines.push(cur);
  return lines;
};

describe("layoutCompanyName", () => {
  it("un nombre corto usa el tamaño máximo en una línea", () => {
    expect(layoutCompanyName("Comercial Pruebas", 400, fake)).toEqual({ fontSize: 15, lines: ["Comercial Pruebas"] });
  });
  it("un nombre largo baja el tamaño hasta caber en 2 líneas", () => {
    const r = layoutCompanyName(LONG, 250, fake);
    expect(r.lines.length).toBeLessThanOrEqual(2);
    expect(r.fontSize).toBeLessThan(15);
    expect(r.fontSize).toBeGreaterThanOrEqual(9);
  });
  it("si no cabe ni al mínimo, queda en el mínimo con las líneas necesarias", () => {
    const r = layoutCompanyName(LONG, 80, fake);
    expect(r.fontSize).toBe(9);
    expect(r.lines.length).toBeGreaterThan(2);
  });
  it("nombre vacío no revienta", () => {
    expect(layoutCompanyName("  ", 300, fake).lines.length).toBe(1);
  });
});

describe("renderCompanyHeader", () => {
  it("el nombre queda dentro de los márgenes y devuelve un Y bajo el bloque", async () => {
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const spy = vi.spyOn(doc, "text");
    const endY = await renderCompanyHeader(doc, { name: LONG } as never, 40, 40, 612);
    const [lines, x] = spy.mock.calls[0] as unknown as [string[], number];
    expect(lines.length).toBeLessThanOrEqual(2);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    for (const l of lines) expect(x + doc.getTextWidth(l)).toBeLessThanOrEqual(612 - 40 + 1);
    expect(endY).toBeGreaterThan(40);
  });
});
