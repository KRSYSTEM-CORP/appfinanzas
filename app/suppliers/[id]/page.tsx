import { AdminShell } from "@/components/accounting/AdminShell";
import { notFound } from "next/navigation";
import { SupplierForm } from "@/components/suppliers/SupplierForm";
import { getSupplier, updateSupplier } from "@/lib/actions/suppliers";

export default async function EditSupplierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supplier = await getSupplier(id);
  if (!supplier) notFound();

  const updateWithId = updateSupplier.bind(null, id);

  return (
    <AdminShell group="compras" sub="prov">
      <h2 className="text-xl font-bold tracking-[-0.02em]">Editar proveedor</h2>
      <SupplierForm supplier={supplier} action={updateWithId} />
    </AdminShell>
  );
}
