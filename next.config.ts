import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Security headers for every route (audit KRPOS-SEC-007). The CSP starts as
// Report-Only so a missed origin shows up in the browser console instead of
// breaking the POS; switch it to enforcing once it reports nothing.
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.sentry.io https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://challenges.cloudflare.com",
  "frame-src https://challenges.cloudflare.com",
  "worker-src 'self' blob:",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://accounts.google.com",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The barcode scanner needs the camera; nothing uses the mic or location.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    // Only the headers proven safe with Cloudflare Turnstile on /login: the
    // CSP, X-Frame-Options and Permissions-Policy broke the login challenge
    // (error 600010) in production and are disabled until re-tested.
    // All security headers on. They were briefly off while a login failure
    // was investigated; it turned out to be the automated browser, not the
    // headers. Turnstile's iframe is cross-origin, so X-Frame-Options (which
    // only stops OTHER sites from framing KR POS) and a Permissions-Policy
    // that limits camera/mic/location don't affect it.
    const safe = securityHeaders;
    return [{ source: "/:path*", headers: safe }];
  },
  // Default is 1MB — raised for the payment-proof image upload (a resized,
  // compressed photo can still run a couple MB as base64).
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  org: "kr-system",
  project: "krpos",
  authToken: process.env.SENTRY_AUTH_TOKEN,
});
