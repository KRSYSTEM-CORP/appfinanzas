import { defineConfig } from "vitest/config";
import path from "node:path";

// Integration tests run server actions against a real Postgres: an
// ephemeral Neon branch in CI (.github/workflows/integration.yml), or the
// test database locally. Never production — see tests/integration/setup.ts.
export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    setupFiles: ["tests/integration/setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
  resolve: { alias: { "@": path.resolve(__dirname) } },
});
