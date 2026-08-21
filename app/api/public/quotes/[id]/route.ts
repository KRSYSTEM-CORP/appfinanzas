import { NextResponse } from "next/server";
import { withSuperAdmin } from "@/lib/tenant-db";
import { buildQuotePDF, quoteControlNumberLabel } from "@/lib/quote-pdf";
import type { DeliveryNoteCompany } from "@/lib/delivery-note";

// Public, unauthenticated PDF endpoint for sharing a presupuesto by
// WhatsApp/QR — see app/api/public/sales/[id]/route.ts for the trust model
// (unguessable id, no listing endpoint, read-only).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const quote = await withSuperAdmin((tx) =>
    tx.quote.findUnique({
      where: { id },
      include: { items: true, company: true },
    })
  );

  if (!quote) {
    return new NextResponse("Documento no encontrado", { status: 404 });
  }

  const company: DeliveryNoteCompany = {
    name: quote.company.name,
    logoDataUrl: quote.company.logoDataUrl,
    fiscalLegalName: quote.company.fiscalLegalName,
    fiscalRif: quote.company.fiscalRif,
    fiscalAddress: quote.company.fiscalAddress,
    fiscalPhone: quote.company.fiscalPhone,
  };

  const exchangeRate = quote.exchangeRate != null ? Number(quote.exchangeRate) : null;
  const rate = exchangeRate ?? (quote.company.exchangeRate != null ? Number(quote.company.exchangeRate) : null);

  const doc = await buildQuotePDF(
    quote,
    company,
    rate,
    quote.company.localCurrencyCode,
    quote.company.exchangeRateEnabled,
    quote.company.referenceCurrency,
    "letter",
    quote.useLocalCurrency
  );

  const pdfBytes = doc.output("arraybuffer");

  return new NextResponse(pdfBytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="presupuesto-${quoteControlNumberLabel(quote)}.pdf"`,
    },
  });
}
