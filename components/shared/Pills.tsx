import { cn } from "@/lib/utils";

type PillTone = "neutral" | "val" | "ok" | "warn" | "bad";

const PILL: Record<PillTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  val: "bg-accent text-primary",
  ok: "bg-ok-solid/14 text-success",
  warn: "bg-warn-solid/18 text-warning",
  bad: "bg-bad-solid/12 text-destructive",
};

// Pill de la preview (.pill): 12px/600, padding 3px 10px, totalmente redonda.
export function Pill({ tone = "neutral", className, ...props }: React.ComponentProps<"span"> & { tone?: PillTone }) {
  return (
    <span
      data-kr="pill"
      className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-[3px] text-xs font-semibold", PILL[tone], className)}
      {...props}
    />
  );
}

// Estado con punto (.st): 12px/700 con un punto de 7px del color del texto.
export function StatusPill({ tone, className, children }: { tone: "ok" | "warn" | "bad" | "neutral"; className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-[3px] text-xs font-bold before:size-[7px] before:rounded-full before:bg-current before:content-['']",
        PILL[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

// Barra de avance (.meter): 8px, pista gris.
export function Meter({ pct, tone = "brand", className }: { pct: number; tone?: "brand" | "ok" | "warn" | "bad"; className?: string }) {
  const fill = { brand: "bg-primary", ok: "bg-ok-solid", warn: "bg-warn-solid", bad: "bg-bad-solid" }[tone];
  return (
    <div className={cn("h-2 min-w-[60px] overflow-hidden rounded-full bg-track", className)}>
      <span className={cn("block h-full rounded-full transition-[width] duration-300", fill)} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}
