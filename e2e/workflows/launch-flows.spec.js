import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { ACCOUNTS, formLogin, goRoute, ROUTES, signOut } from "../helpers/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authDir = path.join(__dirname, "../.auth");

test.describe("Launch critical flows", () => {
  test("login, replace a password, and sign in with the new one", async ({ page }) => {
    const account = ACCOUNTS.teacherMath;
    const current = "password123";
    const next = "password1234";
    let changed = false;
    try {
      await formLogin(page, account, current);
      await goRoute(page, ROUTES.profile);
      await replacePassword(page, current, next);
      changed = true;

      await signOut(page);
      await formLogin(page, account, next);
      await expect(page.getByRole("heading", { name: /Anita/ })).toBeVisible();
    } finally {
      if (!changed) return;
      await page.goto("/profile");
      if (page.url().includes("/login")) {
        await formLogin(page, account, next);
        await page.goto("/profile");
      }
      await replacePassword(page, next, current);
    }
  });

  test("platform home, schools, and pilots show an error instead of a spinner", async ({ browser }) => {
    const ctx = await browser.newContext({
      storageState: path.join(authDir, "admin.json"),
    });
    const page = await ctx.newPage();
    const fail = (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Server error" }),
      });
    await page.route("**/api/platform/overview", (route) => {
      if (route.request().method() === "GET") return fail(route);
      return route.continue();
    });
    await page.route("**/api/platform/schools**", (route) => {
      const pathName = new URL(route.request().url()).pathname;
      if (route.request().method() === "GET" && pathName === "/api/platform/schools") return fail(route);
      return route.continue();
    });
    await page.route("**/api/platform/pilot-requests**", (route) => {
      const pathName = new URL(route.request().url()).pathname;
      if (route.request().method() === "GET" && pathName === "/api/platform/pilot-requests") return fail(route);
      return route.continue();
    });

    await page.goto("/platform");
    await expect(page.locator("main").getByRole("alert")).toContainText("Server error");
    await expect(page.getByText("Loading platform")).toHaveCount(0);

    await page.goto("/platform/schools");
    await expect(page.locator("main").getByRole("alert")).toContainText("Server error");
    await expect(page.getByText("Loading schools")).toHaveCount(0);

    await page.goto("/platform/pilot-requests");
    await expect(page.locator("main").getByRole("alert")).toContainText("Server error");
    await expect(page.getByText("Loading pilot")).toHaveCount(0);
    await ctx.close();
  });

  test("teacher saves a draft, leadership approves it, and the official list downloads", async ({ browser }) => {
    test.setTimeout(180_000);
    const teacherCtx = await browser.newContext({
      storageState: path.join(authDir, "teacher-bio.json"),
    });
    const teacher = await teacherCtx.newPage();
    await openBiologyRegister(teacher);

    await expect(teacher.getByText("Past deadline")).toBeVisible();
    const lateEntry = teacher.getByRole("button", { name: /Request late entry/i });
    const waiting = teacher.getByText(/waiting for approval/i);
    if ((await lateEntry.count()) && !(await waiting.count())) {
      await lateEntry.first().click();
      await expect(waiting.first()).toBeVisible();
    }
    if (await waiting.count()) {
      const coordCtx = await browser.newContext({
        storageState: path.join(authDir, "coordinator.json"),
      });
      const coord = await coordCtx.newPage();
      await coord.goto("/exam-queue?tab=access");
      const accessTab = coord.getByRole("tab", { name: "Access requests" });
      await expect(accessTab).toHaveAttribute("aria-selected", "true");
      const row = coord
        .getByRole("row")
        .filter({ hasText: "Meera Iyer" })
        .filter({ hasText: "Biology" })
        .filter({ hasText: "9-A" });
      await row.getByRole("button", { name: /^Approve$/ }).click();
      await expect(coord.getByText(/Late entry approved/i)).toBeVisible();
      await coordCtx.close();
      await teacher.reload();
      await openBiologyRegister(teacher);
    }

    const theory = teacher.locator("main .divide-y > div input").first();
    if (await theory.isEnabled()) {
      await teacher.getByLabel("Rows").selectOption("50");
      const rows = teacher.locator("main .divide-y > div");
      await expect.poll(async () => rows.count()).toBeGreaterThan(25);
      const count = await rows.count();
      for (let i = 0; i < count; i++) {
        const input = rows.nth(i).locator("input").first();
        if (await input.isEnabled()) await input.fill("41");
      }
      await teacher.getByRole("button", { name: /Save progress/ }).click();
      await expect(teacher.getByText(/Saved \d+ marks? as draft/i)).toBeVisible();
      await teacher.getByRole("button", { name: /^Submit marks$/ }).click();
      await teacher.getByRole("alertdialog").getByRole("button", { name: "Submit marks" }).click();
      await expect(teacher.getByText(/Submitted \d+ mark/i)).toBeVisible();

      const leadCtx = await browser.newContext({
        storageState: path.join(authDir, "coordinator.json"),
      });
      const lead = await leadCtx.newPage();
      await lead.goto(teacher.url());
      await lead.getByRole("button", { name: /Approve Meera/ }).click();
      await lead.getByRole("alertdialog").getByRole("button", { name: "Approve submitted" }).click();
      await expect(lead.getByText(/Approved \d+ mark/i)).toBeVisible();
      await leadCtx.close();
    } else {
      await expect(teacher.getByText("40/40")).toBeVisible();
    }

    const principalCtx = await browser.newContext({
      storageState: path.join(authDir, "principal.json"),
    });
    const principal = await principalCtx.newPage();
    await principal.goto("/consolidated");
    await principal.locator("main").waitFor({ state: "visible" });
    const examSelect = principal.locator("main select.field-filter").filter({
      has: principal.locator("option", { hasText: "Final Exam · 2025-26" }),
    });
    await examSelect.selectOption({ label: "Final Exam · 2025-26" });
    await principal.getByRole("button", { name: /^9\b/ }).click();
    await principal.getByRole("button", { name: /^A\b/ }).click();
    const official = principal.getByRole("button", { name: "Official Excel" });
    await expect(official).toBeVisible();
    const downloadPromise = principal.waitForEvent("download");
    await official.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.xlsx$/i);
    await principalCtx.close();
    await teacherCtx.close();
  });
});

async function replacePassword(page, current, next) {
  const passwords = page.locator("form input[type='password']");
  await passwords.nth(0).fill(current);
  await passwords.nth(1).fill(next);
  await passwords.nth(2).fill(next);
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByText("Password updated.")).toBeVisible();
}

async function openBiologyRegister(page) {
  if (!page.url().includes("/marks")) await page.goto("/marks");
  await page.locator("main").waitFor({ state: "visible" });
  const onRegister = page.getByText(/9-A · Final Exam · 2025-26 · Biology/);
  const paper = page.getByRole("link", { name: /9-A Biology/ });
  await expect(onRegister.or(paper).first()).toBeVisible();
  if (!(await onRegister.count()) && (await paper.count())) await paper.first().click();
  await expect(onRegister).toBeVisible();
}
