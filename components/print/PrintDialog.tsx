"use client";

import { useRef, useState } from "react";
import type { PrintPaperSize } from "@prisma/client";
import { PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PAPER_SIZES, getPaperSize } from "@/lib/print-paper-sizes";
import { PrintFrame, type PrintFrameHandle } from "@/components/print/PrintFrame";

// Vista previa + impresión de un documento. El documento se dibuja UNA vez en
// un <PrintFrame> (iframe con @page y márgenes del tamaño elegido) y ese mismo
// iframe es el que se imprime: lo impreso es exactamente lo previsualizado, en
// 58 mm, 80 mm, carta o A4. Ver components/print/PrintFrame.tsx.
//
// Uso normal: con `triggerLabel` (botón que abre el diálogo). Uso controlado:
// pasar `open`/`onOpenChange` y omitir `triggerLabel`.
export function PrintDialog({
  triggerLabel,
  title,
  defaultPaperSize,
  paperSizes,
  onDownload,
  open: openProp,
  onOpenChange,
  children,
}: {
  triggerLabel?: string;
  title: string;
  defaultPaperSize: PrintPaperSize;
  // Tamaños ofrecidos (por defecto los cuatro). El Corte Z ofrece 80/58/carta.
  paperSizes?: PrintPaperSize[];
  // Si se pasa, aparece «Descargar PDF» junto a Imprimir.
  onDownload?: () => void | Promise<void>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: (paperSize: PrintPaperSize) => React.ReactNode;
}) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const [paperSize, setPaperSize] = useState<PrintPaperSize>(defaultPaperSize);
  const frameRef = useRef<PrintFrameHandle>(null);
  const options = paperSizes ? PAPER_SIZES.filter((p) => paperSizes.includes(p.code)) : PAPER_SIZES;

  function handleOpenChange(next: boolean) {
    setOpenState(next);
    onOpenChange?.(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {triggerLabel && <DialogTrigger render={<Button size="sm" variant="outline" />}>{triggerLabel}</DialogTrigger>}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-3">
          <Label htmlFor="print-paper-size" className="shrink-0">
            Tamaño de papel
          </Label>
          <Select value={paperSize} onValueChange={(v) => v && setPaperSize(v as PrintPaperSize)}>
            <SelectTrigger id="print-paper-size" className="max-w-[220px]">
              <SelectValue>{getPaperSize(paperSize).label}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {options.map((p) => (
                <SelectItem key={p.code} value={p.code}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {open && (
          <div className="min-w-0 rounded-md bg-muted p-3">
            <PrintFrame ref={frameRef} paperSize={paperSize} title={title}>
              {children(paperSize)}
            </PrintFrame>
          </div>
        )}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cerrar</DialogClose>
          {onDownload && (
            <Button variant="outline" onClick={() => void onDownload()}>
              Descargar PDF
            </Button>
          )}
          <Button onClick={() => void frameRef.current?.print()}>
            <PrinterIcon className="size-4" aria-hidden /> Imprimir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
