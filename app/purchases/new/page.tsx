import { PurchaseForm } from "@/components/purchases/PurchaseForm";
import { listSuppliers } from "@/lib/actions/suppliers";
import { listActiveProducts } from "@/lib/actions/products";
import { getExchangeRateInfo } from "@/lib/actions/settings";

export const dynamic = "force-dynamic";

export default async function NewPurchasePage() {
  const [suppliers, products, { referenceCurrency }] = await Promise.all([
    listSuppliers(true),
    listActiveProducts(),
    getExchangeRateInfo(),
  ]);

  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Nueva compra</h1>
      <PurchaseForm suppliers={suppliers} products={products} referenceCurrency={referenceCurrency} />
    </div>
  );
}
