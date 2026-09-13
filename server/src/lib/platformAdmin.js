import bcrypt from "bcryptjs";
import { prisma } from "./prisma.js";
import { runWithoutTenant } from "./tenant.js";

export const SEED_PLATFORM_ADMIN_EMAIL = "admin@platform.edu";
export const SEED_PLATFORM_ADMIN_PASSWORD = "password123";

/**
 * Make sure the documented platform admin exists.
 * Existing deployments skip seed when users are already present, so login
 * would return "Invalid credentials" until this account is created.
 */
export async function ensureSeedPlatformAdmin({ resetPassword = false } = {}) {
  return runWithoutTenant(async () => {
    const passwordHash = await bcrypt.hash(SEED_PLATFORM_ADMIN_PASSWORD, 10);
    const byEmail = await prisma.user.findUnique({
      where: { email: SEED_PLATFORM_ADMIN_EMAIL },
    });

    if (byEmail) {
      const needsPromote =
        byEmail.role !== "PLATFORM_ADMIN" ||
        byEmail.status !== "ACTIVE" ||
        byEmail.tenantId != null;
      if (!needsPromote && !resetPassword) return byEmail;
      return prisma.user.update({
        where: { id: byEmail.id },
        data: {
          role: "PLATFORM_ADMIN",
          status: "ACTIVE",
          tenantId: null,
          mustChangePassword: false,
          schoolId: byEmail.schoolId || "PLT-A01",
          ...(resetPassword || needsPromote ? { passwordHash } : {}),
        },
      });
    }

    const existingAdmin = await prisma.user.findFirst({ where: { role: "PLATFORM_ADMIN" } });
    if (existingAdmin) {
      if (resetPassword && existingAdmin.email === SEED_PLATFORM_ADMIN_EMAIL) {
        return prisma.user.update({
          where: { id: existingAdmin.id },
          data: { passwordHash, status: "ACTIVE", tenantId: null, mustChangePassword: false },
        });
      }
      return existingAdmin;
    }

    return prisma.user.create({
      data: {
        name: "Platform Admin",
        email: SEED_PLATFORM_ADMIN_EMAIL,
        schoolId: "PLT-A01",
        passwordHash,
        role: "PLATFORM_ADMIN",
        status: "ACTIVE",
        mustChangePassword: false,
      },
    });
  });
}
