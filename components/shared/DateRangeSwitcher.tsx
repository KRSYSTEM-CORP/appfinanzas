"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MONTHS_SHORTCUTS, RANGE_SHORTCUTS, daysInMonth, monthsForShortcut, rangeForShortcut, weekdayMon0, ymd } from "@/lib/period-shortcuts";
import { dateRangeSelectionToQuery, isValidRange, todayDateString, type DateRangeSelection } from "@/lib/report-types";

const PRESETS: { key: "today" | "7d" | "month"; label: string }[] = [
  { key: "today", label: "Hoy" },
  { key: "7d", label: "7 días" },
  { key: "month", label: "Mes" },
];

const MONTH_NAMES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

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
  const today = todayDateString();
  const currentYear = Number(today.slice(0, 4));
  const currentMonth = Number(today.slice(5, 7));
  const [calYear, setCalYear] = useState(Number((selection.kind === "range" ? selection.to : today).slice(0, 4)));
  const [calMonth, setCalMonth] = useState(Number((selection.kind === "range" ? selection.to : today).slice(5, 7)));
  function shiftMonth(delta: number) {
    const idx = calYear * 12 + (calMonth - 1) + delta;
    setCalYear(Math.floor(idx / 12));
    setCalMonth((idx % 12) + 1);
  }
  // Primer toque = día inicial; segundo = final (si es anterior, pasa a ser el inicial).
  function pickDay(d: string) {
    if (!draftFrom || (draftFrom && draftTo && draftTo !== draftFrom)) {
      setDraftFrom(d);
      setDraftTo(d);
    } else if (d < draftFrom) {
      setDraftFrom(d);
      setDraftTo(draftFrom);
    } else {
      setDraftTo(d);
    }
  }
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

      <button
        type="button"
        onClick={() => setMonthsOpen(true)}
        className={`min-h-[34px] rounded-full px-3.5 text-[13px] font-bold whitespace-nowrap transition-colors ${
          selection.kind === "months" ? "bg-card text-foreground shadow-[0_1px_3px_rgba(0,0,0,.15)]" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Meses{selection.kind === "months" ? ` (${selection.months.length})` : ""}
      </button>
      <button
        type="button"
        onClick={() => setRangeOpen(true)}
        className={`min-h-[34px] rounded-full px-3.5 text-[13px] font-bold whitespace-nowrap transition-colors ${
          selection.kind === "range" ? "bg-card text-foreground shadow-[0_1px_3px_rgba(0,0,0,.15)]" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Rango
      </button>

      <Dialog open={monthsOpen} onOpenChange={setMonthsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Elige los meses</DialogTitle>
            <DialogDescription>Suma varios meses del año; los que aún no llegan salen deshabilitados.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            {MONTHS_SHORTCUTS.map((sc) => (
              <Chip
                key={sc.key}
                onClick={() => {
                  setDraftYear(currentYear);
                  setDraftMonths(new Set(monthsForShortcut(sc.key, currentMonth)));
                }}
              >
                {sc.label}
              </Chip>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Año</span>
            <select value={draftYear} onChange={(e) => setDraftYear(Number(e.target.value))} className="h-10 rounded-[12px] border-[1.5px] bg-background px-3 text-sm">
              {Array.from({ length: 6 }, (_, i) => currentYear - i).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
            {MONTH_LABELS.map((label, i) => {
              const m = i + 1;
              const future = draftYear === currentYear && m > currentMonth;
              const active = draftMonths.has(m);
              return (
                <button
                  key={m}
                  type="button"
                  disabled={future}
                  onClick={() => toggleMonth(m)}
                  className={`flex min-h-12 flex-col items-center justify-center rounded-[12px] border-2 text-[13px] font-bold transition-colors disabled:opacity-45 ${
                    active ? "border-primary bg-primary/12 text-primary" : "border-transparent bg-muted"
                  }`}
                >
                  {label}
                  {future && <small className="text-[10px] font-semibold text-muted-foreground">Aún no</small>}
                  {draftYear === currentYear && m === currentMonth && <small className="text-[10px] font-semibold text-muted-foreground">En curso</small>}
                </button>
              );
            })}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setMonthsOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={draftMonths.size === 0} onClick={applyMonths}>
              Aplicar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={rangeOpen} onOpenChange={setRangeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Elige el rango</DialogTitle>
            <DialogDescription>Toca el día inicial y luego el final, o aplica un solo día.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            {RANGE_SHORTCUTS.map((sc) => (
              <Chip
                key={sc.key}
                onClick={() => {
                  const r = rangeForShortcut(sc.key, today);
                  setDraftFrom(r.from);
                  setDraftTo(r.to);
                  const [yy, mm] = r.to.split("-").map(Number);
                  setCalYear(yy);
                  setCalMonth(mm);
                }}
              >
                {sc.label}
              </Chip>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <button type="button" aria-label="Mes anterior" onClick={() => shiftMonth(-1)} className="grid size-9 place-items-center rounded-full bg-muted">
              <ChevronLeftIcon className="size-4" />
            </button>
            <b className="text-sm capitalize">
              {MONTH_NAMES[calMonth - 1]} {calYear}
            </b>
            <button type="button" aria-label="Mes siguiente" onClick={() => shiftMonth(1)} className="grid size-9 place-items-center rounded-full bg-muted">
              <ChevronRightIcon className="size-4" />
            </button>
          </div>
          <div className="grid gap-1 text-center text-xs font-bold text-muted-foreground" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
            {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
          <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
            {Array.from({ length: weekdayMon0(ymd(calYear, calMonth, 1)) }, (_, i) => (
              <span key={`b${i}`} />
            ))}
            {Array.from({ length: daysInMonth(calYear, calMonth) }, (_, i) => {
              const d = ymd(calYear, calMonth, i + 1);
              const isEdge = d === draftFrom || d === draftTo;
              const inside = draftFrom && draftTo && d > draftFrom && d < draftTo;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => pickDay(d)}
                  aria-pressed={isEdge}
                  className={`aspect-square min-h-9 rounded-[12px] text-[13px] font-bold tabular-nums ${
                    isEdge ? "bg-primary text-primary-foreground" : inside ? "bg-primary/12 text-primary" : "hover:bg-muted"
                  } ${d === today && !isEdge ? "ring-2 ring-primary/40" : ""}`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          {draftFrom && draftTo && !rangeOk && (
            <p role="alert" className="text-xs text-destructive">
              El rango debe ir de menor a mayor y durar como máximo un año.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {draftFrom ? `Del ${draftFrom}${draftTo && draftTo !== draftFrom ? ` al ${draftTo}` : ""}` : "Aún no has elegido días"}
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setRangeOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={!rangeOk} onClick={applyRange}>
              Aplicar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
