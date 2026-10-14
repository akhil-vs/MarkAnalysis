import { test, expect } from "@playwright/test";

/**
 * Parent / student portal — docs/user-manuals/portal.md
 * Guest user type (no staff login). Leadership issues links; guests paste codes.
 */
test.describe("Parent / student portal", () => {
  test("Portal entry page shows access-code form and staff links", async ({ page }) => {
    await page.goto("/portal");
    await expect(page.getByRole("heading", { name: /marks portal|student marks/i })).toBeVisible();
    await expect(page.getByLabel(/access code/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /view marks/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /staff sign in/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /back to home/i })).toBeVisible();
  });

  test("Invalid access code shows a friendly error", async ({ page }) => {
    await page.goto("/portal");
    await page.getByLabel(/access code/i).fill("not-a-valid-portal-code");
    await page.getByRole("button", { name: /view marks/i }).click();
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("alert")).toContainText(/invalid|expired|could not open|closed/i);
  });

  test("Landing and login expose parent portal entry", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /parent portal/i }).first()).toBeVisible();
    await page.goto("/login");
    await expect(page.getByRole("link", { name: /parent|portal/i }).first()).toBeVisible();
  });
});
