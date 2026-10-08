import Link from "next/link";
import { PosClient } from "@/components/pos/PosClient";
import { OfflineSyncBanner } from "@/components/pos/OfflineSyncBanner";
import { listActiveProducts, listCategories } from "@/lib/actions/products";
import { getQuoteForConversion } from "@/lib/actions/quotes";
import { getBranding, getExchangeRateInfo, getFiscalData, getIvaSettings } from "@/lib/actions/settings";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function PosPage({
  searchParams,
}: {
  searchParams: Promise<{ fromQuote?: string }>;
}) {
  const { fromQuote } = await searchParams;
  const [
    { companyName, sellerName, companyId, branchId, branchName, role, isSuperAdmin },
    products,
    { rate, localCurrencyCode, exchangeRateEnabled, referenceCurrency, printPaperSize },
    categories,
    { logoDataUrl },
    fiscalData,
    { ivaGeneralRatePercent, ivaReducedRatePercent },
  ] = await Promise.all([
    requireSession(),
    listActiveProducts(),
    getExchangeRateInfo(),
    listCategories(),
    getBranding(),
    getFiscalData(),
    getIvaSettings(),
  ]);
  const company = { name: companyName, logoDataUrl, ...fiscalData };

  const quoteConversion = fromQuote ? await getQuoteForConversion(fromQuote) : null;
  const quoteConversionError = quoteConversion && !quoteConversion.success ? quoteConversion.error : null;
  const initialQuote = quoteConversion && quoteConversion.success ? quoteConversion.quote : null;

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 md:h-full">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">Operación</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Punto de venta</h1>
          <p className="mt-1 text-sm text-muted-foreground">Registra una venta y mantén el control de caja.</p>
        </div>
      </div>
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
        />
      </div>
    </div>
  );
}
