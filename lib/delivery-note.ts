import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { PAYMENT_METHOD_LABELS, formatDate } from "@/lib/format";
import { DEFAULT_CURRENCY_CODE, eurCentsToLocal, formatCurrencyCents, formatLocalCurrency, referenceNote } from "@/lib/currencies";
import { legacyCurrencyForPayment } from "@/lib/payment-currency";
import { COPYRIGHT_LINE } from "@/lib/legal";
import type { PaymentMethod, PaymentStatus, ReferenceCurrency } from "@prisma/client";

export { COPYRIGHT_LINE };

export type SalePaymentLine = {
  paymentMethod: PaymentMethod;
  amountEurCents: number;
  currencyCode?: string | null;
  amountCurrencyCents?: number | null;
  reference: string | null;
  // Present on abono installments toward a credit sale (see registerPayment,
  // lib/actions/sales.ts) — each can fall on a different day at a different
  // rate. Absent/null on rows from before this snapshot existed.
  createdAt?: Date;
  exchangeRate?: number | null;
};

export type DeliveryNoteSale = {
  id: string;
  controlNumber: number | null;
  receiptControlNumber: number | null;
  invoiceNumber?: number | null;
  createdAt: Date;
  totalCents: number;
  // IVA breakdown (see lib/tax.ts) — both default to 0 for sales completed
  // before this feature existed, in which case baseImponibleCents + taxCents
  // won't equal totalCents; the breakdown is only rendered when taxCents > 0.
  baseImponibleCents?: number;
  taxCents?: number;
  paymentMethod: PaymentMethod | null;
  paymentStatus: PaymentStatus;
  paymentReference: string | null;
  paidAt?: Date | null;
  customerFirstName: string | null;
  customerLastName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  customerRif?: string | null;
  sellerName?: string | null;
  // Free-text, optional — printed on the Nota de Entrega/Factura when set
  // (see renderNote below), not shown on the Recibo de Pago.
  note?: string | null;
  items: {
    productName: string;
    category?: string | null;
    quantity: number;
    unitPriceCents: number;
    subtotalCents: number;
  }[];
  // Payment breakdown when split across multiple methods. Sales created
  // before this feature existed have no rows here — the singular
  // paymentMethod/paymentReference fields above are used as a fallback.
  payments?: SalePaymentLine[];
};

export type DeliveryNoteCompany = {
  name: string;
  logoDataUrl: string | null;
  fiscalLegalName?: string | null;
  fiscalRif?: string | null;
  fiscalAddress?: string | null;
  fiscalPhone?: string | null;
};

export function dataUrlImageFormat(dataUrl: string): "PNG" | "JPEG" {
  return dataUrl.startsWith("data:image/png") ? "PNG" : "JPEG";
}

export function loadImageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  // No DOM Image element exists when this runs inside a server Route
  // Handler (see app/api/public/*/route.ts, which regenerate a PDF on
  // demand for the WhatsApp/QR share link) — fall back to a fixed square box
  // instead of adding an image-parsing dependency just for that one case.
  // The logo may render slightly stretched there; the in-app PDF download
  // still measures the real aspect ratio via the branch below.
  if (typeof Image === "undefined") {
    return Promise.resolve({ width: 200, height: 200 });
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("No se pudo cargar el logo"));
    img.src = dataUrl;
  });
}

export function controlNumberLabel(sale: Pick<DeliveryNoteSale, "id" | "controlNumber">): string {
  return sale.controlNumber != null
    ? String(sale.controlNumber).padStart(6, "0")
    : sale.id.slice(-8).toUpperCase();
}

// The Recibo de Pago's own progressive sequence — independent of
// controlNumber above (the Nota de Entrega's). Only set once a credit sale's
// debt is actually collected (see registerPayment).
export function receiptControlNumberLabel(sale: Pick<DeliveryNoteSale, "id" | "receiptControlNumber">): string {
  return sale.receiptControlNumber != null
    ? String(sale.receiptControlNumber).padStart(6, "0")
    : sale.id.slice(-8).toUpperCase();
}

// The Factura's own progressive sequence — independent of controlNumber and
// receiptControlNumber. Only assigned the moment someone actually requests a
// Factura for this sale (see getOrCreateInvoiceNumber in
// lib/actions/sales.ts) — a placeholder ahead of real SENIAT fiscal-machine
// integration, not a fiscally-compliant invoice number yet.
export function invoiceNumberLabel(sale: Pick<DeliveryNoteSale, "id" | "invoiceNumber">): string {
  return sale.invoiceNumber != null
    ? String(sale.invoiceNumber).padStart(6, "0")
    : sale.id.slice(-8).toUpperCase();
}

