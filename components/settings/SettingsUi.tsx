"use client";

import { cn } from "@/lib/utils";

// Interruptor de la preview (.sw): 44×26, pista gris y verde al activarse, perilla blanca de 20px.
export function Switch({
  on,
  onChange,
  disabled,
  readOnly,
  label,
  className,
}: {
  on: boolean;
  onChange?: (next: boolean) => void;
  disabled?: boolean;
  // Estado fijo (no se puede cambiar): mismo botón, sin atenuarlo.
  readOnly?: boolean;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      aria-readonly={readOnly || undefined}
      onClick={() => !readOnly && onChange?.(!on)}
      className={cn("inline-flex flex-none items-center py-1 disabled:opacity-60", readOnly && "cursor-default", className)}
    >
      <i className={cn("relative block h-[26px] w-11 flex-none rounded-full transition-colors duration-150", on ? "bg-ok-solid" : "bg-track")}>
        <span className={cn("absolute left-[3px] top-[3px] size-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,.3)] transition-transform duration-150", on && "translate-x-[18px]")} />
      </i>
    </button>
  );
}

// Subtítulo de sección (.sub): 13px, mayúsculas, gris.
export function SubTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return <h3 className={cn("mb-1 text-[13px] font-bold uppercase tracking-[0.08em] text-muted-foreground", className)} {...props} />;
}
