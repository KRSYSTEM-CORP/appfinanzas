"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateFiscalData, type FiscalData } from "@/lib/actions/settings";

export function FiscalDataForm({ initial }: { initial: FiscalData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await updateFiscalData(formData);
      if (result.success) {
        toast.success("Datos fiscales guardados.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4 max-w-sm">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fiscalLegalName">Razón social</Label>
        <Input id="fiscalLegalName" name="fiscalLegalName" defaultValue={initial.fiscalLegalName ?? ""} />
        <p className="text-xs text-muted-foreground">Ej. Comercial Ejemplo, C.A.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fiscalRif">RIF</Label>
        <Input id="fiscalRif" name="fiscalRif" defaultValue={initial.fiscalRif ?? ""} />
        <p className="text-xs text-muted-foreground">Ej. J-12345678-9</p>
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
        <Input id="fiscalPhone" name="fiscalPhone" defaultValue={initial.fiscalPhone ?? ""} />
        <p className="text-xs text-muted-foreground">Ej. 0212-1234567</p>
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Guardar datos fiscales"}
      </Button>
    </form>
  );
}
