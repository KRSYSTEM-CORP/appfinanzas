import Link from "@/components/ui/nav-link";
import { Button } from "@/components/ui/button";
import { UpdateInventoryForm } from "@/components/inventory/UpdateInventoryForm";

export default function UpdateInventoryPage() {
  return (
    <div className="flex flex-col gap-4 px-4 py-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="kr-h1">Actualizar inventario desde Excel</h1>
        <Button variant="outline" nativeButton={false} render={<Link href="/inventory" />}>
          Volver a inventario
        </Button>
      </div>
      <UpdateInventoryForm />
    </div>
  );
}
