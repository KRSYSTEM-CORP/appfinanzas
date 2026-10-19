"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// Last-resort boundary: replaces the root layout when it (or anything above
// the route error boundaries) throws, so it renders its own <html>/<body> and
// uses inline styles instead of the app's CSS.
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // An open tab (or the installed app) still running JS from a previous
    // deploy calls Server Actions that no longer exist ("Failed to find
    // Server Action"). Reloading fetches the current version; the session
    // flag stops a reload loop if the error is something else.
    if (/server action/i.test(error.message)) {
      try {
        const last = Number(sessionStorage.getItem("kr-stale-reload") ?? 0);
        if (Date.now() - last > 60_000) {
          sessionStorage.setItem("kr-stale-reload", String(Date.now()));
          window.location.reload();
          return;
        }
      } catch {}
    }
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
            onClick={() => {
              try {
                sessionStorage.removeItem("kr-stale-reload");
              } catch {}
              window.location.reload();
            }}
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
