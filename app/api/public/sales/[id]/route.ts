import { NextResponse, type NextRequest } from "next/server";
import { withSuperAdmin } from "@/lib/tenant-db";
import {
  buildDeliveryNotePDF,
  buildPaymentReceiptPDF,
  controlNumberLabel,
  receiptControlNumberLabel,
  invoiceNumberLabel,
  type DeliveryNoteCompany,
} from "@/lib/delivery-note";

// Public, unauthenticated PDF endpoint for the "share by WhatsApp/QR"
// feature (see components/print/ShareDialog.tsx) — regenerates the note,
// receipt, or factura on demand from what's already in the database instead
// of storing a file anywhere. Its only protection is that `id` (a cuid) is
// unguessable, same trust model as e.g. a Stripe/Mercado Pago receipt link:
// read-only, one document at a time, no listing endpoint exists anywhere.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const docParam = request.nextUrl.searchParams.get("doc");
  const docType = docParam === "receipt" ? "receipt" : docParam === "invoice" ? "invoice" : "note";

  const sale = await withSuperAdmin((tx) =>
    tx.sale.findUnique({
      where: { id },
      include: { items: true, payments: true, company: true },
    })
  );

  if (!sale) {
    return new NextResponse("Documento no encontrado", { status: 404 });
  }
  if (docType === "receipt" && sale.paidExchangeRate == null) {
    // Matches SaleDocumentButtons.tsx's own gate for showing "Recibo de
    // pago" — only set once a CREDIT sale is actually collected via
    // registerPayment, never for a sale paid directly at checkout.
    return new NextResponse("Este recibo todavía no está disponible", { status: 404 });
  }
  if (docType === "invoice" && sale.invoiceNumber == null) {
    // A Factura only exists once someone has generated one at least once
    // from SaleDocumentButtons.tsx (which assigns the number) — this route
    // never assigns one itself, since a GET request has no session to
    // attribute the action to.
    return new NextResponse("Esta factura todavía no está disponible", { status: 404 });
  }

  const company: DeliveryNoteCompany = {
    name: sale.company.name,
    logoDataUrl: sale.company.logoDataUrl,
    fiscalLegalName: sale.company.fiscalLegalName,
    fiscalRif: sale.company.fiscalRif,
    fiscalAddress: sale.company.fiscalAddress,
    fiscalPhone: sale.company.fiscalPhone,
  };

  const saleForPdf = {
    ...sale,
    exchangeRate: sale.exchangeRate != null ? Number(sale.exchangeRate) : null,
    paidExchangeRate: sale.paidExchangeRate != null ? Number(sale.paidExchangeRate) : null,
    payments: sale.payments.map((p) => ({
      ...p,
      exchangeRate: p.exchangeRate != null ? Number(p.exchangeRate) : null,
    })),
  };

  const rate =
    docType === "receipt"
      ? (saleForPdf.paidExchangeRate ?? saleForPdf.exchangeRate ?? (sale.company.exchangeRate != null ? Number(sale.company.exchangeRate) : null))
      : (saleForPdf.exchangeRate ?? (sale.company.exchangeRate != null ? Number(sale.company.exchangeRate) : null));

  const doc =
    docType === "receipt"
      ? await buildPaymentReceiptPDF(
          saleForPdf,
          company,
          rate,
          sale.company.localCurrencyCode,
          sale.company.exchangeRateEnabled,
          sale.company.referenceCurrency
        )
      : await buildDeliveryNotePDF(
          saleForPdf,
          company,
          rate,
          sale.company.localCurrencyCode,
          sale.company.exchangeRateEnabled,
          sale.company.referenceCurrency,
          "letter",
          docType === "invoice" ? "invoice" : "delivery-note"
        );

  const pdfBytes = doc.output("arraybuffer");
  const filename =
    docType === "receipt"
      ? `recibo-pago-${receiptControlNumberLabel(sale)}.pdf`
      : docType === "invoice"
        ? `factura-${invoiceNumberLabel(sale)}.pdf`
        : `nota-entrega-${controlNumberLabel(sale)}.pdf`;

  return new NextResponse(pdfBytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
    },
  });
}
