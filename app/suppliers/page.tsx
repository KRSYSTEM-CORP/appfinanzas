import { requireAccountingPlan } from "@/lib/session";
import { AdminShell } from "@/components/accounting/AdminShell";
import { CostComparisonCard, SupplierCards } from "@/components/suppliers/SupplierCards";
import { listSuppliers } from "@/lib/actions/suppliers";
import { supplierStats } from "@/lib/actions/supplier-stats";
import { costComparison } from "@/lib/actions/purchases";
import { getExchangeRateInfo } from "@/lib/actions/settings";
import { toSupplierCards } from "@/lib/supplier-cards";

export const dynamic = "force-dynamic";

// Administración → Compras → Proveedores.
export default async function SuppliersPage() {
  await requireAccountingPlan();
  const [suppliers, stats, comparison, { referenceCurrency }] = await Promise.all([listSuppliers(), supplierStats(), costComparison(), getExchangeRateInfo()]);
  return (
    <AdminShell group="compras" sub="prov">
      <SupplierCards suppliers={toSupplierCards(suppliers, stats)} currency={referenceCurrency} />
      <CostComparisonCard rows={comparison} currency={referenceCurrency} />
    </AdminShell>
  );
}
