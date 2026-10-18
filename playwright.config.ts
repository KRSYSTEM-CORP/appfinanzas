import { defineConfig } from "@playwright/test";

// E2E against a LOCAL app pointed at the TEST database (see
// tests/e2e/README section in README.md) — never production.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3003", viewport: { width: 1280, height: 900 } },
  workers: 1,
});
