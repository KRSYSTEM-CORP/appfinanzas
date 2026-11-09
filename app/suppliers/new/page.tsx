import { SupplierForm } from "@/components/suppliers/SupplierForm";
import { createSupplier } from "@/lib/actions/suppliers";

export default function NewSupplierPage() {
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <h1 className="text-3xl font-bold tracking-tight">Nuevo proveedor</h1>
      <SupplierForm action={createSupplier} />
    </div>
  );
}
