"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { switchBranch } from "@/lib/actions/branches";

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
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleChange(value: string) {
    const branchId = value === ALL_VALUE ? null : value;
    if (branchId === currentBranchId) return;
    startTransition(async () => {
      await switchBranch(branchId);
      router.refresh();
    });
  }

  return (
    <Select
      value={currentBranchId ?? ALL_VALUE}
      onValueChange={(v) => v && handleChange(v)}
      disabled={isPending}
    >
      <SelectTrigger size="sm">
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
  );
}
