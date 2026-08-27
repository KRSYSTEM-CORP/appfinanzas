import Link from "next/link";
import { PosClient } from "@/components/pos/PosClient";
import { OfflineSyncBanner } from "@/components/pos/OfflineSyncBanner";
import { listActiveProducts, listCategories } from "@/lib/actions/products";
import { getQuoteForConversion } from "@/lib/actions/quotes";
import { getBranding, getExchangeRateInfo, getFiscalData } from "@/lib/actions/settings";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function PosPage({
  searchParams,
}: {
  searchParams: Promise<{ fromQuote?: string }>;
}) {
  const { fromQuote } = await searchParams;
  const [
    { companyName, sellerName, companyId },
    products,
    { rate, localCurrencyCode, exchangeRateEnabled, referenceCurrency, printPaperSize },
    categories,
    { logoDataUrl },
    fiscalData,
  ] = await Promise.all([
    requireSession(),
    listActiveProducts(),
    getExchangeRateInfo(),
    listCategories(),
    getBranding(),
    getFiscalData(),
  ]);
  const company = { name: companyName, logoDataUrl, ...fiscalData };

  const quoteConversion = fromQuote ? await getQuoteForConversion(fromQuote) : null;
  const quoteConversionError = quoteConversion && !quoteConversion.success ? quoteConversion.error : null;
  const initialQuote = quoteConversion && quoteConversion.success ? quoteConversion.quote : null;

  return (
    <div className="flex flex-col gap-4 p-6 h-[calc(100vh-56px)]">
      <h1 className="text-2xl font-semibold">Punto de venta</h1>
      <OfflineSyncBanner />
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
        />
      </div>
    </div>
  );
}
