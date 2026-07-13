export type StockLike = {
  stock: number;
  lowStockThreshold: number;
};

export function isLowStock(product: StockLike): boolean {
  return product.stock <= product.lowStockThreshold;
}
