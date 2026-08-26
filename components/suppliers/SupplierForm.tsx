"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/types";
import type { Supplier } from "@prisma/client";

type Props = {
  supplier?: Supplier;
  action: (formData: FormData) => Promise<ActionResult>;
};

export function SupplierForm({ supplier, action }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await action(formData);
      if (result.success) {
        router.push("/suppliers");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4 max-w-4xl rounded-lg border p-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nombre / razón social</Label>
          <Input id="name" name="name" defaultValue={supplier?.name} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rif">RIF (opcional)</Label>
          <Input id="rif" name="rif" defaultValue={supplier?.rif ?? ""} />
          <p className="text-xs text-muted-foreground">Ej. J-12345678-9</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phone">Teléfono (opcional)</Label>
          <Input id="phone" name="phone" type="tel" defaultValue={supplier?.phone ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="address">Dirección (opcional)</Label>
          <Input id="address" name="address" defaultValue={supplier?.address ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Correo (opcional)</Label>
          <Input id="email" name="email" type="email" defaultValue={supplier?.email ?? ""} />
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : supplier ? "Guardar cambios" : "Crear proveedor"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/suppliers")}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
