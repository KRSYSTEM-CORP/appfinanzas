"use server";

import { requireManager } from "@/lib/session";
import { withTenant } from "@/lib/tenant-db";
import { rangeToDates, type DateRangePreset } from "@/lib/report-types";

// Libro de Ventas — one row per non-voided sale in the period, with the IVA
// breakdown already snapshotted on Sale (see lib/tax.ts/completeSale). Sales
// completed before the IVA feature existed show baseImponibleCents=0/
// taxCents=0 (an approximation, not a real historical record).
export async function getSalesTaxBook(range: DateRangePreset) {
  const { companyId, branchId } = await requireManager();
  const { start, end } = rangeToDates(range);
  return withTenant(companyId, (tx) =>
    tx.sale.findMany({
      where: {
        companyId,
        ...(branchId ? { branchId } : {}),
        createdAt: { gte: start, lte: end },
        voided: false,
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
      },
    })
  );
}

// Libro de Compras — one row per non-voided purchase in the period, with the
// supplier's RIF and any IVA withheld (see Company.isIvaWithholdingAgent).
export async function getPurchasesTaxBook(range: DateRangePreset) {
  const { companyId, branchId } = await requireManager();
  const { start, end } = rangeToDates(range);
  return withTenant(companyId, (tx) =>
    tx.purchase.findMany({
      where: {
        companyId,
        ...(branchId ? { branchId } : {}),
        createdAt: { gte: start, lte: end },
        voided: false,
      },
      orderBy: { createdAt: "asc" },
      include: { supplier: true },
    })
  );
}
