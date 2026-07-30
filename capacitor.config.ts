import type { CapacitorConfig } from "@capacitor/cli";

// This wraps the LIVE deployed app (not a static export) — KR System uses
// Server Actions, Prisma/Postgres, and signed session cookies throughout,
// none of which can run in a bundled static build. Capacitor's WebView just
// points at the same production URL the web app already runs on, so every
// server-side feature (auth, POS, PDFs, the Binance Pay webhook, etc.) works
// identically inside the native app with zero duplicated logic.
const config: CapacitorConfig = {
  appId: "com.kyrasystem.app",
  appName: "App Finanzas",
  webDir: "public",
  server: {
    url: "https://ventas-inventario-dun.vercel.app",
    cleartext: false,
  },
};

export default config;
