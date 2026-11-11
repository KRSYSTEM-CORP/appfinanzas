"use client";

import { cn } from "@/lib/utils";

// Fila de tarjetas de grupo (Administración): la activa en color de marca con texto blanco.
export function GroupTabs<T extends string>({
  value,
  onChange,
  groups,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  groups: { value: T; label: string; icon?: React.ReactNode }[];
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(${groups.length}, minmax(0, 1fr))` }}>
      {groups.map((g) => (
        <button
          key={g.value}
          type="button"
          role="tab"
          aria-selected={value === g.value}
          onClick={() => onChange(g.value)}
          className={cn(
            "flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-[19px] p-3 text-center text-[13px] font-bold shadow-(--shadow-card) transition-colors",
            value === g.value ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted"
          )}
        >
          {g.icon}
          {g.label}
        </button>
      ))}
    </div>
  );
}
