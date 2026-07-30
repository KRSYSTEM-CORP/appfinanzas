import Link from "next/link";
import { Button } from "@/components/ui/button";
import { UpdateInventoryForm } from "@/components/inventory/UpdateInventoryForm";

export default function UpdateInventoryPage() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Actualizar inventario desde Excel</h1>
        <Button variant="outline" nativeButton={false} render={<Link href="/inventory" />}>
          Volver a inventario
        </Button>
      </div>
      <UpdateInventoryForm />
    </div>
  );
}
