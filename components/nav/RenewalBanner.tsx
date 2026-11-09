"use client";

import { useState } from "react";
import Link from "next/link";
import { BellRingIcon, XIcon } from "lucide-react";

const KEY = "kr-pos-renewal-dismissed";

// Aviso flotante de renovación. Se puede cerrar, pero vuelve al día siguiente
// (la clave guarda el número de días que faltaban cuando se cerró).
export function RenewalBanner({ days, text }: { days: number; text: string }) {
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem(KEY) === String(days);
    } catch {
      return false;
    }
  });
  if (hidden) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md items-center gap-3 rounded-xl border bg-card p-3 text-sm shadow-lg md:bottom-4 md:left-auto md:right-4 md:mx-0"
    >
      <BellRingIcon className="size-5 shrink-0 text-warning" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{text}</p>
        <Link href="/billing" className="text-primary underline-offset-2 hover:underline">
          Ir a Suscripción mensual
        </Link>
      </div>
      <button
        type="button"
        aria-label="Cerrar aviso"
        className="rounded-md p-1 text-muted-foreground hover:bg-muted"
        onClick={() => {
          try {
            sessionStorage.setItem(KEY, String(days));
          } catch {
            // Sin almacenamiento: se oculta solo en esta visita.
          }
          setHidden(true);
        }}
      >
        <XIcon className="size-4" />
      </button>
    </div>
  );
}
