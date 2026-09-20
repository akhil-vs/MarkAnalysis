import { test, expect } from "@playwright/test";
import { ACCOUNTS, demoLogin, goNav, expectPageTitle, openAnalysisChild, signOut } from "../helpers/auth.js";

/**
 * Principal user manual — full-app UI walkthrough
 * Source: docs/user-manuals/principal.md
 */
test.describe("Principal manual — complete application workflow", () => {
  test.beforeEach(async ({ page }) => {
    await demoLogin(page, ACCOUNTS.principal);
  });

  test.afterEach(async ({ page }) => {
    await signOut(page).catch(() => {});
  });

  test("§1 Sign in lands on Principal desk with exam selector", async ({ page }) => {
    await expect(page.getByText(/principal|good (morning|afternoon|evening)/i).first()).toBeVisible({
      timeout: 20_000,
    });
    // Exam selector shared with leadership
    await expect(page.locator("select, [role='combobox']").first()).toBeVisible();
  });

  test("§2.1 School profile — identity, join code, grading", async ({ page }) => {
    await goNav(page, "School profile");
    await expectPageTitle(page, "School profile");
    await expect(page.getByText(/join code|DEMO-JOIN|staff join/i).first()).toBeVisible();
    await expect(page.getByText(/pass percent|distinction|grade|working week|bell/i).first()).toBeVisible();
  });

  test("§2.2 Records — classes, subjects, students, exams tabs", async ({ page }) => {
    await goNav(page, "Records");
    await expectPageTitle(page, "School records|Records");
    for (const tab of ["Classes", "Subjects", "Students", "Exams"]) {
      const tabBtn = page.getByRole("button", { name: new RegExp(`^${tab}$`, "i") }).or(
        page.getByRole("tab", { name: new RegExp(`^${tab}$`, "i") })
      );
      if (await tabBtn.count()) {
        await tabBtn.first().click();
      } else {
        await page.getByText(tab, { exact: true }).first().click();
      }
      await expect(page.locator("main, .flex-1").first()).toBeVisible();
    }
  });

  test("§2.3 Staff — active teachers and co-ordinators listed", async ({ page }) => {
    await goNav(page, "Staff");
    await expectPageTitle(page, "Staff");
    await expect(page.getByText(/Anita Sharma|Meera Iyer|Sanjay Menon/i).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test("§2.4 Timetables — teachers / daily board / find free", async ({ page }) => {
    await goNav(page, "Timetables");
    await expectPageTitle(page, "timetable");
    await expect(page.getByText(/teacher|daily|weekly|find free/i).first()).toBeVisible();
  });

  test("§3.1 Pending uploads — chase & approve queue", async ({ page }) => {
    await goNav(page, "Pending uploads");
    await expectPageTitle(page, "Pending");
    await expect(page.getByText(/pending|awaiting|upload|approval|teacher/i).first()).toBeVisible();
  });

  test("§3.2 Access requests inbox", async ({ page }) => {
    await goNav(page, "Access requests");
    await expectPageTitle(page, "Access request");
  });

  test("§3.4 Consolidated lists", async ({ page }) => {
    await goNav(page, "Consolidated lists");
    await expectPageTitle(page, "Consolidated");
  });

  test("§3.5 Hall tickets", async ({ page }) => {
    await goNav(page, "Hall tickets");
    await expectPageTitle(page, "Hall ticket");
  });

  test("§3.6 Audit log", async ({ page }) => {
    await goNav(page, "Audit log");
    await expectPageTitle(page, "Audit");
  });

  test("§4 Insights suite — school / classes / subjects / teachers / students / compare / deep", async ({
    page,
  }) => {
    const children = [
      "School overview",
      "Classes",
      "Subjects",
      "Teachers",
      "Students",
      "Compare",
      "Deep insights",
    ];
    for (const label of children) {
      await openAnalysisChild(page, label);
      await expect(page.locator("main, .flex-1").first()).toBeVisible();
      // Page should not bounce to login
      await expect(page).not.toHaveURL(/\/login/);
    }
  });

  test("§10 Principal has no Mark register / Bulk upload in sidebar", async ({ page }) => {
    const marks = page.locator("nav a").filter({ hasText: /^Mark register$/ });
    const upload = page.locator("nav a").filter({ hasText: /^Bulk upload$/ });
    await expect(marks).toHaveCount(0);
    await expect(upload).toHaveCount(0);
  });

  test("§ HELP — only Principal user manual PDF", async ({ page }) => {
    await goNav(page, "User manuals");
    await expectPageTitle(page, "HELP|user manual");
    await expect(page.getByRole("heading", { name: /Principal user manual/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Teacher user manual/i })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /co-ordinator user manual|coordinator user manual/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Open PDF|Download/i }).first()).toBeVisible();
  });

  test("§8 Profile — account security page", async ({ page }) => {
    await goNav(page, "Profile");
    await expectPageTitle(page, "profile");
    await expect(page.getByText(/password|MFA|authenticator/i).first()).toBeVisible();
  });
});
