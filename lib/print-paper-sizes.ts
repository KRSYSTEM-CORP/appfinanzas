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
