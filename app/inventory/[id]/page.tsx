import { notFound } from "next/navigation";
import { ProductForm } from "@/components/inventory/ProductForm";
import { getProduct, listCategories, updateProduct } from "@/lib/actions/products";
import { getExchangeRateInfo } from "@/lib/actions/settings";

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
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Editar producto</h1>
      <ProductForm
        product={product}
        action={updateWithId}
        categories={categories}
        referenceCurrency={referenceCurrency}
      />
    </div>
  );
}
