"use client";

import { useState } from "react";
import { ChevronRightIcon, ClockIcon } from "lucide-react";

// «Días pendientes por cerrar» como en la preview: fila colapsable con contador y flecha.
export function PendingClosingsRow({ count, children }: { count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-[20px] bg-card p-1.5 shadow-(--shadow-card)">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-[52px] w-full items-center gap-3 rounded-[14px] px-2.5 py-2 text-left"
      >
        <span className="grid size-[34px] shrink-0 place-items-center rounded-[11px] bg-warning/15 text-warning">
          <ClockIcon className="size-[18px]" aria-hidden />
        </span>
        <b className="min-w-0 flex-1 text-[15px]">Días pendientes por cerrar</b>
        <span
          className={`grid h-7 min-w-7 place-items-center rounded-full px-2 text-sm font-extrabold ${
            count > 0 ? "bg-warning/18 text-warning" : "bg-success/14 text-success"
          }`}
        >
          {count}
        </span>
        <ChevronRightIcon className={`size-[18px] shrink-0 transition-transform duration-200 ${open ? "rotate-90" : ""}`} aria-hidden />
      </button>
      {open && <div className="px-3 pb-3 pt-1">{children}</div>}
    </section>
  );
}
