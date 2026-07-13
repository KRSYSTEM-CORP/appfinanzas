import { notFound } from "next/navigation";
import { ProductForm } from "@/components/inventory/ProductForm";
import { getProduct, updateProduct } from "@/lib/actions/products";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) notFound();

  const updateWithId = updateProduct.bind(null, id);

  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Editar producto</h1>
      <ProductForm product={product} action={updateWithId} />
    </div>
  );
}
