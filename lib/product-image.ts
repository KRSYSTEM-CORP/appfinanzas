import type { Product } from "@prisma/client";

// Max products returned by the catalog lists (POS, inventory, quotes,
// purchases, bulk update, offline snapshot). Product photos are NOT part of
// these lists any more — see productImageUrl — so the payload stays small
// enough for this to be large.
export const PRODUCT_LIST_LIMIT = 500;

// A product as served by the list endpoints: everything except the base64
// photo (which can weigh tens of KB each), plus a flag saying whether one
// exists so the UI knows whether to request it.
export type ListedProduct = Omit<Product, "imageDataUrl"> & { hasImage: boolean };

// The photo is fetched on demand from /api/products/[id]/image. `v` is the
// product's updatedAt, so editing the photo changes the URL and busts the
// browser cache, while an unchanged photo is served from cache forever.
export function productImageUrl(p: Pick<ListedProduct, "id" | "hasImage" | "updatedAt">): string | null {
  if (!p.hasImage) return null;
  return `/api/products/${p.id}/image?v=${new Date(p.updatedAt).getTime()}`;
}
