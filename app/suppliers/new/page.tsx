import { SupplierForm } from "@/components/suppliers/SupplierForm";
import { createSupplier } from "@/lib/actions/suppliers";

export default function NewSupplierPage() {
  return (
    <div className="flex flex-col gap-4 px-4 py-5">
      <h1 className="kr-h1">Nuevo proveedor</h1>
      <SupplierForm action={createSupplier} />
    </div>
  );
}
