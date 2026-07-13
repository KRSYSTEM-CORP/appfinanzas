// Minimal service worker: exists only to satisfy PWA installability checks.
// It intentionally does no offline caching — every request goes straight to
// the network, since this app always points at the live online version.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // No-op: let the browser handle the request normally (network passthrough).
});
