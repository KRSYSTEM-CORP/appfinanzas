import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ImportProductsForm } from "@/components/inventory/ImportProductsForm";

export default function ImportProductsPage() {
  return (
    <div className="flex flex-col gap-4 px-4 py-5">
      <div className="flex items-center justify-between">
        <h1 className="kr-h1">Importar productos desde Excel</h1>
        <Button variant="outline" nativeButton={false} render={<Link href="/inventory" />}>
          Volver a inventario
        </Button>
      </div>
      <ImportProductsForm />
    </div>
  );
}
