import { test as setup } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ACCOUNTS, formLogin } from "./helpers/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authDir = path.join(__dirname, ".auth");

async function loginAndSave(page, account, fileName) {
  await formLogin(page, account);
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
