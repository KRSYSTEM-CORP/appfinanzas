"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// Last-resort boundary: replaces the root layout when it (or anything above
// the route error boundaries) throws, so it renders its own <html>/<body> and
// uses inline styles instead of the app's CSS.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#0b0b12",
          color: "#f5f5f7",
          textAlign: "center",
          padding: "1.5rem",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.5rem", margin: 0 }}>Algo salió mal</h1>
          <p style={{ color: "#a1a1a6", margin: "0.75rem 0 1.5rem" }}>
            Ya registramos el problema. Intenta de nuevo.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              border: 0,
              borderRadius: "9999px",
              padding: "0.75rem 1.5rem",
              fontSize: "1rem",
              color: "#fff",
              background: "#4f46e5",
              cursor: "pointer",
            }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
