"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { dateRangeSelectionToQuery, type DateRangeSelection } from "@/lib/report-types";

const PRESETS: { key: "today" | "7d" | "month"; label: string }[] = [
  { key: "today", label: "Hoy" },
  { key: "7d", label: "7 días" },
  { key: "month", label: "Este mes" },
];

const MONTH_LABELS = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

// Shared by every page that used to hand-roll its own day/7d/30d/month
// button row (Finanzas, Ventas por vendedor, Libro de Contabilidad,
// Documentos, Reportes). Defaults to driving the URL (?range=... etc.) so a
// server-rendered page can just read searchParams — pass `onChange` to
// instead keep the selection in local client state (see DocumentsTable,
// which filters client-side rather than via the URL).
export function DateRangeSwitcher({
  selection,
  extraParams,
  onChange,
}: {
  selection: DateRangeSelection;
  extraParams?: Record<string, string>;
  onChange?: (selection: DateRangeSelection) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [monthsOpen, setMonthsOpen] = useState(false);
  const currentYear = new Date().getFullYear();
  const [draftYear, setDraftYear] = useState(selection.kind === "months" ? selection.year : currentYear);
  const [draftMonths, setDraftMonths] = useState<Set<number>>(
    new Set(selection.kind === "months" ? selection.months : [])
  );

  function apply(next: DateRangeSelection) {
    if (onChange) {
      onChange(next);
      return;
    }
    const query = new URLSearchParams({ ...extraParams, ...dateRangeSelectionToQuery(next) });
    router.push(`${pathname}?${query.toString()}`);
  }

  function toggleMonth(m: number) {
    setDraftMonths((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  }

  function applyMonths() {
    if (draftMonths.size === 0) return;
    apply({ kind: "months", year: draftYear, months: [...draftMonths].sort((a, b) => a - b) });
    setMonthsOpen(false);
  }

  return (
    <div className="relative flex items-center gap-1 flex-wrap">
      {PRESETS.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={() => apply({ kind: "preset", preset: p.key })}
          className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
            selection.kind === "preset" && selection.preset === p.key
              ? "bg-primary text-primary-foreground border-primary"
              : "border-input hover:bg-accent"
          }`}
        >
          {p.label}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setMonthsOpen((v) => !v)}
        className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
          selection.kind === "months"
            ? "bg-primary text-primary-foreground border-primary"
            : "border-input hover:bg-accent"
        }`}
      >
        Meses{selection.kind === "months" ? ` (${selection.months.length})` : ""}
      </button>

      {monthsOpen && (
        <div className="absolute top-full right-0 mt-2 z-20 w-72 rounded-lg border bg-card p-3 shadow-lg flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Elige año y meses</span>
            <select
              value={draftYear}
              onChange={(e) => setDraftYear(Number(e.target.value))}
              className="rounded-md border bg-background px-2 py-1 text-sm"
            >
              {Array.from({ length: 6 }, (_, i) => currentYear - i).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {MONTH_LABELS.map((label, i) => {
              const m = i + 1;
              const active = draftMonths.has(m);
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => toggleMonth(m)}
                  className={`rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                    active ? "bg-primary text-primary-foreground border-primary" : "border-input hover:bg-accent"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setMonthsOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" size="sm" disabled={draftMonths.size === 0} onClick={applyMonths}>
              Aplicar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
