"use client";

import { useEffect, useState } from "react";
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
}: {
  triggerLabel: string;
  title: string;
  path: string;
  customerPhone?: string | null;
  message: string;
}) {
  const [open, setOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (!open) return;
    const fullUrl = `${window.location.origin}${path}`;
    setUrl(fullUrl);
    QRCode.toDataURL(fullUrl, { margin: 1, width: 220 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [open, path]);

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
    const phoneDigits = customerPhone ? customerPhone.replace(/\D/g, "") : "";
    window.open(`https://wa.me/${phoneDigits}?text=${encodeURIComponent(text)}`, "_blank");
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
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cerrar</DialogClose>
          <Button onClick={handleWhatsApp}>Enviar por WhatsApp</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
