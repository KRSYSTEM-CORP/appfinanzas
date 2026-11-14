"use client";

import { PlusIcon } from "lucide-react";

// "+ Recargar créditos" bajo el título: abre la pestaña Créditos del asistente.
export function RechargeButton() {
  return (
    <button
      type="button"
      onClick={() => {
        window.dispatchEvent(new CustomEvent("assistant-tab", { detail: "credits" }));
        document.getElementById("recargar")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }}
      className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-muted px-3.5 text-[13px] font-semibold text-primary transition-transform active:scale-[0.97]"
    >
      <PlusIcon className="size-4" aria-hidden /> Recargar créditos
    </button>
  );
}
