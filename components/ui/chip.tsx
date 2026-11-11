import { cn } from "@/lib/utils";

// Chip de filtro: rectángulo de radio 12px y 38px de alto; borde de 2px en color de marca cuando está activo.
export function Chip({
  active,
  className,
  ...props
}: React.ComponentProps<"button"> & { active?: boolean }) {
  return (
    <button
      type="button"
      data-kr="chip"
      aria-pressed={active}
      className={cn(
        "inline-flex min-h-[38px] items-center gap-1.5 rounded-[12px] border-2 px-3.5 text-[13px] font-bold transition-colors duration-150 active:scale-[0.97]",
        active ? "border-primary bg-primary/12 text-primary" : "border-transparent bg-muted text-foreground hover:bg-muted/70",
        className
      )}
      {...props}
    />
  );
}
