"use client";

import { cn } from "@/lib/utils";

// Segmentado (Asistente · Créditos · Historial, etc.): el activo con fondo de tarjeta y sombra.
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("inline-flex gap-0.5 rounded-full bg-muted p-[3px]", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          data-kr="seg-btn"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "min-h-[34px] shrink-0 whitespace-nowrap rounded-full px-3.5 text-[13px] font-bold transition-colors",
            value === o.value ? "bg-card shadow-[0_1px_3px_rgba(0,0,0,.15)]" : "text-muted-foreground"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
