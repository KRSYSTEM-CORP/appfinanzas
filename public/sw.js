// KR POS service worker.
//
// What this does, and — just as important — what it deliberately does NOT
// do: it does NOT try to cache the real, dynamic "/pos" page's rendered
// HTML (that page always needs a live session/catalog check — see
// app/pos/page.tsx — and caching a personalized, per-request response would
// be fragile and could even leak one company's data into another's cached
// copy). Instead, while online, it caches the separate, always-generic
// "/pos/offline" shell (see app/pos/offline/page.tsx) — a page with no
// server data of its own, which reads everything it needs from IndexedDB
// (see lib/offline/db.ts). When a navigation to "/", "/pos" or "/pos/offline"
// itself fails because there's no network, this worker REDIRECTS the browser
// to "/pos/offline" (never serves that cached content directly under a
// different URL — that would desync the address bar from what Next's own
// client-side router thinks is loaded). The redirected request is then a
// normal navigation to "/pos/offline", which this same fetch handler serves
// from cache.
//
// CACHE_VERSION is bumped by hand on any deploy that changes this file or
// anything /pos/offline depends on (mirrors DB_VERSION's manual-bump
// convention in lib/offline/db.ts) — the browser detects sw.js's bytes
// changed and runs a fresh install/activate cycle, which re-warms the cache
// and (in activate, below) deletes the previous version's bucket. Everything
// outside this shell (Inventario, Reportes, Compras, Contabilidad, ...) is
// intentionally left uncached — those need a live connection either way, so
// caching their shell would only risk serving something stale/broken.
//
// EMERGENCY KILL SWITCH: if a bad version of this file ever ships, bump
// CACHE_VERSION to the literal string "disabled" and deploy — activate()
// below detects that, deletes every cache this worker owns, and unregisters
// itself, so every open tab falls back to the old plain network-passthrough
// behavior on its next load without anyone needing to clear site data by
// hand.
const CACHE_VERSION = "v3";
const CACHE_NAME = `kr-pos-shell-${CACHE_VERSION}`;
const OFFLINE_SHELL_PATH = "/pos/offline";
// Any failed navigation to one of these paths is redirected to the offline
// shell — deliberately NOT a catch-all for every route, so a failed
// navigation to e.g. /inventory or /reports still shows the browser's own
// offline page instead of silently landing on a POS screen that has nothing
// to do with what was asked for.
const OFFLINE_FALLBACK_PATHS = new Set(["/", "/pos", OFFLINE_SHELL_PATH]);

self.addEventListener("install", (event) => {
  self.skipWaiting();
  if (CACHE_VERSION === "disabled") return;
  event.waitUntil(warmShellCache());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      if (CACHE_VERSION === "disabled") {
        await Promise.all(keys.map((k) => caches.delete(k)));
        await self.registration.unregister();
        await self.clients.claim();
        return;
      }
      // Drop every cache bucket from a previous CACHE_VERSION — keys() only
      // ever contains buckets this same origin's service worker created, so
      // this can't touch anything unrelated.
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

// The Cache API stores a fetched Response's body already decoded (gzip/br
// undone) — but the ORIGINAL response headers, including "content-encoding"
// and "transfer-encoding", are kept as-is on the stored Response. Replaying
// that stored Response later to satisfy a real navigation makes Chrome try
// to gunzip an already-decoded body (since it trusts "content-encoding:
// gzip"), which fails and shows Chrome's own network-error page instead of
// the offline shell — silently, with no console error tying it back to this.
// Every cache.put() in this file goes through this helper instead of storing
// a fetch() response directly, specifically to avoid that trap.
async function cachePut(cache, request, response) {
  const headers = new Headers(response.headers);
  headers.delete("content-encoding");
  headers.delete("content-length");
  headers.delete("transfer-encoding");
  const body = await response.arrayBuffer();
  const clean = new Response(body, { status: response.status, statusText: response.statusText, headers });
  await cache.put(request, clean);
}

// Fetches the offline shell page while online and stores the response, then
// scans its HTML for the JS/CSS chunk URLs it actually references and caches
// those too — this is what lets a fully cold tab (never having visited
// /pos/offline itself) still get a working offline shell just from having
// loaded /pos once, without needing to know Turbopack's content-hashed
// filenames ahead of time (there's no build-time manifest available to a
// hand-rolled worker like this one — see the AGENTS.md note on why this
// project can't use Serwist/Workbox).
async function warmShellCache() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const res = await fetch(OFFLINE_SHELL_PATH, { credentials: "same-origin" });
    if (!res.ok) return;
    const html = await res.clone().text();
    await cachePut(cache, OFFLINE_SHELL_PATH, res);
    const assetUrls = new Set();
    const re = /["'](\/_next\/static\/[^"']+\.(?:js|css))["']/g;
    let match;
    while ((match = re.exec(html))) assetUrls.add(match[1]);
    await Promise.all(
      Array.from(assetUrls).map(async (url) => {
        try {
          const assetRes = await fetch(url, { credentials: "same-origin" });
          if (assetRes.ok) await cachePut(cache, url, assetRes);
        } catch {
          // One missing chunk shouldn't abort warming the rest.
        }
      })
    );
  } catch (err) {
    // No connectivity yet, or the fetch failed for some other reason — the
    // next successful online load (see lib/offline/use-catalog-sync.ts,
    // which triggers on every /pos render) gets another chance via the
    // fetch handler's own opportunistic caching below.
    console.error("[sw] warmShellCache failed:", err && err.stack ? err.stack : err);
  }
}

self.addEventListener("fetch", (event) => {
  if (CACHE_VERSION === "disabled") return;
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // _next/static/* is content-hashed by Next itself — a given URL's bytes
  // never change, so cache-first here is always safe and also opportunistically
  // keeps the offline shell's chunks warm even if warmShellCache() above
  // missed one (e.g. the very first install raced a slow network).
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            if (res.ok) caches.open(CACHE_NAME).then((c) => cachePut(c, request, res.clone()));
            return res;
          })
      )
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        if (!OFFLINE_FALLBACK_PATHS.has(url.pathname)) {
          // Not a path this worker knows how to help with while offline —
          // let the browser show its own default offline page rather than
          // pretending Inventario/Reportes/etc. work without a connection.
          throw new Error("offline, no fallback for this path");
        }
        if (url.pathname === OFFLINE_SHELL_PATH) {
          const cached = await caches.match(OFFLINE_SHELL_PATH);
          if (cached) return cached;
          throw new Error("offline shell not cached yet");
        }
        // Redirect rather than serve the cached shell's bytes directly under
        // this URL — the browser then re-navigates to /pos/offline, whose
        // own request is what the branch above actually serves from cache,
        // so the address bar and Next's client router always agree on what
        // page is loaded.
        return Response.redirect(OFFLINE_SHELL_PATH, 302);
      })
    );
    return;
  }

  // Everything else (API calls, images, fonts, other pages) goes straight to
  // the network, unchanged from before this rewrite.
});
