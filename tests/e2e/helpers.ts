import type { Page } from "@playwright/test";

// Seed users from prisma/seed-pruebas.ts (test database only).
export const PASSWORD = process.env.E2E_PASSWORD ?? "Pruebas2026!";
export const MANAGER = "gerente@pruebas.test";
export const SELLER = "ana@pruebas.test";

export async function login(page: Page, email: string) {
  await page.goto("/api/auth/clear-session");
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", PASSWORD);
  await page.click("button[type=submit]");
  await page.locator('button:has-text("Sucursal Principal")').first().click({ timeout: 15_000 });
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
}
