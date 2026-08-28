import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Default is 1MB — raised for the payment-proof image upload (a resized,
  // compressed photo can still run a couple MB as base64).
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
};

// No Sentry auth token is configured, so this only wires up error/request
// instrumentation — source map upload (which needs org/project/authToken)
// is skipped for now, so stack traces in Sentry will show minified code.
export default withSentryConfig(nextConfig, {
  silent: true,
});
