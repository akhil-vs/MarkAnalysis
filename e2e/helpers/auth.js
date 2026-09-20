/** Shared demo accounts from the seed / login page. */
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

/**
 * Sign in via the one-click demo button on /login (Vite DEV enables demos).
 */
export async function demoLogin(page, account) {
  await page.goto("/login");
  await page.getByRole("heading", { name: /sign in/i }).waitFor({ state: "visible" });
  const btn = page.locator("button").filter({
    has: page.getByText(account.name, { exact: true }),
  });
  await btn.first().click();
  // Principals / teachers / coordinators land on desk; platform admin on /platform
  if (account.role === "Platform admin") {
    await page.waitForURL(/\/platform/);
  } else {
    await page.waitForURL((url) => url.pathname === "/" || url.pathname === "");
  }
}

export async function signOut(page) {
  const logout = page.getByRole("button", { name: /sign out|log out/i });
  if (await logout.count()) {
    await logout.first().click();
    await page.waitForURL(/\/login/);
    return;
  }
  // Fallback: clear session via API + reload
  await page.evaluate(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {
      /* ignore */
    }
  });
  await page.goto("/login");
}

/** Click a sidebar link by visible label. */
export async function goNav(page, label) {
  const link = page.locator("nav a, nav button").filter({ hasText: new RegExp(`^${escapeRegExp(label)}$`) });
  if (await link.count()) {
    await link.first().click();
    return;
  }
  // Expandable parent (e.g. Marks analysis)
  const parent = page.locator("nav").getByText(label, { exact: true });
  await parent.first().click();
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Assert the page header / main title contains text. */
export async function expectPageTitle(page, text) {
  const main = page.locator("main, [role='main'], .flex-1").first();
  await main.getByRole("heading", { name: new RegExp(text, "i") }).first().waitFor({
    state: "visible",
    timeout: 20_000,
  });
}

/** Open Marks analysis child route via hub or sidebar. */
export async function openAnalysisChild(page, label) {
  // Try sidebar child first
  const side = page.locator("nav a").filter({ hasText: new RegExp(`^${escapeRegExp(label)}$`) });
  if (await side.count()) {
    await side.first().click();
    return;
  }
  await goNav(page, "Marks analysis");
  await page.getByRole("link", { name: new RegExp(label, "i") }).first().click();
}
