"use client";

import { ReceiptIcon } from "lucide-react";
import type { PaymentMethod, PaymentReportStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { MasterDetail, MobileRow } from "@/components/shared/MasterDetail";
import { formatDate, formatUSD, PAYMENT_METHOD_LABELS } from "@/lib/format";

// Slim shape: the page strips the proof image (a large base64 string) so it
// never crosses into the client bundle.
export type PaymentHistoryItem = {
  id: string;
  createdAt: Date;
  status: PaymentReportStatus;
  reviewNote: string | null;
  lines: { paymentMethod: PaymentMethod; amountUsdCents: number; reference: string | null }[];
};

const STATUS_LABELS: Record<PaymentReportStatus, string> = {
  PENDING: "Pendiente de revisión",
  APPROVED: "Aprobado",
  REJECTED: "Rechazado",
};

const statusVariant = (s: PaymentReportStatus) =>
  s === "APPROVED" ? "secondary" : s === "PENDING" ? "outline" : "destructive";

const totalOf = (r: PaymentHistoryItem) => r.lines.reduce((sum, l) => sum + l.amountUsdCents, 0);

export function PaymentHistoryList({ reports }: { reports: PaymentHistoryItem[] }) {
  return (
    <MasterDetail
      items={reports}
      label="Historial de reportes"
      empty={
        <div className="flex flex-col items-center gap-3 rounded-lg border bg-card py-14 text-center shadow-xs">
          <div className="flex items-center justify-center size-11 rounded-full bg-muted text-muted-foreground">
            <ReceiptIcon className="size-5" />
          </div>
          <p className="text-sm text-muted-foreground">Todavía no has reportado ningún pago.</p>
        </div>
      }
      renderRowMobile={(r) => (
        <MobileRow
          title={formatDate(r.createdAt)}
          meta={r.lines.map((l) => PAYMENT_METHOD_LABELS[l.paymentMethod]).join(", ")}
          badge={<Badge variant={statusVariant(r.status)}>{STATUS_LABELS[r.status]}</Badge>}
          amount={<span className="font-semibold tabular-nums">{formatUSD(totalOf(r))}</span>}
        />
      )}
      renderRow={(r) => (
        <>
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted">
            <ReceiptIcon className="size-4 text-muted-foreground/60" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{formatDate(r.createdAt)}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {r.lines.map((l) => PAYMENT_METHOD_LABELS[l.paymentMethod]).join(", ")}
            </span>
          </span>
          <Badge variant={statusVariant(r.status)}>{STATUS_LABELS[r.status]}</Badge>
          <span className="w-24 shrink-0 text-right text-sm font-medium tabular-nums">{formatUSD(totalOf(r))}</span>
        </>
      )}
      renderDetail={(r) => (
        <>
          <div className="flex flex-col gap-0.5">
            <h3 className="text-lg font-semibold leading-tight tabular-nums">{formatUSD(totalOf(r))}</h3>
            <p className="text-sm text-muted-foreground">Reportado el {formatDate(r.createdAt)}</p>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div className="col-span-2 flex flex-col gap-1">
              <dt className="text-xs text-muted-foreground">Estado</dt>
              <dd>
                <Badge variant={statusVariant(r.status)}>{STATUS_LABELS[r.status]}</Badge>
              </dd>
            </div>
            <div className="col-span-2 flex flex-col gap-1">
              <dt className="text-xs text-muted-foreground">Métodos de pago</dt>
              <dd className="flex flex-col gap-0.5 font-medium">
                {r.lines.map((line, i) => (
                  <span key={i}>
                    {PAYMENT_METHOD_LABELS[line.paymentMethod]}: {formatUSD(line.amountUsdCents)}
                    {line.reference && <span className="font-normal text-muted-foreground"> ({line.reference})</span>}
                  </span>
                ))}
              </dd>
            </div>
            <div className="col-span-2 flex flex-col gap-1">
              <dt className="text-xs text-muted-foreground">Nota del admin</dt>
              <dd className="font-medium">{r.reviewNote ?? "—"}</dd>
            </div>
          </dl>
        </>
      )}
    />
  );
}
