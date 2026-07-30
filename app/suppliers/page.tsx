import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SupplierTable } from "@/components/suppliers/SupplierTable";
import { listSuppliers } from "@/lib/actions/suppliers";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const suppliers = await listSuppliers();

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Proveedores</h1>
        <Button nativeButton={false} render={<Link href="/suppliers/new" />}>
          Nuevo proveedor
        </Button>
      </div>

      <SupplierTable suppliers={suppliers} />
    </div>
  );
}
