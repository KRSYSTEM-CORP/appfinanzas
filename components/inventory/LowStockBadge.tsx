import { Badge } from "@/components/ui/badge";
import { isLowStock, type StockLike } from "@/lib/inventory";

export function LowStockBadge({ product }: { product: StockLike }) {
  if (!isLowStock(product)) return null;
  return <Badge variant="destructive">Stock bajo</Badge>;
}
