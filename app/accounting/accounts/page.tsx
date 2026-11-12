import { requireAccountingPlan, requirePermission } from "@/lib/session";
import { getAccountBalances } from "@/lib/actions/payment-accounts";
import { AccountBalancesPanel } from "@/components/accounting/AccountBalancesPanel";

export default async function AccountsPage() {
  await requirePermission("admin");
  await requireAccountingPlan();
  const rows = await getAccountBalances();
  return (
    <div className="flex flex-col gap-4 px-4 py-5">
      <div>
        <p className="kr-eyebrow">Administración</p>
        <h1 className="kr-h1">Cuentas Bancarias</h1>
      </div>
      <AccountBalancesPanel rows={rows} />
    </div>
  );
}
