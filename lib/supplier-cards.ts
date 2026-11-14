import type { SupplierStats } from "@/lib/actions/supplier-stats";

// Une los proveedores con sus totales de compras para las tarjetas de Compras → Proveedores.
export function toSupplierCards(
  suppliers: { id: string; name: string; rif: string | null; phone: string | null; rating: number | null; isActive: boolean }[],
  stats: SupplierStats[]
) {
  const by = new Map(stats.map((s) => [s.supplierId, s]));
  return suppliers.map((s) => ({
    id: s.id,
    name: s.name,
    rif: s.rif,
    phone: s.phone,
    rating: s.rating,
    isActive: s.isActive,
    purchasedCents: by.get(s.id)?.purchasedCents ?? 0,
    owedCents: by.get(s.id)?.owedCents ?? 0,
    invoices: by.get(s.id)?.invoices ?? 0,
  }));
}
