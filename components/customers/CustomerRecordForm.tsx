"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/types";
import type { Customer } from "@prisma/client";

type Props = {
  customer?: Customer;
  action: (formData: FormData) => Promise<ActionResult>;
};

export function CustomerRecordForm({ customer, action }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await action(formData);
      if (result.success) {
        router.push("/customers");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4 max-w-4xl rounded-lg border p-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="firstName">Nombre</Label>
          <Input id="firstName" name="firstName" defaultValue={customer?.firstName} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lastName">Apellido</Label>
          <Input id="lastName" name="lastName" defaultValue={customer?.lastName} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phone">Número de teléfono</Label>
          <Input id="phone" name="phone" type="tel" defaultValue={customer?.phone} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rif">Cédula/RIF (opcional)</Label>
          <Input id="rif" name="rif" defaultValue={customer?.rif ?? ""} />
          <p className="text-xs text-muted-foreground">Ej. V-12345678 o J-12345678-9</p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="address">Dirección</Label>
        <Input id="address" name="address" defaultValue={customer?.address ?? ""} />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : customer ? "Guardar cambios" : "Crear cliente"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/customers")}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
