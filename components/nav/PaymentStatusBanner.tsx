"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2Icon, ClockIcon, XCircleIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Confetti } from "@/components/ui/confetti";
import { PaymentShareActions } from "@/components/billing/PaymentShareActions";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import type { PaymentBannerState } from "@/lib/payment-banner";

const KEY = "kr-pos-payment-celebrated";
const usd = (cents: number) => `$${(cents / 100).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function seen(id: string): boolean {
  try {
    return localStorage.getItem(KEY) === id;
  } catch {
    return false;
  }
}
function markSeen(id: string) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // Sin almacenamiento: puede repetirse el anuncio en otra visita; no es grave.
  }
}

// Estado del pago de la suscripción en el encabezado: «Pago pendiente» (con su información y las opciones
// de reenviarla o verla), y el anuncio «¡Pago registrado!» con confeti cuando el administrador lo aprueba.
// Se actualiza solo (aviso en vivo) y, si la persona no estaba conectada, lo celebra al volver.
export function PaymentStatusBanner({ companyId, state }: { companyId: string; state: PaymentBannerState | null }) {
  useLiveRefresh(`pos:${companyId}`, "payment");
  const [open, setOpen] = useState(false);
  const [celebrate, setCelebrate] = useState<PaymentBannerState | null>(null);
  const [rejected, setRejected] = useState<PaymentBannerState | null>(null);
  const [confetti, setConfetti] = useState(false);
  const prev = useRef<string | null>(null);

  useEffect(() => {
    if (!state) {
      prev.current = null;
      return;
    }
    const key = `${state.reportId}:${state.status}`;
    if (prev.current === key) return;
    const changedLive = prev.current !== null;
    prev.current = key;
    // En un temporizador (no síncrono dentro del efecto): reacciona al cambio de estado ya pintado.
    const t = setTimeout(() => {
      if (state.status === "APPROVED" && !seen(state.reportId)) {
        markSeen(state.reportId);
        setOpen(false);
        setCelebrate(state);
        setConfetti(true);
      } else if (state.status === "REJECTED" && changedLive) {
        setOpen(false);
        setRejected(state);
      }
    }, 0);
    return () => clearTimeout(t);
  }, [state]);

  const pending = state?.status === "PENDING" ? state : null;

  return (
    <>
      <Confetti run={confetti} onDone={() => setConfetti(false)} />

      {pending && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-[calc(var(--tabbar-h)+0.75rem)] right-3 z-40 flex items-center gap-2 rounded-full border border-warning/40 bg-card px-3.5 py-2 text-sm font-semibold shadow-(--shadow-card) hover:bg-muted"
        >
          <ClockIcon className="size-4 text-warning" aria-hidden />
          Pago pendiente · {usd(pending.amountUsdCents)}
        </button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Pago pendiente</DialogTitle>
            <DialogDescription>
              Recibimos tu reporte. Lo verificamos en hasta 2 horas hábiles y te avisamos aquí apenas esté confirmado.
            </DialogDescription>
          </DialogHeader>
          {pending && <PaymentShareActions reportId={pending.reportId} />}
        </DialogContent>
      </Dialog>

      <Dialog open={celebrate !== null} onOpenChange={(v) => !v && setCelebrate(null)}>
        <DialogContent className="text-center sm:max-w-md">
          <DialogHeader className="items-center">
            <CheckCircle2Icon className="size-14 text-success" aria-hidden />
            <DialogTitle className="text-2xl">¡Pago registrado!</DialogTitle>
            <DialogDescription>
              Confirmamos tu pago{celebrate ? ` de ${usd(celebrate.amountUsdCents)}` : ""} ({celebrate?.concept}). Tu suscripción quedó al día. ¡Gracias por confiar en KR POS!
            </DialogDescription>
          </DialogHeader>
          <Button onClick={() => setCelebrate(null)}>Genial</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={rejected !== null} onOpenChange={(v) => !v && setRejected(null)}>
        <DialogContent className="text-center sm:max-w-md">
          <DialogHeader className="items-center">
            <XCircleIcon className="size-12 text-destructive" aria-hidden />
            <DialogTitle>No pudimos confirmar tu pago</DialogTitle>
            <DialogDescription>
              Revisa la referencia y el comprobante y vuelve a reportarlo desde Mi plan, o escríbenos por WhatsApp.
            </DialogDescription>
          </DialogHeader>
          <Button onClick={() => setRejected(null)}>Entendido</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
