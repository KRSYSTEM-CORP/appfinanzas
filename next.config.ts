import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Default is 1MB — raised for the payment-proof image upload (a resized,
  // compressed photo can still run a couple MB as base64).
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
