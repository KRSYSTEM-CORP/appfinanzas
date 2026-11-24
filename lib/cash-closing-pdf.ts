import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { dualForMethod } from "@/lib/money-primary";
import { PAYMENT_METHOD_LABELS, formatDate, formatDateOnly } from "@/lib/format";
import { DEFAULT_CURRENCY_CODE, eurCentsToLocal, formatCurrencyCents, formatLocalCurrency, referenceNote } from "@/lib/currencies";
import { renderCompanyHeader, renderDocumentTitleBlock, type DeliveryNoteCompany } from "@/lib/delivery-note";
import type { CashClosingSummary } from "@/lib/actions/cash-closing";
import { grandTotals, groupIncomeByMethod } from "@/lib/income-by-method";
import type { ReferenceCurrency } from "@prisma/client";

export async function buildCashClosingPDF(
  summary: CashClosingSummary,
  company: DeliveryNoteCompany,
  branchName: string | null,
  rate: number | null,
  currencyCode: string = DEFAULT_CURRENCY_CODE,
  exchangeRateEnabled: boolean = true,
  referenceCurrency: ReferenceCurrency = "EUR",
  format: "letter" | "a4" = "letter"
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "pt", format });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = 40;
  const showLocal = exchangeRateEnabled && rate != null;

  const fiscalEndY = await renderCompanyHeader(doc, company, margin, y, pageWidth, "CORTE Z · CIERRE DE CAJA");

  const titleBottomY = renderDocumentTitleBlock(
    doc,
    "CORTE Z · CIERRE DE CAJA",
    [
      `Fecha: ${formatDateOnly(summary.date)}`,
      ...(branchName ? [`Sucursal: ${branchName}`] : []),
      ...(summary.shiftNumber != null ? [`Turno ${summary.shiftNumber}${summary.responsibleName ? ` · Responsable: ${summary.responsibleName}` : ""}`] : []),
    ],
    margin,
    y,
    pageWidth
  );

  y = Math.max(titleBottomY + 20, fiscalEndY + 20);
  doc.setDrawColor(200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 24;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  if (summary.closed) {
    doc.setTextColor(20, 120, 60);
    doc.text(`CERRADA — ${formatDate(summary.closed.closedAt)}`, margin, y);
    doc.setTextColor(0, 0, 0);
    y += 16;
    if (summary.closed.note) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      const noteLines = doc.splitTextToSize(`Nota: ${summary.closed.note}`, pageWidth - margin * 2) as string[];
      doc.text(noteLines, margin, y);
      y += noteLines.length * 12;
    }
  } else {
    doc.setTextColor(180, 30, 30);
    doc.text("CAJA ABIERTA — todavía no se ha cerrado este día", margin, y);
    doc.setTextColor(0, 0, 0);
    y += 16;
  }
  y += 16;

  const money = (cents: number) => {
    const local = showLocal ? formatLocalCurrency(eurCentsToLocal(cents, rate!), currencyCode) : null;
    const reference = formatCurrencyCents(referenceCurrency, cents);
    return local ? `${local} (${reference})` : reference;
  };

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text("Total vendido:", margin, y);
  doc.setFont("helvetica", "bold");
  doc.text(money(summary.totalCents), pageWidth - margin, y, { align: "right" });
  y += 18;
  doc.setFont("helvetica", "normal");
  doc.text("Número de ventas:", margin, y);
  doc.text(String(summary.salesCount), pageWidth - margin, y, { align: "right" });
  y += 18;
  doc.text(`Pagadas (${summary.paidCount}):`, margin, y);
  doc.text(money(summary.paidCents), pageWidth - margin, y, { align: "right" });
  y += 18;
  doc.text(`A crédito (${summary.creditCount}):`, margin, y);
  doc.text(money(summary.creditCents), pageWidth - margin, y, { align: "right" });
  y += 26;

  // Caja Chica: efectivo del día.
  doc.setFont("helvetica", "bold");
  doc.text("Caja Chica", margin, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  for (const [label, value] of [
    ["Apertura:", money(summary.openingCents ?? 0)],
    ["Ventas en efectivo:", money(summary.cashSalesCents)],
    ["Salidas:", `-${money(summary.outflowsCents)}`],
  ]) {
    doc.text(label, margin, y);
    doc.text(value, pageWidth - margin, y, { align: "right" });
    y += 16;
  }
  doc.setFont("helvetica", "bold");
  doc.text("Efectivo esperado:", margin, y);
  doc.text(money(summary.expectedCashCents), pageWidth - margin, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  y += 18;
  if (summary.outflows.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Salida", "Monto"]],
      body: summary.outflows.map((o) => [o.concept, money(o.amountCents)]),
      theme: "grid",
      headStyles: { fillColor: [30, 41, 59] },
      styles: { fontSize: 10, cellPadding: 6 },
      columnStyles: { 1: { halign: "right" } },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20;
  } else {
    y += 8;
  }

  if (summary.byCurrency.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Cobrado por moneda (lo que realmente entró)", "Monto", "Equiv. referencia"]],
      body: summary.byCurrency.map((c) => [c.currencyCode, formatCurrencyCents(c.currencyCode, c.cents), formatCurrencyCents(referenceCurrency, c.refCents)]),
      theme: "grid",
      headStyles: { fillColor: [225, 225, 225], textColor: 0 },
      styles: { fontSize: 10, cellPadding: 6, textColor: 0 },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20;
  }

  if (summary.byMethod.length > 0) {
    const rows = summary.byMethod.map((m) => {
      // Zelle/Binance/PayPal: divisa primero y bolívares debajo; el resto (incluido el efectivo, cuyo desglose por moneda va abajo): bolívares primero.
      const d = dualForMethod(m.totalCents, { method: m.paymentMethod, foreign: false }, { rate, localCurrencyCode: currencyCode, referenceCurrency, exchangeRateEnabled: showLocal });
      return [PAYMENT_METHOD_LABELS[m.paymentMethod], d.secondary ? `${d.primary} (${d.secondary})` : d.primary];
    });
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Método de pago", "Total (ref.)"]],
      body: rows,
      theme: "grid",
      headStyles: { fillColor: [30, 41, 59] },
      styles: { fontSize: 10, cellPadding: 6 },
      columnStyles: { 1: { halign: "right" } },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20;
  } else {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(110);
    doc.text("No hubo ventas registradas este día.", margin, y);
    doc.setTextColor(0, 0, 0);
    y += 20;
  }

  // Ingresos por método y cuenta (puntos de venta por banco, pago móvil, transferencias, Zelle…): lo mismo que el botón
  // «Ingresos por método» de Caja Chica y la versión impresa.
  const incomeSections = groupIncomeByMethod(summary.byAccount ?? []);
  if (incomeSections.length > 0) {
    const total = grandTotals(incomeSections);
    const amountOf = (cents: number, currency: string) => formatCurrencyCents(currency, cents);
    type Cell = string | { content: string; colSpan?: number; styles?: Record<string, unknown> };
    const body: Cell[][] = [];
    for (const sec of incomeSections) {
      body.push([
        { content: sec.title, colSpan: 2, styles: { fontStyle: "bold", fillColor: [235, 238, 245] } },
        { content: String(sec.count), styles: { fontStyle: "bold", halign: "center", fillColor: [235, 238, 245] } },
        { content: sec.byCurrency.map((c) => amountOf(c.cents, c.currencyCode)).join(" + "), styles: { fontStyle: "bold", halign: "right", fillColor: [235, 238, 245] } },
        { content: formatCurrencyCents(referenceCurrency, sec.refCents), styles: { fontStyle: "bold", halign: "right", fillColor: [235, 238, 245] } },
      ]);
      for (const r of sec.rows) {
        const detail = [r.accountId ? (r.kind === "PUNTO_DE_VENTA" ? "Terminal" : null) : null, r.accountNumber].filter(Boolean).join(" ");
        body.push([r.label || "—", detail, String(r.count), amountOf(r.cents, r.currencyCode), formatCurrencyCents(referenceCurrency, r.refCents)]);
      }
    }
    body.push([
      { content: "Total general", colSpan: 2, styles: { fontStyle: "bold" } },
      { content: String(total.count), styles: { fontStyle: "bold", halign: "center" } },
      { content: total.byCurrency.map((c) => amountOf(c.cents, c.currencyCode)).join(" + "), styles: { fontStyle: "bold", halign: "right" } },
      { content: formatCurrencyCents(referenceCurrency, total.refCents), styles: { fontStyle: "bold", halign: "right" } },
    ]);
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Ingresos por método y cuenta", "Cuenta", "Cobros", "Monto", "Equiv. ref."]],
      body,
      theme: "grid",
      headStyles: { fillColor: [30, 41, 59] },
      styles: { fontSize: 9, cellPadding: 5 },
      columnStyles: { 2: { halign: "center" }, 3: { halign: "right" }, 4: { halign: "right" } },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20;
  }

  if (exchangeRateEnabled && rate != null) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text(referenceNote(currencyCode, referenceCurrency), margin, y);
    doc.setTextColor(0, 0, 0);
  }

  return doc;
}
