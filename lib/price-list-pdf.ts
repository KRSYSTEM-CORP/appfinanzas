import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatDate } from "@/lib/format";
import { formatCurrencyCents } from "@/lib/currencies";
import { dataUrlImageFormat, loadImageSize, renderCompanyHeader, renderDocumentTitleBlock, type DeliveryNoteCompany } from "@/lib/delivery-note";
import type { ReferenceCurrency } from "@prisma/client";

export type PriceListProduct = {
  name: string;
  category: string | null;
  priceCents: number;
  // Ruta de la foto del producto (productImageUrl) o null si no tiene.
  imageUrl?: string | null;
};

export type CatalogProduct = PriceListProduct & { imageDataUrl: string | null };

export async function buildPriceListPDF(
  products: PriceListProduct[],
  company: DeliveryNoteCompany,
  referenceCurrency: ReferenceCurrency,
  format: "letter" | "a4" = "letter"
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "pt", format });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = 40;

  const fiscalEndY = await renderCompanyHeader(doc, company, margin, y, pageWidth);

  const titleBottomY = renderDocumentTitleBlock(
    doc,
    "LISTA DE PRECIOS",
    [`Fecha de emisión: ${formatDate(new Date())}`],
    margin,
    y,
    pageWidth
  );

  y = Math.max(titleBottomY + 20, fiscalEndY + 20);
  doc.setDrawColor(200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 20;

  const rows = products.map((p) => [
    p.category ? `${p.name} (${p.category})` : p.name,
    formatCurrencyCents(referenceCurrency, p.priceCents),
  ]);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Producto", `Precio (${referenceCurrency})`]],
    body: rows,
    theme: "grid",
    headStyles: { fillColor: [30, 41, 59] },
    styles: { fontSize: 9, cellPadding: 6 },
    columnStyles: {
      1: { halign: "right", cellWidth: 100 },
    },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;

  const pageHeight = doc.internal.pageSize.getHeight();
  const footerY = Math.max(y, pageHeight - 60);
  const bcvLabel = referenceCurrency === "USD" ? "Dólar BCV" : "Euro BCV";
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(110);
  const footerLines = doc.splitTextToSize(
    `Lista de precios sujeta a cambio según la tasa diaria del BCV. Precios cotizados en ${bcvLabel}.`,
    pageWidth - margin * 2
  ) as string[];
  doc.text(footerLines, pageWidth / 2, footerY, { align: "center" });
  doc.setTextColor(0, 0, 0);

  return doc;
}

const IMAGE_MAX_SIDE = 400;

// Descarga la foto del producto y la reduce a un JPEG pequeño (data URL) para
// que el catálogo pese poco. Solo corre en el navegador; devuelve null si la
// foto falta o no se puede cargar, y el catálogo dibuja un marcador.
export async function loadCatalogImage(url: string | null | undefined): Promise<string | null> {
  if (!url || typeof document === "undefined") return null;
  try {
    const res = await fetch(url, { credentials: "same-origin" });
    if (!res.ok) return null;
    const bitmap = await createImageBitmap(await res.blob());
    const scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL("image/jpeg", 0.8);
  } catch {
    return null;
  }
}

export async function loadCatalogImages(
  products: PriceListProduct[],
  concurrency = 6
): Promise<CatalogProduct[]> {
  const out: CatalogProduct[] = new Array(products.length);
  let next = 0;
  async function worker() {
    while (next < products.length) {
      const i = next++;
      out[i] = { ...products[i], imageDataUrl: await loadCatalogImage(products[i].imageUrl) };
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, products.length) }, worker));
  return out;
}

function drawPlaceholder(doc: jsPDF, x: number, y: number, size: number) {
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(x, y, size, size, 6, 6, "FD");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text("Sin imagen", x + size / 2, y + size / 2 + 3, { align: "center" });
}

