import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const authDir = path.join(__dirname, ".auth");
fs.mkdirSync(authDir, { recursive: true });

const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:5173";
const apiURL = process.env.E2E_API_URL || "http://127.0.0.1:4000";

/**
 * Full-application Playwright config.
 * Workflows mirror docs/user-manuals/{principal,coordinator,teacher}.md
 *
 * Auth setup logs in once per role and reuses storageState so we stay under
 * the API's sign-in rate limit (20 / 15 min).
 */
export default defineConfig({
  testDir: path.join(root, "e2e"),
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [
    ["list"],
    ["html", { outputFolder: path.join(root, "reports/playwright-html"), open: "never" }],
    ["json", { outputFile: path.join(root, "reports/playwright-report.json") }],
    ["junit", { outputFile: path.join(root, "reports/playwright-junit.xml") }],
  ],
  outputDir: path.join(root, "reports/playwright-artifacts"),
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.js/ },
    {
      name: "chromium",
      dependencies: ["setup"],
      testIgnore: /auth\.setup\.js/,
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
  webServer: [
    {
      command: "npm run dev",
      cwd: path.join(root, "server"),
      url: `${apiURL}/api/health`,
      reuseExistingServer: true,
      timeout: 120_000,
      env: {
        ...process.env,
        PORT: "4000",
        COOKIE_SECURE: "false",
        CLIENT_ORIGIN: "http://127.0.0.1:5173,http://localhost:5173",
        RATE_LIMIT_STORE: "memory",
      },
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 5173",
      cwd: path.join(root, "client"),
      url: baseURL,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
