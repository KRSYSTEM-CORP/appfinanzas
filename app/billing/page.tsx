import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PaymentReportForm } from "@/components/billing/PaymentReportForm";
import { getBillingInfo, listMyPaymentReports } from "@/lib/actions/billing";
import { formatDate, formatUSD, PAYMENT_METHOD_LABELS } from "@/lib/format";
import { formatLocalCurrency } from "@/lib/currencies";
import { WHATSAPP_PHONE } from "@/lib/legal";
import type { PaymentReportStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<PaymentReportStatus, string> = {
  PENDING: "Pendiente de revisión",
  APPROVED: "Aprobado",
  REJECTED: "Rechazado",
};

export default async function BillingPage() {
  const [info, reports] = await Promise.all([getBillingInfo(), listMyPaymentReports()]);

  // The Bs equivalent is only shown here as a heads-up for VES companies
  // (who typically pay via Pago Móvil) while reporting a payment — the
  // headline "cost" is always the USD amount; the actual Bs amount used
  // when a report is approved is computed from whatever the platform rate
  // is at that moment, not frozen here.
  const previewBs =
    info.localCurrencyCode === "VES" && info.monthlyFeeUsdCents != null && info.billingExchangeRate != null
      ? (info.monthlyFeeUsdCents / 100) * info.billingExchangeRate
      : null;

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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
          <Card>
            <CardHeader>
              <CardTitle>Costo mensual</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {info.monthlyFeeUsdCents != null ? (
                <>
                  <span className="text-2xl font-semibold">{formatUSD(info.monthlyFeeUsdCents)}</span>
                  {previewBs != null && (
                    <span className="text-xs text-muted-foreground">
                      ≈ {formatLocalCurrency(previewBs, info.localCurrencyCode)} a la tasa vigente
                    </span>
                  )}
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
              <CardTitle>Cómo pagar</CardTitle>
            </CardHeader>
            <CardContent>
              {info.paymentInstructions ? (
                <p className="text-sm whitespace-pre-line">{info.paymentInstructions}</p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  El super admin todavía no ha configurado el método de pago.
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
              {previewBs != null && (
                <p className="text-sm text-muted-foreground">
                  Monto aproximado en bolívares a la tasa vigente:{" "}
                  <span className="font-medium">{formatLocalCurrency(previewBs, info.localCurrencyCode)}</span>
                </p>
              )}
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 flex flex-col gap-2">
                <p className="text-sm font-medium">
                  Pasos obligatorios para activar tu suscripción:
                </p>
                <ol className="text-sm text-muted-foreground list-decimal list-inside flex flex-col gap-1">
                  <li>Paga por Transferencia Bancaria o Pago Móvil, con los datos de arriba.</li>
                  <li>Sube tu comprobante de pago aquí abajo (obligatorio).</li>
                  <li>
                    Envía el mismo comprobante también por WhatsApp (obligatorio) — así te
                    confirmamos más rápido.
                  </li>
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
              <PaymentReportForm />
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Historial de reportes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Métodos de pago</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Nota del admin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((r) => {
                  const totalUsdCents = r.lines.reduce((sum, l) => sum + l.amountUsdCents, 0);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(r.createdAt)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {r.lines.map((line, i) => (
                          <div key={i}>
                            {PAYMENT_METHOD_LABELS[line.paymentMethod]}: {formatUSD(line.amountUsdCents)}
                            {line.reference && ` (${line.reference})`}
                          </div>
                        ))}
                      </TableCell>
                      <TableCell className="font-medium">{formatUSD(totalUsdCents)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            r.status === "APPROVED"
                              ? "secondary"
                              : r.status === "PENDING"
                                ? "outline"
                                : "destructive"
                          }
                        >
                          {STATUS_LABELS[r.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.reviewNote ?? "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {reports.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Todavía no has reportado ningún pago.
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
