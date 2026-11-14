"use client";

import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { FileTextIcon, PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { WhatsappIcon } from "@/components/ui/whatsapp-icon";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PrintableSaleDocument } from "@/components/print/PrintableSaleDocument";
import { buildDeliveryNotePDF, controlNumberLabel, type DeliveryNoteCompany, type DeliveryNoteSale } from "@/lib/delivery-note";
import type { PrintPaperSize, ReferenceCurrency } from "@prisma/client";

type Fmt = "58" | "80" | "c";
const PAPER: Record<Fmt, PrintPaperSize> = { "58": "THERMAL_58", "80": "THERMAL_80", c: "LETTER" };
const PAGE_CSS: Record<Fmt, string> = {
  "58": "@page { size: 58mm auto; margin: 2mm; }",
  "80": "@page { size: 80mm auto; margin: 3mm; }",
  c: "@page { size: letter; margin: 0.5in; }",
};

// «Imprimir o compartir» de la preview: formato (ticket 58/80 mm u hoja carta)
// con vista previa, Imprimir, Descargar PDF y envío por WhatsApp al cliente.
export function PosDocumentSheet({
  open,
  onOpenChange,
  sale,
  company,
  rate,
  currencyCode,
  exchangeRateEnabled,
  referenceCurrency,
  kind,
  defaultFormat,
  message,
  pendingSync,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sale: DeliveryNoteSale & { id: string };
  company: DeliveryNoteCompany;
  rate: number | null;
  currencyCode: string;
  exchangeRateEnabled: boolean;
  referenceCurrency: ReferenceCurrency;
  kind: "delivery" | "ticket";
  defaultFormat: Fmt;
  message: string;
  pendingSync: boolean;
}) {
  const [fmt, setFmt] = useState<Fmt>(defaultFormat);
  const [phone, setPhone] = useState(sale.customerPhone && sale.customerPhone !== "0000-0000000" ? sale.customerPhone : "");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const title = kind === "ticket" ? "TICKET DE CAJA" : "NOTA DE ENTREGA";
  const number = pendingSync ? "pendiente" : controlNumberLabel(sale);
  const fileBase = `${kind === "ticket" ? "ticket" : "nota-entrega"}-${number}`;
  const variant = kind === "ticket" ? "ticket" : "delivery-note";

  const doc = (paper: PrintPaperSize) => (
    <PrintableSaleDocument
      sale={sale}
      company={company}
      rate={rate}
      currencyCode={currencyCode}
      exchangeRateEnabled={exchangeRateEnabled}
      referenceCurrency={referenceCurrency}
      variant={variant}
      paperSize={paper}
    />
  );

  async function pdfBlob() {
    const pdf = await buildDeliveryNotePDF(sale, company, rate, currencyCode, exchangeRateEnabled, referenceCurrency, "letter", variant);
    return pdf.output("blob") as Blob;
  }

  async function download() {
    setBusy(true);
    try {
      const blob = await pdfBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileBase}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally {
      setBusy(false);
    }
  }

  async function sendWhatsApp() {
    setNotice(null);
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) {
      setNotice("Escribe un número de WhatsApp válido");
      return;
    }
    const intl = digits.startsWith("0") ? `58${digits.slice(1)}` : digits;
    setBusy(true);
    try {
      const file = new File([await pdfBlob()], `${fileBase}.pdf`, { type: "application/pdf" });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], text: message });
        } catch {
          // El cliente canceló el menú de compartir.
        }
        return;
      }
      // Este navegador no puede pasarle el archivo a WhatsApp: se descarga el
      // PDF y se abre el chat para adjuntarlo.
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      window.open(`https://wa.me/${intl}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
      setNotice("Se descargó el PDF: adjúntalo en el chat de WhatsApp que se abrió.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Imprimir o compartir</DialogTitle>
            <DialogDescription>
              {title} · N.º {number}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-1">
            <Segmented
              label="Formato"
              value={fmt}
              onChange={setFmt}
              options={[
                { value: "58", label: "Ticket 58 mm" },
                { value: "80", label: "Ticket 80 mm" },
                { value: "c", label: "Hoja carta" },
              ]}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {fmt === "c"
              ? "Hoja carta (8,5 × 11 pulgadas), lista para impresora de oficina o para guardar en PDF."
              : `Ticket térmico de ${fmt} mm para impresora de punto de venta.`}
          </p>
          <div className="flex max-h-[44vh] justify-center overflow-auto rounded-[14px] bg-muted p-3">
            <div
              className="h-fit bg-white p-3.5 text-black shadow-[0_1px_3px_rgba(0,0,0,.2)]"
              style={{ width: fmt === "c" ? "100%" : fmt === "58" ? 220 : 300 }}
            >
              {doc(PAPER[fmt])}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => window.print()}>
              <PrinterIcon className="size-4" strokeWidth={2.2} /> Imprimir
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={download}>
              <FileTextIcon className="size-4" strokeWidth={2.2} /> Descargar PDF
            </Button>
          </div>
          <div className="mt-1 border-t border-border pt-1">
            <label className="mt-2.5 flex flex-col gap-1 text-[13px] font-semibold">
              Enviar por WhatsApp
              <input
                type="tel"
                inputMode="tel"
                autoComplete="off"
                placeholder="0412-000-0000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="h-11 w-full rounded-[12px] border border-border bg-background px-3 text-[13px] font-semibold outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/30"
              />
            </label>
            <div className="mt-2.5 rounded-2xl bg-muted p-3.5">
              <div className="ml-auto max-w-[85%] rounded-[14px] rounded-tr-[4px] bg-success/14 px-3.5 py-2.5 text-sm text-foreground">{message}</div>
            </div>
            {notice && <p className="mt-2 text-[13px] text-muted-foreground">{notice}</p>}
            <div className="mt-2.5 flex flex-wrap gap-2">
              <Button type="button" disabled={busy} onClick={sendWhatsApp} className="bg-[#25d366] text-[#052e16] hover:bg-[#25d366]/90">
                <WhatsappIcon className="size-4" /> Enviar por WhatsApp
              </Button>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cerrar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {mounted &&
        open &&
        createPortal(
          <div className="print-portal-content">
            <style>{PAGE_CSS[fmt]}</style>
            <div style={{ width: fmt === "c" ? "100%" : `${fmt}mm` }}>{doc(PAPER[fmt])}</div>
          </div>,
          document.body
        )}
    </>
  );
}
