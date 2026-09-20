import { test, expect } from "@playwright/test";
import {
  ACCOUNTS,
  ROUTES,
  demoLogin,
  goNav,
  goRoute,
  expectPageTitle,
  expectNavLink,
  signOut,
} from "../helpers/auth.js";

/**
 * Teacher user manual — full-app UI walkthrough
 * Source: docs/user-manuals/teacher.md
 */
test.describe("Teacher manual — complete application workflow", () => {
  test.describe("Class teacher (Anita Sharma)", () => {
    test.beforeEach(async ({ page }) => {
      await demoLogin(page, ACCOUNTS.teacherMath);
    });

    test.afterEach(async ({ page }) => {
      await signOut(page).catch(() => {});
    });

    test("§1–§2 Teacher desk with notices / metrics", async ({ page }) => {
      await expect(page.locator("main")).toContainText(/teacher|Anita|paper|register|notice|class/i);
    });

    test("§3.1 Mark register", async ({ page }) => {
      await goNav(page, "Mark register");
      await expect(page).toHaveURL(/\/marks/);
      await expectPageTitle(page, "Mark register");
      await expect(page.locator("main")).toContainText(/exam|class|subject|AB|EX|WH|save|submit|marks/i);
    });

    test("§3.2 Bulk upload", async ({ page }) => {
      await goNav(page, "Bulk upload");
      await expect(page).toHaveURL(/\/upload/);
      await expectPageTitle(page, "Bulk upload");
    });

    test("§4 Consolidated lists (class teacher)", async ({ page }) => {
      await goNav(page, "Consolidated lists");
      await expect(page).toHaveURL(/\/consolidated/);
      await expectPageTitle(page, "Consolidated");
    });

    test("§5 Hall tickets", async ({ page }) => {
      await goNav(page, "Hall tickets");
      await expect(page).toHaveURL(/\/hall-tickets/);
      await expectPageTitle(page, "Hall ticket");
    });

    test("§6 Insights — Classes & Students; no leadership hubs", async ({ page }) => {
      await goRoute(page, ROUTES.analysisClasses);
      await expect(page).not.toHaveURL(/\/login/);
      await goRoute(page, ROUTES.analysisStudents);
      await expect(page).not.toHaveURL(/\/login/);

      await expectNavLink(page, "School overview", { visible: false });
      await expectNavLink(page, "Deep insights", { visible: false });
    });

    test("Teacher cannot open Pending uploads / Staff / Records / Audit", async ({ page }) => {
      await expectNavLink(page, "Pending uploads", { visible: false });
      await expectNavLink(page, "Staff", { visible: false });
      await expectNavLink(page, "Records", { visible: false });
      await expectNavLink(page, "Audit log", { visible: false });
    });

    test("§ HELP — only Teacher user manual", async ({ page }) => {
      await goNav(page, "User manuals");
      await expect(page).toHaveURL(/\/help/);
      await expect(page.locator("main")).toContainText(/Teacher user manual/i);
      await expect(page.locator("main")).not.toContainText(/Principal user manual/i);
      const pdf = page.getByRole("link", { name: /Open PDF/i }).first();
      await expect(pdf).toBeVisible();
      await expect(pdf).toHaveAttribute("href", /teacher-user-manual\.pdf/);
    });

    test("§8 Profile", async ({ page }) => {
      await goNav(page, "Profile");
      await expect(page).toHaveURL(/\/profile/);
      await expectPageTitle(page, "profile");
    });
  });

  test.describe("Subject teacher (Meera Iyer · Biology)", () => {
    test.beforeEach(async ({ page }) => {
      await demoLogin(page, ACCOUNTS.teacherBio);
    });

    test.afterEach(async ({ page }) => {
      await signOut(page).catch(() => {});
    });

    test("§2 Desk loads for biology teacher", async ({ page }) => {
      await expect(page.locator("main")).toContainText(/Meera|Biology|teacher|paper|register/i);
    });

    test("§3 Mark register opens for assigned papers", async ({ page }) => {
      await goNav(page, "Mark register");
      await expect(page).toHaveURL(/\/marks/);
      await expectPageTitle(page, "Mark register");
    });
  });
});
