import { test, expect } from "@playwright/test";
import { ACCOUNTS, demoLogin, goNav, expectPageTitle, openAnalysisChild, signOut } from "../helpers/auth.js";

/**
 * Exam co-ordinator user manual — full-app UI walkthrough
 * Source: docs/user-manuals/coordinator.md
 */
test.describe("Exam co-ordinator manual — complete application workflow", () => {
  test.beforeEach(async ({ page }) => {
    await demoLogin(page, ACCOUNTS.coordinator);
  });

  test.afterEach(async ({ page }) => {
    await signOut(page).catch(() => {});
  });

  test("§1 Sign in lands on Exam coordination desk", async ({ page }) => {
    await expect(
      page.getByText(/exam coord|coordination|pending|awaiting|upload/i).first()
    ).toBeVisible({ timeout: 20_000 });
  });

  test("§2.1 Records accessible", async ({ page }) => {
    await goNav(page, "Records");
    await expectPageTitle(page, "School records|Records");
  });

  test("§2.2 Staff — can manage teachers", async ({ page }) => {
    await goNav(page, "Staff");
    await expectPageTitle(page, "Staff");
    await expect(page.getByText(/Anita Sharma|Teacher/i).first()).toBeVisible({ timeout: 20_000 });
  });

  test("§2.3 Timetables", async ({ page }) => {
    await goNav(page, "Timetables");
    await expectPageTitle(page, "timetable");
  });

  test("§2.4 School profile — join code visible, not principal-only rotate required", async ({ page }) => {
    await goNav(page, "School profile");
    await expectPageTitle(page, "School profile");
    await expect(page.getByText(/join code|DEMO-JOIN/i).first()).toBeVisible();
  });

  test("§3.1 Mark register available (unlike principal)", async ({ page }) => {
    await goNav(page, "Mark register");
    await expectPageTitle(page, "Mark register");
  });

  test("§3.2 Bulk upload available", async ({ page }) => {
    await goNav(page, "Bulk upload");
    await expectPageTitle(page, "Bulk upload");
  });

  test("§3.3 Pending uploads", async ({ page }) => {
    await goNav(page, "Pending uploads");
    await expectPageTitle(page, "Pending");
  });

  test("§3.4 Access requests", async ({ page }) => {
    await goNav(page, "Access requests");
    await expectPageTitle(page, "Access request");
  });

  test("§3.6–§3.7 Consolidated lists & hall tickets", async ({ page }) => {
    await goNav(page, "Consolidated lists");
    await expectPageTitle(page, "Consolidated");
    await goNav(page, "Hall tickets");
    await expectPageTitle(page, "Hall ticket");
  });

  test("§3.8 Audit log", async ({ page }) => {
    await goNav(page, "Audit log");
    await expectPageTitle(page, "Audit");
  });

  test("§4 Leadership insights available", async ({ page }) => {
    for (const label of ["School overview", "Deep insights", "Subjects"]) {
      await openAnalysisChild(page, label);
      await expect(page).not.toHaveURL(/\/login/);
    }
  });

  test("§ HELP — only co-ordinator user manual", async ({ page }) => {
    await goNav(page, "User manuals");
    await expectPageTitle(page, "HELP|user manual");
    await expect(page.getByRole("heading", { name: /co-ordinator user manual|coordinator user manual/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Principal user manual/i })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /Teacher user manual/i })).toHaveCount(0);
  });
});
