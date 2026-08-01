import { ImportPurchasesForm } from "@/components/purchases/ImportPurchasesForm";

export default function ImportPurchasesPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Importar compras desde Excel</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Registra varias compras a la vez desde una hoja de cálculo.
        </p>
      </div>
      <ImportPurchasesForm />
    </div>
  );
}
