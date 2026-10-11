"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
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

// What the parent says about a scanned code, shown inside the dialog so the
// cashier sees the result without the camera view being covered.
export type ScanFeedback = { ok: boolean; message: string };

// Only the formats retail products actually carry — decoding fewer formats is
// faster and gives fewer false reads than trying everything.
const FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.ITF,
  BarcodeFormat.QR_CODE,
];

// A code held in front of the camera is decoded many times a second. Accept it
// once, and accept the same code again only after the camera has NOT seen it
// for a moment (the cashier moved it away and brought it back). A fixed pause
// instead would re-add the item every few seconds while it stays in view, which
// would overcharge the sale. A different code is accepted right away, after a
// short pause so one product isn't read as two by a bad frame.
const ANY_CODE_COOLDOWN_MS = 500;
const SAME_CODE_GONE_MS = 1500;

function cameraErrorMessage(err: unknown): string {
  if (typeof window !== "undefined" && (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)) {
    return "La cámara solo funciona en una conexión segura (https).";
  }
  const name = typeof err === "object" && err !== null && "name" in err ? String((err as { name: unknown }).name) : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Permiso de cámara denegado. Actívalo en los ajustes del navegador para este sitio y vuelve a intentarlo.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No hay una cámara disponible en este equipo. Puedes usar un lector de códigos conectado o escribir el código.";
    case "NotReadableError":
    case "AbortError":
      return "La cámara está siendo usada por otra aplicación. Ciérrala e inténtalo de nuevo.";
    default:
      return "No se pudo acceder a la cámara. Revisa los permisos del navegador.";
  }
}

// Short confirmation a cashier can feel and hear without looking: a vibration
// (Android) and a brief beep. Both are best-effort — iOS has no vibration API
// and a browser may block audio — so neither can ever break scanning.
function signalRead() {
  try {
    navigator.vibrate?.(60);
  } catch {}
  try {
    const AudioCtx =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.onended = () => void ctx.close();
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  } catch {}
}

// A camera-based barcode scanner reused across POS, Presupuestos and
// Inventario. It asks for the rear camera, decodes continuously while open,
// and — with `continuous` — stays open so several products can be scanned
// one after another (the POS case); otherwise it closes after the first read.
export function BarcodeScannerDialog({
  triggerLabel = "Escanear",
  onDetected,
  continuous = false,
}: {
  triggerLabel?: string;
  onDetected: (code: string) => ScanFeedback | void;
  continuous?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [feedback, setFeedback] = useState<ScanFeedback | null>(null);

  // The parent usually passes a new function on every render. Keeping the
  // latest one in a ref (instead of listing it as an effect dependency) stops
  // the camera from restarting whenever the parent re-renders mid-scan.
  const onDetectedRef = useRef(onDetected);
  useEffect(() => {
    onDetectedRef.current = onDetected;
  });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setError(null);
      setReady(false);
      setFeedback(null);
    }
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let controls: IScannerControls | null = null;
    let lastCode = "";
    let lastAcceptedAt = 0;
    let lastSeenAt = 0;

    async function start() {
      try {
        // The dialog body mounts in a portal; wait briefly for the <video> so
        // the preview never ends up on a detached element. A timer, not
        // requestAnimationFrame: rAF stops entirely while the tab is hidden and
        // would leave the camera waiting forever.
        let video = videoRef.current;
        for (let i = 0; i < 40 && !video && !cancelled; i++) {
          await new Promise<void>((resolve) => setTimeout(resolve, 50));
          video = videoRef.current;
        }
        if (cancelled) return;
        if (!video) throw new Error("video element missing");
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
          setError(cameraErrorMessage(null));
          return;
        }

        const hints = new Map<DecodeHintType, unknown>([
          [DecodeHintType.POSSIBLE_FORMATS, FORMATS],
          [DecodeHintType.TRY_HARDER, true],
        ]);
        const reader = new BrowserMultiFormatReader(hints as Map<DecodeHintType, never>, {
          delayBetweenScanAttempts: 100,
          delayBetweenScanSuccess: 300,
        });

        const started = await reader.decodeFromConstraints(
          {
            audio: false,
            video: {
              // "ideal", not "exact": phones open the rear camera, a laptop
              // with only a webcam still works instead of failing.
              facingMode: { ideal: "environment" },
              // The default (640x480) is too soft for small or distant codes.
              width: { ideal: 1280 },
              height: { ideal: 720 },
              // Best-effort; browsers that don't support it ignore it.
              advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet],
            },
          },
          video,
          (result) => {
            if (cancelled || !result) return;
            const code = result.getText();
            const now = Date.now();
            const sameCodeStillInView = code === lastCode && now - lastSeenAt < SAME_CODE_GONE_MS;
            lastSeenAt = now;
            if (sameCodeStillInView) return;
            if (now - lastAcceptedAt < ANY_CODE_COOLDOWN_MS) return;
            lastCode = code;
            lastAcceptedAt = now;

            signalRead();
            const outcome = onDetectedRef.current(code);
            if (continuous) {
              setFeedback(outcome ?? { ok: true, message: code });
            } else {
              // Closing runs the cleanup below, which stops the camera.
              setOpen(false);
            }
          }
        );

        if (cancelled) {
          started.stop();
          return;
        }
        controls = started;
        setReady(true);
      } catch (err) {
        if (!cancelled) setError(cameraErrorMessage(err));
      }
    }

    void start();

    return () => {
      cancelled = true;
      controls?.stop();
      controls = null;
    };
  }, [open, continuous]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>
        {triggerLabel}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Escanear código de barras</DialogTitle>
          <DialogDescription>
            {continuous
              ? "Apunta la cámara a cada código. Se agregan uno tras otro; cierra cuando termines."
              : "Apunta la cámara al código del producto."}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <div className="relative">
            <video
              ref={videoRef}
              className="aspect-video w-full rounded-md bg-black object-cover"
              autoPlay
              muted
              playsInline
            />
            {!ready && (
              <p className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
                Iniciando cámara…
              </p>
            )}
          </div>
        )}
        <p
          role="status"
          aria-live="polite"
          className={`min-h-5 text-sm font-medium ${
            feedback?.ok === false ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"
          }`}
        >
          {feedback?.message}
        </p>
        <DialogClose render={<Button variant="outline" />}>{continuous ? "Cerrar" : "Cancelar"}</DialogClose>
      </DialogContent>
    </Dialog>
  );
}
