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
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <h1 className="text-3xl font-bold tracking-tight">Nueva compra</h1>
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
    </div>
  );
}
