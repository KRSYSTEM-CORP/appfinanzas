export type StockLike = {
  stock: number;
  lowStockThreshold: number;
  trackStock: boolean;
};

export function isLowStock(product: StockLike): boolean {
  return product.trackStock && product.stock <= product.lowStockThreshold;
}
