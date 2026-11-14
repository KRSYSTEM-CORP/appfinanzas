import { requireAccountingPlan } from "@/lib/session";
import { listPaymentOrders } from "@/lib/actions/purchases";
import { getExchangeRateInfo } from "@/lib/actions/settings";
import { AdminShell } from "@/components/accounting/AdminShell";
import { PaymentOrdersPanel } from "@/components/purchases/PaymentOrdersPanel";

export const dynamic = "force-dynamic";

// Administración → Compras → Órdenes de pago.
export default async function PaymentOrdersPage() {
  await requireAccountingPlan();
  const [orders, { referenceCurrency }] = await Promise.all([listPaymentOrders(), getExchangeRateInfo()]);
  return (
    <AdminShell group="compras" sub="ordenes">
      <PaymentOrdersPanel orders={orders} currency={referenceCurrency} />
    </AdminShell>
  );
}
