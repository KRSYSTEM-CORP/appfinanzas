// Guarda una sesión de pruebas para comparar.mjs. SOLO contra la base de pruebas.
// Uso: E2E_BASE_URL=http://localhost:3000 KR_EMAIL=... KR_PASS=... KR_PIN=.... node rediseno/visual/sesion.mjs
// Los valores salen de prisma/seed-pruebas.ts; no los escribas en ningún archivo del repositorio.
import { chromium } from "@playwright/test";
const base = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const { KR_EMAIL, KR_PASS, KR_PIN, KR_SUCURSAL = "Sucursal Principal" } = process.env;
if (!KR_EMAIL || !KR_PASS) { console.error("Faltan KR_EMAIL y KR_PASS"); process.exit(1); }
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(base + "/login");
await page.fill("input[name=email]", KR_EMAIL);
await page.fill("input[name=password]", KR_PASS);
await page.keyboard.press("Enter");
const suc = page.getByText(KR_SUCURSAL, { exact: true });
if (await suc.first().isVisible({ timeout: 8000 }).catch(() => false)) await suc.first().click();
await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
if (page.url().includes("/lock")) {
  if (!KR_PIN) { console.error("La app pide PIN: define KR_PIN"); process.exit(1); }
  await page.locator("button").filter({ hasText: /\S/ }).first().waitFor();
  await page.getByRole("button").filter({ hasText: /Gerente/ }).first().click().catch(() => {});
  for (const d of KR_PIN) await page.getByRole("button", { name: d, exact: true }).click();
  await page.getByRole("button", { name: /Entrar|Continuar/ }).click().catch(() => {});
  await page.waitForURL((u) => !u.pathname.startsWith("/lock"), { timeout: 30000 });
}
await ctx.storageState({ path: process.env.KR_STORAGE ?? "tests/e2e/.auth.json" });
await browser.close();
console.log("Sesión guardada.");
