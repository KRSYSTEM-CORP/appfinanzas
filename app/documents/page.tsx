import { toQty } from "@/lib/units";
import Link from "@/components/ui/nav-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DocumentsTable } from "@/components/documents/DocumentsTable";
import { listRecentSales } from "@/lib/actions/sales";
import { listQuotes } from "@/lib/actions/quotes";
import { getBranding, getExchangeRateInfo, getFiscalData } from "@/lib/actions/settings";
import { requireSectionAccess } from "@/lib/session";

export const dynamic = "force-dynamic";

const PAGE_STEP = 150;
const PAGE_MAX = 2000;

// Carga inicial acotada (cada fila trae partidas y pagos): «Cargar más» pide otras 150 de cada tipo.
export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ n?: string }> }) {
  const { n } = await searchParams;
  const limit = Math.min(PAGE_MAX, Math.max(PAGE_STEP, Math.floor(Number(n) / PAGE_STEP) * PAGE_STEP || PAGE_STEP));
  const [
    { companyName },
    sales,
    quotes,
    { rate, localCurrencyCode, exchangeRateEnabled, referenceCurrency, printPaperSize },
    { logoDataUrl },
    fiscalData,
  ] = await Promise.all([
    requireSectionAccess("documents"),
    listRecentSales(limit),
    listQuotes(limit),
    getExchangeRateInfo(),
    getBranding(),
    getFiscalData(),
  ]);

  const company = { name: companyName, logoDataUrl, ...fiscalData };
  const documentSales = sales.map((sale) => ({
    ...sale,
    exchangeRate: sale.exchangeRate != null ? Number(sale.exchangeRate) : null,
    paidExchangeRate: sale.paidExchangeRate != null ? Number(sale.paidExchangeRate) : null,
    items: sale.items.map((i) => ({ ...i, quantity: toQty(i.quantity) })),
    payments: sale.payments.map((p) => ({
      ...p,
      exchangeRate: p.exchangeRate != null ? Number(p.exchangeRate) : null,
    })),
  }));

  return (
    <div className="flex flex-col gap-6 px-4 py-5">
      <div>
        <p className="kr-eyebrow">Todo lo que has emitido</p>
        <h1 className="kr-h1">Documentos</h1>
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
          {(sales.length >= limit || quotes.length >= limit) && limit < PAGE_MAX && (
            <div className="mt-4 text-center">
              <Link
                href={`/documents?n=${limit + PAGE_STEP}`}
                scroll={false}
                prefetch={false}
                className="text-sm font-semibold text-primary underline underline-offset-4"
              >
                Cargar documentos anteriores
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
