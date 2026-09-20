import { test, expect } from "@playwright/test";
import { ACCOUNTS, ROUTES, demoLogin, goNav, goRoute, expectPageTitle, expectNavLink, signOut } from "../helpers/auth.js";

/**
 * Cross-role exam-cycle workflow from the manuals:
 * Teacher opens register → Leadership pending queue → Principal ops (no mark entry).
 */
test.describe("Cross-role marks cycle (manuals exam workflow)", () => {
  test("Teacher register → Co-ordinator pending uploads → Principal pending (no mark entry)", async ({
    page,
  }) => {
    await demoLogin(page, ACCOUNTS.teacherBio);
    await goNav(page, "Mark register");
    await expectPageTitle(page, "Mark register");
    await expect(page.locator("main")).toContainText(/exam|class|subject|marks|Biology|student/i);
    await signOut(page);

    await demoLogin(page, ACCOUNTS.coordinator);
    await goNav(page, "Pending uploads");
    await expectPageTitle(page, "Pending");
    await expect(page.locator("main")).toContainText(/Biology|Meera|pending|awaiting|teacher|upload/i);
    await goNav(page, "Access requests");
    await expectPageTitle(page, "Access request");
    await signOut(page);

    await demoLogin(page, ACCOUNTS.principal);
    await goNav(page, "Pending uploads");
    await expectPageTitle(page, "Pending");
    await expectNavLink(page, "Mark register", { visible: false });
  });

  test("Landing → login → signup / register-school entry points exist", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /sign in|log in/i }).first()).toBeVisible();
    await page.goto("/signup");
    await expect(page.getByText(/join code|request access|sign up/i).first()).toBeVisible();
    await page.goto("/register-school");
    await expect(page.getByText(/register|school|principal/i).first()).toBeVisible();
  });

  test("Platform admin opens platform console", async ({ page }) => {
    await demoLogin(page, ACCOUNTS.admin);
    await expect(page).toHaveURL(/\/platform/);
    await expect(page.locator("main, body")).toContainText(/school|platform|Greenfield|Riverside/i);
  });

  test("Public HELP manuals are not required before login; login page loads", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
    await expect(page.getByText(/Dr\. Kavita Rao|Sanjay Menon|Anita Sharma/i).first()).toBeVisible();
  });
});
