import Link from "@/components/ui/nav-link";
import { PosSalesSheet } from "@/components/pos/PosSalesSheet";
import { PosClient } from "@/components/pos/PosClient";
import { OfflineSyncBanner } from "@/components/pos/OfflineSyncBanner";
import { listActiveProducts, listCategories } from "@/lib/actions/products";
import { getQuoteForConversion } from "@/lib/actions/quotes";
import { effectiveIvaRates } from "@/lib/tax";
import { getBranding, getExchangeRateInfo, getFiscalData, getIvaSettings } from "@/lib/actions/settings";
import { listPaymentAccounts } from "@/lib/actions/payment-accounts";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { canAccess, landingPath } from "@/lib/access";
import { getRequireCustomerOnSale } from "@/lib/actions/marketing";
import { getDailyClosingSummary } from "@/lib/actions/cash-closing";
import { CashClosedAlert } from "@/components/pos/CashClosedAlert";
import { todayDateString } from "@/lib/report-types";

export const dynamic = "force-dynamic";

export default async function PosPage({
  searchParams,
}: {
  searchParams: Promise<{ fromQuote?: string }>;
}) {
  const { fromQuote } = await searchParams;
  // Quien no tiene el POS (p. ej. Contador) aterriza en su primer módulo en vez de ver un POS que no puede usar.
  const me = await requireSession();
  if (!canAccess(me, { kind: "section", sections: ["pos"] })) redirect(landingPath(me));
  const [
    { companyName, sellerName, companyId, branchId, branchName, role, isSuperAdmin },
    products,
    { rate, localCurrencyCode, exchangeRateEnabled, referenceCurrency, printPaperSize },
    categories,
    { logoDataUrl },
    fiscalData,
    { ivaEnabled, ivaGeneralRatePercent: rawIvaGeneral, ivaReducedRatePercent: rawIvaReduced, isIgtfAgent, igtfRatePercent },
    paymentAccounts,
    todaySummary,
    requireCustomer,
  ] = await Promise.all([
    requireSession(),
    listActiveProducts(),
    getExchangeRateInfo(),
    listCategories(),
    getBranding(),
    getFiscalData(),
    getIvaSettings(),
    listPaymentAccounts(true),
    getDailyClosingSummary(todayDateString()).catch(() => null),
    getRequireCustomerOnSale().catch(() => false),
  ]);
  const { general: ivaGeneralRatePercent, reduced: ivaReducedRatePercent } = effectiveIvaRates(ivaEnabled, rawIvaGeneral, rawIvaReduced);
  const shiftOpen: boolean | null = todaySummary && branchId ? todaySummary.shiftOpen : null;
  const company = { name: companyName, logoDataUrl, ...fiscalData };

  const quoteConversion = fromQuote ? await getQuoteForConversion(fromQuote) : null;
  const quoteConversionError = quoteConversion && !quoteConversion.success ? quoteConversion.error : null;
  const initialQuote = quoteConversion && quoteConversion.success ? quoteConversion.quote : null;

  return (
    <div className="flex flex-col gap-4 px-4 py-5 md:h-full">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="kr-eyebrow">
            {companyName} · {branchName ?? "Todas las sedes"}
          </p>
          <h1 className="mt-1 kr-h1">POS</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {exchangeRateEnabled && rate != null && (
              <span className="rounded-full bg-primary/12 px-3 py-1 text-xs font-semibold text-primary tabular-nums">
                Tasa Bs {rate.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            )}
            {todaySummary && (
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${todaySummary.shiftOpen ? "bg-success/14 text-success" : todaySummary.closed ? "bg-muted text-muted-foreground" : "bg-warning/18 text-warning"}`}>
                {todaySummary.shiftOpen ? "Caja abierta" : todaySummary.closed ? "Caja cerrada" : "Caja sin abrir"}
              </span>
            )}
            <PosSalesSheet referenceCurrency={referenceCurrency} />
          </div>
        </div>
      </div>
      {shiftOpen === false && <CashClosedAlert />}
      <OfflineSyncBanner canManage={role === "GERENTE" || isSuperAdmin} />
      {exchangeRateEnabled && rate == null && (
        <p className="text-sm text-destructive">
          No has configurado tu tasa de cambio.{" "}
          <Link href="/settings" className="underline underline-offset-4">
            Configúrala aquí
          </Link>{" "}
          antes de vender.
        </p>
      )}
      {quoteConversionError && <p className="text-sm text-destructive">{quoteConversionError}</p>}
      {initialQuote && initialQuote.droppedItemNames.length > 0 && (
        <p className="text-sm text-destructive">
          No se pudieron precargar del presupuesto (ya no existen o están desactivados):{" "}
          {initialQuote.droppedItemNames.join(", ")}
        </p>
      )}
      <div className="flex-1 min-h-0">
        <PosClient
          topMethod={[...(todaySummary?.byMethod ?? [])].sort((a, b) => b.totalCents - a.totalCents)[0]?.paymentMethod ?? null}
          paymentAccounts={paymentAccounts}
          requireCustomer={requireCustomer}
          products={products}
          rate={rate}
          currencyCode={localCurrencyCode}
          exchangeRateEnabled={exchangeRateEnabled}
          referenceCurrency={referenceCurrency}
          printPaperSize={printPaperSize}
          categories={categories}
          company={company}
          sellerName={sellerName}
          initialQuote={initialQuote}
          companyId={companyId}
          companyName={companyName}
          branchId={branchId}
          branchName={branchName}
          ivaGeneralRatePercent={ivaGeneralRatePercent}
          ivaReducedRatePercent={ivaReducedRatePercent}
          shiftOpen={shiftOpen}
          igtfRatePercent={isIgtfAgent ? igtfRatePercent : null}
        />
      </div>
    </div>
  );
}
