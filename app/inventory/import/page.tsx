import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ImportProductsForm } from "@/components/inventory/ImportProductsForm";

export default function ImportProductsPage() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Importar productos desde Excel</h1>
        <Button variant="outline" nativeButton={false} render={<Link href="/inventory" />}>
          Volver a inventario
        </Button>
      </div>
      <ImportProductsForm />
    </div>
  );
}
