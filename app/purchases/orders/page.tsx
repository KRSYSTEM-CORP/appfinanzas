import { requireAccountingPlan } from "@/lib/session";
import { costComparison, listPaymentOrders } from "@/lib/actions/purchases";
import { getExchangeRateInfo } from "@/lib/actions/settings";
import { PaymentOrdersPanel } from "@/components/purchases/PaymentOrdersPanel";

export const dynamic = "force-dynamic";

export default async function PaymentOrdersPage() {
  await requireAccountingPlan();
  const [orders, comparison, { referenceCurrency }] = await Promise.all([
    listPaymentOrders(),
    costComparison(),
    getExchangeRateInfo(),
  ]);
  return (
    <div className="flex flex-col gap-4 px-4 py-5">
      <div>
        <p className="kr-eyebrow">Compras</p>
        <h1 className="kr-h1">Órdenes de pago</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Lo que le debes a tus proveedores, de la más antigua a la más reciente, y a quién le compras más barato.
        </p>
      </div>
      <PaymentOrdersPanel orders={orders} comparison={comparison} currency={referenceCurrency} />
    </div>
  );
}
