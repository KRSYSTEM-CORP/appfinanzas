"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";

// Frontera de error general: cualquier pantalla sin su propio error.tsx cae aquí
// en vez de quedarse en blanco.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div role="alert" className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <div>
        <h2 className="text-lg font-semibold">Algo salió mal</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          No pudimos mostrar esta pantalla. Intenta de nuevo; si el problema sigue, recarga la página.
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
