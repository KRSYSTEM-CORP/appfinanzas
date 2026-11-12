"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setRequireCustomerOnSale } from "@/lib/actions/marketing";

// Interruptor «Exigir nombre y teléfono en cada venta».
export function RequireCustomerToggle({ initial, canChange }: { initial: boolean; canChange: boolean }) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();

  function toggle() {
    const next = !on;
    setOn(next);
    start(async () => {
      const r = await setRequireCustomerOnSale(next);
      if (!r.success) {
        setOn(!next);
        toast.error(r.error);
      } else toast.success(next ? "Ahora cada venta pide nombre y teléfono." : "Ya se puede vender como Cliente general.");
    });
  }

  return (
    <div className="flex items-center gap-3 rounded-[19px] bg-card p-4 shadow-(--shadow-card)">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">Exigir nombre y teléfono en cada venta</p>
        <p className="text-xs text-muted-foreground">Así construyes tu lista de clientes sin esfuerzo. Con esto activo no se puede vender como «Cliente general».</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Exigir nombre y teléfono en cada venta"
        disabled={!canChange || pending}
        onClick={toggle}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${on ? "bg-primary" : "bg-muted"}`}
      >
        <span className={`absolute top-0.5 size-6 rounded-full bg-white shadow transition-[left] ${on ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}
