"use client";

import { useEffect, useState } from "react";

// Lets the cashier type a quantity directly instead of only tapping −/+ —
// much faster for a bulk sale. Keeps its own draft string so the field can
// be freely edited (including briefly empty) while typing; only commits
// (clamped to [1, maxStock]) on blur/Enter, reverting to the last valid
// quantity if what's typed doesn't parse. Shared by the POS cart and the
// Presupuestos cart.
export function QuantityInput({
  quantity,
  maxStock,
  onCommit,
}: {
  quantity: number;
  maxStock: number;
  onCommit: (quantity: number) => void;
}) {
  const [draft, setDraft] = useState(String(quantity));

  useEffect(() => {
    setDraft(String(quantity));
  }, [quantity]);

  function commit() {
    const parsed = Math.floor(Number(draft));
    if (Number.isFinite(parsed) && parsed > 0) {
      const clamped = Math.min(parsed, maxStock);
      setDraft(String(clamped));
      if (clamped !== quantity) onCommit(clamped);
    } else {
      setDraft(String(quantity));
    }
  }

  return (
    <input
      type="number"
      inputMode="numeric"
      min={1}
      max={maxStock}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      className="w-12 rounded border border-input bg-background px-1 py-0.5 text-center text-sm tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
    />
  );
}
