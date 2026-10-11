import { notFound } from "next/navigation";
import { ProductForm } from "@/components/inventory/ProductForm";
import { getProduct, listCategories, updateProduct } from "@/lib/actions/products";
import { getExchangeRateInfo } from "@/lib/actions/settings";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { HistoryIcon } from "lucide-react";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [product, categories, { referenceCurrency }] = await Promise.all([
    getProduct(id),
    listCategories(),
    getExchangeRateInfo(),
  ]);
  if (!product) notFound();

  const updateWithId = updateProduct.bind(null, id);

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Editar producto</h1>
        <Button variant="outline" nativeButton={false} render={<Link href={`/inventory/${id}/movements`} />}>
          <HistoryIcon data-icon="inline-start" /> Historial de movimientos
        </Button>
      </header>
      <ProductForm
        product={product}
        action={updateWithId}
        categories={categories}
        referenceCurrency={referenceCurrency}
      />
    </div>
  );
}
