import { cn } from "@/lib/utils";

// Cuadro redondeado con fondo suave para el icono de mosaicos, listas y avatares (radio 14px, 44px).
export function IconTile({
  className,
  size = 44,
  children,
  ...props
}: React.ComponentProps<"span"> & { size?: number }) {
  return (
    <span
      data-kr="icon-tile"
      style={{ width: size, height: size }}
      className={cn("grid shrink-0 place-items-center rounded-[14px] bg-primary/12 text-primary", className)}
      {...props}
    >
      {children}
    </span>
  );
}
