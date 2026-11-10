import { requireAccountingPlan } from "@/lib/session";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SupplierTable } from "@/components/suppliers/SupplierTable";
import { listSuppliers } from "@/lib/actions/suppliers";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  await requireAccountingPlan();
  const suppliers = await listSuppliers();

  return (
    <div className="flex flex-col gap-4 px-4 py-5">
      <div className="flex items-center justify-between">
        <h1 className="kr-h1">Proveedores</h1>
        <Button nativeButton={false} render={<Link href="/suppliers/new" />}>
          Nuevo proveedor
        </Button>
      </div>

      <SupplierTable suppliers={suppliers} />
    </div>
  );
}
