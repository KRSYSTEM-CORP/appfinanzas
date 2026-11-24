import { describe, expect, it, vi } from "vitest";
import { jsPDF } from "jspdf";
import { renderCompanyHeader } from "@/lib/delivery-note";

const LONG = "Inversiones Comerciales y Distribuciones Los Andes del Occidente Venezolano, C.A.";

// Captura dónde se dibuja el nombre de la empresa (primer texto en negrita de 13 pt) y lo compara con el borde izquierdo del título.
async function nameRightEdge(title: string | undefined) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const spy = vi.spyOn(doc, "text");
  await renderCompanyHeader(doc, { name: LONG } as never, 40, 40, 612, title);
  const [lines, x] = spy.mock.calls[0] as unknown as [string[] | string, number];
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  const arr = Array.isArray(lines) ? lines : [lines];
  const right = Math.max(...arr.map((l) => x + doc.getTextWidth(l)));
  doc.setFontSize(18);
  const titleLeft = 612 / 2 - doc.getTextWidth(title ?? "NOTA DE ENTREGA") / 2;
  return { right, titleLeft };
}

describe("encabezado de los PDF con nombre de empresa largo", () => {
  it("el nombre no choca con el título «CORTE Z · CIERRE DE CAJA»", async () => {
    const { right, titleLeft } = await nameRightEdge("CORTE Z · CIERRE DE CAJA");
    expect(right).toBeLessThan(titleLeft);
  });
  it("tampoco con «RECIBO DE PAGO DE NÓMINA»", async () => {
    const { right, titleLeft } = await nameRightEdge("RECIBO DE PAGO DE NÓMINA");
    expect(right).toBeLessThan(titleLeft);
  });
  it("sin indicar título sigue usando «NOTA DE ENTREGA»", async () => {
    const { right, titleLeft } = await nameRightEdge(undefined);
    expect(right).toBeLessThan(titleLeft);
  });
});
