import { PurchaseForm } from "@/components/purchases/PurchaseForm";
import { listSuppliers } from "@/lib/actions/suppliers";
import { listActiveProducts } from "@/lib/actions/products";
import { getExchangeRateInfo, getIvaSettings } from "@/lib/actions/settings";

export const dynamic = "force-dynamic";

export default async function NewPurchasePage() {
  const [suppliers, products, { rate, localCurrencyCode, exchangeRateEnabled, referenceCurrency }, ivaSettings] =
    await Promise.all([
      listSuppliers(true),
      listActiveProducts(),
      getExchangeRateInfo(),
      getIvaSettings(),
    ]);

  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Nueva compra</h1>
      <PurchaseForm
        suppliers={suppliers}
        products={products}
        rate={rate}
        currencyCode={localCurrencyCode}
        exchangeRateEnabled={exchangeRateEnabled}
        referenceCurrency={referenceCurrency}
        ivaSettings={ivaSettings}
      />
    </div>
  );
}
