import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Selector de periodo (debajo del título, alineado a la izquierda) seguido de la etiqueta del
// periodo (.plab de la preview): píldora blanca de 40px, borde de 1,5px, calendario de marca y texto 13px/700.
// `end` va a la derecha (p. ej. «Agregar gasto»), `start` a la izquierda del selector.
export function PeriodBar({
  label,
  children,
  start,
  end,
  className,
}: {
  label?: string;
  children?: React.ReactNode;
  start?: React.ReactNode;
  end?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2.5", className)}>
      {start}
      {children}
      {label && (
        <span className="inline-flex min-h-10 max-w-full items-center gap-2 rounded-full border-[1.5px] border-border bg-card px-3.5 text-[13px] font-bold">
          <CalendarIcon className="size-4 flex-none text-primary" strokeWidth={2.2} aria-hidden />
          <span className="truncate">{label}</span>
        </span>
      )}
      {end && <div className="ml-auto flex flex-wrap items-center gap-2">{end}</div>}
    </div>
  );
}
