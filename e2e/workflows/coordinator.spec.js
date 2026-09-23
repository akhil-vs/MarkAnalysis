import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { ROUTES, goNav, goRoute, expectPageTitle, expectNavLink } from "../helpers/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authFile = path.join(__dirname, "../.auth/coordinator.json");

/**
 * Exam co-ordinator user manual — full-app UI walkthrough
 * Source: docs/user-manuals/coordinator.md
 */
test.describe("Exam co-ordinator manual — complete application workflow", () => {
  test.use({ storageState: authFile });

  test("§1 Sign in lands on Exam coordination desk", async ({ page }) => {
    await goRoute(page, ROUTES.dashboard);
    await expect(page.locator("main")).toContainText(/coord|pending|awaiting|upload|exam/i);
  });

  test("§2.1 Records accessible", async ({ page }) => {
    await goRoute(page, ROUTES.dashboard);
    await goNav(page, "Records");
    await expect(page).toHaveURL(/\/manage/);
    await expectPageTitle(page, "School records");
  });

  test("§2.2 Staff — can manage teachers", async ({ page }) => {
    await goRoute(page, ROUTES.dashboard);
    await goNav(page, "Staff");
    await expect(page).toHaveURL(/\/users/);
    await expectPageTitle(page, "Staff");
    await expect(page.locator("main")).toContainText(/Anita Sharma|Teacher/i);
  });

  test("§2.3 Timetables", async ({ page }) => {
    await goRoute(page, ROUTES.dashboard);
    await goNav(page, "Timetables");
    await expect(page).toHaveURL(/\/timetables/);
    await expectPageTitle(page, "timetable");
  });

  test("§2.4 School profile — join code visible", async ({ page }) => {
    await goRoute(page, ROUTES.dashboard);
    await goNav(page, "School profile");
    await expect(page).toHaveURL(/\/school/);
    await expectPageTitle(page, "School profile");
    await page.locator("main").getByRole("tab", { name: /Modules & Security/i }).click();
    await expect(page.locator("main")).toContainText(/join code|DEMO-JOIN/i);
  });

  test("§3.1 Mark register available (unlike principal)", async ({ page }) => {
    await goRoute(page, ROUTES.dashboard);
    await expectNavLink(page, "Mark register", { visible: true });
    await goNav(page, "Mark register");
    await expect(page).toHaveURL(/\/marks/);
    await expectPageTitle(page, "Mark register");
  });

  test("§3.2 Bulk upload available", async ({ page }) => {
    await goRoute(page, ROUTES.dashboard);
    await goNav(page, "Bulk upload");
    await expect(page).toHaveURL(/\/upload/);
    await expectPageTitle(page, "Bulk upload");
  });

  test("§3.3 Pending uploads", async ({ page }) => {
    await goRoute(page, ROUTES.dashboard);
    await goNav(page, "Pending uploads");
    await expect(page).toHaveURL(/\/pending-uploads/);
    await expectPageTitle(page, "Pending");
    await expect(page.locator("main")).toContainText(/Still missing marks|awaiting your approval|Every assigned teacher/i);
    const trigger = page.locator("main .accordion-trigger").first();
    if (await trigger.count()) {
      await expect(trigger).toBeVisible();
      await trigger.click();
      await expect(page.locator("main").getByRole("link", { name: /Open register/i }).first()).toBeVisible();
    }
  });

  test("§3.4 Access requests", async ({ page }) => {
    await goRoute(page, ROUTES.dashboard);
    await goNav(page, "Access requests");
    await expect(page).toHaveURL(/\/late-entry/);
    await expectPageTitle(page, "Access request");
  });

  test("§3.6–§3.7 Consolidated lists & hall tickets", async ({ page }) => {
    await goRoute(page, ROUTES.dashboard);
    await goNav(page, "Consolidated lists");
    await expectPageTitle(page, "Consolidated");
    await goNav(page, "Hall tickets");
    await expectPageTitle(page, "Hall ticket");
  });

  test("§3.8 Audit log", async ({ page }) => {
    await goRoute(page, ROUTES.dashboard);
    await goNav(page, "Audit log");
    await expect(page).toHaveURL(/\/audit/);
    await expectPageTitle(page, "Audit");
  });

  test("§4 Leadership insights available", async ({ page }) => {
    for (const path of [ROUTES.analysisSchool, ROUTES.analysisDeep, ROUTES.analysisSubjects]) {
      await goRoute(page, path);
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.locator("main")).toBeVisible();
    }
  });

  test("§ HELP — only co-ordinator user manual", async ({ page }) => {
    await goRoute(page, ROUTES.dashboard);
    await goNav(page, "User manuals");
    await expect(page).toHaveURL(/\/help/);
    await expect(page.locator("main")).toContainText(/co-ordinator user manual|coordinator user manual/i);
    await expect(page.locator("main")).not.toContainText(/Principal user manual/i);
    await expect(page.locator("main")).not.toContainText(/Teacher user manual/i);
  });
});
