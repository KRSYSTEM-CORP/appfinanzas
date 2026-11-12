"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LockIcon } from "lucide-react";
import { lockSession } from "@/lib/actions/pin";
import { lockState, lockTimeoutFor } from "@/lib/lock";

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;

// Bloquea la pantalla tras un rato sin actividad (según el rol) y avisa 15 s antes.
// Solo se monta para quien ya tiene PIN.
export function IdleLock({ role, minutes }: { role: "GERENTE" | "VENDEDOR"; minutes?: number | null }) {
  const router = useRouter();
  const timeout = minutes ? minutes * 60_000 : lockTimeoutFor(role);
  const last = useRef(0);
  const locking = useRef(false);
  const [warning, setWarning] = useState<number | null>(null);

  useEffect(() => {
    last.current = Date.now();
    const bump = () => {
      // Durante el aviso, un toque cuenta como «sigo aquí»; el reloj se reinicia.
      last.current = Date.now();
    };
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, bump, { passive: true }));

    const tick = setInterval(async () => {
      const s = lockState(last.current, Date.now(), timeout);
      if (s.phase === "warning") setWarning(s.secondsLeft);
      else setWarning(null);
      if (s.phase === "locked" && !locking.current) {
        locking.current = true;
        const r = await lockSession();
        if (r.success) router.replace("/lock");
        else locking.current = false;
      }
    }, 1000);

    return () => {
      clearInterval(tick);
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, bump));
    };
  }, [timeout, router]);

  if (warning == null) return null;
  return (
    <div
      role="alert"
      className="fixed inset-x-3 top-3 z-50 mx-auto flex max-w-sm items-center gap-3 rounded-[19px] border bg-card p-3 text-sm shadow-(--shadow-float)"
    >
      <LockIcon className="size-5 shrink-0 text-warning" aria-hidden />
      <p className="min-w-0 flex-1">
        Se bloqueará en <b className="tabular-nums">{warning}</b> s
      </p>
      <button type="button" className="min-h-9 rounded-full bg-primary px-3.5 text-[13px] font-bold text-primary-foreground">
        Seguir aquí
      </button>
    </div>
  );
}
