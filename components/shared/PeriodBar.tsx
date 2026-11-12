import { CalendarIcon } from "lucide-react";

// Selector de periodo (debajo del título, alineado a la izquierda) seguido de la etiqueta
// del periodo: chip blanco con borde, icono de calendario y texto en negrita.
export function PeriodBar({ label, children }: { label?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {children}
      {label && (
        <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-[3px] text-xs font-bold">
          <CalendarIcon className="size-3.5" aria-hidden /> {label}
        </span>
      )}
    </div>
  );
}
