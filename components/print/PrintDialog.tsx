"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PrintPaperSize } from "@prisma/client";
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
import { PAPER_SIZES, getPaperSize, isThermal } from "@/lib/print-paper-sizes";

// @page rules keyed by paper size — injected as an inline <style> tag scoped
// to this dialog instance, since @page can't be conditioned on a class. Only
// used for the thermal fallback path below; the letter/A4 path prints an
// actual PDF (which carries its own page size) instead.
const PAGE_CSS: Record<PrintPaperSize, string> = {
  THERMAL_58: "@page { size: 58mm auto; margin: 2mm; }",
  THERMAL_80: "@page { size: 80mm auto; margin: 3mm; }",
  LETTER: "@page { size: letter; margin: 0.5in; }",
  A4: "@page { size: A4; margin: 12mm; }",
};

// A print-optimized preview + native browser print dialog for a single
// document.
//
// Letter/A4 (the common case): rendered and printed as the SAME PDF the
// "Descargar" button produces (buildPdfBlob), shown in an <iframe> and
// printed via that iframe's own contentWindow.print() — this guarantees the
// preview, the print output, and the downloaded file are pixel-identical and
// always portrait, since that's what the PDF itself is.
//
// Thermal receipt paper (58/80mm): no letter-sized PDF makes sense to compare
// against a narrow receipt roll, so this keeps the original hand-rolled HTML
// preview (`children`), printed through a SEPARATE React portal straight onto
// document.body (see .print-portal-content in app/globals.css) rather than
// printed from inside the visible preview dialog. Base UI's DialogContent is
// `position: fixed` with a translate transform, which makes it the CSS
// containing block for any `position: absolute` descendant — so a naive
// ".print-area" nested inside the dialog gets sized/clipped to the small
// on-screen modal box once @media print kicks in. Rendering the printable
// content as a body-level sibling of the dialog avoids that trap entirely.
export function PrintDialog({
  triggerLabel,
  title,
  defaultPaperSize,
  buildPdfBlob,
  children,
}: {
  triggerLabel: string;
  title: string;
  defaultPaperSize: PrintPaperSize;
  // Builds the exact same PDF as the "Descargar"/"Copiar" buttons, for the
  // given paper size — only called (and only relevant) for LETTER/A4.
  buildPdfBlob: (paperSize: PrintPaperSize) => Promise<Blob>;
  children: (paperSize: PrintPaperSize) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [paperSize, setPaperSize] = useState<PrintPaperSize>(defaultPaperSize);
  const [mounted, setMounted] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const thermal = isThermal(paperSize);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open || thermal) return;
    let cancelled = false;
    setPdfError(null);
    buildPdfBlob(paperSize)
      .then((blob) => {
        if (cancelled) return;
        setPdfUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
      })
      .catch(() => {
        if (!cancelled) setPdfError("No se pudo generar el documento.");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, thermal, paperSize]);

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) {
      setPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    }
  }, [open]);

  function handlePrint() {
    if (thermal) {
      window.print();
    } else {
      iframeRef.current?.contentWindow?.print();
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<Button size="sm" variant="outline" />}>{triggerLabel}</DialogTrigger>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
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
                {PAPER_SIZES.map((p) => (
                  <SelectItem key={p.code} value={p.code}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {thermal ? (
            <div
              className="mx-auto rounded-md border bg-white p-4 text-black"
              style={{ width: `${getPaperSize(paperSize).widthMm}mm` }}
            >
              {children(paperSize)}
            </div>
          ) : pdfError ? (
            <p className="text-sm text-destructive">{pdfError}</p>
          ) : pdfUrl ? (
            <iframe ref={iframeRef} src={pdfUrl} title={title} className="h-[60vh] w-full rounded-md border" />
          ) : (
            <p className="text-sm text-muted-foreground">Generando vista previa...</p>
          )}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cerrar</DialogClose>
            <Button onClick={handlePrint} disabled={!thermal && !pdfUrl}>
              Imprimir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {mounted &&
        open &&
        thermal &&
        createPortal(
          <div className="print-portal-content">
            <style>{PAGE_CSS[paperSize]}</style>
            <div style={{ width: `${getPaperSize(paperSize).widthMm}mm` }}>{children(paperSize)}</div>
          </div>,
          document.body
        )}
    </>
  );
}
