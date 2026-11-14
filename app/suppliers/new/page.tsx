import { AdminShell } from "@/components/accounting/AdminShell";
import { SupplierForm } from "@/components/suppliers/SupplierForm";
import { createSupplier } from "@/lib/actions/suppliers";

export default function NewSupplierPage() {
  return (
    <AdminShell group="compras" sub="prov">
      <h2 className="text-xl font-bold tracking-[-0.02em]">Nuevo proveedor</h2>
      <SupplierForm action={createSupplier} />
    </AdminShell>
  );
}
