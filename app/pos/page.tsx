import { PosClient } from "@/components/pos/PosClient";
import { listActiveProducts } from "@/lib/actions/products";

export const dynamic = "force-dynamic";

export default async function PosPage() {
  const products = await listActiveProducts();

  return (
    <div className="flex flex-col gap-4 p-6 h-[calc(100vh-56px)]">
      <h1 className="text-2xl font-semibold">Punto de venta</h1>
      <div className="flex-1 min-h-0">
        <PosClient products={products} />
      </div>
    </div>
  );
}
