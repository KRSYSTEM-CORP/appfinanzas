import { AdminShell } from "@/components/accounting/AdminShell";
import { PayrollPanel } from "@/components/payroll/PayrollPanel";
import { listPayroll } from "@/lib/actions/payroll";
import { getBranding, getExchangeRateInfo, getFiscalData } from "@/lib/actions/settings";
import { requireSession } from "@/lib/session";
import { periodFor } from "@/lib/payroll";

export const dynamic = "force-dynamic";

export default async function PayrollPage() {
  const [{ employees, payments, rates, sellers }, { referenceCurrency }, { companyName }, { logoDataUrl }, fiscalData] = await Promise.all([
    listPayroll(periodFor(new Date())),
    getExchangeRateInfo(),
    requireSession(),
    getBranding(),
    getFiscalData(),
  ]);
  const company = { name: companyName, logoDataUrl, ...fiscalData };
  return (
    <AdminShell group="conta" sub="nomina">
      <PayrollPanel
        employees={employees}
        payments={payments}
        currentPeriod={periodFor(new Date())}
        referenceCurrency={referenceCurrency}
        company={company}
        rates={rates}
        sellers={sellers}
        monthsElapsed={new Date().getMonth() + 1}
      />
    </AdminShell>
  );
}
