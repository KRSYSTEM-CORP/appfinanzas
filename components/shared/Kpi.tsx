import { cn } from "@/lib/utils";

export type Tone = "info" | "ok" | "warn" | "bad";

// Fondo suave de cada estado (info-bg, ok-bg, warn-bg, bad-bg de la preview).
export const TONE_BG: Record<Tone, string> = {
  info: "bg-accent",
  ok: "bg-ok-solid/14",
  warn: "bg-warn-solid/18",
  bad: "bg-bad-solid/12",
};
// Texto de cada estado.
export const TONE_TEXT: Record<Tone, string> = {
  info: "text-primary",
  ok: "text-success",
  warn: "text-warning",
  bad: "text-destructive",
};

// Tarjeta KPI de la preview (.kpi): etiqueta en mayúsculas, número 30px, pista y círculo de icono arriba a la derecha.
export function Kpi({
  label,
  value,
  hint,
  icon,
  tone = "info",
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <div
      data-kr="kpi"
      className={cn(
        "relative flex min-h-[128px] min-w-0 flex-col gap-1.5 rounded-[19px] border-2 border-transparent bg-card p-[17px] text-left shadow-(--shadow-card) transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-(--shadow-float)",
        className
      )}
    >
      <span data-kr="kpi-lbl" className="pr-11 text-xs font-semibold uppercase text-muted-foreground">
        {label}
      </span>
      {icon && (
        <span
          aria-hidden
          className={cn("absolute right-3.5 top-3.5 grid size-[34px] place-items-center rounded-full [&_svg]:size-[18px]", TONE_BG[tone], TONE_TEXT[tone])}
        >
          {icon}
        </span>
      )}
      <span data-kr="kpi-num" className="text-[30px] font-bold leading-[1.1] tracking-[-0.03em] tabular-nums text-foreground">
        {value}
      </span>
      {hint && <span className="text-[13px] text-muted-foreground">{hint}</span>}
    </div>
  );
}

// Fila de KPI: repeat(auto-fit, minmax(min(100%,180px),1fr)) con 12px.
export function KpiGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-[repeat(auto-fit,minmax(min(100%,180px),1fr))] gap-3", className)}>{children}</div>;
}
