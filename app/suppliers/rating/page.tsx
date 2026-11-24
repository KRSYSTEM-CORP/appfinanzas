import { requirePurchasesAccess } from "@/lib/session";
import { AdminShell } from "@/components/accounting/AdminShell";
import { SupplierRating } from "@/components/suppliers/SupplierCards";
import { listSuppliers } from "@/lib/actions/suppliers";
import { supplierStats } from "@/lib/actions/supplier-stats";
import { toSupplierCards } from "@/lib/supplier-cards";

export const dynamic = "force-dynamic";

// Administración → Compras → Calificación.
export default async function SupplierRatingPage() {
  await requirePurchasesAccess();
  const [suppliers, stats] = await Promise.all([listSuppliers(true), supplierStats()]);
  return (
    <AdminShell group="compras" sub="calif">
      <SupplierRating suppliers={toSupplierCards(suppliers, stats)} />
    </AdminShell>
  );
}
