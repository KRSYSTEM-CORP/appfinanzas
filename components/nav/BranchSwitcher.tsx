"use client";

import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EnterBranchDialog } from "@/components/branches/EnterBranchDialog";

// Sentinel value for the Select primitive, which can't hold a real `null` —
// maps to branchId: null ("Todas las sucursales") in handleChange below.
const ALL_VALUE = "__all__";

export function BranchSwitcher({
  branches,
  currentBranchId,
}: {
  branches: { id: string; name: string }[];
  currentBranchId: string | null;
}) {
  const [target, setTarget] = useState<{ id: string | null; name: string } | null>(null);

  // Cambiar de sede pide la clave: el desplegable solo elige a cuál entrar.
  function handleChange(value: string) {
    const branchId = value === ALL_VALUE ? null : value;
    if (branchId === currentBranchId) return;
    setTarget({
      id: branchId,
      name: branchId ? branches.find((b) => b.id === branchId)?.name ?? "la sucursal" : "Todas las sucursales",
    });
  }

  return (
    <>
      <Select value={currentBranchId ?? ALL_VALUE} onValueChange={(v) => v && handleChange(v)}>
        <SelectTrigger size="sm" aria-label="Sucursal">
          <SelectValue placeholder="Sucursal">
            {(value: string | null) =>
              !value || value === ALL_VALUE
                ? "Todas las sucursales"
                : branches.find((b) => b.id === value)?.name ?? "Sucursal"
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>Todas las sucursales</SelectItem>
          {branches.map((b) => (
            <SelectItem key={b.id} value={b.id}>
              {b.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {target && <EnterBranchDialog target={target} onClose={() => setTarget(null)} />}
    </>
  );
}
