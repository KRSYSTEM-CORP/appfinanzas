"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      // updateViaCache: "none" stops the browser's own HTTP cache from
      // caching sw.js — without it, a bumped CACHE_VERSION inside sw.js can
      // take up to 24h to be noticed, since the browser would otherwise be
      // checking a stale cached copy of the file to decide whether it
      // changed (per Next's own PWA guide).
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then(() => navigator.serviceWorker.ready)
        .then((reg) => {
          // The install-time warm-up may have run before login (then
          // /pos/offline only redirects to /login, which the worker refuses to
          // cache), so on any signed-in screen ask it to warm the shell again.
          const publicPath = /^\/(login|signup|forgot-password|reset-password|privacidad|terminos|cookies)(\/|$)/;
          if (!publicPath.test(location.pathname)) reg.active?.postMessage({ type: "warm-shell" });
        })
        .catch(() => {
          // Installability is unaffected if this silently fails (e.g. unsupported browser).
        });
    }
  }, []);

  return null;
}
