"use client";

import { useState } from "react";
import { toast } from "sonner";
import { convertQty, formatQty, formatQtyUnit, getUnit, sellableUnits, toBaseQty } from "@/lib/units";

// Lets the cashier type a quantity directly instead of only tapping −/+ —
// much faster for a bulk sale. Keeps its own draft string so the field can
// be freely edited (including briefly empty) while typing; only commits
// (clamped to [mínimo, maxStock]) on blur/Enter, reverting to the last valid
// quantity if what's typed doesn't parse. Shared by the POS cart and the
// Presupuestos cart.
//
// Con `unit` (la unidad BASE del producto) acepta decimales si la unidad lo permite y, si la familia tiene
// varias unidades (litro/mililitro/galón), muestra un selector: se puede escribir «500» en ml y se guarda 0,5 L.
// `quantity`, `maxStock` y `onCommit` siempre van en la unidad base.
export function QuantityInput({
  quantity,
  maxStock,
  onCommit,
  className,
  unit,
}: {
  quantity: number;
  maxStock: number;
  onCommit: (quantity: number) => void;
  // Reemplaza el estilo por defecto (el POS lo muestra dentro de su stepper).
  className?: string;
  unit?: string;
}) {
  const base = unit ?? "unidad";
  const def = getUnit(base);
  const options = unit ? sellableUnits(base) : [];
  const [displayUnit, setDisplayUnit] = useState(base);
  const shown = (q: number) => formatQty(convertQty(q, base, displayUnit)).replace(/\./g, "");
  const [draft, setDraft] = useState(() => shown(quantity));
  // Re-sync the draft when the quantity changes from outside (−/+ buttons).
  // Adjusting state during render avoids an extra effect-driven render pass.
  const [seenQuantity, setSeenQuantity] = useState(quantity);
  const [invalid, setInvalid] = useState(false);
  if (seenQuantity !== quantity) {
    setSeenQuantity(quantity);
    setDraft(shown(quantity));
    setInvalid(false);
  }

  const decimalsHere = unit ? getUnit(displayUnit).decimals : false;

  function commit() {
    const text = draft.trim().replace(",", ".");
    const parsed = text === "" ? NaN : Number(text);
    const checked = Number.isFinite(parsed) && parsed > 0 ? toBaseQty(parsed, displayUnit, base) : null;
    if (checked && checked.ok) {
      const clamped = Math.min(checked.qty, maxStock);
      if (clamped < checked.qty) toast.error(`Solo hay ${formatQtyUnit(maxStock, base)} disponibles; dejamos ese máximo.`);
      setInvalid(false);
      setDraft(shown(clamped));
      if (clamped !== quantity) onCommit(clamped);
    } else {
      setInvalid(!!text);
      if (text) {
        toast.error(
          decimalsHere ? "Escribe un número mayor que cero (hasta 3 decimales)." : "Este producto se vende en cantidades enteras: no se puede vender una fracción."
        );
      }
      setDraft(shown(quantity));
    }
  }

  function changeUnit(next: string) {
    setDisplayUnit(next);
    setDraft(formatQty(convertQty(quantity, base, next)).replace(/\./g, ""));
  }

  const baseClass = "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";
  const input = (
    <input
      type="text"
      inputMode={decimalsHere ? "decimal" : "numeric"}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      aria-label={unit && def.key !== "unidad" ? `Cantidad en ${getUnit(displayUnit).plural}` : "Cantidad"}
      aria-invalid={invalid || undefined}
      title={invalid ? (decimalsHere ? "Escribe un número mayor que cero (hasta 3 decimales)" : "Este producto se vende en cantidades enteras") : undefined}
      className={
        (className ? `${className} ${baseClass}` : `w-12 rounded border border-input bg-background px-1 py-0.5 text-center text-sm tabular-nums ${baseClass}`) +
        (invalid ? " ring-2 ring-destructive/60" : "")
      }
    />
  );

  if (options.length <= 1) return input;
  return (
    <span className="inline-flex items-center gap-1">
      {input}
      <select
        value={displayUnit}
        onChange={(e) => changeUnit(e.target.value)}
        aria-label="Unidad de venta"
        className="rounded border border-input bg-background px-1 py-0.5 text-xs"
      >
        {options.map((u) => (
          <option key={u.key} value={u.key}>
            {u.symbol || u.name}
          </option>
        ))}
      </select>
    </span>
  );
}
