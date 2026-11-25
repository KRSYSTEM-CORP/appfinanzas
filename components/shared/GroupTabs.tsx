import Link from "@/components/ui/nav-link";
import { cn } from "@/lib/utils";

// Fila de tarjetas de grupo de la preview (.groups / .gp): icono de marca 22px, título 16px/700 y
// descripción 12px; la activa en color de marca con texto blanco. Cada tarjeta es un enlace.
export function GroupTabs<T extends string>({
  value,
  groups,
  label,
  compactOnMobile = false,
}: {
  value: T;
  groups: { value: T; label: string; hint?: string; icon?: React.ReactNode; href: string }[];
  label: string;
  // En móvil oculta la descripción para que las tarjetas no tapen el contenido.
  compactOnMobile?: boolean;
}) {
  return (
    <nav aria-label={label} className={cn("grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5", compactOnMobile && "max-md:grid-cols-3 max-md:gap-2")}>
      {groups.map((g) => {
        const active = value === g.value;
        return (
          <Link
            key={g.value}
            href={g.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              compactOnMobile && "max-md:items-center max-md:p-2.5 max-md:text-center",
              "flex flex-col gap-1 rounded-[19px] border-2 border-transparent p-3.5 text-left shadow-(--shadow-card) transition-[transform,background-color,color] duration-150 active:scale-[0.97]",
              "[&_svg]:size-[22px]",
              active ? "bg-primary text-primary-foreground [&_svg]:text-primary-foreground [&_svg]:opacity-90" : "bg-card [&_svg]:text-primary"
            )}
          >
            {g.icon}
            <b className={cn("text-base tracking-[-0.02em]", compactOnMobile && "max-md:text-[13px]")}>{g.label}</b>
            {g.hint && <small className={cn("text-xs leading-[1.3]", compactOnMobile && "max-md:hidden", active ? "text-primary-foreground opacity-90" : "text-muted-foreground")}>{g.hint}</small>}
          </Link>
        );
      })}
    </nav>
  );
}

// Chips de sub-pestaña (.chips/.chip) como enlaces: rectángulo radio 12, 38px; el activo con borde de marca.
export function SubTabs({ items, active, label }: { items: { id: string; label: string; href: string }[]; active: string; label: string }) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-2">
      {items.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          data-kr="chip"
          aria-current={t.id === active ? "page" : undefined}
          className={cn(
            "inline-flex min-h-[38px] items-center whitespace-nowrap rounded-[12px] border-2 px-3.5 text-[13px] font-bold transition-colors duration-150",
            t.id === active ? "border-primary bg-accent text-primary" : "border-transparent bg-muted text-foreground"
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
