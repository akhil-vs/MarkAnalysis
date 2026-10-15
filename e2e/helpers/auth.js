import { expect } from "@playwright/test";

/** Shared seed accounts used by E2E auth setup. */
export const ACCOUNTS = {
  principal: {
    name: "Dr. Kavita Rao",
    email: "principal@school.edu",
    role: "Principal",
  },
  coordinator: {
    name: "Sanjay Menon",
    email: "coordinator@school.edu",
    role: "Exam Coordinator",
  },
  teacherMath: {
    name: "Anita Sharma",
    email: "anita.sharma@school.edu",
    role: "Teacher · Mathematics",
  },
  teacherBio: {
    name: "Meera Iyer",
    email: "meera.iyer@school.edu",
    role: "Teacher · Biology",
  },
  admin: {
    name: "Platform Admin",
    email: "admin@platform.edu",
    role: "Platform admin",
  },
};

/** Canonical SPA routes from client/src/lib/nav.js */
export const ROUTES = {
  dashboard: "/",
  marks: "/marks",
  upload: "/upload",
  pendingUploads: "/exam-queue?tab=missing",
  examQueue: "/exam-queue",
  examQueueMissing: "/exam-queue?tab=missing",
  examQueueSubmitted: "/exam-queue?tab=submitted",
  examQueueAccess: "/exam-queue?tab=access",
  accessRequests: "/exam-queue?tab=access",
  approvals: "/exam-queue?tab=submitted",
  consolidated: "/consolidated",
  hallTickets: "/hall-tickets",
  studentPhotos: "/student-photos",
  audit: "/audit",
  analysis: "/analysis",
  analysisSchool: "/analysis/school",
  analysisClasses: "/analysis/classes",
  analysisSubjects: "/analysis/subjects",
  analysisTeachers: "/analysis/teachers",
  analysisStudents: "/analysis/students",
  analysisCompare: "/analysis/compare",
  analysisDeep: "/analysis/deep",
  staff: "/users",
  records: "/manage",
  timetables: "/timetables",
  schoolProfile: "/school",
  boardOps: "/board",
  cpd: "/cpd",
  help: "/help",
  profile: "/profile",
  platform: "/platform",
};

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Sign in with email + password on /login (seed password is password123).
 */
export async function formLogin(page, account, password = "password123") {
  await page.goto("/login");
  await page.getByRole("heading", { name: /sign in/i }).waitFor({ state: "visible" });
  await page.locator('input[type="email"]').fill(account.email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  if (account.role === "Platform admin") {
    await page.waitForURL(/\/platform/);
  } else {
    await page.waitForURL((url) => url.pathname === "/" || url.pathname === "");
  }
  await page.locator("main").waitFor({ state: "visible" });
}

/** @deprecated Use formLogin — one-click demo accounts were removed from /login. */
export async function demoLogin(page, account) {
  return formLogin(page, account);
}

export async function signOut(page) {
  const logout = page.getByRole("button", { name: /^Sign out$/i });
  if (await logout.count()) {
    await logout.first().click();
    await page.waitForURL(/\/login/);
    return;
  }
  await page.evaluate(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {
      /* ignore */
    }
  });
  await page.goto("/login");
}

/** Click a sidebar link by visible label (tolerates badge suffixes like "Mark progress 0"). */
export async function goNav(page, label) {
  const link = page.getByRole("navigation").getByRole("link", {
    name: new RegExp(`^${escapeRegExp(label)}(\\s+\\d+)?$`, "i"),
  });
  await link.first().click();
  await page.locator("main").waitFor({ state: "visible" });
}

/** Navigate by SPA path and wait for main content. */
export async function goRoute(page, path) {
  await page.goto(path);
  await page.locator("main").waitFor({ state: "visible" });
}

/**
 * Assert the page h1 (PageHeader) matches. Help hint text is part of the accessible name,
 * so we match against innerText / substring regex.
 */
export async function expectPageTitle(page, pattern) {
  const heading = page.locator("main h1").first();
  await heading.waitFor({ state: "visible", timeout: 20_000 });
  const re = typeof pattern === "string" ? new RegExp(pattern, "i") : pattern;
  await expect.poll(async () => (await heading.innerText()).replace(/\s+/g, " ")).toMatch(re);
}

export async function openAnalysisChild(page, label, route) {
  if (route) {
    await goRoute(page, route);
    return;
  }
  const side = page.getByRole("navigation").getByRole("link", {
    name: new RegExp(`^${escapeRegExp(label)}$`, "i"),
  });
  if (await side.count()) {
    await side.first().click();
  } else {
    await goRoute(page, ROUTES.analysis);
    await page.locator("main").getByRole("link", { name: new RegExp(label, "i") }).first().click();
  }
  await page.locator("main").waitFor({ state: "visible" });
}

/** Assert a sidebar link is present or absent. */
export async function expectNavLink(page, label, { visible = true } = {}) {
  const link = page.getByRole("navigation").getByRole("link", {
    name: new RegExp(`^${escapeRegExp(label)}(\\s+\\d+)?$`, "i"),
  });
  if (visible) await expect(link.first()).toBeVisible();
  else await expect(link).toHaveCount(0);
}
