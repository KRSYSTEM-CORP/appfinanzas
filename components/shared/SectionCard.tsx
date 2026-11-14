import { cn } from "@/lib/utils";

// Tarjeta de la preview (.card): radio 19, padding 16, sombra de tarjeta. Con título (16px/700),
// subtítulo (13px gris) y una acción a la derecha. `flush` quita el padding (tablas a todo el ancho).
export function SectionCard({
  title,
  subtitle,
  action,
  flush,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"section">, "title"> & {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  flush?: boolean;
}) {
  const header =
    title || action ? (
      <header className={cn("mb-3 flex flex-wrap items-start justify-between gap-2.5", flush && "mb-0 px-4 pb-2 pt-4")}>
        <div className="min-w-0">
          {title && <h3 className="text-base font-bold tracking-[-0.015em]">{title}</h3>}
          {subtitle && <p className="mt-0.5 text-[13px] text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </header>
    ) : null;
  return (
    <section
      data-kr="card"
      className={cn("relative min-w-0 rounded-[19px] bg-card shadow-(--shadow-card)", flush ? "overflow-hidden p-0" : "p-4", className)}
      {...props}
    >
      {header}
      {children}
    </section>
  );
}

// Dos columnas de la preview (.grid.g2): minmax(min(100%,330px),1fr) con 14px.
export function TwoCol({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,330px),1fr))] gap-3.5", className)}>{children}</div>;
}

// Fila de lista (.li): separador inferior, 10px arriba y abajo.
export function ListRow({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2.5 border-b py-2.5 last:border-0 [&>div]:min-w-0 [&_small]:block [&_small]:text-xs [&_small]:text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}

// Nota gris de 13px al pie de una tarjeta (.note).
export function Note({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("mt-2 text-[13px] text-muted-foreground", className)} {...props} />;
}
