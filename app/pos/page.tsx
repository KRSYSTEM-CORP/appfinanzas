import Link from "next/link";
import { PosClient } from "@/components/pos/PosClient";
import { listActiveProducts } from "@/lib/actions/products";
import { getExchangeRateInfo } from "@/lib/actions/settings";

export const dynamic = "force-dynamic";

export default async function PosPage() {
  const [products, { rate }] = await Promise.all([
    listActiveProducts(),
    getExchangeRateInfo(),
  ]);

  return (
    <div className="flex flex-col gap-4 p-6 h-[calc(100vh-56px)]">
      <h1 className="text-2xl font-semibold">Punto de venta</h1>
      {rate == null && (
        <p className="text-sm text-destructive">
          No has configurado tu tasa de cambio.{" "}
          <Link href="/settings" className="underline underline-offset-4">
            Configúrala aquí
          </Link>{" "}
          antes de vender.
        </p>
      )}
      <div className="flex-1 min-h-0">
        <PosClient products={products} rate={rate} />
      </div>
    </div>
  );
}