// Products can share the same name but differ by category — append it to
// the printed description so a document never leaves it ambiguous which one
// was actually sold.
export function itemDescription(item: { productName: string; category?: string | null }): string {
  return item.category ? `${item.productName} (${item.category})` : item.productName;
}

function fiscalLines(company: DeliveryNoteCompany): string[] {
  const lines: string[] = [];
  if (company.fiscalLegalName) lines.push(company.fiscalLegalName);
  if (company.fiscalRif) lines.push(`RIF: ${company.fiscalRif}`);
  if (company.fiscalAddress) lines.push(company.fiscalAddress);
  if (company.fiscalPhone) lines.push(`Tel: ${company.fiscalPhone}`);
  return lines;
}

export function renderFiscalHeader(doc: jsPDF, company: DeliveryNoteCompany, x: number, startY: number): number {
  const lines = fiscalLines(company);
  if (lines.length === 0) return startY;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(90);
  let y = startY;
  for (const line of lines) {
    doc.text(line, x, y, { maxWidth: 260 });
    y += 10;
  }
  doc.setTextColor(0, 0, 0);
  return y;
}

// Renders the logo + company name + fiscal lines block that opens every
// generated document. The company name is capped to roughly the left half
// of the page and wraps onto extra lines instead of running unbounded to the
// right — without this, a long company name collided with the centered
// document title (FACTURA/NOTA DE ENTREGA/PRESUPUESTO/RECIBO DE PAGO/CIERRE
// DE CAJA) drawn on the same baseline, making both illegible. Shared by
// every PDF builder (delivery note, receipt, quote, cash closing) so the fix
// — and the logo-loading logic — only exists in one place.
export async function renderCompanyHeader(
  doc: jsPDF,
  company: DeliveryNoteCompany,
  margin: number,
  y: number,
  pageWidth: number
): Promise<number> {
  let logoWidth = 0;
  if (company.logoDataUrl) {
    try {
      const { width, height } = await loadImageSize(company.logoDataUrl);
      const maxBox = 50;
      const scale = Math.min(1, maxBox / Math.max(width, height));
      logoWidth = width * scale;
      const logoHeight = height * scale;
      doc.addImage(company.logoDataUrl, dataUrlImageFormat(company.logoDataUrl), margin, y, logoWidth, logoHeight);
    } catch {
      logoWidth = 0;
    }
  }

  const textX = margin + (logoWidth > 0 ? logoWidth + 12 : 0);

  // Measure the actual widest document title ("NOTA DE ENTREGA" — longer
  // than FACTURA/PRESUPUESTO/RECIBO DE PAGO/CIERRE DE CAJA) at the real
  // font/size it's drawn with, rather than guessing a fixed pixel budget —
  // that's what let a long company name creep far enough right to collide
  // with the title in the first place, even after adding a width cap.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  const titleHalfWidth = doc.getTextWidth("NOTA DE ENTREGA") / 2;
  const titleLeftEdge = pageWidth / 2 - titleHalfWidth - 16;

  const nameMaxWidth = Math.max(100, titleLeftEdge - textX);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  const nameLines = doc.splitTextToSize(company.name, nameMaxWidth) as string[];
  doc.text(nameLines, textX, y + 20);
  const nameBottomY = y + 20 + (nameLines.length - 1) * 15;

  return renderFiscalHeader(doc, company, textX, nameBottomY + 12);
}

// Optional free-text note (Sale.note / Quote.note) — rendered between the
// customer info block and the items table, wrapping across lines as needed.
// Shared by buildDeliveryNotePDF and lib/quote-pdf.ts's buildQuotePDF.
export function renderNote(
  doc: jsPDF,
  note: string | null | undefined,
  margin: number,
  startY: number,
  pageWidth: number
): number {
  if (!note) return startY;
  let y = startY;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Nota:", margin, y);
  doc.setFont("helvetica", "normal");
  const maxWidth = pageWidth - margin * 2 - 45;
  const lines = doc.splitTextToSize(note, maxWidth) as string[];
  doc.text(lines, margin + 45, y);
  y += lines.length * 13 + 6;
  return y;
}