// Catálogo: portada con logo y nombre del negocio + cuadrícula de tarjetas
// (imagen, nombre y precio de venta) paginada.
export async function buildCatalogPDF(
  products: CatalogProduct[],
  company: DeliveryNoteCompany,
  referenceCurrency: ReferenceCurrency,
  format: "letter" | "a4" = "letter"
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "pt", format });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 36;

  // Portada
  let y = pageHeight * 0.28;
  if (company.logoDataUrl) {
    try {
      const size = await loadImageSize(company.logoDataUrl);
      const ratio = Math.min(160 / size.width, 110 / size.height);
      const w = size.width * ratio;
      const h = size.height * ratio;
      doc.addImage(company.logoDataUrl, dataUrlImageFormat(company.logoDataUrl), (pageWidth - w) / 2, y, w, h);
      y += h + 28;
    } catch {
      // Sin logo legible: la portada sigue con el nombre.
    }
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.setTextColor(30, 41, 59);
  const nameLines = doc.splitTextToSize(company.name, pageWidth - margin * 2 - 40) as string[];
  doc.text(nameLines, pageWidth / 2, y, { align: "center" });
  y += nameLines.length * 32 + 6;
  doc.setDrawColor(30, 41, 59);
  doc.setLineWidth(2);
  doc.line(pageWidth / 2 - 30, y, pageWidth / 2 + 30, y);
  y += 30;
  doc.setFontSize(14);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  doc.text("CATÁLOGO DE PRODUCTOS", pageWidth / 2, y, { align: "center" });
  y += 20;
  doc.setFontSize(10);
  doc.text(formatDate(new Date()), pageWidth / 2, y, { align: "center" });
  if (company.fiscalPhone) doc.text(company.fiscalPhone, pageWidth / 2, y + 16, { align: "center" });

  // Cuadrícula
  const cols = 3;
  const rowsPerPage = 3;
  const gap = 14;
  const headerH = 34;
  const footerH = 30;
  const cardW = (pageWidth - margin * 2 - gap * (cols - 1)) / cols;
  const cardH = (pageHeight - margin * 2 - headerH - footerH - gap * (rowsPerPage - 1)) / rowsPerPage;
  const perPage = cols * rowsPerPage;
  const totalPages = Math.max(1, Math.ceil(products.length / perPage));

  for (let page = 0; page < totalPages; page++) {
    doc.addPage();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(30, 41, 59);
    doc.text(company.name, margin, margin + 8);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`Precios en ${referenceCurrency}`, pageWidth - margin, margin + 8, { align: "right" });
    doc.setDrawColor(220);
    doc.setLineWidth(0.5);
    doc.line(margin, margin + 16, pageWidth - margin, margin + 16);

    products.slice(page * perPage, (page + 1) * perPage).forEach((p, idx) => {
      const x = margin + (idx % cols) * (cardW + gap);
      const top = margin + headerH + Math.floor(idx / cols) * (cardH + gap);
      doc.setDrawColor(222);
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(x, top, cardW, cardH, 8, 8, "FD");

      const boxSize = Math.min(cardW - 16, cardH - 64);
      const bx = x + (cardW - boxSize) / 2;
      const by = top + 8;
      if (p.imageDataUrl) {
        try {
          doc.addImage(p.imageDataUrl, dataUrlImageFormat(p.imageDataUrl), bx, by, boxSize, boxSize, undefined, "FAST");
        } catch {
          drawPlaceholder(doc, bx, by, boxSize);
        }
      } else {
        drawPlaceholder(doc, bx, by, boxSize);
      }

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(30, 41, 59);
      const lines = (doc.splitTextToSize(p.name, cardW - 16) as string[]).slice(0, 2);
      doc.text(lines, x + cardW / 2, by + boxSize + 14, { align: "center" });
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(formatCurrencyCents(referenceCurrency, p.priceCents), x + cardW / 2, top + cardH - 10, { align: "center" });
    });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`${page + 1} / ${totalPages}`, pageWidth / 2, pageHeight - margin + 8, { align: "center" });
  }
  doc.setTextColor(0, 0, 0);
  return doc;
}
