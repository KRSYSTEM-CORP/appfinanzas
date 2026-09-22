"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

// Next's own error boundary for the /pos route segment — the app has none
// anywhere else today, and this is the one screen where an uncaught error
// (e.g. a Server Action call failing mid-checkout because the connection
// just dropped) matters most: without this, that error takes down the whole
// screen with no way back except a manual reload, in the middle of a sale.
export default function PosError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[pos] unexpected error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 h-[calc(100vh-56px)] p-6 text-center">
      <div>
        <h2 className="text-lg font-semibold">Algo salió mal en el punto de venta</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Puede haber sido un corte de conexión momentáneo. Intenta de nuevo — si el problema
          sigue, recarga la página.
        </p>
      </div>
      <div className="flex gap-2">
        <Button onClick={() => reset()}>Intentar de nuevo</Button>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Recargar página
        </Button>
      </div>
    </div>
  );
}
