import { requireAccountingPlan, requirePermission } from "@/lib/session";
import { listInternalUse, listAllProducts } from "@/lib/actions/products";
import { InternalUsePanel } from "@/components/accounting/InternalUsePanel";

export default async function ConsumptionPage() {
  await requirePermission("admin");
  await requireAccountingPlan();
  const [rows, products] = await Promise.all([listInternalUse(), listAllProducts()]);
  return (
    <div className="flex flex-col gap-4 px-4 py-5">
      <div>
        <p className="kr-eyebrow">Administración</p>
        <h1 className="kr-h1">Consumo Interno</h1>
      </div>
      <InternalUsePanel
        rows={rows}
        products={products.filter((p) => p.trackStock && p.stock > 0).map((p) => ({ id: p.id, name: p.name, stock: p.stock }))}
      />
    </div>
  );
}
