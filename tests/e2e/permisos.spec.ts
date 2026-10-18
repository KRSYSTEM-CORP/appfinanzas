import { expect, test } from "@playwright/test";
import { MANAGER, SELLER, login } from "./helpers";

// Regression for audit KRPOS-SEC-001/002/004.
test("el vendedor no ve cerrar caja ni anular, y no entra a ajustes", async ({ page }) => {
  await login(page, SELLER);
  await page.goto("/reports");
  await expect(page.getByText("solo el gerente puede cerrar la caja")).toBeVisible();
  await expect(page.getByRole("button", { name: /Cerrar caja/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Anular$|Nota de crédito/ })).toHaveCount(0);
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/pos/);
});

test("el gerente ve cerrar caja", async ({ page }) => {
  await login(page, MANAGER);
  await page.goto("/reports");
  await expect(page.getByRole("button", { name: /Cerrar caja/ }).first()).toBeVisible();
});
