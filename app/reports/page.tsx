import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SaleActions } from "@/components/reports/SaleActions";
import { SaleDocumentButtons } from "@/components/reports/SaleDocumentButtons";
import { CashClosingPanel } from "@/components/reports/CashClosingPanel";
import { Price } from "@/components/money/Price";
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, formatDate } from "@/lib/format";
import { eurCentsToLocal, formatCurrencyCents, formatLocalCurrency, getCurrency } from "@/lib/currencies";
import { legacyCurrencyForPayment } from "@/lib/payment-currency";
import { getBranding, getExchangeRateInfo, getFiscalData } from "@/lib/actions/settings";
import { requireSession } from "@/lib/session";
import { listRecentSales } from "@/lib/actions/sales";
import { getDailyClosingSummary } from "@/lib/actions/cash-closing";
import { todayDateString } from "@/lib/report-types";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const session = await requireSession();
  const todayStr = todayDateString();

  const [
    recentSales,
    { rate, localCurrencyCode, exchangeRateEnabled, referenceCurrency, printPaperSize },
    { logoDataUrl },
    fiscalData,
    todaySummary,
  ] = await Promise.all([
    listRecentSales(500),
    getExchangeRateInfo(),
    getBranding(),
    getFiscalData(),
    getDailyClosingSummary(todayStr),
  ]);
  const company = { name: session.companyName, logoDataUrl, ...fiscalData };
  const localCurrencyName = getCurrency(localCurrencyCode).name.split(" (")[0];
  // Outstanding balance for a CREDIT sale — equal to totalCents until any
  // abono has been registered against it (see registerPayment).
  const remainingCentsBySaleId = new Map(
    recentSales.map((sale) => [
      sale.id,
      sale.totalCents - sale.payments.reduce((sum, p) => sum + p.amountEurCents, 0),
    ])
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Reportes</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Historial de ventas de contado y a crédito — registra pagos, anula o elimina ventas
          desde aquí.
        </p>
      </div>

      {todaySummary && (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Cierre de caja</CardTitle>
          </CardHeader>
          <CardContent>
            <CashClosingPanel
              initialSummary={todaySummary}
              todayStr={todayStr}
              rate={rate}
              currencyCode={localCurrencyCode}
              exchangeRateEnabled={exchangeRateEnabled}
              referenceCurrency={referenceCurrency}
              company={company}
              branchName={session.branchName}
              printPaperSize={printPaperSize}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Ventas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead>Artículos</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Moneda</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Documentos</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentSales.map((sale) => (
                  <TableRow key={sale.id} className={sale.voided ? "opacity-50" : undefined}>
                    <TableCell>
                      {formatDate(sale.createdAt)}
                      {sale.voided && (
                        <span className="block">
                          <Badge variant="destructive">Anulada</Badge>
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {sale.customerFirstName
                        ? `${sale.customerFirstName} ${sale.customerLastName ?? ""}`.trim()
                        : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{sale.sellerName ?? "—"}</TableCell>
                    <TableCell>
                      {sale.items.reduce((sum, i) => sum + i.quantity, 0)}
                    </TableCell>
                    <TableCell>
                      {sale.payments.length > 0 ? (
                        <>
                          {sale.payments.map((p) => (
                            <span key={p.id} className="block text-xs">
                              {PAYMENT_METHOD_LABELS[p.paymentMethod]}:{" "}
                              {formatCurrencyCents(
                                p.currencyCode ?? legacyCurrencyForPayment(p.paymentMethod, referenceCurrency),
                                p.amountCurrencyCents ?? p.amountEurCents
                              )}
                              {p.reference && ` (${p.reference})`}
                              {(p.createdAt || p.exchangeRate != null) && (
                                <span className="block text-muted-foreground">
                                  {formatDate(p.createdAt)}
                                  {p.exchangeRate != null &&
                                    ` · Tasa ${formatLocalCurrency(Number(p.exchangeRate), localCurrencyCode)}`}
                                </span>
                              )}
                            </span>
                          ))}
                        </>
                      ) : sale.paymentMethod ? (
                        <>
                          {PAYMENT_METHOD_LABELS[sale.paymentMethod]}
                          {sale.paymentReference && (
                            <span className="block text-xs text-muted-foreground">
                              Ref: {sale.paymentReference}
                            </span>
                          )}
                          {exchangeRateEnabled && sale.paidExchangeRate != null && sale.paidAt && (
                            <span className="block text-xs text-muted-foreground">
                              Cobrado: {formatDate(sale.paidAt)} · Tasa{" "}
                              {formatLocalCurrency(Number(sale.paidExchangeRate), localCurrencyCode)}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                      {sale.paymentStatus === "CREDIT" &&
                        remainingCentsBySaleId.get(sale.id) !== sale.totalCents && (
                          <span className="block text-xs font-medium text-warning">
                            Saldo pendiente:{" "}
                            {exchangeRateEnabled && rate != null
                              ? formatLocalCurrency(
                                  eurCentsToLocal(remainingCentsBySaleId.get(sale.id) ?? 0, rate),
                                  localCurrencyCode
                                )
                              : formatCurrencyCents(referenceCurrency, remainingCentsBySaleId.get(sale.id) ?? 0)}
                          </span>
                        )}
                    </TableCell>
                    <TableCell>
                      {sale.paymentStatus === "CREDIT" ? (
                        <Badge variant="destructive">{PAYMENT_STATUS_LABELS.CREDIT}</Badge>
                      ) : (
                        <Badge variant="success">{PAYMENT_STATUS_LABELS.PAID}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {!exchangeRateEnabled ? (
                        <Badge variant="outline">{referenceCurrency}</Badge>
                      ) : sale.paidInForeignCurrency ? (
                        <Badge variant="secondary">Divisas</Badge>
                      ) : (
                        <Badge variant="outline">{localCurrencyName}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Price
                        eurCents={sale.totalCents}
                        rate={
                          sale.paidExchangeRate != null
                            ? Number(sale.paidExchangeRate)
                            : sale.exchangeRate != null
                              ? Number(sale.exchangeRate)
                              : rate
                        }
                        currencyCode={localCurrencyCode}
                        exchangeRateEnabled={exchangeRateEnabled}
                        referenceCurrency={referenceCurrency}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <SaleDocumentButtons
                        sale={{
                          ...sale,
                          exchangeRate: sale.exchangeRate != null ? Number(sale.exchangeRate) : null,
                          paidExchangeRate:
                            sale.paidExchangeRate != null ? Number(sale.paidExchangeRate) : null,
                          payments: sale.payments.map((p) => ({
                            ...p,
                            exchangeRate: p.exchangeRate != null ? Number(p.exchangeRate) : null,
                          })),
                        }}
                        company={company}
                        currentRate={rate}
                        currencyCode={localCurrencyCode}
                        exchangeRateEnabled={exchangeRateEnabled}
                        referenceCurrency={referenceCurrency}
                        printPaperSize={printPaperSize}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <SaleActions
                        saleId={sale.id}
                        voided={sale.voided}
                        paymentStatus={sale.paymentStatus}
                        totalCents={sale.totalCents}
                        remainingCents={remainingCentsBySaleId.get(sale.id) ?? sale.totalCents}
                        currentRate={rate}
                        currencyCode={localCurrencyCode}
                        exchangeRateEnabled={exchangeRateEnabled}
                        referenceCurrency={referenceCurrency}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {recentSales.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                      Aún no hay ventas registradas.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
