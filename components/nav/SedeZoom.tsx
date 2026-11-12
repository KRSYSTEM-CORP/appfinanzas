"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export const SEDE_SWITCH_EVENT = "kr-sede-switch";
const SEDE_COLORS = ["var(--sede-1)", "var(--sede-2)", "var(--sede-3)", "var(--sede-4)"];

// Animación de cambio de sede: pantalla completa del color de la sede nueva con
// «Sede anterior → Sede nueva · Entrando a la sede…» (1,8 s). A mitad de la animación
// se vuelve a Inicio y el chip «Sede activa» parpadea.
export function SedeZoom({ currentName, branches }: { currentName: string | null; branches: { id: string; name: string }[] }) {
  const router = useRouter();
  const [state, setState] = useState<{ from: string; to: string; color: string } | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const fromRef = useRef(currentName);

  useEffect(() => {
    function onSwitch(e: Event) {
      const { toId, toName } = (e as CustomEvent<{ toId: string | null; toName: string }>).detail;
      const idx = Math.max(0, branches.findIndex((b) => b.id === toId));
      const from = fromRef.current ?? "Todas las sucursales";
      fromRef.current = toName;
      setState({ from, to: toName, color: SEDE_COLORS[idx % SEDE_COLORS.length] });
      timers.current.forEach(clearTimeout);
      timers.current = [
        setTimeout(() => {
          router.replace("/home");
          router.refresh();
          const chip = document.querySelector<HTMLElement>("[data-kr=side-sede]");
          chip?.classList.remove("kr-pulse");
          void chip?.offsetWidth;
          chip?.classList.add("kr-pulse");
        }, 900),
        setTimeout(() => setState(null), 1800),
      ];
    }
    window.addEventListener(SEDE_SWITCH_EVENT, onSwitch);
    return () => {
      window.removeEventListener(SEDE_SWITCH_EVENT, onSwitch);
      timers.current.forEach(clearTimeout);
    };
  }, [branches, router]);

  useEffect(() => {
    fromRef.current = currentName;
  }, [currentName]);

  if (!state) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="kr-sede-zoom fixed inset-0 z-[100] grid place-items-center p-6 text-center text-white"
      style={{ background: state.color }}
    >
      <div className="flex flex-col items-center gap-2">
        <p className="text-sm font-semibold opacity-80">{state.from} →</p>
        <p className="text-[34px] font-extrabold tracking-[-0.03em]">{state.to}</p>
        <p className="text-sm font-semibold opacity-90">Entrando a la sede…</p>
      </div>
    </div>
  );
}
