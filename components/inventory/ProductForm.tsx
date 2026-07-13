"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/types";
import type { Product } from "@prisma/client";

type Props = {
  product?: Product;
  action: (formData: FormData) => Promise<ActionResult>;
};

export function ProductForm({ product, action }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
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
    <form action={handleSubmit} className="flex flex-col gap-4 max-w-md">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Nombre</Label>
        <Input id="name" name="name" defaultValue={product?.name} required />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sku">SKU (opcional)</Label>
        <Input id="sku" name="sku" defaultValue={product?.sku ?? ""} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="price">Precio de venta (MXN)</Label>
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
          <Label htmlFor="cost">Costo (MXN, opcional)</Label>
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

      <div className="grid grid-cols-2 gap-4">
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
