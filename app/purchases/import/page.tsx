import { requireAccountingPlan } from "@/lib/session";
import { ImportPurchasesForm } from "@/components/purchases/ImportPurchasesForm";

export default async function ImportPurchasesPage() {
  await requireAccountingPlan();
  return (
    <div className="flex flex-col gap-6 px-4 py-5">
      <div>
        <h1 className="kr-h1">Importar compras desde Excel</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Registra varias compras a la vez desde una hoja de cálculo.
        </p>
      </div>
      <ImportPurchasesForm />
    </div>
  );
}
