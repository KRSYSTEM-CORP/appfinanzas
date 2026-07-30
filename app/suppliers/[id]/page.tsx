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
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Editar proveedor</h1>
      <SupplierForm supplier={supplier} action={updateWithId} />
    </div>
  );
}
