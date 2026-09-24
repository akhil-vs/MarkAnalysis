import { hashPassword, verifyPassword } from "./password.js";

export const DEFAULT_PLATFORM_ADMIN_EMAIL = "admin@platform.edu";
export const DEFAULT_PLATFORM_ADMIN_PASSWORD = "password123";
export const DEFAULT_PLATFORM_ADMIN_SCHOOL_ID = "PLT-A01";

export function isProductionLike(env = process.env) {
  return (
    env.NODE_ENV === "production" ||
    Boolean(env.VERCEL) ||
    env.REQUIRE_SECURE_AUTH === "true"
  );
}

export function platformAdminConfig(env = process.env) {
  const email = String(env.PLATFORM_ADMIN_EMAIL || DEFAULT_PLATFORM_ADMIN_EMAIL)
    .trim()
    .toLowerCase();
  const explicitPassword = env.PLATFORM_ADMIN_PASSWORD;
  const usingDefaultPassword =
    !explicitPassword || explicitPassword === DEFAULT_PLATFORM_ADMIN_PASSWORD;
  return {
    email,
    password: explicitPassword || DEFAULT_PLATFORM_ADMIN_PASSWORD,
    schoolId: env.PLATFORM_ADMIN_SCHOOL_ID || DEFAULT_PLATFORM_ADMIN_SCHOOL_ID,
    /** Only an explicit reset flag rewrites an existing admin password. */
    resetPassword: env.RESET_PLATFORM_ADMIN_PASSWORD === "true",
    enabled: env.ENSURE_PLATFORM_ADMIN !== "false",
    productionLike: isProductionLike(env),
    usingDefaultPassword,
    allowDefaultPassword: env.ALLOW_DEFAULT_PLATFORM_ADMIN === "true",
    locked: env.PLATFORM_ADMIN_PASSWORD_LOCKED === "true",
  };
}

function refuseDefaultPassword(cfg) {
  return cfg.productionLike && cfg.usingDefaultPassword && !cfg.allowDefaultPassword;
}

/**
 * Ensure the canonical platform admin row exists (tenantId null).
 *
 * Local seed / development may still create admin@platform.edu / password123.
 * Production-like environments (NODE_ENV=production, Vercel, or
 * REQUIRE_SECURE_AUTH) refuse that documented default unless
 * ALLOW_DEFAULT_PLATFORM_ADMIN=true. Set PLATFORM_ADMIN_PASSWORD to provision
 * or rotate the account; set PLATFORM_ADMIN_PASSWORD_LOCKED=true afterwards.
 */
export async function ensurePlatformAdmin(db, env = process.env) {
  const cfg = platformAdminConfig(env);
  if (!cfg.enabled) {
    return { skipped: true, reason: "disabled", user: null };
  }

  const blockDefault = refuseDefaultPassword(cfg);
  const existing = await db.user.findUnique({ where: { email: cfg.email } });
  if (existing) {
    if (existing.role !== "PLATFORM_ADMIN") {
      console.warn(
        `ensurePlatformAdmin: ${cfg.email} exists with role ${existing.role}; leaving unchanged`
      );
      return { skipped: true, reason: "email-taken", user: existing };
    }

    if (blockDefault) {
      try {
        const usesDefault = await verifyPassword(
          DEFAULT_PLATFORM_ADMIN_PASSWORD,
          existing.passwordHash
        );
        if (usesDefault) {
          console.warn(
            "ensurePlatformAdmin: platform admin still uses the documented default password. " +
              "Set PLATFORM_ADMIN_PASSWORD and RESET_PLATFORM_ADMIN_PASSWORD=true, then lock with PLATFORM_ADMIN_PASSWORD_LOCKED=true."
          );
        }
      } catch {
        // Ignore compare failures; never rewrite the hash in this path.
      }
      return { created: false, updated: false, skipped: true, reason: "default-password-blocked", user: existing };
    }

    const data = {};
    // Auto-reactivating or clearing mustChangePassword is a local convenience.
    // Production must not undo a lockout or forced rotation on every boot.
    if (!cfg.productionLike) {
      if (existing.status !== "ACTIVE") data.status = "ACTIVE";
      if (existing.mustChangePassword) data.mustChangePassword = false;
    }
    if (existing.tenantId != null) data.tenantId = null;

    if (cfg.locked) {
      // Password stays as stored.
    } else if (cfg.resetPassword) {
      data.passwordHash = await hashPassword(cfg.password);
    } else if (!cfg.productionLike) {
      const matches = await verifyPassword(cfg.password, existing.passwordHash);
      if (!matches) {
        data.passwordHash = await hashPassword(cfg.password);
      }
    }

    if (Object.keys(data).length === 0) {
      return { created: false, updated: false, skipped: false, user: existing };
    }

    const user = await db.user.update({ where: { id: existing.id }, data });
    return { created: false, updated: true, skipped: false, user };
  }

  if (blockDefault) {
    console.warn(
      "ensurePlatformAdmin: refusing to create platform admin with the documented default password. " +
        "Set PLATFORM_ADMIN_PASSWORD (or ALLOW_DEFAULT_PLATFORM_ADMIN=true only for disposable demos)."
    );
    return { skipped: true, reason: "default-password-blocked", user: null };
  }

  const passwordHash = await hashPassword(cfg.password);
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
