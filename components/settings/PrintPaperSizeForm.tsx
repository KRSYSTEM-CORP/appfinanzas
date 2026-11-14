"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { PrintPaperSize } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { updatePrintPaperSize } from "@/lib/actions/settings";
import { PAPER_SIZES } from "@/lib/print-paper-sizes";
import { Field, FieldSelect, SubTitle } from "@/components/settings/team-print-kit";

// Tamaño de papel por defecto (se preselecciona al imprimir notas, presupuestos y recibos).
export function PrintPaperSizeForm({ currentPaperSize }: { currentPaperSize: PrintPaperSize }) {
  const router = useRouter();
  const [paperSize, setPaperSize] = useState<PrintPaperSize>(currentPaperSize);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const formData = new FormData();
      formData.set("printPaperSize", paperSize);
      const result = await updatePrintPaperSize(formData);
      if (result.success) {
        toast.success("Tamaño de papel guardado.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3.5">
      <SubTitle>Papel por defecto</SubTitle>
      <Field label="Tamaño de papel por defecto" htmlFor="printPaperSize">
        <FieldSelect id="printPaperSize" value={paperSize} onChange={(e) => setPaperSize(e.target.value as PrintPaperSize)}>
          {PAPER_SIZES.map((p) => (
            <option key={p.code} value={p.code}>
              {p.label}
            </option>
          ))}
        </FieldSelect>
      </Field>
      <p className="mt-2 text-[13px] text-muted-foreground">Se usa al imprimir notas de entrega, presupuestos y recibos de pago; puedes cambiarlo en cada impresión.</p>
      <div className="mt-3">
        <Button type="submit" disabled={isPending || paperSize === currentPaperSize}>
          {isPending ? "Guardando..." : "Guardar"}
        </Button>
      </div>
    </form>
  );
}
