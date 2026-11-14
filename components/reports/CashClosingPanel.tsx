"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { closeCashRegister, setCashOpening, type CashClosingSummary } from "@/lib/actions/cash-closing";
import { buildCashClosingPDF } from "@/lib/cash-closing-pdf";
import { pdfFormatForPaperSize } from "@/lib/print-paper-sizes";
import { PrintDialog } from "@/components/print/PrintDialog";
import { PrintableCashClosing } from "@/components/print/PrintableCashClosing";
import type { DeliveryNoteCompany } from "@/lib/delivery-note";
import type { PrintPaperSize, ReferenceCurrency } from "@prisma/client";

// Acciones del encabezado de "Estado de la caja": píldora de estado, Abrir
// caja, Generar Corte Z (+ imprimir) y Cerrar caja. Solo opera sobre el día de
// hoy; los días anteriores se cierran desde "Días pendientes por cerrar".
export function CashClosingPanel({
  summary,
  rate,
  currencyCode,
  exchangeRateEnabled,
  referenceCurrency,
  company,
  branchName,
  printPaperSize,
  canClose,
}: {
  summary: CashClosingSummary;
  rate: number | null;
  currencyCode: string;
  exchangeRateEnabled: boolean;
  referenceCurrency: ReferenceCurrency;
  company: DeliveryNoteCompany;
  branchName: string | null;
  printPaperSize: PrintPaperSize;
  canClose: boolean;
}) {
  const router = useRouter();
  const [openSheet, setOpenSheet] = useState<"open" | "close" | null>(null);
  const [opening, setOpening] = useState(summary.openingCents != null ? String(summary.openingCents / 100) : "");
  const [openingBs, setOpeningBs] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  const isOpen = !summary.closed && summary.openingCents != null;

  async function buildPdf(paperSize?: PrintPaperSize) {
    return buildCashClosingPDF(
      summary,
      company,
      branchName,
      rate,
      currencyCode,
      exchangeRateEnabled,
      referenceCurrency,
      paperSize ? pdfFormatForPaperSize(paperSize) : "letter"
    );
  }

  async function downloadPdf() {
    setBusy(true);
    try {
      const doc = await buildPdf();
      doc.save(`cierre-de-caja-${summary.date}.pdf`);
    } finally {
      setBusy(false);
    }
  }

  function saveOpening() {
    setError(null);
    const cents = Math.round((Number(opening) || 0) * 100);
    const bsCents = Math.round((Number(openingBs) || 0) * 100);
    startTransition(async () => {
      const result = await setCashOpening(summary.date, cents, { usdCents: cents, bsCents });
      if (result.success) {
        setOpenSheet(null);
        router.refresh();
      } else {
        setError(result.error ?? "No se pudo guardar");
      }
    });
  }

  function handleClose() {
    setError(null);
    startTransition(async () => {
      const result = await closeCashRegister(summary.date, note);
      if (result.success) {
        setNote("");
        setOpenSheet(null);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={isOpen ? "success" : "destructive"}>{isOpen ? "Abierta" : "Cerrada"}</Badge>
        {canClose && !summary.closed && (
          <Button type="button" onClick={() => { setError(null); setOpenSheet("open"); }}>
            {isOpen ? "Ajustar apertura" : "Abrir caja"}
          </Button>
        )}
        <Button type="button" variant="outline" disabled={busy} onClick={downloadPdf}>
          <PrinterIcon data-icon="inline-start" /> Generar Corte Z
        </Button>
        <PrintDialog
          triggerLabel="Imprimir Corte Z"
          title="Imprimir cierre de caja"
          defaultPaperSize={printPaperSize}
          buildPdfBlob={async (paperSize) => (await buildPdf(paperSize)).output("blob") as Blob}
        >
          {(paperSize) => (
            <PrintableCashClosing
              summary={summary}
              company={company}
              branchName={branchName}
              rate={rate}
              currencyCode={currencyCode}
              exchangeRateEnabled={exchangeRateEnabled}
              referenceCurrency={referenceCurrency}
              paperSize={paperSize}
            />
          )}
        </PrintDialog>
        {canClose && !summary.closed && (
          <Button type="button" variant="destructive" onClick={() => { setError(null); setOpenSheet("close"); }}>
            Cerrar caja
          </Button>
        )}
      </div>

      <Dialog open={openSheet === "open"} onOpenChange={(o) => !o && setOpenSheet(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isOpen ? "Ajustar apertura" : "Abrir caja"}</DialogTitle>
            <DialogDescription>Saldo inicial por método de pago. Arranca el turno de hoy.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cc-opening">Efectivo $</Label>
              <Input id="cc-opening" type="number" min="0" step="0.01" inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cc-opening-bs">Efectivo Bs</Label>
              <Input id="cc-opening-bs" type="number" min="0" step="0.01" inputMode="decimal" value={openingBs} onChange={(e) => setOpeningBs(e.target.value)} />
            </div>
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" disabled={isPending} onClick={saveOpening}>{isOpen ? "Guardar" : "Iniciar turno"}</Button>
            <Button type="button" variant="outline" onClick={() => setOpenSheet(null)}>Cancelar</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={openSheet === "close"} onOpenChange={(o) => !o && setOpenSheet(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cerrar caja</DialogTitle>
            <DialogDescription>
              {summary.salesCount === 0 ? "No hay ventas este día para cerrar." : "Se cierra el turno de hoy y queda en el historial de cierres."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="closing-note">Nota (opcional)</Label>
            <Input id="closing-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" variant="destructive" disabled={isPending || summary.salesCount === 0} onClick={handleClose}>
              {isPending ? "Cerrando..." : "Cerrar caja"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpenSheet(null)}>Cancelar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
