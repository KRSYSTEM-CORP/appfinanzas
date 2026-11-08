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
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Nómina</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Empleados, pagos por quincena con método, referencia y comprobante, e historial. Cada pago se anota como
          gasto de Nómina en Finanzas.
        </p>
      </div>
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
    </div>
  );
}
