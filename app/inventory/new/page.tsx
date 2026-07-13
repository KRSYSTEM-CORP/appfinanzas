import { ProductForm } from "@/components/inventory/ProductForm";
import { createProduct, listCategories } from "@/lib/actions/products";

export default async function NewProductPage() {
  const categories = await listCategories();

  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Nuevo producto</h1>
      <ProductForm action={createProduct} categories={categories} />
    </div>
  );
}
