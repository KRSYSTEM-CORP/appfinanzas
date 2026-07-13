"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Installability is unaffected if this silently fails (e.g. unsupported browser).
      });
    }
  }, []);

  return null;
}
