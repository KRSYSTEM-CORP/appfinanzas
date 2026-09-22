import { PosOfflineClient } from "@/components/pos/PosOfflineClient";

// The offline-only POS screen (see components/pos/PosOfflineClient.tsx for
// why it exists and how it's populated) — a plain leaf page under the
// existing root layout, no special rendering mode needed. It's reachable
// live at this URL too (nothing hides it), but its real job is being the
// page the service worker (public/sw.js) redirects to and serves from cache
// when a navigation to "/" or "/pos" fails with no network. Everything it
// shows comes from IndexedDB, populated by the real /pos page while online —
// this page itself does no data fetching of its own.
export default function PosOfflinePage() {
  return <PosOfflineClient />;
}
