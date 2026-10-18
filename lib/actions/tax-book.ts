"use server";

import { requireManager } from "@/lib/session";
import { withTenant } from "@/lib/tenant-db";
import { selectionToWindows, type DateRangeSelection } from "@/lib/report-types";

// Libro de Ventas — one row per non-voided sale in the period, with the IVA
// breakdown already snapshotted on Sale (see lib/tax.ts/completeSale). Sales
// completed before the IVA feature existed show baseImponibleCents=0/
// taxCents=0 (an approximation, not a real historical record).
export async function getSalesTaxBook(range: DateRangeSelection) {
  const { companyId, branchId } = await requireManager();
  const windows = selectionToWindows(range);
  return withTenant(companyId, (tx) =>
    tx.sale.findMany({
      where: {
        companyId,
        ...(branchId ? { branchId } : {}),
        AND: [
          { OR: windows.map((w) => ({ createdAt: { gte: w.start, lt: w.end } })) },
          // A factura cancelled by a nota de crédito stays in the book; the
          // note itself is listed separately (getCreditNotesTaxBook).
          { OR: [{ voided: false }, { creditNote: { isNot: null } }] },
        ],
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        createdAt: true,
        controlNumber: true,
        invoiceNumber: true,
        customerFirstName: true,
        customerLastName: true,
        customerRif: true,
        baseImponibleCents: true,
        taxCents: true,
        totalCents: true,
        igtfCents: true,
      },
    })
  );
}

// Libro de Compras — one row per non-voided purchase in the period, with the
// supplier's RIF and any IVA withheld (see Company.isIvaWithholdingAgent).
export async function getPurchasesTaxBook(range: DateRangeSelection) {
  const { companyId, branchId } = await requireManager();
  const windows = selectionToWindows(range);
  return withTenant(companyId, (tx) =>
    tx.purchase.findMany({
      where: {
        companyId,
        ...(branchId ? { branchId } : {}),
        OR: windows.map((w) => ({ createdAt: { gte: w.start, lt: w.end } })),
        voided: false,
      },
      orderBy: { createdAt: "asc" },
      include: { supplier: true },
    })
  );
}

// Notas de crédito issued in the period (audit KRPOS-FIS-003), each with the
// factura it cancels — they subtract from the Libro de Ventas.
export async function getCreditNotesTaxBook(range: DateRangeSelection) {
  const { companyId, branchId } = await requireManager();
  const windows = selectionToWindows(range);
  return withTenant(companyId, (tx) =>
    tx.creditNote.findMany({
      where: {
        companyId,
        ...(branchId ? { branchId } : {}),
        OR: windows.map((w) => ({ createdAt: { gte: w.start, lt: w.end } })),
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        createdAt: true,
        controlNumber: true,
        reason: true,
        baseImponibleCents: true,
        taxCents: true,
        totalCents: true,
        igtfCents: true,
        sale: {
          select: { invoiceNumber: true, customerFirstName: true, customerLastName: true, customerRif: true },
        },
      },
    })
  );
}
