import type { QuoteForPdf } from "@/lib/quote-pdf";

export function quoteControlNumberLabel(quote: Pick<QuoteForPdf, "id" | "controlNumber">): string {
  return quote.controlNumber != null
    ? String(quote.controlNumber).padStart(6, "0")
    : quote.id.slice(-8).toUpperCase();
}

