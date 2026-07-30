"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PrintPaperSize } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updatePrintPaperSize } from "@/lib/actions/settings";
import { PAPER_SIZES, getPaperSize } from "@/lib/print-paper-sizes";

export function PrintPaperSizeForm({ currentPaperSize }: { currentPaperSize: PrintPaperSize }) {
  const router = useRouter();
  const [paperSize, setPaperSize] = useState<PrintPaperSize>(currentPaperSize);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("printPaperSize", paperSize);
      const result = await updatePrintPaperSize(formData);
      if (result.success) {
        setSaved(true);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-sm">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="printPaperSize">Tamaño de papel por defecto</Label>
        <Select value={paperSize} onValueChange={(v) => v && setPaperSize(v as PrintPaperSize)}>
          <SelectTrigger id="printPaperSize">
            <SelectValue placeholder="Selecciona un tamaño">
              {(value: string | null) => (value ? getPaperSize(value as PrintPaperSize).label : "Selecciona un tamaño")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {PAPER_SIZES.map((p) => (
              <SelectItem key={p.code} value={p.code}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Se usa como opción preseleccionada al imprimir notas de entrega, presupuestos y recibos de
          pago — puedes cambiarlo en cada impresión.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {saved && !error && <p className="text-sm text-muted-foreground">Guardado.</p>}

      <Button type="submit" disabled={isPending || paperSize === currentPaperSize}>
        {isPending ? "Guardando..." : "Guardar tamaño de papel"}
      </Button>
    </form>
  );
}
