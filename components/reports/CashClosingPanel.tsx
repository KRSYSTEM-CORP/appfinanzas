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
  canClose,
  branchSelected = true,
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
  // false con «Todas las sucursales»: la caja se abre y se cierra por sucursal.
  branchSelected?: boolean;
}) {
  const router = useRouter();
  const [openSheet, setOpenSheet] = useState<"open" | "close" | null>(null);
  const [opening, setOpening] = useState(summary.openingCents != null ? String(summary.openingCents / 100) : "");
  const [openingBs, setOpeningBs] = useState("");
  const [responsible, setResponsible] = useState(summary.responsibleName ?? "");
  const [note, setNote] = useState("");
  const [countedUsd, setCountedUsd] = useState("");
  const [countedBs, setCountedBs] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  const isOpen = summary.shiftOpen;
  const hadShiftToday = summary.shifts.length > 0;
  const nextShiftNo = summary.shifts.length > 0 ? Math.max(...summary.shifts.map((x) => x.shiftNumber)) + 1 : 1;

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
      const result = await setCashOpening(summary.date, cents, { usdCents: cents, bsCents }, responsible, isOpen ? "adjust" : "start");
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
    const hasCount = countedUsd.trim() !== "" || countedBs.trim() !== "";
    const counted = hasCount
      ? { usdCents: Math.round((Number(countedUsd) || 0) * 100), bsCents: Math.round((Number(countedBs) || 0) * 100) }
      : undefined;
    startTransition(async () => {
      const result = await closeCashRegister(summary.date, note, counted);
      if (result.success) {
        setNote("");
        setCountedUsd("");
        setCountedBs("");
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
        {canClose && (
          <Button
            type="button"
            disabled={!branchSelected}
            title={!branchSelected ? "Selecciona una sucursal para abrir la caja" : undefined}
            onClick={() => {
              setError(null);
              if (isOpen) {
                setOpening(summary.openingCents != null ? String(summary.openingCents / 100) : "");
              } else {
                setOpening("");
                setOpeningBs("");
                setResponsible("");
              }
              setOpenSheet("open");
            }}
          >
            {isOpen ? "Ajustar apertura" : hadShiftToday ? "Abrir nuevo turno" : "Abrir caja"}
          </Button>
        )}
        <Button type="button" variant="outline" disabled={busy} onClick={downloadPdf}>
          <PrinterIcon data-icon="inline-start" /> Generar Corte Z
        </Button>
        <PrintDialog
          triggerLabel="Imprimir Corte Z"
          title="Imprimir cierre de caja"
          defaultPaperSize="THERMAL_80"
          paperSizes={["THERMAL_80", "THERMAL_58", "LETTER"]}
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
        {canClose && (
          <Button
            type="button"
            variant="destructive"
            disabled={summary.closed != null || !branchSelected}
            title={!branchSelected ? "Selecciona una sucursal para cerrar la caja" : summary.closed ? "La caja de hoy ya fue cerrada" : undefined}
            onClick={() => { setError(null); setOpenSheet("close"); }}
          >
            {summary.closed ? "Caja cerrada" : "Cerrar caja"}
          </Button>
        )}
        {summary.shiftNumber != null && (
          <p className="basis-full text-xs text-muted-foreground">
            Turno {summary.shiftNumber}
            {summary.responsibleName ? ` · Responsable: ${summary.responsibleName}` : ""}
            {summary.shifts.length > 1 ? ` · ${summary.shifts.length} turnos hoy` : ""}
          </p>
        )}
        {canClose && !branchSelected && (
          <p className="basis-full text-xs text-muted-foreground">Elige una sucursal arriba para abrir o cerrar su caja.</p>
        )}
        {!canClose && <p className="basis-full text-xs text-muted-foreground">Solo el gerente abre y cierra la caja.</p>}
      </div>

      <Dialog open={openSheet === "open"} onOpenChange={(o) => !o && setOpenSheet(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isOpen ? "Ajustar apertura" : hadShiftToday ? `Abrir turno ${nextShiftNo}` : "Abrir caja"}</DialogTitle>
            <DialogDescription>Saldo inicial por método de pago. Indica quién es el responsable de la caja en este turno.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cc-responsible">Responsable de la caja</Label>
            <Input id="cc-responsible" value={responsible} maxLength={80} placeholder="Nombre de quien recibe la caja" onChange={(e) => setResponsible(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cc-opening">Efectivo {referenceCurrency === "EUR" ? "€" : "$"}</Label>
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
              {summary.salesCount === 0
                ? "No hay ventas este día. Puedes cerrar el turno igualmente."
                : "Cuenta el efectivo de la gaveta. Se cierra el turno de hoy y queda en el historial de cierres."}
            </DialogDescription>
          </DialogHeader>
          {(() => {
            const sym = referenceCurrency === "EUR" ? "€" : "$";
            const usd = Number(countedUsd) || 0;
            const bs = Number(countedBs) || 0;
            const rateOn = exchangeRateEnabled && rate != null;
            const countedRef = usd + (rateOn && rate ? bs / rate : 0);
            const expected = summary.expectedCashCents / 100;
            const hasCount = countedUsd.trim() !== "" || countedBs.trim() !== "";
            const diff = countedRef - expected;
            return (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between rounded-xl bg-muted px-3.5 py-2.5 text-sm">
                  <span className="text-muted-foreground">Efectivo esperado en caja</span>
                  <b className="tabular-nums">{sym}{expected.toFixed(2)}</b>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="cc-counted-usd">Efectivo contado {sym}</Label>
                    <Input id="cc-counted-usd" type="number" min="0" step="0.01" inputMode="decimal" value={countedUsd} onChange={(e) => setCountedUsd(e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="cc-counted-bs">Efectivo contado Bs</Label>
                    <Input id="cc-counted-bs" type="number" min="0" step="0.01" inputMode="decimal" value={countedBs} onChange={(e) => setCountedBs(e.target.value)} disabled={!rateOn} />
                  </div>
                </div>
                {hasCount && (
                  <p className={`rounded-xl px-3.5 py-2.5 text-sm font-semibold ${Math.abs(diff) < 0.005 ? "bg-success/14 text-success" : "bg-warning/18 text-warning"}`}>
                    {Math.abs(diff) < 0.005 ? "La caja cuadra." : diff > 0 ? `Sobrante de ${sym}${diff.toFixed(2)}.` : `Faltante de ${sym}${Math.abs(diff).toFixed(2)}.`}
                  </p>
                )}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="closing-note">Nota (opcional)</Label>
                  <Input id="closing-note" value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
              </div>
            );
          })()}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" variant="destructive" disabled={isPending} onClick={handleClose}>
              {isPending ? "Cerrando..." : "Cerrar caja"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpenSheet(null)}>Cancelar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
