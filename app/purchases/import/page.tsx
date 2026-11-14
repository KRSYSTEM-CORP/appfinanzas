import { AdminShell } from "@/components/accounting/AdminShell";
import { requireAccountingPlan } from "@/lib/session";
import { ImportPurchasesForm } from "@/components/purchases/ImportPurchasesForm";

export default async function ImportPurchasesPage() {
  await requireAccountingPlan();
  return (
    <AdminShell group="compras" sub="registro">
      <div>
        <h2 className="text-xl font-bold tracking-[-0.02em]">Importar compras desde Excel</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Registra varias compras a la vez desde una hoja de cálculo.
        </p>
      </div>
      <ImportPurchasesForm />
    </AdminShell>
  );
}
