import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { ROUTES, goNav, goRoute, expectPageTitle, expectNavLink } from "../helpers/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authFile = path.join(__dirname, "../.auth/principal.json");

/**
 * Principal user manual — full-app UI walkthrough
 * Source: docs/user-manuals/principal.md
 */
test.describe("Principal manual — complete application workflow", () => {
  test.use({ storageState: authFile });

  test("§1 Sign in lands on Principal desk with exam selector", async ({ page }) => {
    await goRoute(page, ROUTES.dashboard);
    await expect(page.locator("main")).toContainText(/principal|good (morning|afternoon|evening)|school/i);
    await expect(page.locator("main select, main [role='combobox']").first()).toBeVisible();
  });

  test("§2.1 School profile — identity, join code, grading", async ({ page }) => {
    await goRoute(page, ROUTES.dashboard);
    await goNav(page, "School profile");
    await expect(page).toHaveURL(/\/school/);
    await expectPageTitle(page, "School profile");
    await page.locator("main").getByRole("tab", { name: /Modules & Security/i }).click();
    await expect(page.locator("main")).toContainText(/join code|DEMO-JOIN/i);
  });

  test("§2.2 Records — classes, subjects, students, exams tabs", async ({ page }) => {
    await goRoute(page, ROUTES.dashboard);
    await goNav(page, "Records");
    await expect(page).toHaveURL(/\/manage/);
    await expectPageTitle(page, "School records");
    for (const tab of ["Classes", "Subjects", "Students", "Exams"]) {
      await page.locator("main").getByRole("button", { name: new RegExp(`^${tab}$`, "i") }).click();
      await expect(page.locator("main")).toBeVisible();
    }
  });

  test("§2.3 Staff — active teachers and co-ordinators listed", async ({ page }) => {
    await goRoute(page, ROUTES.dashboard);
    await goNav(page, "Staff");
    await expect(page).toHaveURL(/\/users/);
    await expectPageTitle(page, "Staff");
    await expect(page.locator("main")).toContainText(/Anita Sharma|Meera Iyer|Sanjay Menon/i);
  });

  test("§2.4 Timetables — teachers accordion opens timetable, leave, hours", async ({ page }) => {
    await goRoute(page, ROUTES.dashboard);
    await goNav(page, "Timetables");
    await expect(page).toHaveURL(/\/timetables/);
    await expectPageTitle(page, "timetable");
    await page.locator("main").getByRole("button", { name: /^Teachers$/i }).click();
    await expect(page.locator("main").getByLabel("Filter by class")).toBeVisible();
    await expect(page.locator("main").getByLabel("Filter by subject")).toBeVisible();
    const trigger = page.locator("main .accordion-trigger").first();
    await expect(trigger).toBeVisible();
    await trigger.click();
    await expect(page.locator("main").getByRole("button", { name: /^Open timetable$/i })).toBeVisible();
    await expect(page.locator("main").getByRole("button", { name: /^Put on leave$/i })).toBeVisible();
    await expect(page.locator("main").getByRole("button", { name: /^Hrs history$/i })).toBeVisible();

    await page.locator("main").getByRole("button", { name: /^Open timetable$/i }).click();
    await expect(page.locator("main")).toContainText(/Weekly timetable|Open full page/i);

    await page.locator("main").getByRole("button", { name: /^Hrs history$/i }).click();
    await expect(page.locator("main").getByRole("button", { name: /^Previous week$/i })).toBeVisible();
    await expect(page.locator("main").getByRole("button", { name: /^Next week$/i })).toBeVisible();
    await expect(page.locator("main").getByLabel(/^From$/i)).toBeVisible();
    await expect(page.locator("main").getByLabel(/^To$/i)).toBeVisible();
    await expect(page.locator("main").getByRole("button", { name: /^Show range$/i })).toBeVisible();
    await expect(page.locator("main")).toContainText(/own/i);
    await expect(page.locator("main")).toContainText(/extra/i);

    await page.locator("main").getByRole("button", { name: /^Put on leave$/i }).click();
    await expect(page.locator("main").getByRole("button", { name: /Save leave/i })).toBeVisible();
  });

  test("§3.1 Pending uploads — chase & approve queue", async ({ page }) => {
    await goRoute(page, ROUTES.dashboard);
    await goNav(page, "Pending uploads");
    await expect(page).toHaveURL(/\/pending-uploads/);
    await expectPageTitle(page, "Pending");
  });

  test("§3.2 Access requests inbox", async ({ page }) => {
    await goRoute(page, ROUTES.dashboard);
    await goNav(page, "Access requests");
    await expect(page).toHaveURL(/\/late-entry/);
    await expectPageTitle(page, "Access request");
  });

  test("§3.4 Consolidated lists", async ({ page }) => {
    await goRoute(page, ROUTES.dashboard);
    await goNav(page, "Consolidated lists");
    await expect(page).toHaveURL(/\/consolidated/);
    await expectPageTitle(page, "Consolidated");
  });

  test("§3.5 Hall tickets", async ({ page }) => {
    await goRoute(page, ROUTES.dashboard);
    await goNav(page, "Hall tickets");
    await expect(page).toHaveURL(/\/hall-tickets/);
    await expectPageTitle(page, "Hall ticket");
  });

  test("§3.6 Audit log", async ({ page }) => {
    await goRoute(page, ROUTES.dashboard);
    await goNav(page, "Audit log");
    await expect(page).toHaveURL(/\/audit/);
    await expectPageTitle(page, "Audit");
  });

  test("§4 Insights suite — school / classes / subjects / teachers / students / compare / deep", async ({
    page,
  }) => {
    const routes = [
      ROUTES.analysisSchool,
      ROUTES.analysisClasses,
      ROUTES.analysisSubjects,
      ROUTES.analysisTeachers,
      ROUTES.analysisStudents,
      ROUTES.analysisCompare,
      ROUTES.analysisDeep,
    ];
    for (const path of routes) {
      await goRoute(page, path);
      await expect(page).toHaveURL(new RegExp(path.replace(/\//g, "\\/")));
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.locator("main")).toBeVisible();
    }
  });

  test("§10 Principal has no Mark register / Bulk upload in sidebar", async ({ page }) => {
    await goRoute(page, ROUTES.dashboard);
    await expectNavLink(page, "Mark register", { visible: false });
    await expectNavLink(page, "Bulk upload", { visible: false });
  });

  test("§ HELP — only Principal user manual PDF", async ({ page }) => {
    await goRoute(page, ROUTES.dashboard);
    await goNav(page, "User manuals");
    await expect(page).toHaveURL(/\/help/);
    await expectPageTitle(page, "HELP|user manual");
    await expect(page.locator("main")).toContainText(/Principal user manual/i);
    await expect(page.locator("main")).not.toContainText(/Teacher user manual/i);
    await expect(page.getByRole("link", { name: /Open PDF|Download/i }).first()).toBeVisible();
  });

  test("§8 Profile — account security page", async ({ page }) => {
    await goRoute(page, ROUTES.dashboard);
    await goNav(page, "Profile");
    await expect(page).toHaveURL(/\/profile/);
    await expectPageTitle(page, "profile");
    await expect(page.locator("main")).toContainText(/password|MFA|authenticator/i);
  });
});
