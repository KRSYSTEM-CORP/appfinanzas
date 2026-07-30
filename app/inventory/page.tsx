import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ProductTable } from "@/components/inventory/ProductTable";
import { listAllProducts, listCategories } from "@/lib/actions/products";
import { getExchangeRateInfo } from "@/lib/actions/settings";
import { isLowStock } from "@/lib/inventory";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const [products, { rate, localCurrencyCode, exchangeRateEnabled, referenceCurrency }, categories] =
    await Promise.all([listAllProducts(), getExchangeRateInfo(), listCategories()]);
  const lowStockCount = products.filter((p) => p.isActive && isLowStock(p)).length;

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Inventario</h1>
          {lowStockCount > 0 && (
            <p className="text-sm text-warning mt-1">
              {lowStockCount} producto{lowStockCount === 1 ? "" : "s"} con stock bajo
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" nativeButton={false} render={<Link href="/inventory/update" />}>
            Actualizar desde Excel
          </Button>
          <Button variant="outline" nativeButton={false} render={<Link href="/inventory/import" />}>
            Importar desde Excel
          </Button>
          <Button nativeButton={false} render={<Link href="/inventory/new" />}>
            Nuevo producto
          </Button>
        </div>
      </div>

      {exchangeRateEnabled && rate == null && (
        <p className="text-sm text-destructive">
          No has configurado tu tasa de cambio.{" "}
          <Link href="/settings" className="underline underline-offset-4">
            Configúrala aquí
          </Link>{" "}
          para ver los precios en bolívares.
        </p>
      )}

      <ProductTable
        products={products}
        rate={rate}
        currencyCode={localCurrencyCode}
        exchangeRateEnabled={exchangeRateEnabled}
        referenceCurrency={referenceCurrency}
        categories={categories}
      />
    </div>
  );
}
