"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { StatusPill } from "@/components/shared/Pills";
import { FIELD_CONTROL } from "@/components/shared/Field";
import { STATE_LABELS, type CompanyState } from "@/lib/platform-logic";
import { formatDate, formatUSD } from "@/lib/format";
import type { ActionResult } from "@/lib/types";

export { formatDate, formatUSD };

// Ejecuta una acción de servidor con aviso y refresco; devuelve si está en curso.
export function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  function run(fn: () => Promise<ActionResult>, ok: string, after?: () => void) {
    start(async () => {
      const r = await fn();
      if (r.success) {
        toast.success(ok);
        router.refresh();
        after?.();
      } else toast.error(r.error);
    });
  }
  return { pending, run, start, router };
}

const STATE_TONE: Record<CompanyState, "ok" | "warn" | "bad" | "neutral"> = {
  active: "ok",
  exempt: "ok",
  expiring: "warn",
  pending: "warn",
  overdue: "bad",
  suspended: "bad",
};

export function StateBadge({ state }: { state: CompanyState }) {
  return <StatusPill tone={STATE_TONE[state]}>{STATE_LABELS[state]}</StatusPill>;
}

export function SelectControl({ label, value, onChange, options, className }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; className?: string }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={`${FIELD_CONTROL} ${className ?? ""}`}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function EmptyCard({ children }: { children: React.ReactNode }) {
  return <p className="rounded-[14px] bg-muted px-4 py-6 text-center text-[13px] text-muted-foreground">{children}</p>;
}

export function dayLabel(days: number | null): string {
  if (days == null) return "Sin fecha";
  if (days < 0) return `Venció hace ${-days} d`;
  if (days === 0) return "Vence hoy";
  return `Vence en ${days} d`;
}
