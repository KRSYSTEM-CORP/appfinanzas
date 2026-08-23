"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateSellerCommission } from "@/lib/actions/seller-reports";

export function SellerCommissionForm({
  userId,
  initialPercent,
}: {
  userId: string;
  initialPercent: number | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialPercent != null ? String(initialPercent) : "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    setSaved(false);
    const percent = value.trim() === "" ? null : Number(value);
    startTransition(async () => {
      const result = await updateSellerCommission(userId, percent);
      if (result.success) {
        setSaved(true);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex items-end gap-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="commissionPercent">% de comisión</Label>
        <Input
          id="commissionPercent"
          type="number"
          min={0}
          max={100}
          step="0.01"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSaved(false);
          }}
          placeholder="Ej. 5"
          className="w-24"
        />
      </div>
      <Button type="button" size="sm" onClick={handleSave} disabled={isPending}>
        {isPending ? "Guardando..." : "Guardar"}
      </Button>
      {saved && !error && <span className="text-sm text-success self-center">Guardado</span>}
      {error && <span className="text-sm text-destructive self-center">{error}</span>}
    </div>
  );
}
