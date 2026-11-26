"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CheckIcon, ChevronDownIcon, SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { UNITS, UNIT_FAMILIES, UNIT_LABEL_MAX, getUnit, parseUnit } from "@/lib/units";

export type UnitValue = { unit: string; unitLabel: string };

function describe(key: string, label: string): string {
  const u = getUnit(key);
  if (u.key === "otra") return label.trim() ? `Otra: ${label.trim()}` : "Otra";
  const name = u.name.charAt(0).toUpperCase() + u.name.slice(1);
  return u.symbol && u.symbol !== u.name ? `${name} (${u.symbol})` : name;
}

/**
 * Selector de unidad de medida con buscador. Escribe «ml», «litro», «pza»... y filtra por nombre o abreviatura.
 * Con `name` incluye los campos ocultos `unit` y `unitLabel` para formularios clásicos.
 */
export function UnitSelect({
  value,
  onChange,
  name = true,
  id,
}: {
  value: UnitValue;
  onChange: (v: UnitValue) => void;
  name?: boolean;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const autoId = useId();
  const listId = `${autoId}-lista`;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const exactKey = q ? parseUnit(q) : null;
    return UNIT_FAMILIES.map((f) => ({
      ...f,
      units: UNITS.filter((u) => u.family === f.key).filter((u) => {
        if (!q) return true;
        if (exactKey === u.key) return true;
        return `${u.name} ${u.plural} ${u.symbol} ${u.aliases.join(" ")}`.toLowerCase().includes(q);
      }),
    })).filter((g) => g.units.length > 0);
  }, [query]);

  return (
    <div ref={rootRef} className="relative flex flex-col gap-1.5">
      {name && (
        <>
          <input type="hidden" name="unit" value={value.unit} />
          <input type="hidden" name="unitLabel" value={value.unit === "otra" ? value.unitLabel : ""} />
        </>
      )}
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm"
      >
        <span className="truncate">{describe(value.unit, value.unitLabel)}</span>
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border bg-popover p-2 shadow-md">
          <div className="relative mb-2">
            <SearchIcon className="pointer-events-none absolute left-2 top-2.5 size-4 text-muted-foreground" aria-hidden />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar: litro, ml, kg, pieza..."
              aria-label="Buscar unidad de medida"
              className="pl-8"
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault();
                if (e.key === "Escape") setOpen(false);
              }}
            />
          </div>
          <div id={listId} role="listbox" className="max-h-64 overflow-y-auto">
            {groups.length === 0 && <p className="px-2 py-3 text-sm text-muted-foreground">No encontramos esa unidad. Prueba con «Otra» y escribe su nombre.</p>}
            {groups.map((g) => (
              <div key={g.key} className="mb-1">
                <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</p>
                {g.units.map((u) => {
                  const selected = value.unit === u.key;
                  return (
                    <button
                      key={u.key}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => {
                        onChange({ unit: u.key, unitLabel: u.key === "otra" ? value.unitLabel : "" });
                        setOpen(false);
                        setQuery("");
                      }}
                      className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                    >
                      <span>
                        {describe(u.key, "")}
                        <span className="ml-2 text-xs text-muted-foreground">{u.decimals ? "admite decimales" : "solo enteros"}</span>
                      </span>
                      {selected && <CheckIcon className="size-4" aria-hidden />}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {value.unit === "otra" && (
        <div className="flex flex-col gap-1">
          <Input
            value={value.unitLabel}
            onChange={(e) => onChange({ unit: "otra", unitLabel: e.target.value.slice(0, UNIT_LABEL_MAX) })}
            placeholder="¿Cómo se llama? (rollo, saco...)"
            aria-label="Nombre de la unidad"
            maxLength={UNIT_LABEL_MAX}
          />
          <p className="text-xs text-muted-foreground">Las unidades «otra» se venden en cantidades enteras.</p>
        </div>
      )}
    </div>
  );
}
