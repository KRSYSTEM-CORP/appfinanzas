import { AdminShell } from "@/components/accounting/AdminShell";
import { requireAccountingPlan } from "@/lib/session";
import { PurchaseForm } from "@/components/purchases/PurchaseForm";
import { listSuppliers } from "@/lib/actions/suppliers";
import { listActiveProducts, listCategories } from "@/lib/actions/products";
import { getExchangeRateInfo, getIvaSettings } from "@/lib/actions/settings";

export const dynamic = "force-dynamic";

export default async function NewPurchasePage() {
  await requireAccountingPlan();
  const [suppliers, products, categories, { rate, localCurrencyCode, exchangeRateEnabled, referenceCurrency }, ivaSettings] =
    await Promise.all([
      listSuppliers(true),
      listActiveProducts(),
      listCategories(),
      getExchangeRateInfo(),
      getIvaSettings(),
    ]);

  return (
    <AdminShell group="compras" sub="registro">
      <h2 className="text-xl font-bold tracking-[-0.02em]">Nueva compra</h2>
      <PurchaseForm
        suppliers={suppliers}
        products={products}
        categories={categories}
        rate={rate}
        currencyCode={localCurrencyCode}
        exchangeRateEnabled={exchangeRateEnabled}
        referenceCurrency={referenceCurrency}
        ivaSettings={ivaSettings}
      />
    </AdminShell>
  );
}
