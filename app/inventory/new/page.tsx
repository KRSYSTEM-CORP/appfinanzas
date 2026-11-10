import { ProductForm } from "@/components/inventory/ProductForm";
import { createProduct, listCategories } from "@/lib/actions/products";
import { getExchangeRateInfo } from "@/lib/actions/settings";

export default async function NewProductPage() {
  const [categories, { referenceCurrency }] = await Promise.all([listCategories(), getExchangeRateInfo()]);

  return (
    <div className="flex flex-col gap-4 px-4 py-5">
      <h1 className="kr-h1">Nuevo producto</h1>
      <ProductForm action={createProduct} categories={categories} referenceCurrency={referenceCurrency} />
    </div>
  );
}
