"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Button } from "@/components/ui/button";
import { dateRangeSelectionToQuery, isValidRange, type DateRangeSelection } from "@/lib/report-types";

const PRESETS: { key: "today" | "7d" | "month"; label: string }[] = [
  { key: "today", label: "Hoy" },
  { key: "7d", label: "7 días" },
  { key: "month", label: "Mes" },
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
  const [rangeOpen, setRangeOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(selection.kind === "range" ? selection.from : "");
  const [draftTo, setDraftTo] = useState(selection.kind === "range" ? selection.to : "");
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

  const rangeOk = isValidRange(draftFrom, draftTo);
  function applyRange() {
    if (!rangeOk) return;
    apply({ kind: "range", from: draftFrom, to: draftTo });
    setRangeOpen(false);
  }

  return (
    <div className="inline-flex flex-wrap gap-0.5 rounded-full bg-muted p-[3px] w-fit max-w-full">
      {PRESETS.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={() => apply({ kind: "preset", preset: p.key })}
          className={`min-h-[34px] rounded-full px-3.5 text-[13px] font-bold whitespace-nowrap transition-colors ${
            selection.kind === "preset" && selection.preset === p.key
              ? "bg-card text-foreground shadow-[0_1px_3px_rgba(0,0,0,.15)]"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {p.label}
        </button>
      ))}

      <PopoverPrimitive.Root open={monthsOpen} onOpenChange={setMonthsOpen}>
        <PopoverPrimitive.Trigger
          className={`min-h-[34px] rounded-full px-3.5 text-[13px] font-bold whitespace-nowrap transition-colors ${
            selection.kind === "months"
              ? "bg-card text-foreground shadow-[0_1px_3px_rgba(0,0,0,.15)]"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Meses{selection.kind === "months" ? ` (${selection.months.length})` : ""}
        </PopoverPrimitive.Trigger>
        {/* Portaled out of the trigger's ancestry — Card has overflow-hidden
            (for its own rounded corners), which was silently clipping this
            popover's bottom, hiding the Cancelar/Aplicar row, before this
            switched from a hand-rolled absolute div to a real Popover. */}
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Positioner side="bottom" sideOffset={4} align="end" className="z-50">
            <PopoverPrimitive.Popup className="w-72 rounded-lg bg-popover text-popover-foreground p-3 shadow-md ring-1 ring-foreground/10 flex flex-col gap-3">
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
            </PopoverPrimitive.Popup>
          </PopoverPrimitive.Positioner>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>

      <PopoverPrimitive.Root open={rangeOpen} onOpenChange={setRangeOpen}>
        <PopoverPrimitive.Trigger
          className={`min-h-[34px] rounded-full px-3.5 text-[13px] font-bold whitespace-nowrap transition-colors ${
            selection.kind === "range" ? "bg-card text-foreground shadow-[0_1px_3px_rgba(0,0,0,.15)]" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Rango
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Positioner side="bottom" sideOffset={4} align="end" className="z-50">
            <PopoverPrimitive.Popup className="w-72 rounded-lg bg-popover text-popover-foreground p-3 shadow-md ring-1 ring-foreground/10 flex flex-col gap-3">
              <span className="text-sm font-medium">Elige desde y hasta</span>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Desde
                <input
                  type="date"
                  value={draftFrom}
                  max={draftTo || undefined}
                  onChange={(e) => setDraftFrom(e.target.value)}
                  className="rounded-md border bg-background px-2 py-1.5 text-sm text-foreground"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Hasta
                <input
                  type="date"
                  value={draftTo}
                  min={draftFrom || undefined}
                  onChange={(e) => setDraftTo(e.target.value)}
                  className="rounded-md border bg-background px-2 py-1.5 text-sm text-foreground"
                />
              </label>
              {draftFrom && draftTo && !rangeOk && (
                <p role="alert" className="text-xs text-destructive">
                  El rango debe ir de menor a mayor y durar como máximo un año.
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setRangeOpen(false)}>
                  Cancelar
                </Button>
                <Button type="button" size="sm" disabled={!rangeOk} onClick={applyRange}>
                  Aplicar
                </Button>
              </div>
            </PopoverPrimitive.Popup>
          </PopoverPrimitive.Positioner>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </div>
  );
}
