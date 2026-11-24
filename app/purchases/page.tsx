import { LandmarkIcon, ShoppingCartIcon, TrendingDownIcon } from "lucide-react";
import { requirePurchasesAccess } from "@/lib/session";
import { AdminShell } from "@/components/accounting/AdminShell";
import { DateRangeSwitcher } from "@/components/shared/DateRangeSwitcher";
import { PeriodBar } from "@/components/shared/PeriodBar";
import { Kpi, KpiGrid } from "@/components/shared/Kpi";
import { RowMenu } from "@/components/shared/RowMenu";
import { PurchasesTable, RestockCard, type RegisterPurchase } from "@/components/purchases/PurchasesRegister";
import { getExchangeRateInfo } from "@/lib/actions/settings";
import { listPaymentOrders, listRecentPurchases } from "@/lib/actions/purchases";
import { restockSuggestions } from "@/lib/actions/reports";
import { money } from "@/lib/money-display";
import { paymentsPrimaryLocal, type MoneyCtx } from "@/lib/money-primary";
import { ACCOUNT_KIND_LABELS } from "@/lib/payment-accounts";
import { selectionLabel } from "@/lib/period-label";
import { parseDateRangeSelection, selectionToWindows, todayDateString } from "@/lib/report-types";

export const dynamic = "force-dynamic";

// Administración → Compras → Registro de compras.
export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; year?: string; months?: string; from?: string; to?: string }>;
}) {
  await requirePurchasesAccess();
  const range = parseDateRangeSelection(await searchParams, { kind: "preset", preset: "month" });
  const [purchases, orders, restock, rateInfo] = await Promise.all([
    listRecentPurchases(500, selectionToWindows(range)),
    listPaymentOrders(),
    restockSuggestions(6),
    getExchangeRateInfo(),
  ]);
  const { referenceCurrency } = rateInfo;
  const ctx: MoneyCtx = { rate: rateInfo.rate, localCurrencyCode: rateInfo.localCurrencyCode, referenceCurrency, exchangeRateEnabled: rateInfo.exchangeRateEnabled };
  const label = selectionLabel(range, todayDateString());
  const live = purchases.filter((p) => !p.voided);
  const bought = live.reduce((n, p) => n + p.totalCents, 0);
  const owed = orders.reduce((n, o) => n + o.remainingCents, 0);
  const owedSuppliers = new Set(orders.map((o) => o.supplierName)).size;
  const activeSuppliers = new Set(live.map((p) => p.supplierId ?? p.manualSupplierName ?? "")).size;
  const rows: RegisterPurchase[] = purchases.map((p) => {
    const names = p.items.map((i) => i.productName);
    return {
      id: p.id,
      createdAt: p.createdAt.toISOString(),
      controlNumber: p.controlNumber,
      supplierName: p.supplier?.name ?? p.manualSupplierName ?? "—",
      supplierInvoiceNo: p.supplierInvoiceNo,
      concept: names.length > 2 ? `${names.slice(0, 2).join(", ")} y ${names.length - 2} más` : names.join(" y ") || (p.note ?? "—"),
      items: p.items.map((i) => ({
        name: i.productName,
        quantity: i.quantity,
        unitCostCents: i.unitCostCents,
        subtotalCents: i.subtotalCents,
        baseCents: i.baseCents,
        taxCents: i.taxCents,
        taxRatePercent: i.taxRatePercent,
        taxCategory: i.taxCategory,
        affectsStock: i.affectsStock,
      })),
      supplierRif: p.supplier?.rif ?? null,
      supplierContact: [p.supplier?.phone, p.supplier?.email, p.supplier?.address].filter(Boolean).join(" · ") || null,
      branchName: p.branchName,
      note: p.note,
      baseCents: p.baseImponibleCents,
      taxCents: p.taxCents,
      ivaRetainedCents: p.ivaRetainedCents,
      paidAt: p.paidAt?.toISOString() ?? null,
      voidedAt: p.voidedAt?.toISOString() ?? null,
      createdByName: p.createdByName,
      voidedByName: p.voidedByName,
      primaryLocal: paymentsPrimaryLocal(p.payments, ctx),
      payments: p.payments.map((x) => ({
        id: x.id,
        createdAt: x.createdAt.toISOString(),
        paymentMethod: x.paymentMethod,
        paidInForeignCurrency: x.paidInForeignCurrency,
        amountEurCents: x.amountEurCents,
        amountCurrencyCents: x.amountCurrencyCents,
        currencyCode: x.currencyCode,
        exchangeRate: x.exchangeRate,
        reference: x.reference,
        accountLabel: x.paymentAccount
          ? [x.paymentAccount.bankName ?? ACCOUNT_KIND_LABELS[x.paymentAccount.kind], x.paymentAccount.holder, x.paymentAccount.accountNumber].filter(Boolean).join(" · ")
          : null,
      })),
      fiscal: Boolean(p.supplierInvoiceNo) || p.taxCents > 0,
      totalCents: p.totalCents,
      owedCents: p.totalCents - p.ivaRetainedCents,
      paidCents: p.payments.reduce((n, x) => n + x.amountEurCents, 0),
      paymentStatus: p.paymentStatus,
      voided: p.voided,
    };
  });

  return (
    <AdminShell group="compras" sub="registro">
      <PeriodBar label={label} end={<RowMenu label="Más opciones de compras" items={[{ label: "Importar desde Excel", href: "/purchases/import" }]} />}>
        <DateRangeSwitcher selection={range} />
      </PeriodBar>
      <KpiGrid>
        <Kpi tone="info" icon={<ShoppingCartIcon />} label="Comprado (ref.)" value={money(referenceCurrency, bought, 0)} hint={`${label} · ${live.length} compras`} />
        <Kpi tone="warn" icon={<TrendingDownIcon />} label="Por pagar (ref.)" value={money(referenceCurrency, owed, 0)} hint={`${owedSuppliers} proveedores`} />
        <Kpi tone="ok" icon={<LandmarkIcon />} label="Proveedores" value={activeSuppliers} hint="Activos en el periodo" />
      </KpiGrid>
      <RestockCard rows={restock} currency={referenceCurrency} />
      <PurchasesTable purchases={rows} ctx={ctx} />
    </AdminShell>
  );
}
