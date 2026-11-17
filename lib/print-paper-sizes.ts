import type { PrintPaperSize } from "@prisma/client";

// Drives both the paper-size Select in Settings/the print dialog and the
// @page CSS rule applied when printing (see components/print/PrintDialog.tsx).
// widthMm is null for LETTER/A4 since those use a fixed named page size
// instead of a custom width.
export type PaperSizeOption = {
  code: PrintPaperSize;
  label: string;
  widthMm: number | null;
};

export const PAPER_SIZES: PaperSizeOption[] = [
  { code: "THERMAL_58", label: "Térmica 58mm", widthMm: 58 },
  { code: "THERMAL_80", label: "Térmica 80mm", widthMm: 80 },
  { code: "LETTER", label: "Carta", widthMm: null },
  { code: "A4", label: "A4", widthMm: null },
];

export function getPaperSize(code: PrintPaperSize | null | undefined): PaperSizeOption {
  return PAPER_SIZES.find((p) => p.code === code) ?? PAPER_SIZES[2];
}

export function isThermal(code: PrintPaperSize): boolean {
  return code === "THERMAL_58" || code === "THERMAL_80";
}

// Maps a non-thermal paper size to the jsPDF page format used by
// buildDeliveryNotePDF/buildPaymentReceiptPDF/buildQuotePDF, so the print
// dialog can render (and print) that exact PDF instead of a separate HTML
// approximation. Only meaningful when !isThermal(code) — thermal receipts
// keep their own hand-tuned HTML preview (see PrintDialog.tsx), since there's
// no letter/A4 PDF to compare a narrow receipt roll against.
export function pdfFormatForPaperSize(code: PrintPaperSize): "letter" | "a4" {
  return code === "A4" ? "a4" : "letter";
}

// ── Geometría de impresión compartida ─────────────────────────────────────
// Una sola fuente de verdad para el tamaño de hoja, los márgenes y la
// tipografía de TODO documento que se imprime (ver components/print/PrintFrame
// y lib/print-html.ts). La vista previa y la hoja impresa usan estos mismos
// números, por eso lo impreso es idéntico a lo previsualizado.
export type PrintGeometry = {
  // Ancho de la hoja en mm.
  pageWidthMm: number;
  // Alto fijo de la hoja en mm; null en tickets (el alto se mide del contenido).
  pageHeightMm: number | null;
  // Margen @page en mm (igual en los 4 lados).
  marginMm: number;
  // Tamaño base de fuente en px.
  fontPx: number;
};

const GEOMETRY: Record<PrintPaperSize, PrintGeometry> = {
  THERMAL_58: { pageWidthMm: 58, pageHeightMm: null, marginMm: 2, fontPx: 10 },
  THERMAL_80: { pageWidthMm: 80, pageHeightMm: null, marginMm: 3, fontPx: 11 },
  LETTER: { pageWidthMm: 215.9, pageHeightMm: 279.4, marginMm: 12.7, fontPx: 13 },
  A4: { pageWidthMm: 210, pageHeightMm: 297, marginMm: 12, fontPx: 13 },
};

export function printGeometry(code: PrintPaperSize): PrintGeometry {
  return GEOMETRY[code];
}

// Ancho útil del contenido (hoja menos márgenes), en mm.
export function printContentWidthMm(code: PrintPaperSize): number {
  const g = GEOMETRY[code];
  return +(g.pageWidthMm - 2 * g.marginMm).toFixed(2);
}

// Regla @page para el tamaño elegido. En tickets, `contentHeightMm` (alto
// medido del documento) fija la hoja al largo exacto para que la impresora
// corte justo al final; sin medida se usa `auto`.
export function pageRule(code: PrintPaperSize, contentHeightMm?: number): string {
  const g = GEOMETRY[code];
  const m = g.marginMm;
  if (code === "LETTER") return `@page { size: letter; margin: ${m}mm; }`;
  if (code === "A4") return `@page { size: A4; margin: ${m}mm; }`;
  const h = contentHeightMm != null ? `${Math.ceil(contentHeightMm + 2 * m + 2)}mm` : "auto";
  return `@page { size: ${g.pageWidthMm}mm ${h}; margin: ${m}mm; }`;
}

// Hoja de estilos base del documento impreso (dentro del iframe de impresión).
// En pantalla el cuerpo simula los márgenes con padding; al imprimir el
// padding pasa a 0 porque el margen lo pone @page.
export function printBaseCss(code: PrintPaperSize): string {
  const g = GEOMETRY[code];
  const thermal = isThermal(code);
  return `
html,body{margin:0;background:#fff;color:#000;color-scheme:light;}
body{padding:${g.marginMm}mm;font-size:${g.fontPx}px;box-sizing:border-box;width:${g.pageWidthMm}mm;${
    g.pageHeightMm ? `min-height:${g.pageHeightMm}mm;` : ""
  }-webkit-print-color-adjust:exact;print-color-adjust:exact;overflow-wrap:anywhere;}
#print-root{width:${printContentWidthMm(code)}mm;}
img{max-width:100%;}
tr,.avoid-break,[class*="justify-between"]{break-inside:avoid;page-break-inside:avoid;}
thead{display:table-header-group;}
table{width:100%;}
${thermal ? "table{font-size:inherit;}#print-root .text-xs{font-size:.92em;line-height:1.25;}" : ""}
@media print{body{padding:0;width:auto;min-height:0;}}
`;
}

// Clase raíz de los documentos imprimibles (ticket térmico vs. hoja).
export function printRootClass(code: PrintPaperSize): string {
  if (code === "THERMAL_58") return "font-mono text-[10px] leading-snug";
  if (code === "THERMAL_80") return "font-mono text-[11px] leading-snug";
  return "font-sans text-sm";
}
