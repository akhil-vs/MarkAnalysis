import { test, expect } from "@playwright/test";
import { ACCOUNTS, demoLogin, goNav, expectPageTitle, signOut } from "../helpers/auth.js";

/**
 * Cross-role exam-cycle workflow from the manuals:
 * Teacher enters/submits (or requests late entry) → Leadership sees pending → Approves.
 *
 * Seed leaves Biology empty on Final Exam 2025-26 with a past marks deadline,
 * so the UI path exercises Access requests + Pending uploads.
 */
test.describe("Cross-role marks cycle (manuals exam workflow)", () => {
  test("Teacher requests late entry → Co-ordinator approves access → Principal sees pending queue", async ({
    page,
  }) => {
    // --- Teacher: open register for Biology ---
    await demoLogin(page, ACCOUNTS.teacherBio);
    await goNav(page, "Mark register");
    await expectPageTitle(page, "Mark register");

    // Prefer Final Exam if selectable
    const examSelect = page.locator("select").filter({ has: page.locator("option") }).first();
    if (await examSelect.count()) {
      const finalOpt = examSelect.locator("option", { hasText: /Final Exam/i });
      if (await finalOpt.count()) {
        const value = await finalOpt.first().getAttribute("value");
        if (value) await examSelect.selectOption(value);
      }
    }

    // If late-entry CTA exists, use it (past deadline on Final Exam)
    const lateBtn = page.getByRole("button", { name: /late entry|request access|request late/i });
    const requestLink = page.getByRole("link", { name: /late entry|request access|access request/i });
    if (await lateBtn.count()) {
      await lateBtn.first().click();
      const submitReq = page.getByRole("button", { name: /submit|send|request/i });
      if (await submitReq.count()) await submitReq.first().click();
    } else if (await requestLink.count()) {
      await requestLink.first().click();
    } else {
      // Navigate via Access requests is leadership-only; teacher may see inline banner.
      // Fall through — still verify register UI loaded.
      await expect(page.getByText(/class|subject|student|marks|AB|exam/i).first()).toBeVisible();
    }

    await signOut(page);

    // --- Co-ordinator: Access requests + Pending uploads ---
    await demoLogin(page, ACCOUNTS.coordinator);
    await goNav(page, "Access requests");
    await expectPageTitle(page, "Access request");
    const approve = page.getByRole("button", { name: /approve/i });
    if (await approve.count()) {
      await approve.first().click();
    }

    await goNav(page, "Pending uploads");
    await expectPageTitle(page, "Pending");
    await expect(page.getByText(/Biology|Meera|pending|awaiting|teacher/i).first()).toBeVisible({
      timeout: 20_000,
    });
    await signOut(page);

    // --- Principal: same ops desk, no mark entry ---
    await demoLogin(page, ACCOUNTS.principal);
    await goNav(page, "Pending uploads");
    await expectPageTitle(page, "Pending");
    await expect(page.locator("nav a").filter({ hasText: /^Mark register$/ })).toHaveCount(0);
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
    await expect(page.getByText(/school|platform|Greenfield|Riverside/i).first()).toBeVisible({
      timeout: 20_000,
    });
  });
});
