import { requireAccountingPlan, requirePermission, isManagerSession } from "@/lib/session";
import { getAccountBalances, listPaymentAccounts } from "@/lib/actions/payment-accounts";
import { getExchangeRateInfo } from "@/lib/actions/settings";
import { getAccountsPeriodReport } from "@/lib/actions/accounts-period";
import { parseSegMode } from "@/lib/accounts-segmentation";
import { parseDateRangeSelection } from "@/lib/report-types";
import { AdminShell } from "@/components/accounting/AdminShell";
import { AccountsPeriodSection } from "@/components/accounting/AccountsPeriodSection";
import { BankAccountsView, type BankAccount } from "@/components/accounting/BankAccountsView";

export const dynamic = "force-dynamic";

// Administración → Cuentas Bancarias.
export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ seg?: string; turno?: string; range?: string; year?: string; months?: string; from?: string; to?: string }>;
}) {
  const me = await requirePermission("admin");
  // Solo el gerente agrega fondos o cambia cuentas (lo exige también el servidor).
  const canWrite = isManagerSession(me);
  await requireAccountingPlan();
  const params = await searchParams;
  const seg = parseSegMode(params.seg);
  const selection = parseDateRangeSelection(params, { kind: "preset", preset: "today" });
  const [balances, accounts, { rate, exchangeRateEnabled, referenceCurrency }, report] = await Promise.all([
    getAccountBalances(),
    listPaymentAccounts(),
    getExchangeRateInfo(),
    getAccountsPeriodReport({ seg, turno: params.turno, selection }),
  ]);
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
            paidOutCents: b.paidOutCents,
            fundedCents: b.fundedCents,
            websiteUrl: a.websiteUrl,
            balanceCents: b.balanceCents,
          },
        ]
      : [];
  });
  return (
    <AdminShell group="bancos" sub="cuentas">
      <BankAccountsView canWrite={canWrite} accounts={rows} rate={exchangeRateEnabled ? rate : null} referenceCurrency={referenceCurrency} />
      <AccountsPeriodSection report={report} selection={selection} seg={seg} />
    </AdminShell>
  );
}
