"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// A camera-based barcode scanner reused across POS, Presupuestos and
// Inventario. Decodes continuously while open; the per-frame callback fires
// constantly with "not found" between frames (normal while no code is in
// view) — only a caught promise rejection (camera denied/unavailable) is a
// real error worth surfacing.
export function BarcodeScannerDialog({
  triggerLabel = "Escanear",
  onDetected,
}: {
  triggerLabel?: string;
  onDetected: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    const reader = new BrowserMultiFormatReader();
    let cancelled = false;

    reader
      .decodeFromVideoDevice(undefined, videoRef.current ?? undefined, (result, _err, controls) => {
        controlsRef.current = controls;
        if (cancelled || !result) return;
        controls.stop();
        onDetected(result.getText());
        setOpen(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError("No se pudo acceder a la cámara. Revisa los permisos del navegador.");
        }
      });

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [open, onDetected]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>
        {triggerLabel}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Escanear código de barras</DialogTitle>
          <DialogDescription>Apunta la cámara al código del producto.</DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <video ref={videoRef} className="aspect-video w-full rounded-md bg-black" muted playsInline />
        )}
        <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
      </DialogContent>
    </Dialog>
  );
}
