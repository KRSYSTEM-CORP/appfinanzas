"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateFiscalData, type FiscalData } from "@/lib/actions/settings";

export function FiscalDataForm({ initial }: { initial: FiscalData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSubmit(formData: FormData) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateFiscalData(formData);
      if (result.success) {
        setSaved(true);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4 max-w-sm">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fiscalLegalName">Razón social</Label>
        <Input
          id="fiscalLegalName"
          name="fiscalLegalName"
          defaultValue={initial.fiscalLegalName ?? ""}
          placeholder="Ej. Comercial Ejemplo, C.A."
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fiscalRif">RIF</Label>
        <Input
          id="fiscalRif"
          name="fiscalRif"
          defaultValue={initial.fiscalRif ?? ""}
          placeholder="Ej. J-12345678-9"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fiscalAddress">Dirección fiscal</Label>
        <Textarea
          id="fiscalAddress"
          name="fiscalAddress"
          defaultValue={initial.fiscalAddress ?? ""}
          rows={2}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fiscalPhone">Teléfono</Label>
        <Input
          id="fiscalPhone"
          name="fiscalPhone"
          defaultValue={initial.fiscalPhone ?? ""}
          placeholder="Ej. 0212-1234567"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {saved && !error && <p className="text-sm text-muted-foreground">Guardado.</p>}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Guardar datos fiscales"}
      </Button>
    </form>
  );
}
