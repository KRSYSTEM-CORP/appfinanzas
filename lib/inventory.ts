import { toQty } from "@/lib/units";

export type StockLike = {
  stock: number | { toString(): string };
  lowStockThreshold: number | { toString(): string };
  trackStock: boolean;
};

export function isLowStock(product: StockLike): boolean {
  return product.trackStock && toQty(product.stock) <= toQty(product.lowStockThreshold);
}
