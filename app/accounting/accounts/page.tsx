import { requireAccountingPlan, requirePermission } from "@/lib/session";
import { getAccountBalances, listPaymentAccounts } from "@/lib/actions/payment-accounts";
import { getExchangeRateInfo } from "@/lib/actions/settings";
import { AdminShell } from "@/components/accounting/AdminShell";
import { BankAccountsView, type BankAccount } from "@/components/accounting/BankAccountsView";

export const dynamic = "force-dynamic";

// Administración → Cuentas Bancarias.
export default async function AccountsPage() {
  await requirePermission("admin");
  await requireAccountingPlan();
  const [balances, accounts, { rate, exchangeRateEnabled, referenceCurrency }] = await Promise.all([getAccountBalances(), listPaymentAccounts(), getExchangeRateInfo()]);
  const byId = new Map(balances.map((b) => [b.id, b]));
  const rows: BankAccount[] = accounts.flatMap((a) => {
    const b = byId.get(a.id);
    return b
      ? [
          {
            id: a.id,
            kind: a.kind,
            bankKey: a.bankKey,
            bankName: a.bankName,
            holder: a.holder,
            accountNumber: a.accountNumber,
            docId: a.docId,
            currency: b.currency,
            linkedMethod: b.linkedMethod,
            openingCents: b.openingCents,
            balanceCents: b.balanceCents,
          },
        ]
      : [];
  });
  return (
    <AdminShell group="bancos" sub="cuentas">
      <BankAccountsView accounts={rows} rate={exchangeRateEnabled ? rate : null} referenceCurrency={referenceCurrency} />
    </AdminShell>
  );
}
