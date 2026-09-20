import { test as setup, expect } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ACCOUNTS } from "./helpers/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authDir = path.join(__dirname, ".auth");

async function loginAndSave(page, account, fileName) {
  await page.goto("/login");
  await page.getByRole("heading", { name: /sign in/i }).waitFor({ state: "visible" });
  await page
    .getByRole("button")
    .filter({ has: page.getByText(account.name, { exact: true }) })
    .first()
    .click();

  if (account.role === "Platform admin") {
    await page.waitForURL(/\/platform/, { timeout: 45_000 });
  } else {
    await page.waitForURL((url) => url.pathname === "/" || url.pathname === "", {
      timeout: 45_000,
    });
  }
  await page.locator("main").waitFor({ state: "visible", timeout: 45_000 });
  await page.context().storageState({ path: path.join(authDir, fileName) });
}

setup("authenticate principal", async ({ page }) => {
  await loginAndSave(page, ACCOUNTS.principal, "principal.json");
});

setup("authenticate coordinator", async ({ page }) => {
  await loginAndSave(page, ACCOUNTS.coordinator, "coordinator.json");
});

setup("authenticate teacher math", async ({ page }) => {
  await loginAndSave(page, ACCOUNTS.teacherMath, "teacher-math.json");
});

setup("authenticate teacher bio", async ({ page }) => {
  await loginAndSave(page, ACCOUNTS.teacherBio, "teacher-bio.json");
});

setup("authenticate platform admin", async ({ page }) => {
  await loginAndSave(page, ACCOUNTS.admin, "admin.json");
});
