import { Suspense } from "react";
import { requireAccountingPlan, requirePermission } from "@/lib/session";
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
  await requirePermission("admin");
  await requireAccountingPlan();
  const params = await searchParams;
  const seg = parseSegMode(params.seg);
  const selection = parseDateRangeSelection(params, { kind: "preset", preset: "today" });
  const [balances, accounts, { rate, exchangeRateEnabled, referenceCurrency }] = await Promise.all([
    getAccountBalances(),
    listPaymentAccounts(),
    getExchangeRateInfo(),
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
      <BankAccountsView accounts={rows} rate={exchangeRateEnabled ? rate : null} referenceCurrency={referenceCurrency} />
      {/* El reporte del periodo es lo más lento: va en Suspense para que la lista de cuentas
          aparezca (y se refresque al guardar) sin esperarlo. */}
      <Suspense fallback={<div className="h-40 animate-pulse rounded-[20px] bg-muted/60" aria-busy="true" aria-label="Cargando movimientos del periodo" />}>
        <PeriodSectionAsync seg={seg} turno={params.turno} selection={selection} />
      </Suspense>
    </AdminShell>
  );
}

async function PeriodSectionAsync({ seg, turno, selection }: { seg: ReturnType<typeof parseSegMode>; turno?: string; selection: ReturnType<typeof parseDateRangeSelection> }) {
  const report = await getAccountsPeriodReport({ seg, turno, selection });
  return <AccountsPeriodSection report={report} selection={selection} seg={seg} />;
}
