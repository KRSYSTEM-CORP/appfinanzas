import Link from "next/link";
import { MoreHorizontalIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionMenu } from "@/components/ui/action-menu";
import { ProductTable } from "@/components/inventory/ProductTable";
import { PriceListButton } from "@/components/inventory/PriceListButton";
import { listAllProducts, listCategories } from "@/lib/actions/products";
import { getBranding, getExchangeRateInfo, getFiscalData } from "@/lib/actions/settings";
import { isLowStock } from "@/lib/inventory";
import { requireSectionAccess } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const [
    session,
    products,
    { rate, localCurrencyCode, exchangeRateEnabled, referenceCurrency },
    categories,
    { logoDataUrl },
    fiscalData,
  ] = await Promise.all([
    requireSectionAccess("inventory"),
    listAllProducts(),
    getExchangeRateInfo(),
    listCategories(),
    getBranding(),
    getFiscalData(),
  ]);
  const lowStockCount = products.filter((p) => p.isActive && isLowStock(p)).length;
  const priceListProducts = products
    .filter((p) => p.isActive)
    .map((p) => ({ name: p.name, category: p.category, priceCents: p.priceCents }));
  const priceListCompany = { name: session.companyName, logoDataUrl, ...fiscalData };
  const canManage = session.role === "GERENTE" || session.isSuperAdmin;

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">Gestión de productos</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Inventario</h1>
          <p className="mt-1 text-sm text-muted-foreground">Encuentra productos y revisa sus existencias y precios.</p>
          {lowStockCount > 0 && (
            <p className="mt-1 hidden text-sm text-warning md:block">
              {lowStockCount} producto{lowStockCount === 1 ? "" : "s"} con stock bajo
            </p>
          )}
        </div>
        <div className="hidden flex-wrap gap-2 md:flex">
          <PriceListButton
            products={priceListProducts}
            company={priceListCompany}
            referenceCurrency={referenceCurrency}
          />
          {canManage && (
            <>
              <Button variant="outline" nativeButton={false} render={<Link href="/inventory/update" />}>
                Actualizar desde Excel
              </Button>
              <Button variant="outline" nativeButton={false} render={<Link href="/inventory/import" />}>
                Importar desde Excel
              </Button>
              <Button nativeButton={false} render={<Link href="/inventory/new" />}>
                Nuevo producto
              </Button>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 md:hidden">
          {canManage ? (
            <>
              <Button nativeButton={false} render={<Link href="/inventory/new" />} className="flex-1">
                <PlusIcon data-icon="inline-start" /> Nuevo producto
              </Button>
              <ActionMenu
                trigger={<Button type="button" variant="outline" size="icon" aria-label="Más acciones de inventario" />}
                triggerChildren={<MoreHorizontalIcon />}
                contentClassName="md:w-56"
              >
                <PriceListButton
                  products={priceListProducts}
                  company={priceListCompany}
                  referenceCurrency={referenceCurrency}
                  className="w-full justify-start"
                />
                <Button
                  nativeButton={false}
                  variant="ghost"
                  render={<Link href="/inventory/update" />}
                  className="w-full justify-start"
                >
                  Actualizar desde Excel
                </Button>
                <Button
                  nativeButton={false}
                  variant="ghost"
                  render={<Link href="/inventory/import" />}
                  className="w-full justify-start"
                >
                  Importar desde Excel
                </Button>
              </ActionMenu>
            </>
          ) : (
            <PriceListButton
              products={priceListProducts}
              company={priceListCompany}
              referenceCurrency={referenceCurrency}
              className="w-full justify-start"
            />
          )}
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
        canManage={canManage}
        companyId={session.companyId}
      />
    </div>
  );
}
