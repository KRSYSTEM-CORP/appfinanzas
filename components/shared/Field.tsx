import { cn } from "@/lib/utils";

// Campo de formulario de las hojas de la preview (.field): etiqueta 13px/600 y control de 44px,
// radio 12, borde de línea y fondo de página.
export const FIELD_CONTROL =
  "min-h-11 w-full rounded-[12px] border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50";

export function Field({ label, className, children }: { label: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn("mt-3 flex flex-col gap-1 text-[13px] font-semibold", className)}>
      {label}
      {children}
    </label>
  );
}

// Dos campos lado a lado (.f2).
export function FieldPair({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2.5">{children}</div>;
}
