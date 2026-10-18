import { expect, test } from "@playwright/test";
import { MANAGER, PASSWORD, login } from "./helpers";

// Regression for audit KRPOS-SEC-006: changing the password signs out every
// other session but keeps the current one. Restores the password at the end.
async function changePassword(page: import("@playwright/test").Page, from: string, to: string) {
  await page.goto("/settings");
  await page.getByText("Cambio de clave", { exact: true }).first().click();
  await page.fill("input[name=currentPassword]", from);
  await page.fill("input[name=newPassword]", to);
  await page.fill("input[name=confirmPassword]", to);
  await page.locator("input[name=confirmPassword]").locator("xpath=ancestor::form").locator("button[type=submit]").click();
  await page.waitForTimeout(3_000);
}

test("cambiar la contraseña cierra las otras sesiones", async ({ page, browser }) => {
  const other = await (await browser.newContext()).newPage();
  await login(page, MANAGER);
  await login(other, MANAGER);
  const temp = `${PASSWORD}x`;
  await changePassword(page, PASSWORD, temp);
  try {
    await page.goto("/reports");
    await expect(page).toHaveURL(/\/reports/);
    await other.goto("/reports");
    await expect(other).toHaveURL(/\/login/);
  } finally {
    await changePassword(page, temp, PASSWORD);
  }
});
