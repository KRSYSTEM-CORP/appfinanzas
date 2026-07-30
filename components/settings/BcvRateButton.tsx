"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { fetchAndUpdateBcvRate } from "@/lib/actions/settings";

// A daily cron job already refreshes this rate automatically for every VES
// company (see app/api/cron/bcv-rate/route.ts) — this button is only for
// pulling today's rate immediately instead of waiting for that run.
export function BcvRateButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await fetchAndUpdateBcvRate();
      if (result.success) {
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Button type="button" variant="outline" onClick={handleClick} disabled={isPending}>
        {isPending ? "Consultando BCV..." : "Actualizar con tasa BCV"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
