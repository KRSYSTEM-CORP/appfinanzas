import Link from "next/link";
import { MoreHorizontalIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionMenu } from "@/components/ui/action-menu";
import { ProductTable } from "@/components/inventory/ProductTable";
import { PriceListButton } from "@/components/inventory/PriceListButton";
import { InternalUseButton } from "@/components/inventory/InternalUseButton";
import { getInventoryOverview, listAllProducts, listCategories } from "@/lib/actions/products";
import { getBranding, getExchangeRateInfo, getFiscalData } from "@/lib/actions/settings";
import { hasPermission, requireSectionAccess } from "@/lib/session";
import { getPlan } from "@/lib/plans";
import { formatCurrencyCents } from "@/lib/currencies";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const [
    session,
    products,
    inventory,
    { rate, localCurrencyCode, exchangeRateEnabled, referenceCurrency },
    categories,
    { logoDataUrl },
    fiscalData,
  ] = await Promise.all([
    requireSectionAccess("inventory"),
    listAllProducts(),
    getInventoryOverview(),
    getExchangeRateInfo(),
    listCategories(),
    getBranding(),
    getFiscalData(),
  ]);
  const priceListProducts = products
    .filter((p) => p.isActive)
    .map((p) => ({ name: p.name, category: p.category, priceCents: p.priceCents }));
  const priceListCompany = { name: session.companyName, logoDataUrl, ...fiscalData };
  const canManage = session.role === "GERENTE" || session.isSuperAdmin;
  const plan = getPlan(session.plan);
  // Valor del inventario = existencias × costo de los productos con control de stock.
  const inventoryValueCents = products.reduce((a, p) => (p.trackStock && p.costCents != null ? a + p.stock * p.costCents : a), 0);

  return (
    <div className="flex flex-col gap-5 px-4 py-5">
      <div className="flex flex-col gap-3.5">
        <div>
          <p className="kr-eyebrow">Gestión de productos</p>
          <h1 className="kr-h1">Inventario</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className="inline-flex items-center gap-2 rounded-full bg-card px-3 py-1.5 shadow-(--shadow-card)">
              {inventory.totalCount} {plan.maxProducts == null ? "productos" : `de ${plan.maxProducts} productos`}
              {plan.maxProducts != null && (
                <span className="h-1.5 w-12 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.round((inventory.totalCount / plan.maxProducts) * 100))}%` }} />
                </span>
              )}
              <span className="font-medium text-muted-foreground">Plan {plan.label}</span>
            </span>
            <span className="rounded-full bg-primary/12 px-3 py-1.5 text-primary">
              Valor del inventario: {formatCurrencyCents(referenceCurrency, inventoryValueCents)}
              {rate != null && exchangeRateEnabled ? ` · Bs ${Math.round((inventoryValueCents / 100) * rate).toLocaleString("es-VE")}` : ""}
            </span>
            {rate != null && exchangeRateEnabled && (
              <span className="rounded-full bg-muted px-3 py-1.5 text-muted-foreground">
                Tasa Bs {rate.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} por {referenceCurrency === "USD" ? "$" : "€"}
              </span>
            )}
          </div>
        </div>
        <div className="hidden flex-wrap gap-2 md:flex">
          {canManage && (
            <>
              <Button size="lg" nativeButton={false} render={<Link href="/inventory/new" />}>
                <PlusIcon data-icon="inline-start" /> Nuevo producto
              </Button>
              <Button size="lg" variant="outline" nativeButton={false} render={<Link href="/inventory/update" />}>
                Actualizar inventario
              </Button>
              <Button size="lg" variant="outline" nativeButton={false} render={<Link href="/inventory/import" />}>
                Importar
              </Button>
              <Button size="lg" variant="outline" nativeButton={false} render={<Link href="/inventory/transfers" />}>
                Traspasos
              </Button>
              <InternalUseButton
                products={products
                  .filter((p) => p.trackStock && p.stock > 0)
                  .map((p) => ({ id: p.id, name: p.name, stock: p.stock }))}
              />
            </>
          )}
          <PriceListButton
            products={priceListProducts}
            company={priceListCompany}
            referenceCurrency={referenceCurrency}
          />
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
        inventory={inventory}
        rate={rate}
        currencyCode={localCurrencyCode}
        exchangeRateEnabled={exchangeRateEnabled}
        referenceCurrency={referenceCurrency}
        categories={categories}
        canManage={canManage}
        canSeeCosts={hasPermission(session, "costs")}
        companyId={session.companyId}
      />
    </div>
  );
}
