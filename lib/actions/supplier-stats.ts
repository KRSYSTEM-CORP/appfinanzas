"use server";

import { requireManager } from "@/lib/session";
import { withTenant } from "@/lib/tenant-db";

export type SupplierStats = { supplierId: string; purchasedCents: number; owedCents: number; invoices: number };

// Por proveedor: total comprado (sin anuladas), lo que se le debe y cuántas facturas tiene.
export async function supplierStats(): Promise<SupplierStats[]> {
  const { companyId, branchId } = await requireManager();
  const rows = await withTenant(companyId, (tx) =>
    tx.purchase.findMany({
      where: { companyId, voided: false, supplierId: { not: null }, ...(branchId ? { branchId } : {}) },
      select: { supplierId: true, totalCents: true, ivaRetainedCents: true, paymentStatus: true, payments: { select: { amountEurCents: true } } },
      take: 5000,
    })
  );
  const map = new Map<string, SupplierStats>();
  for (const p of rows) {
    const id = p.supplierId as string;
    const s = map.get(id) ?? { supplierId: id, purchasedCents: 0, owedCents: 0, invoices: 0 };
    s.purchasedCents += p.totalCents;
    s.invoices++;
    if (p.paymentStatus === "PENDING") {
      const paid = p.payments.reduce((n, x) => n + x.amountEurCents, 0);
      s.owedCents += Math.max(0, p.totalCents - p.ivaRetainedCents - paid);
    }
    map.set(id, s);
  }
  return [...map.values()];
}
