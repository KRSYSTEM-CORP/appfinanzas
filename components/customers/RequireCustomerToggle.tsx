"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setRequireCustomerOnSale } from "@/lib/actions/marketing";
import { cn } from "@/lib/utils";

// Interruptor «Exigir nombre y teléfono en cada venta» (.sw de la preview: 44×26, verde al activarse).
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
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={!canChange || pending}
      onClick={toggle}
      title={canChange ? undefined : "Solo el gerente puede cambiar esta regla"}
      className="inline-flex items-center gap-2.5 py-1 text-left text-[13px] font-semibold disabled:opacity-60"
    >
      <i className={cn("relative h-[26px] w-11 flex-none rounded-full transition-colors duration-150", on ? "bg-ok-solid" : "bg-track")}>
        <span className={cn("absolute left-[3px] top-[3px] size-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,.3)] transition-transform duration-150", on && "translate-x-[18px]")} />
      </i>
      Exigir nombre y teléfono en cada venta
    </button>
  );
}