// Resolves the payment breakdown to render: the actual split-payment rows if
// present, otherwise falls back to the sale's own singular fields (older
// sales, created before split payments existed).
export function resolvePaymentLines(sale: DeliveryNoteSale, referenceCurrency: ReferenceCurrency): SalePaymentLine[] {
  if (sale.payments && sale.payments.length > 0) return sale.payments;
  if (sale.paymentMethod) {
    return [
      {
        paymentMethod: sale.paymentMethod,
        amountEurCents: sale.totalCents,
        currencyCode: legacyCurrencyForPayment(sale.paymentMethod, referenceCurrency),
        amountCurrencyCents: sale.totalCents,
        reference: sale.paymentReference,
      },
    ];
  }
  return [];
}

function renderPaymentSection(
  doc: jsPDF,
  sale: DeliveryNoteSale,
  margin: number,
  startY: number,
  referenceCurrency: ReferenceCurrency,
  currencyCode: string = DEFAULT_CURRENCY_CODE
): number {
  let y = startY;
  if (sale.paymentStatus === "CREDIT") {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(180, 30, 30);
    doc.setFontSize(12);
    doc.text("PAGO PENDIENTE", margin, y);
    doc.setTextColor(0, 0, 0);
    return y + 26;
  }

  const payments = resolvePaymentLines(sale, referenceCurrency);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  if (payments.length <= 1) {
    const p = payments[0];
    doc.text(`Método de pago: ${p ? PAYMENT_METHOD_LABELS[p.paymentMethod] : "—"}`, margin, y);
    y += 16;
    if (p?.reference) {
      doc.text(`Referencia: ${p.reference}`, margin, y);
      y += 16;
    }
  } else {
    // More than one line means this was collected across several abonos
    // (or split at checkout) — show each installment's own date and rate,
    // not just a combined total, since they can each fall on a different
    // day at a different exchange rate (see registerPayment).
    doc.text("Métodos de pago:", margin, y);
    y += 15;
    for (const p of payments) {
      const refPart = p.reference ? ` (Ref: ${p.reference})` : "";
      const currency = p.currencyCode ?? legacyCurrencyForPayment(p.paymentMethod, referenceCurrency);
      const cents = p.amountCurrencyCents ?? p.amountEurCents;
      doc.text(
        `• ${PAYMENT_METHOD_LABELS[p.paymentMethod]}: ${formatCurrencyCents(currency, cents)}${refPart}`,
        margin + 8,
        y
      );
      y += 14;
      if (p.createdAt || p.exchangeRate != null) {
        const parts: string[] = [];
        if (p.createdAt) parts.push(formatDate(p.createdAt));
        if (p.exchangeRate != null) parts.push(`Tasa ${formatLocalCurrency(p.exchangeRate, currencyCode)}`);
        doc.setFontSize(8);
        doc.setTextColor(110);
        doc.text(parts.join(" · "), margin + 14, y);
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        y += 12;
      }
    }
  }
  return y;
}

