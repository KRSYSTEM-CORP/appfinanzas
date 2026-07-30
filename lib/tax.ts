import type { TaxCategory } from "@prisma/client";

// Venezuelan IVA is always shown tax-INCLUSIVE in this app — a product's
// priceCents is the sticker/final price the customer actually pays, matching
// how Venezuelan retail already works. So this module never adds tax on top
// of an existing subtotal; it only DECOMPOSES an already-fixed,
// tax-inclusive amount into base imponible + IVA, purely for the Libro de
// Compras/Ventas SENIAT report and a properly-broken-down Factura. Checkout
// math (Sale.totalCents, Purchase.totalCents) is completely unaffected.
export function decomposeTax(
  amountCents: number,
  taxCategory: TaxCategory,
  ratePercent: number
): { baseCents: number; taxCents: number } {
  if (taxCategory === "EXEMPT" || ratePercent <= 0) {
    return { baseCents: amountCents, taxCents: 0 };
  }
  const baseCents = Math.round(amountCents / (1 + ratePercent / 100));
  return { baseCents, taxCents: amountCents - baseCents };
}

// Resolves which of a company's configured IVA rates applies to a given tax
// category (see Company.ivaGeneralRatePercent/ivaReducedRatePercent).
export function rateForCategory(
  taxCategory: TaxCategory,
  generalRatePercent: number,
  reducedRatePercent: number
): number {
  if (taxCategory === "EXEMPT") return 0;
  if (taxCategory === "REDUCED") return reducedRatePercent;
  return generalRatePercent;
}

export const TAX_CATEGORY_LABELS: Record<TaxCategory, string> = {
  GENERAL: "Gravado (general)",
  REDUCED: "Gravado (reducido)",
  EXEMPT: "Exento",
};

// Short Spanish word for the Excel "IVA" column — deliberately different from
// TAX_CATEGORY_LABELS above (which has parentheses) so exporting a product
// list and re-importing it round-trips cleanly through the word map in
// lib/validations.ts's TaxCategoryEnum preprocessor.
export const TAX_CATEGORY_EXPORT_LABELS: Record<TaxCategory, string> = {
  GENERAL: "General",
  REDUCED: "Reducido",
  EXEMPT: "Exento",
};
