import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PaymentHistoryList } from "@/components/billing/PaymentHistoryList";
import { PaymentReportForm } from "@/components/billing/PaymentReportForm";
import { getBillingInfo, listMyPaymentReports } from "@/lib/actions/billing";
import { formatDate, formatUSD, formatUSDT } from "@/lib/format";
import { formatLocalCurrency } from "@/lib/currencies";
import { WHATSAPP_PHONE } from "@/lib/legal";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const [info, reports] = await Promise.all([getBillingInfo(), listMyPaymentReports()]);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Suscripción mensual</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Costo mensual de la plataforma, cómo pagarlo y el estado de tus reportes de pago.
        </p>
      </div>

      {info.isExempt ? (
        <Card className="max-w-md">
          <CardContent className="pt-6">
            <Badge variant="outline">Exonerada</Badge>
            <p className="text-sm text-muted-foreground mt-2">
              Tu empresa está exonerada de todo cobro de mantenimiento por el super admin. No
              necesitas reportar pagos.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl">
          <Card>
            <CardHeader>
              <CardTitle>Costo mensual</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {info.monthlyFeeUsdCents != null ? (
                <>
                  <span className="text-2xl font-semibold">{formatUSD(info.monthlyFeeUsdCents)}</span>
                </>
              ) : (
                <span className="text-sm text-muted-foreground">
                  Todavía no tienes un ciclo de cobro configurado.
                </span>
              )}
              {info.nextPaymentDueDate && (
                <span className="text-sm text-muted-foreground">
                  Vence el {formatDate(info.nextPaymentDueDate)}
                </span>
              )}
              {info.blocked && (
                <Badge variant="destructive" className="w-fit">
                  Cuenta bloqueada por pago
                </Badge>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cómo pagar — Binance (USDT)</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {info.monthlyFeeUsdCents != null && (
                <p className="text-sm">
                  <span className="text-muted-foreground">Monto a pagar: </span>
                  <span className="font-medium">{formatUSDT(info.monthlyFeeUsdCents)}</span>
                </p>
              )}
              {info.binanceQrDataUrl || info.binanceId ? (
                <>
                  {info.binanceQrDataUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={info.binanceQrDataUrl}
                      alt="QR de Binance Pay"
                      className="h-40 w-40 rounded-lg border object-cover"
                    />
                  )}
                  {info.binanceId && (
                    <p className="text-sm">
                      <span className="text-muted-foreground">ID de Binance: </span>
                      <span className="font-medium">{info.binanceId}</span>
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  El super admin todavía no ha configurado los datos de Binance.
                </p>
              )}
              {info.paymentInstructions && (
                <p className="text-sm text-muted-foreground whitespace-pre-line">{info.paymentInstructions}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pago Móvil</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {info.monthlyFeeLocalAmount != null && (
                <p className="text-sm">
                  <span className="text-muted-foreground">Monto a pagar: </span>
                  <span className="font-medium">
                    {formatLocalCurrency(info.monthlyFeeLocalAmount, "VES")}
                  </span>
                </p>
              )}
              {info.pagoMovilBank || info.pagoMovilPhone || info.pagoMovilId ? (
                <>
                  {info.pagoMovilBank && (
                    <p className="text-sm">
                      <span className="text-muted-foreground">Banco: </span>
                      <span className="font-medium">{info.pagoMovilBank}</span>
                    </p>
                  )}
                  {info.pagoMovilPhone && (
                    <p className="text-sm">
                      <span className="text-muted-foreground">Teléfono: </span>
                      <span className="font-medium">{info.pagoMovilPhone}</span>
                    </p>
                  )}
                  {info.pagoMovilId && (
                    <p className="text-sm">
                      <span className="text-muted-foreground">Cédula/RIF: </span>
                      <span className="font-medium">{info.pagoMovilId}</span>
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {info.monthlyFeeLocalAmount != null
                      ? "Este monto se actualiza a diario según la tasa BCV de KR System."
                      : "Paga el equivalente en bolívares a la tasa del día."}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  El super admin todavía no ha configurado los datos de Pago Móvil.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {!info.isExempt && (
        <div className="max-w-3xl">
          <Card>
            <CardHeader>
              <CardTitle>Reportar pago</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 flex flex-col gap-2">
                <p className="text-sm font-medium">
                  Pasos obligatorios para activar tu suscripción:
                </p>
                <ol className="text-sm text-muted-foreground list-decimal list-inside flex flex-col gap-1">
                  <li>Paga por Binance (USDT) o Pago Móvil, con los datos de arriba.</li>
                  <li>Completa el formulario de abajo con los datos del pago.</li>
                  <li>Envía tu comprobante de pago por WhatsApp (obligatorio) — así te confirmamos más rápido.</li>
                </ol>
                <a
                  href={`https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(
                    `Hola, les envío el comprobante de pago de la suscripción de ${info.companyName}.`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-primary underline underline-offset-4 w-fit"
                >
                  Enviar comprobante por WhatsApp →
                </a>
              </div>
              <PaymentReportForm
                monthlyFeeUsdCents={info.monthlyFeeUsdCents}
                monthlyFeeLocalAmount={info.monthlyFeeLocalAmount}
                platformRate={info.platformRate}
              />
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Historial de reportes</CardTitle>
        </CardHeader>
        <CardContent>
          <PaymentHistoryList
            reports={reports.map((r) => ({
              id: r.id,
              createdAt: r.createdAt,
              status: r.status,
              reviewNote: r.reviewNote,
              lines: r.lines.map((l) => ({
                paymentMethod: l.paymentMethod,
                amountUsdCents: l.amountUsdCents,
                reference: l.reference,
              })),
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
