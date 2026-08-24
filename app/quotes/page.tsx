import Link from "next/link";
import { QuoteClient } from "@/components/quotes/QuoteClient";
import { listActiveProducts, listCategories } from "@/lib/actions/products";
import { getBranding, getExchangeRateInfo, getFiscalData } from "@/lib/actions/settings";
import { requireSectionAccess } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function QuotesPage() {
  const [
    { companyName },
    products,
    { rate, localCurrencyCode, exchangeRateEnabled, referenceCurrency, printPaperSize },
    categories,
    { logoDataUrl },
    fiscalData,
  ] = await Promise.all([
    requireSectionAccess("quotes"),
    listActiveProducts(),
    getExchangeRateInfo(),
    listCategories(),
    getBranding(),
    getFiscalData(),
  ]);
  const company = { name: companyName, logoDataUrl, ...fiscalData };

  return (
    <div className="flex flex-col gap-4 p-6 h-[calc(100vh-56px)]">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Presupuestos</h1>
        <Link href="/quotes/history" className="text-sm text-primary underline underline-offset-2">
          Ver historial y seguimiento
        </Link>
      </div>
      {exchangeRateEnabled && rate == null && (
        <p className="text-sm text-destructive">
          No has configurado tu tasa de cambio.{" "}
          <Link href="/settings" className="underline underline-offset-4">
            Configúrala aquí
          </Link>{" "}
          para mostrar precios en bolívares en el presupuesto.
        </p>
      )}
      <div className="flex-1 min-h-0">
        <QuoteClient
          products={products}
          rate={rate}
          currencyCode={localCurrencyCode}
          exchangeRateEnabled={exchangeRateEnabled}
          referenceCurrency={referenceCurrency}
          printPaperSize={printPaperSize}
          categories={categories}
          company={company}
        />
      </div>
    </div>
  );
}
