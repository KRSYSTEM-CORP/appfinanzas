"use client";

import { useState } from "react";
import type { Product } from "@prisma/client";
import type { CartLine } from "@/components/pos/Cart";
import { resolveTierPrice, tierPriceCents, type PriceTier, type TieredProduct } from "@/lib/pricing";

// Pure cart-line state (add/remove/quantity/price-tier) — no online/offline
// branching of any kind, which is exactly why it's shared between PosClient
// (online) and PosOfflineClient (offline): both need identical add-to-cart
// behavior, and duplicating this by hand would be the one place a hand-copy
// could silently drift.
export function useCart(initialLines: CartLine[] = []) {
  const [lines, setLines] = useState<CartLine[]>(initialLines);

  // Unlimited for a product that doesn't track stock — there's no count to
  // cap against.
  function maxStockFor(product: Product): number {
    return product.trackStock ? product.stock : Infinity;
  }

  // The price a line should show for its current quantity: the seller's
  // manual tier pick if they made one (and the product actually has that
  // tier configured), otherwise whatever quantity-based tier applies.
  function linePriceCents(product: TieredProduct, quantity: number, override: PriceTier | null): number {
    if (override) {
      const overridePrice = tierPriceCents(product, override);
      if (overridePrice != null) return overridePrice;
    }
    return resolveTierPrice(product, quantity).priceCents;
  }

  function addProduct(product: Product) {
    setLines((prev) => {
      const maxStock = maxStockFor(product);
      const existing = prev.find((l) => l.productId === product.id);
      if (existing) {
        if (existing.quantity >= maxStock) return prev;
        const quantity = existing.quantity + 1;
        return prev.map((l) =>
          l.productId === product.id
            ? { ...l, quantity, unitPriceCents: linePriceCents(l.product, quantity, l.priceTierOverride) }
            : l
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          unitPriceCents: linePriceCents(product, 1, null),
          quantity: 1,
          maxStock,
          product,
          priceTierOverride: null,
        },
      ];
    });
  }

  function increment(productId: string) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.productId !== productId || l.quantity >= l.maxStock) return l;
        const quantity = l.quantity + 1;
        return { ...l, quantity, unitPriceCents: linePriceCents(l.product, quantity, l.priceTierOverride) };
      })
    );
  }

  function decrement(productId: string) {
    setLines((prev) =>
      prev
        .map((l) => {
          if (l.productId !== productId) return l;
          const quantity = l.quantity - 1;
          return { ...l, quantity, unitPriceCents: linePriceCents(l.product, quantity, l.priceTierOverride) };
        })
        .filter((l) => l.quantity > 0)
    );
  }

  // Typed directly into the cart's quantity field (see components/pos/Cart.tsx's
  // QuantityInput) — already clamped to [1, maxStock] there, clamped again here
  // as a second line of defense against a stale maxStock.
  function setQuantity(productId: string, quantity: number) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.productId !== productId) return l;
        const clamped = Math.min(Math.max(1, quantity), l.maxStock);
        return { ...l, quantity: clamped, unitPriceCents: linePriceCents(l.product, clamped, l.priceTierOverride) };
      })
    );
  }

  // Manual tier pick from the cart's Detal/Mayor/Gran mayor selector — null
  // clears the override and goes back to auto-detecting from quantity.
  function setPriceTier(productId: string, tier: PriceTier | null) {
    setLines((prev) =>
      prev.map((l) =>
        l.productId === productId
          ? { ...l, priceTierOverride: tier, unitPriceCents: linePriceCents(l.product, l.quantity, tier) }
          : l
      )
    );
  }

  function remove(productId: string) {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
  }

  function reset() {
    setLines([]);
  }

  return { lines, setLines, maxStockFor, addProduct, increment, decrement, setQuantity, setPriceTier, remove, reset };
}
