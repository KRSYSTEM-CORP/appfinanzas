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

export default withSentryConfig(nextConfig, {
  silent: true,
  org: "kr-system",
  project: "krpos",
  authToken: process.env.SENTRY_AUTH_TOKEN,
});
