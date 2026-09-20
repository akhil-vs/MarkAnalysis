import { test, expect } from "@playwright/test";
import { ACCOUNTS, demoLogin, goNav, expectPageTitle, openAnalysisChild, signOut } from "../helpers/auth.js";

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
      await expect(page.getByText(/teacher|desk|Anita|paper|register|notice/i).first()).toBeVisible({
        timeout: 20_000,
      });
    });

    test("§3.1 Mark register", async ({ page }) => {
      await goNav(page, "Mark register");
      await expectPageTitle(page, "Mark register");
      await expect(page.getByText(/exam|class|subject|AB|EX|WH|save|submit/i).first()).toBeVisible();
    });

    test("§3.2 Bulk upload", async ({ page }) => {
      await goNav(page, "Bulk upload");
      await expectPageTitle(page, "Bulk upload");
    });

    test("§4 Consolidated lists (class teacher)", async ({ page }) => {
      await goNav(page, "Consolidated lists");
      await expectPageTitle(page, "Consolidated");
    });

    test("§5 Hall tickets", async ({ page }) => {
      await goNav(page, "Hall tickets");
      await expectPageTitle(page, "Hall ticket");
    });

    test("§6 Insights — Classes & Students only (no school/subjects hub)", async ({ page }) => {
      await openAnalysisChild(page, "Classes");
      await expect(page).not.toHaveURL(/\/login/);
      await openAnalysisChild(page, "Students");
      await expect(page).not.toHaveURL(/\/login/);

      // Leadership-only items must not appear in teacher sidebar
      await expect(page.locator("nav a").filter({ hasText: /^School overview$/ })).toHaveCount(0);
      await expect(page.locator("nav a").filter({ hasText: /^Subjects$/ })).toHaveCount(0);
      await expect(page.locator("nav a").filter({ hasText: /^Deep insights$/ })).toHaveCount(0);
    });

    test("Teacher cannot open Pending uploads / Staff / Records", async ({ page }) => {
      await expect(page.locator("nav a").filter({ hasText: /^Pending uploads$/ })).toHaveCount(0);
      await expect(page.locator("nav a").filter({ hasText: /^Staff$/ })).toHaveCount(0);
      await expect(page.locator("nav a").filter({ hasText: /^Records$/ })).toHaveCount(0);
      await expect(page.locator("nav a").filter({ hasText: /^Audit log$/ })).toHaveCount(0);
    });

    test("§ HELP — only Teacher user manual", async ({ page }) => {
      await goNav(page, "User manuals");
      await expectPageTitle(page, "HELP|user manual");
      await expect(page.getByRole("heading", { name: /Teacher user manual/i })).toBeVisible();
      await expect(page.getByRole("heading", { name: /Principal user manual/i })).toHaveCount(0);
      const pdf = page.getByRole("link", { name: /Open PDF/i }).first();
      await expect(pdf).toBeVisible();
      await expect(pdf).toHaveAttribute("href", /teacher-user-manual\.pdf/);
    });

    test("§8 Profile", async ({ page }) => {
      await goNav(page, "Profile");
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
      await expect(page.getByText(/Meera|Biology|teacher|paper|register/i).first()).toBeVisible({
        timeout: 20_000,
      });
    });

    test("§3 Mark register opens for assigned papers", async ({ page }) => {
      await goNav(page, "Mark register");
      await expectPageTitle(page, "Mark register");
    });
  });
});
