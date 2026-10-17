"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// Shares a document via a link that regenerates its PDF on demand (see
// app/api/public/sales/[id]/route.ts and .../quotes/[id]/route.ts) — no
// file is ever stored. The QR just encodes that same link, for handing a
// phone to a customer to scan in person instead of typing anything.
export function ShareDialog({
  triggerLabel,
  title,
  path,
  customerPhone,
  message,
  buildPdfBlob,
  fileName,
}: {
  triggerLabel: string;
  title: string;
  path: string;
  customerPhone?: string | null;
  message: string;
  // When given, WhatsApp receives the PDF itself (built on this device)
  // instead of a link the customer has to open online.
  buildPdfBlob?: () => Promise<Blob>;
  fileName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfNotice, setPdfNotice] = useState<string | null>(null);

  // The PDF is built as soon as the dialog opens, not on the button click:
  // phones (iOS above all) only allow the share sheet right after a tap, and
  // building the PDF first would use up that window and the share would fail.
  const buildRef = useRef(buildPdfBlob);
  useEffect(() => {
    buildRef.current = buildPdfBlob;
  });
  useEffect(() => {
    if (!open || !buildRef.current) return;
    let cancelled = false;
    setPdfFile(null);
    setPdfError(null);
    setPdfNotice(null);
    buildRef.current()
      .then((blob) => {
        if (!cancelled) setPdfFile(new File([blob], fileName ?? "documento.pdf", { type: "application/pdf" }));
      })
      .catch(() => {
        if (!cancelled) setPdfError("No se pudo generar el PDF. Puedes enviar el enlace.");
      });
    return () => {
      cancelled = true;
    };
  }, [open, fileName]);
  // The dialog only opens after a click, so the origin is always available.
  const url = open ? `${window.location.origin}${path}` : "";

  useEffect(() => {
    if (!open) return;
    QRCode.toDataURL(url, { margin: 1, width: 220 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [open, url]);

  async function handleCopy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleWhatsApp() {
    const text = `${message} ${url}`;
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch {
        return; // user cancelled the native share sheet
      }
    }
    openWhatsApp(text);
  }

  function openWhatsApp(text: string) {
    const phoneDigits = customerPhone ? customerPhone.replace(/\D/g, "") : "";
    window.open(`https://wa.me/${phoneDigits}?text=${encodeURIComponent(text)}`, "_blank");
  }

  async function handleSendPdf() {
    if (!pdfFile) return;
    setPdfNotice(null);
    if (navigator.canShare?.({ files: [pdfFile] })) {
      try {
        await navigator.share({ files: [pdfFile], title, text: message });
      } catch {
        // Cancelled by the user — nothing to do.
      }
      return;
    }
    // This browser can't hand a file to WhatsApp (common on computers):
    // download the PDF and open the chat so it can be attached.
    const href = URL.createObjectURL(pdfFile);
    const a = document.createElement("a");
    a.href = href;
    a.download = pdfFile.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
    setPdfNotice("Se descargó el PDF. En el chat de WhatsApp que se abrió, adjúntalo con el clip 📎.");
    openWhatsApp(message);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>{triggerLabel}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Comparte el enlace o deja que el cliente escanee el código — siempre entrega la versión
            más reciente del documento.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3">
          {qrDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrDataUrl} alt="Código QR del documento" className="h-44 w-44" />
          )}
          <div className="flex w-full gap-2">
            <Input
              readOnly
              value={url}
              className="flex-1 text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button type="button" size="sm" variant="outline" onClick={handleCopy}>
              {copied ? "¡Copiado!" : "Copiar"}
            </Button>
          </div>
        </div>
        {pdfError && <p className="text-sm text-destructive">{pdfError}</p>}
        {pdfNotice && <p role="status" className="text-sm text-muted-foreground">{pdfNotice}</p>}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cerrar</DialogClose>
          {buildPdfBlob ? (
            <>
              <Button variant="outline" onClick={handleWhatsApp}>Enviar enlace</Button>
              <Button onClick={handleSendPdf} disabled={!pdfFile}>
                {pdfFile || pdfError ? "Enviar PDF por WhatsApp" : "Preparando PDF…"}
              </Button>
            </>
          ) : (
            <Button onClick={handleWhatsApp}>Enviar por WhatsApp</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
