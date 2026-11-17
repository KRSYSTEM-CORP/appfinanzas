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
  THERMAL_58: { pageWidthMm: 58, pageHeightMm: null, marginMm: 2, fontPx: 11 },
  THERMAL_80: { pageWidthMm: 80, pageHeightMm: null, marginMm: 3, fontPx: 12 },
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

// Regla @page. El margen de @page SIEMPRE es 0: con margen > 0 el navegador
// dibuja en ese margen la fecha, el título y la URL. Los márgenes visuales van
// como padding del documento (ver printBaseCss / printShellHtml).
// Tickets: `totalHeightMm` es el alto MEDIDO del documento completo (con su
// padding); la hoja se fija a ese alto exacto (+1 mm de holgura) para que no
// haya blanco ni página extra. Carta/A4: tamaño nombrado.
export function pageRule(code: PrintPaperSize, totalHeightMm?: number): string {
  const g = GEOMETRY[code];
  if (code === "LETTER") return "@page { size: letter; margin: 0; }";
  if (code === "A4") return "@page { size: A4; margin: 0; }";
  const h = totalHeightMm != null ? `${printPageHeightMm(totalHeightMm)}mm` : "auto";
  return `@page { size: ${g.pageWidthMm}mm ${h}; margin: 0; }`;
}

// Alto de hoja (mm) para un ticket cuyo documento mide `totalHeightMm`.
export function printPageHeightMm(totalHeightMm: number): number {
  return Math.ceil(totalHeightMm) + 1;
}

// Estructura base del documento dentro del iframe. En carta/A4 el contenido va
// dentro de una tabla con cabecera y pie vacíos: se repiten en cada página y
// dan el margen superior/inferior sin usar márgenes de @page. En tickets basta
// el padding del body.
export function printShellHtml(code: PrintPaperSize): string {
  if (isThermal(code)) return '<div id="print-root"></div>';
  const m = GEOMETRY[code].marginMm;
  const sp = `<div style="height:${m}mm"></div>`;
  return `<table class="print-shell"><thead><tr><td>${sp}</td></tr></thead><tbody><tr><td><div id="print-root"></div></td></tr></tbody><tfoot><tr><td>${sp}</td></tr></tfoot></table>`;
}

// Hoja de estilos base del documento impreso (dentro del iframe de impresión).
// Garantiza: texto negro puro y grueso, tamaños mínimos legibles, líneas
// negras sólidas, nada que se desborde y títulos centrados.
export function printBaseCss(code: PrintPaperSize, totalHeightMm?: number): string {
  const g = GEOMETRY[code];
  const thermal = isThermal(code);
  const w = printContentWidthMm(code);
  const fixedH = thermal && totalHeightMm != null ? `height:${printPageHeightMm(totalHeightMm)}mm;overflow:hidden;` : "";
  const body = 600;
  const strong = 800;
  const small = thermal ? "1em" : "11.5px";
  return `
*{box-sizing:border-box;}
html,body{margin:0;background:#fff;color:#000;color-scheme:light;}
body{padding:${thermal ? `${g.marginMm}mm` : `0 ${g.marginMm}mm`};width:${g.pageWidthMm}mm;font-size:${g.fontPx}px;font-weight:${body};${fixedH}-webkit-print-color-adjust:exact;print-color-adjust:exact;-webkit-font-smoothing:auto;text-rendering:optimizeLegibility;}
.print-shell{width:100%;border-collapse:collapse;table-layout:fixed;}
.print-shell>thead,.print-shell>tfoot{display:table-header-group;}
.print-shell>tfoot{display:table-footer-group;}
.print-shell>thead>tr>td,.print-shell>tfoot>tr>td,.print-shell>tbody>tr>td{padding:0;}
#print-root{width:${w}mm;margin:0 auto;color:#000;font-weight:${body};line-height:1.3;}
#print-root,#print-root *{color:#000!important;opacity:1!important;text-shadow:none!important;overflow-wrap:anywhere;word-break:break-word;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
#print-root *{min-width:0;background-color:transparent!important;border-color:#000!important;border-style:solid!important;border-width:0;}
#print-root .text-center{text-align:center;}
#print-root .text-right{text-align:right;}
#print-root strong,#print-root b,#print-root th,#print-root .font-bold,#print-root .font-semibold{font-weight:${strong}!important;}
#print-root .font-medium{font-weight:${thermal ? 700 : 600}!important;}
#print-root .text-xs,#print-root [class*="text-["]{font-size:${small}!important;}
#print-root .text-sm{font-size:1em!important;}
#print-root .print-title{font-size:${thermal ? "1.2em" : "1.25em"}!important;font-weight:${strong}!important;text-align:center;}
#print-root [class*="border-t"],#print-root [class*="border-b"]{border-width:0;}
#print-root .border-t{border-top-width:1px;}
#print-root .border-b{border-bottom-width:1px;}
#print-root [class*="justify-between"]{display:flex;justify-content:space-between;align-items:baseline;gap:6px;}
#print-root [class*="justify-between"]>:first-child{flex:1 1 auto;min-width:0;}
#print-root [class*="justify-between"]>:last-child{flex:0 0 auto;text-align:right;white-space:nowrap;overflow-wrap:normal;word-break:normal;}
#print-root img{max-width:100%;}
#print-root table{width:100%;table-layout:fixed;border-collapse:collapse;}
#print-root th,#print-root td{padding:2px 3px;vertical-align:top;}
#print-root th:first-child,#print-root td:first-child{width:11%;}
#print-root th:nth-last-child(-n+2),#print-root td:nth-last-child(-n+2){width:22%;}
#print-root thead{display:table-header-group;}
#print-root tbody tr,.avoid-break,#print-root [class*="justify-between"]{break-inside:avoid;page-break-inside:avoid;}
`;
}

// Clase raíz de los documentos imprimibles (ticket térmico vs. hoja). Los
// tamaños de fuente salen de printBaseCss, no de clases.
export function printRootClass(code: PrintPaperSize): string {
  return isThermal(code) ? "font-mono leading-snug" : "font-sans";
}
