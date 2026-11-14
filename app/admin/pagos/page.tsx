import { PlatformShell } from "@/components/admin/PlatformShell";
import { PaymentMethodsView } from "@/components/admin/PaymentMethodsView";
import { Button } from "@/components/ui/button";
import { requireSuperAdmin } from "@/lib/platform-guard";
import { getPlatformSettings, listPaymentReportHistory } from "@/lib/actions/admin";
import { getPlatformExchangeRateInfo } from "@/lib/actions/billing";

export const dynamic = "force-dynamic";

export default async function PlatformPaymentsPage() {
  await requireSuperAdmin();
  const [settings, rate, history] = await Promise.all([getPlatformSettings(), getPlatformExchangeRateInfo(), listPaymentReportHistory(50)]);
  return (
    <PlatformShell sub="pagos">
      <PaymentMethodsView settings={settings} rate={rate.rate} rateUpdatedAt={rate.updatedAt} history={history} />
      <div>
        <Button variant="outline" render={<a href="/admin/export?kind=pagos" />}>Exportar pagos a Excel (CSV)</Button>
      </div>
    </PlatformShell>
  );
}
