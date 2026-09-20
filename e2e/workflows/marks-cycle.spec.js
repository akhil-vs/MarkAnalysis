import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { ROUTES, goNav, goRoute, expectPageTitle, expectNavLink } from "../helpers/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Cross-role exam-cycle workflow from the manuals.
 * Uses stored sessions (one login per role in auth.setup.js).
 */
test.describe("Cross-role marks cycle (manuals exam workflow)", () => {
  test("Teacher register → Co-ordinator pending uploads → Principal pending (no mark entry)", async ({
    browser,
  }) => {
    const teacher = await browser.newContext({
      storageState: path.join(__dirname, "../.auth/teacher-bio.json"),
    });
    const teacherPage = await teacher.newPage();
    await goRoute(teacherPage, ROUTES.dashboard);
    await goNav(teacherPage, "Mark register");
    await expectPageTitle(teacherPage, "Mark register");
    await expect(teacherPage.locator("main")).toContainText(/exam|class|subject|marks|Biology|student/i);
    await teacher.close();

    const coord = await browser.newContext({
      storageState: path.join(__dirname, "../.auth/coordinator.json"),
    });
    const coordPage = await coord.newPage();
    await goRoute(coordPage, ROUTES.dashboard);
    await goNav(coordPage, "Pending uploads");
    await expectPageTitle(coordPage, "Pending");
    await expect(coordPage.locator("main")).toContainText(/Biology|Meera|pending|awaiting|teacher|upload/i);
    await goNav(coordPage, "Access requests");
    await expectPageTitle(coordPage, "Access request");
    await coord.close();

    const principal = await browser.newContext({
      storageState: path.join(__dirname, "../.auth/principal.json"),
    });
    const principalPage = await principal.newPage();
    await goRoute(principalPage, ROUTES.dashboard);
    await goNav(principalPage, "Pending uploads");
    await expectPageTitle(principalPage, "Pending");
    await expectNavLink(principalPage, "Mark register", { visible: false });
    await principal.close();
  });

  test("Landing → login → signup / register-school entry points exist", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /sign in|log in/i }).first()).toBeVisible();
    await page.goto("/signup");
    await expect(page.getByText(/join code|request access|sign up/i).first()).toBeVisible();
    await page.goto("/register-school");
    await expect(page.getByText(/register|school|principal/i).first()).toBeVisible();
  });

  test("Platform admin opens platform console", async ({ browser }) => {
    const ctx = await browser.newContext({
      storageState: path.join(__dirname, "../.auth/admin.json"),
    });
    const page = await ctx.newPage();
    await page.goto("/platform");
    await expect(page).toHaveURL(/\/platform/);
    await page.locator("main").waitFor({ state: "visible", timeout: 45_000 });
    await expect(page.locator("main")).toContainText(/school|platform|Greenfield|Riverside/i, {
      timeout: 30_000,
    });
    await ctx.close();
  });

  test("Public login page loads with demo accounts", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
    await expect(page.getByText(/Dr\. Kavita Rao|Sanjay Menon|Anita Sharma/i).first()).toBeVisible();
  });
});
