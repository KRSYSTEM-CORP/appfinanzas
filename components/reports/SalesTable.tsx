import { ReceiptTextIcon } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { SalesMasterDetail } from "@/components/reports/SalesMasterDetail";
import { toPlainSale } from "@/lib/sales-plain";
import type { DeliveryNoteCompany } from "@/lib/delivery-note";
import type { listRecentSales } from "@/lib/actions/sales";
import type { PrintPaperSize, ReferenceCurrency } from "@prisma/client";

const DEFAULT_EMPTY_LABEL = "Aún no hay ventas registradas.";

type Sale = Awaited<ReturnType<typeof listRecentSales>>[number];

// Shared by Reportes (every sale) and Contabilidad → Ventas por vendedor (one
// seller's sales) so both stay visually identical — same columns, same
// document/action buttons — rather than two hand-maintained copies drifting
// apart. showSellerColumn is the only structural difference between the two
// call sites (redundant once a table is already scoped to one seller).
export function SalesTable({
  sales,
  company,
  rate,
  localCurrencyCode,
  localCurrencyName,
  exchangeRateEnabled,
  referenceCurrency,
  printPaperSize,
  showSellerColumn = true,
  emptyLabel = DEFAULT_EMPTY_LABEL,
}: {
  sales: Sale[];
  company: DeliveryNoteCompany;
  rate: number | null;
  localCurrencyCode: string;
  localCurrencyName: string;
  exchangeRateEnabled: boolean;
  referenceCurrency: ReferenceCurrency;
  printPaperSize: PrintPaperSize;
  showSellerColumn?: boolean;
  emptyLabel?: string;
}) {
  // Outstanding balance for a CREDIT sale — equal to totalCents until any
  // abono has been registered against it (see registerPayment).
  const remainingCentsBySaleId = new Map(
    sales.map((sale) => [
      sale.id,
      sale.totalCents - sale.payments.reduce((sum, p) => sum + p.amountEurCents, 0),
    ])
  );

  return (
    <>
    <SalesMasterDetail
      sales={sales.map(toPlainSale)}
      remainingCentsBySaleId={Object.fromEntries(remainingCentsBySaleId)}
      company={company}
      rate={rate}
      localCurrencyCode={localCurrencyCode}
      localCurrencyName={localCurrencyName}
      exchangeRateEnabled={exchangeRateEnabled}
      referenceCurrency={referenceCurrency}
      printPaperSize={printPaperSize}
      showSellerColumn={showSellerColumn}
      empty={
        <EmptyState
          icon={ReceiptTextIcon}
          title={emptyLabel}
          action={emptyLabel === DEFAULT_EMPTY_LABEL ? { href: "/pos", label: "Ir al punto de venta" } : undefined}
          className="rounded-lg border bg-card py-14 shadow-xs"
        />
      }
    />
    </>
  );
}
