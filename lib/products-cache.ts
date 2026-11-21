import "server-only";
import { invalidateCache } from "@/lib/cache";

// Caché (Redis) de la lista de productos que usan el POS y el inventario: 60 s. Todo flujo que cambie
// existencias (venta, anulación, nota de crédito, compra, ajuste, transferencia) debe invalidarla; si no,
// «Nueva venta» vuelve a mostrar el inventario viejo hasta que expire.
export const PRODUCTS_CACHE_TTL_SECONDS = 60;

export function productsCacheKey(scope: "active" | "all", companyId: string, branchId: string | null) {
  return `products:${scope}:${companyId}:${branchId ?? "all"}`;
}

// Invalida la lista de la sucursal y la de «todas las sucursales» de la empresa: un gerente que ve
// «Todas» y un cajero fijo a una sucursal leen claves distintas de los mismos datos.
export async function invalidateProductsCache(companyId: string, branchId: string | null) {
  await invalidateCache(
    productsCacheKey("active", companyId, branchId),
    productsCacheKey("all", companyId, branchId),
    productsCacheKey("active", companyId, null),
    productsCacheKey("all", companyId, null)
  );
}
