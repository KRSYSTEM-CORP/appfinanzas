"use client";

import { useEffect, useState } from "react";
import { LOCK_AFTER_MS, LOCK_MINUTE_OPTIONS, LOCK_MINUTES_KEY, readLockMinutes } from "@/lib/lock";

// Cuánto tarda en bloquearse la pantalla sin actividad en este equipo (5, 10 o 15 min).
export function IdleTimeoutSetting() {
  const [minutes, setMinutes] = useState<number>(LOCK_AFTER_MS.VENDEDOR / 60_000);
  useEffect(() => {
    setMinutes(readLockMinutes() ?? LOCK_AFTER_MS.VENDEDOR / 60_000);
  }, []);

  function choose(m: number) {
    setMinutes(m);
    try {
      window.localStorage.setItem(LOCK_MINUTES_KEY, String(m));
    } catch {
      // Sin almacenamiento, el tiempo vuelve al predeterminado.
    }
    window.dispatchEvent(new Event("kr-lock-minutes"));
  }

  return (
    <div className="rounded-[19px] bg-card p-4 shadow-(--shadow-card)">
      <p className="font-semibold">Bloqueo por inactividad</p>
      <p className="text-sm text-muted-foreground">Se aplica a este equipo: la pantalla se bloquea tras este tiempo sin actividad.</p>
      <div role="radiogroup" aria-label="Minutos de inactividad" className="mt-3 flex gap-2">
        {LOCK_MINUTE_OPTIONS.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={minutes === m}
            onClick={() => choose(m)}
            className={`min-h-11 flex-1 rounded-xl border-2 text-sm font-bold transition-colors ${
              minutes === m ? "border-primary bg-primary/12 text-primary" : "border-transparent bg-muted hover:bg-muted/70"
            }`}
          >
            {m} min
          </button>
        ))}
      </div>
    </div>
  );
}
