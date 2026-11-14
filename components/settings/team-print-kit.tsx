"use client";

// Piezas de la preview (10-ajustes.html) que usan Equipo y Seguridad, Impresión y Datos:
// tarjeta con cabecera (.card + header), fila (.li), píldora de estado (.st), subtítulo (.sub),
// campo de hoja (.field) y cuadrícula de permisos (.pgrid / .pk).
import { cn } from "@/lib/utils";

export const TWO_COLS = "grid min-w-0 gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,330px),1fr))]";

export function SCard({
  title,
  description,
  extra,
  children,
  className,
}: {
  title: string;
  description?: string;
  extra?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section data-kr="card" aria-label={title} className={cn("relative min-w-0 rounded-[19px] bg-card p-4 shadow-(--shadow-card)", className)}>
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2.5">
        <div>
          <h3 className="text-base font-bold">{title}</h3>
          {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
        </div>
        {extra}
      </header>
      {children}
    </section>
  );
}

// Fila de lista: texto a la izquierda (negrita + línea pequeña) y acción a la derecha.
export function ListRow({ title, sub, children, className }: { title: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-2.5 border-b border-border py-2.5 last:border-0", className)}>
      <div className="min-w-0">
        <b className="font-bold">{title}</b>
        {sub && <small className="block text-xs text-muted-foreground">{sub}</small>}
      </div>
      {children}
    </div>
  );
}

export function StatusPill({ tone = "ok", children }: { tone?: "ok" | "warn" | "bad"; children: React.ReactNode }) {
  const toneCls = tone === "ok" ? "bg-success/14 text-success" : tone === "warn" ? "bg-warning/18 text-warning" : "bg-destructive/12 text-destructive";
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-[3px] text-xs font-bold", toneCls)}>
      <i className="size-[7px] rounded-full bg-current" aria-hidden />
      {children}
    </span>
  );
}

export function SubTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h3 className={cn("mb-1 text-[13px] font-bold uppercase tracking-[0.08em] text-muted-foreground", className)}>{children}</h3>;
}

const FIELD_CONTROL =
  "min-h-11 w-full rounded-xl border border-border bg-background px-3 text-[13px] font-semibold text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50";

export function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children?: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mt-3 flex flex-col gap-1 text-[13px] font-semibold">
      {label}
      {children}
    </label>
  );
}

export function FieldInput(props: React.ComponentProps<"input">) {
  return <input {...props} className={cn(FIELD_CONTROL, props.className)} />;
}

export function FieldSelect(props: React.ComponentProps<"select">) {
  return <select {...props} className={cn(FIELD_CONTROL, props.className)} />;
}

export function FieldTextarea(props: React.ComponentProps<"textarea">) {
  return <textarea {...props} className={cn(FIELD_CONTROL, "min-h-11 resize-y py-2.5", props.className)} />;
}

// Cuadrícula de permisos: casillas de 22 px dentro de cuadros grises de radio 12.
export function PermGrid({
  items,
  selected,
  onToggle,
  disabled,
  label = "Qué puede hacer",
}: {
  items: readonly { id: string; label: string }[];
  selected: readonly string[];
  onToggle?: (id: string) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div role="group" aria-label={label} className="mt-1.5 grid gap-1.5 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
      {items.map((p) => (
        <label key={p.id} className={cn("flex min-h-11 items-center gap-2.5 rounded-xl bg-muted px-2.5 py-2 text-[13.5px] font-semibold", disabled ? "cursor-default" : "cursor-pointer")}>
          <input
            type="checkbox"
            checked={selected.includes(p.id)}
            disabled={disabled}
            onChange={() => onToggle?.(p.id)}
            className="size-[22px] shrink-0 accent-[var(--primary)]"
          />
          <span>{p.label}</span>
        </label>
      ))}
    </div>
  );
}

// Nombre propio de una persona para mostrar: «Nombre Apellido» o el usuario del correo.
export function displayName(p: { firstName: string | null; lastName: string | null; email: string }): string {
  return p.firstName && p.lastName ? `${p.firstName} ${p.lastName}` : p.firstName ?? p.email.split("@")[0];
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
