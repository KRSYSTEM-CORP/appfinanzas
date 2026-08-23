"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarcodeScannerDialog } from "@/components/scanner/BarcodeScannerDialog";
import { resizeImageToDataUrl } from "@/lib/image-utils";
import { TAX_CATEGORY_LABELS } from "@/lib/tax";
import type { ActionResult } from "@/lib/types";
import type { Product, ReferenceCurrency, TaxCategory } from "@prisma/client";

const MAX_IMAGE_DIMENSION = 480;

type Props = {
  product?: Product;
  categories: string[];
  referenceCurrency: ReferenceCurrency;
  action: (formData: FormData) => Promise<ActionResult>;
};

export function ProductForm({ product, categories, referenceCurrency, action }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [sku, setSku] = useState(product?.sku ?? "");
  const [image, setImage] = useState(product?.imageDataUrl ?? "");
  const [taxCategory, setTaxCategory] = useState<TaxCategory>(product?.taxCategory ?? "GENERAL");
  const [imageError, setImageError] = useState<string | null>(null);
  const [trackStock, setTrackStock] = useState(product?.trackStock ?? true);
  const [priceTiersEnabled, setPriceTiersEnabled] = useState(product?.priceTiersEnabled ?? false);
  const [isPending, startTransition] = useTransition();
  const imageInputRef = useRef<HTMLInputElement>(null);

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageError(null);
    try {
      const dataUrl = await resizeImageToDataUrl(file, { maxDimension: MAX_IMAGE_DIMENSION, format: "image/jpeg", quality: 0.82 });
      setImage(dataUrl);
    } catch {
      setImageError("No se pudo procesar la imagen. Intenta con otro archivo.");
    }
  }

  function removeImage() {
    setImage("");
    if (imageInputRef.current) imageInputRef.current.value = "";
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    formData.set("image", image);
    formData.set("taxCategory", taxCategory);
    formData.set("trackStock", String(trackStock));
    formData.set("priceTiersEnabled", String(priceTiersEnabled));
    startTransition(async () => {
      const result = await action(formData);
      if (result.success) {
        router.push("/inventory");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-6 max-w-6xl">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="flex flex-col gap-4 rounded-lg border p-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Información general
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Nombre</Label>
              <Input id="name" name="name" defaultValue={product?.name} required />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="category">Categoría (opcional)</Label>
              <Input
                id="category"
                name="category"
                list="category-options"
                defaultValue={product?.category ?? ""}
                placeholder="Ej. Ropa, Calzado, Accesorios..."
              />
              <datalist id="category-options">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sku">SKU (opcional)</Label>
            <div className="flex gap-2">
              <Input id="sku" name="sku" value={sku} onChange={(e) => setSku(e.target.value)} className="flex-1" />
              <BarcodeScannerDialog onDetected={setSku} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Imagen del producto (opcional)</Label>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image} alt="" className="h-16 w-16 shrink-0 rounded object-cover border" />
              ) : (
                <div className="h-16 w-16 shrink-0 rounded border flex items-center justify-center text-xs text-muted-foreground text-center">
                  Sin imagen
                </div>
              )}
              <div className="flex flex-col gap-1.5 min-w-0">
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="text-sm max-w-full"
                />
                {image && (
                  <Button type="button" variant="outline" size="sm" onClick={removeImage} className="self-start">
                    Quitar imagen
                  </Button>
                )}
              </div>
            </div>
            {imageError && <p className="text-sm text-destructive">{imageError}</p>}
          </div>
        </div>

        <div className="flex flex-col gap-4 rounded-lg border p-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Precio e impuestos
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="price">Precio de venta ({referenceCurrency})</Label>
              <Input
                id="price"
                name="price"
                type="number"
                min={0}
                step="0.01"
                defaultValue={product ? product.priceCents / 100 : ""}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cost">Costo ({referenceCurrency}, opcional)</Label>
              <Input
                id="cost"
                name="cost"
                type="number"
                min={0}
                step="0.01"
                defaultValue={product?.costCents != null ? product.costCents / 100 : ""}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="taxCategory">IVA</Label>
            <Select value={taxCategory} onValueChange={(v) => v && setTaxCategory(v as TaxCategory)}>
              <SelectTrigger id="taxCategory">
                <SelectValue placeholder="Selecciona el tratamiento de IVA">
                  {(value: string | null) => (value ? TAX_CATEGORY_LABELS[value as TaxCategory] : "Selecciona")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TAX_CATEGORY_LABELS) as TaxCategory[]).map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {TAX_CATEGORY_LABELS[cat]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              El precio de venta ya incluye el IVA (como en el estante) — esto solo decide cómo se
              descompone en el Libro de Ventas y la Factura.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="flex flex-col gap-4 rounded-lg border p-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Control de stock
          </h2>

          <div className="flex flex-col gap-1.5">
            <div className="flex w-fit rounded-md border overflow-hidden">
              <button
                type="button"
                onClick={() => setTrackStock(true)}
                className={`px-3 py-1.5 text-sm ${trackStock ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                Activado
              </button>
              <button
                type="button"
                onClick={() => setTrackStock(false)}
                className={`px-3 py-1.5 text-sm ${!trackStock ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                Desactivado
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Desactívalo para productos sin un conteo real (servicios, artículos por encargo) — el
              punto de venta nunca lo mostrará como agotado.
            </p>
          </div>

          {trackStock && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="stock">Stock actual</Label>
                <Input
                  id="stock"
                  name="stock"
                  type="number"
                  min={0}
                  step={1}
                  defaultValue={product?.stock ?? 0}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="lowStockThreshold">Umbral de stock bajo</Label>
                <Input
                  id="lowStockThreshold"
                  name="lowStockThreshold"
                  type="number"
                  min={0}
                  step={1}
                  defaultValue={product?.lowStockThreshold ?? 5}
                  required
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4 rounded-lg border p-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Precios por cantidad
          </h2>

          <div className="flex flex-col gap-1.5">
            <div className="flex w-fit rounded-md border overflow-hidden">
              <button
                type="button"
                onClick={() => setPriceTiersEnabled(false)}
                className={`px-3 py-1.5 text-sm ${!priceTiersEnabled ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                Desactivado
              </button>
              <button
                type="button"
                onClick={() => setPriceTiersEnabled(true)}
                className={`px-3 py-1.5 text-sm ${priceTiersEnabled ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                Activado
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Precios distintos al mayor y al gran mayor, aplicados automáticamente según la
              cantidad que se venda (el precio de venta de arriba sigue siendo el precio al detal).
            </p>
          </div>

          {priceTiersEnabled && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="wholesalePrice">Precio al mayor ({referenceCurrency}, opcional)</Label>
                  <Input
                    id="wholesalePrice"
                    name="wholesalePrice"
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={product?.wholesalePriceCents != null ? product.wholesalePriceCents / 100 : ""}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="wholesaleMinQty">Cantidad mínima al mayor</Label>
                  <Input
                    id="wholesaleMinQty"
                    name="wholesaleMinQty"
                    type="number"
                    min={1}
                    step={1}
                    defaultValue={product?.wholesaleMinQty ?? ""}
                    placeholder="Ej. 51"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="bulkPrice">Precio al gran mayor ({referenceCurrency}, opcional)</Label>
                  <Input
                    id="bulkPrice"
                    name="bulkPrice"
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={product?.bulkPriceCents != null ? product.bulkPriceCents / 100 : ""}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="bulkMinQty">Cantidad mínima al gran mayor</Label>
                  <Input
                    id="bulkMinQty"
                    name="bulkMinQty"
                    type="number"
                    min={1}
                    step={1}
                    defaultValue={product?.bulkMinQty ?? ""}
                    placeholder="Ej. 100"
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : product ? "Guardar cambios" : "Crear producto"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/inventory")}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