// Renders the totals block at the bottom of a document: a plain "Subtotal:"
// line when there's no IVA breakdown to show (taxCents is 0 or unset — every
// sale completed before this feature existed, or one made entirely of
// EXEMPT items), or a "Base Imponible:"/"IVA:" breakdown followed by the
// bold total when there is one. Shared by buildDeliveryNotePDF (Factura) and
// buildPaymentReceiptPDF (Recibo de Pago) so both stay in sync.
function renderTotalsSection(
  doc: jsPDF,
  sale: DeliveryNoteSale,
  margin: number,
  pageWidth: number,
  startY: number,
  showLocal: boolean,
  rate: number | null,
  currencyCode: string,
  referenceCurrency: ReferenceCurrency,
  totalLabel: string
): number {
  let y = startY;
  const money = (cents: number) => {
    const local = showLocal ? formatLocalCurrency(eurCentsToLocal(cents, rate!), currencyCode) : null;
    const reference = formatCurrencyCents(referenceCurrency, cents);
    return local ? `${local} (${reference})` : reference;
  };
  const hasTax = (sale.taxCents ?? 0) > 0;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  if (hasTax) {
    doc.text("Base imponible:", margin, y);
    doc.text(money(sale.baseImponibleCents ?? 0), pageWidth - margin, y, { align: "right" });
    y += 18;
    doc.text("IVA:", margin, y);
    doc.text(money(sale.taxCents ?? 0), pageWidth - margin, y, { align: "right" });
    y += 20;
  } else {
    doc.text("Subtotal:", margin, y);
    doc.text(money(sale.totalCents), pageWidth - margin, y, { align: "right" });
    y += 20;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(totalLabel, margin, y);
  doc.text(money(sale.totalCents), pageWidth - margin, y, { align: "right" });
  return y;
}

export async function buildDeliveryNotePDF(
  sale: DeliveryNoteSale,
  company: DeliveryNoteCompany,
  rate: number | null,
  currencyCode: string = DEFAULT_CURRENCY_CODE,
  exchangeRateEnabled: boolean = true,
  referenceCurrency: ReferenceCurrency = "EUR",
  format: "letter" | "a4" = "letter",
  // "invoice" is the exact same layout as "delivery-note" — just a
  // different title/sequence — selectable as an alternative document for
  // the same sale (see getOrCreateInvoiceNumber, lib/actions/sales.ts).
  // Not fiscally SENIAT-compliant yet; that's deferred, separate work.
  variant: "delivery-note" | "invoice" = "delivery-note"
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "pt", format });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  let y = 40;
  const showLocal = exchangeRateEnabled && rate != null;

  const fiscalEndY = await renderCompanyHeader(doc, company, margin, y, pageWidth);

  const isInvoice = variant === "invoice";
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(isInvoice ? "FACTURA" : "NOTA DE ENTREGA", pageWidth / 2, y + 20, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(
    `Nº de control: ${isInvoice ? invoiceNumberLabel(sale) : controlNumberLabel(sale)}`,
    pageWidth - margin,
    y + 5,
    { align: "right" }
  );
  doc.text(`Fecha: ${formatDate(sale.createdAt)}`, pageWidth - margin, y + 20, { align: "right" });

  y = Math.max(y + 70, fiscalEndY + 20);
  doc.setDrawColor(200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 20;

  const customerName = `${sale.customerFirstName ?? ""} ${sale.customerLastName ?? ""}`.trim();
  const infoLines: [string, string][] = [["Cliente:", customerName || "—"]];
  if (sale.customerRif) infoLines.push(["RIF/Cédula:", sale.customerRif]);
  if (sale.customerPhone) infoLines.push(["Teléfono:", sale.customerPhone]);
  if (sale.customerAddress) infoLines.push(["Dirección:", sale.customerAddress]);
  if (sale.sellerName) infoLines.push(["Vendedor:", sale.sellerName]);

  for (const [label, value] of infoLines) {
    doc.setFont("helvetica", "bold");
    doc.text(label, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(value, margin + 60, y, { maxWidth: pageWidth - margin * 2 - 60 });
    y += 16;
  }
  y += 10;
  y = renderNote(doc, sale.note, margin, y, pageWidth);

  const rows = sale.items.map((item) => [
    String(item.quantity),
    itemDescription(item),
    showLocal
      ? formatLocalCurrency(eurCentsToLocal(item.unitPriceCents, rate!), currencyCode)
      : formatCurrencyCents(referenceCurrency, item.unitPriceCents),
    showLocal
      ? formatLocalCurrency(eurCentsToLocal(item.subtotalCents, rate!), currencyCode)
      : formatCurrencyCents(referenceCurrency, item.subtotalCents),
  ]);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Cant.", "Descripción", `Precio unit. (${referenceCurrency} ref.)`, "Subtotal"]],
    body: rows,
    theme: "grid",
    headStyles: { fillColor: [30, 41, 59] },
    styles: { fontSize: 9, cellPadding: 6 },
    columnStyles: {
      0: { cellWidth: 40, halign: "center" },
      2: { halign: "right" },
      3: { halign: "right" },
    },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;

  if (exchangeRateEnabled) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(
      `Tasa del día: ${rate != null ? `${formatLocalCurrency(rate, currencyCode)} por 1${referenceCurrency === "USD" ? "$" : "€"}` : "No disponible"}`,
      margin,
      y
    );
    y += 14;
    doc.setFontSize(8);
    doc.setTextColor(110);
    doc.text(referenceNote(currencyCode, referenceCurrency), margin, y);
    doc.setTextColor(0, 0, 0);
    y += 18;
  }

  y = renderPaymentSection(doc, sale, margin, y, referenceCurrency, currencyCode);
  y += 10;

  doc.setDrawColor(200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 20;

  y = renderTotalsSection(doc, sale, margin, pageWidth, y, showLocal, rate, currencyCode, referenceCurrency, "TOTAL A CANCELAR:");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(110);
  doc.text(COPYRIGHT_LINE, pageWidth / 2, pageHeight - 30, { align: "center" });

  return doc;
}

// Issued when a credit sale's debt is collected — same layout as the delivery
// note, but confirms the debt is settled and values the total using the
// exchange rate in effect on the day payment was actually registered (which
// may differ from the rate at the original sale, if collected days later).
export async function buildPaymentReceiptPDF(
  sale: DeliveryNoteSale,
  company: DeliveryNoteCompany,
  rate: number | null,
  currencyCode: string = DEFAULT_CURRENCY_CODE,
  exchangeRateEnabled: boolean = true,
  referenceCurrency: ReferenceCurrency = "EUR",
  format: "letter" | "a4" = "letter"
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "pt", format });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  let y = 40;
  const showLocal = exchangeRateEnabled && rate != null;

  const fiscalEndY = await renderCompanyHeader(doc, company, margin, y, pageWidth);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("RECIBO DE PAGO", pageWidth / 2, y + 20, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Nº de control: ${receiptControlNumberLabel(sale)}`, pageWidth - margin, y - 8, { align: "right" });
  doc.text(`Nota de entrega Nº: ${controlNumberLabel(sale)}`, pageWidth - margin, y + 7, { align: "right" });
  doc.text(`Fecha de venta: ${formatDate(sale.createdAt)}`, pageWidth - margin, y + 22, { align: "right" });
  doc.text(
    `Fecha de pago: ${sale.paidAt ? formatDate(sale.paidAt) : "—"}`,
    pageWidth - margin,
    y + 37,
    { align: "right" }
  );

  y = Math.max(y + 70, fiscalEndY + 20);
  doc.setDrawColor(200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 20;

  const customerName = `${sale.customerFirstName ?? ""} ${sale.customerLastName ?? ""}`.trim();
  const infoLines: [string, string][] = [["Cliente:", customerName || "—"]];
  if (sale.customerPhone) infoLines.push(["Teléfono:", sale.customerPhone]);
  if (sale.customerAddress) infoLines.push(["Dirección:", sale.customerAddress]);
  if (sale.sellerName) infoLines.push(["Vendedor:", sale.sellerName]);

  for (const [label, value] of infoLines) {
    doc.setFont("helvetica", "bold");
    doc.text(label, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(value, margin + 60, y, { maxWidth: pageWidth - margin * 2 - 60 });
    y += 16;
  }
  y += 10;

  const rows = sale.items.map((item) => [
    String(item.quantity),
    itemDescription(item),
    showLocal
      ? formatLocalCurrency(eurCentsToLocal(item.unitPriceCents, rate!), currencyCode)
      : formatCurrencyCents(referenceCurrency, item.unitPriceCents),
    showLocal
      ? formatLocalCurrency(eurCentsToLocal(item.subtotalCents, rate!), currencyCode)
      : formatCurrencyCents(referenceCurrency, item.subtotalCents),
  ]);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Cant.", "Descripción", `Precio unit. (${referenceCurrency} ref.)`, "Subtotal"]],
    body: rows,
    theme: "grid",
    headStyles: { fillColor: [30, 41, 59] },
    styles: { fontSize: 9, cellPadding: 6 },
    columnStyles: {
      0: { cellWidth: 40, halign: "center" },
      2: { halign: "right" },
      3: { halign: "right" },
    },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;

  if (exchangeRateEnabled) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(
      `Tasa del día de pago: ${rate != null ? `${formatLocalCurrency(rate, currencyCode)} por 1${referenceCurrency === "USD" ? "$" : "€"}` : "No disponible"}`,
      margin,
      y
    );
    y += 14;
    doc.setFontSize(8);
    doc.setTextColor(110);
    doc.text(referenceNote(currencyCode, referenceCurrency), margin, y);
    doc.setTextColor(0, 0, 0);
    y += 18;
  }

  y = renderPaymentSection(doc, sale, margin, y, referenceCurrency, currencyCode);
  y += 6;

  doc.setFont("helvetica", "bold");
  doc.setTextColor(20, 120, 60);
  doc.setFontSize(12);
  doc.text("DEUDA CANCELADA", margin, y);
  doc.setTextColor(0, 0, 0);
  y += 26;

  doc.setDrawColor(200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 20;

  y = renderTotalsSection(doc, sale, margin, pageWidth, y, showLocal, rate, currencyCode, referenceCurrency, "TOTAL PAGADO:");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(110);
  doc.text(COPYRIGHT_LINE, pageWidth / 2, pageHeight - 30, { align: "center" });

  return doc;
}
