import bcrypt from "bcryptjs";

export const DEFAULT_PLATFORM_ADMIN_EMAIL = "admin@platform.edu";
export const DEFAULT_PLATFORM_ADMIN_PASSWORD = "password123";
export const DEFAULT_PLATFORM_ADMIN_SCHOOL_ID = "PLT-A01";

export function platformAdminConfig(env = process.env) {
  const email = String(env.PLATFORM_ADMIN_EMAIL || DEFAULT_PLATFORM_ADMIN_EMAIL)
    .trim()
    .toLowerCase();
  return {
    email,
    password: env.PLATFORM_ADMIN_PASSWORD || DEFAULT_PLATFORM_ADMIN_PASSWORD,
    schoolId: env.PLATFORM_ADMIN_SCHOOL_ID || DEFAULT_PLATFORM_ADMIN_SCHOOL_ID,
    /** When true, or when PLATFORM_ADMIN_PASSWORD is explicitly set, refresh the hash. */
    resetPassword:
      env.RESET_PLATFORM_ADMIN_PASSWORD === "true" ||
      Boolean(env.PLATFORM_ADMIN_PASSWORD),
    enabled: env.ENSURE_PLATFORM_ADMIN !== "false",
  };
}

/**
 * Ensure the canonical platform admin row exists (tenantId null).
 * Used by seed and by auth bootstrap so production DBs seeded before
 * PLATFORM_ADMIN still accept admin@platform.edu / password123.
 *
 * If the row exists but the password no longer matches the configured
 * seed/env password, refresh the hash unless PLATFORM_ADMIN_PASSWORD_LOCKED=true.
 */
export async function ensurePlatformAdmin(db, env = process.env) {
  const cfg = platformAdminConfig(env);
  if (!cfg.enabled) {
    return { skipped: true, reason: "disabled", user: null };
  }

  const existing = await db.user.findUnique({ where: { email: cfg.email } });
  if (existing) {
    if (existing.role !== "PLATFORM_ADMIN") {
      console.warn(
        `ensurePlatformAdmin: ${cfg.email} exists with role ${existing.role}; leaving unchanged`
      );
      return { skipped: true, reason: "email-taken", user: existing };
    }

    const data = {};
    if (existing.status !== "ACTIVE") data.status = "ACTIVE";
    if (existing.mustChangePassword) data.mustChangePassword = false;
    if (existing.tenantId != null) data.tenantId = null;

    const locked = env.PLATFORM_ADMIN_PASSWORD_LOCKED === "true";
    if (cfg.resetPassword) {
      data.passwordHash = await bcrypt.hash(cfg.password, 10);
    } else if (!locked) {
      const matches = await bcrypt.compare(cfg.password, existing.passwordHash);
      if (!matches) {
        data.passwordHash = await bcrypt.hash(cfg.password, 10);
      }
    }

    if (Object.keys(data).length === 0) {
      return { created: false, updated: false, skipped: false, user: existing };
    }

    const user = await db.user.update({ where: { id: existing.id }, data });
    return { created: false, updated: true, skipped: false, user };
  }

  const passwordHash = await bcrypt.hash(cfg.password, 10);
  const user = await db.user.create({
    data: {
      name: "Platform Admin",
      email: cfg.email,
      schoolId: cfg.schoolId,
      passwordHash,
      role: "PLATFORM_ADMIN",
      status: "ACTIVE",
      mustChangePassword: false,
      tenantId: null,
    },
  });
  return { created: true, updated: false, skipped: false, user };
}
