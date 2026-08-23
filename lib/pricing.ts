// Quantity-based price tiers ("al detal" / "al mayor" / "al gran mayor") —
// optional per product (Product.priceTiersEnabled). Each tier only kicks in
// once BOTH its price and its minimum quantity are configured; a business
// can define just "mayor" without "gran mayor". Tiers are checked from the
// top down (gran mayor first) since each one's range implicitly ends where
// the next one starts (e.g. 0–50 detal, 51–99 mayor, 100+ gran mayor) — no
// explicit upper bound is stored, only where each tier begins.
export type PriceTier = "RETAIL" | "WHOLESALE" | "BULK";

export type TieredProduct = {
  priceCents: number;
  priceTiersEnabled: boolean;
  wholesalePriceCents: number | null;
  wholesaleMinQty: number | null;
  bulkPriceCents: number | null;
  bulkMinQty: number | null;
};

// The tier that quantity alone would select — ignores any manual override.
export function resolveTierPrice(product: TieredProduct, quantity: number): { tier: PriceTier; priceCents: number } {
  if (product.priceTiersEnabled) {
    if (product.bulkPriceCents != null && product.bulkMinQty != null && quantity >= product.bulkMinQty) {
      return { tier: "BULK", priceCents: product.bulkPriceCents };
    }
    if (
      product.wholesalePriceCents != null &&
      product.wholesaleMinQty != null &&
      quantity >= product.wholesaleMinQty
    ) {
      return { tier: "WHOLESALE", priceCents: product.wholesalePriceCents };
    }
  }
  return { tier: "RETAIL", priceCents: product.priceCents };
}

// The price for one specific tier, if the product actually has it configured
// (used when the seller manually overrides the auto-detected tier) — null if
// that tier isn't defined for this product, so the caller can fall back to
// the quantity-based resolution instead of silently charging the wrong price.
export function tierPriceCents(product: TieredProduct, tier: PriceTier): number | null {
  if (tier === "RETAIL") return product.priceCents;
  if (!product.priceTiersEnabled) return null;
  if (tier === "WHOLESALE") return product.wholesalePriceCents;
  return product.bulkPriceCents;
}

export const PRICE_TIER_LABELS: Record<PriceTier, string> = {
  RETAIL: "Detal",
  WHOLESALE: "Mayor",
  BULK: "Gran mayor",
};
