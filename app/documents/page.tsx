import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DocumentsTable } from "@/components/documents/DocumentsTable";
import { listRecentSales } from "@/lib/actions/sales";
import { listQuotes } from "@/lib/actions/quotes";
import { getBranding, getExchangeRateInfo, getFiscalData } from "@/lib/actions/settings";
import { requireSectionAccess } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const [
    { companyName },
    sales,
    quotes,
    { rate, localCurrencyCode, exchangeRateEnabled, referenceCurrency, printPaperSize },
    { logoDataUrl },
    fiscalData,
  ] = await Promise.all([
    requireSectionAccess("documents"),
    listRecentSales(500),
    listQuotes(500),
    getExchangeRateInfo(),
    getBranding(),
    getFiscalData(),
  ]);

  const company = { name: companyName, logoDataUrl, ...fiscalData };
  const documentSales = sales.map((sale) => ({
    ...sale,
    exchangeRate: sale.exchangeRate != null ? Number(sale.exchangeRate) : null,
    paidExchangeRate: sale.paidExchangeRate != null ? Number(sale.paidExchangeRate) : null,
    payments: sale.payments.map((p) => ({
      ...p,
      exchangeRate: p.exchangeRate != null ? Number(p.exchangeRate) : null,
    })),
  }));

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Documentos</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Notas de entrega, facturas, recibos de pago y presupuestos — filtra por tipo de documento
          para ver solo lo que se generó de cada uno.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Documentos</CardTitle>
        </CardHeader>
        <CardContent>
          <DocumentsTable
            sales={documentSales}
            quotes={quotes}
            company={company}
            currentRate={rate}
            currencyCode={localCurrencyCode}
            exchangeRateEnabled={exchangeRateEnabled}
            referenceCurrency={referenceCurrency}
            printPaperSize={printPaperSize}
          />
        </CardContent>
      </Card>
    </div>
  );
}
