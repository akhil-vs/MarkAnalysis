import { prisma } from "./prisma.js";
import { ensurePendingSchema } from "./ensureSchema.js";
import { newJoinCode, slugifySchoolName } from "./schoolIdentity.js";
import { requireTenantId, runWithoutTenant } from "./tenant.js";

export async function getSchoolProfile() {
  await ensurePendingSchema();
  const tenantId = requireTenantId();
  const existing = await prisma.school.findUnique({ where: { id: tenantId } });
  if (existing) return existing;
  const err = new Error("School not found");
  err.status = 404;
  throw err;
}

export function schoolHeaderLines(profile) {
  if (!profile) return ["School Marks Analytics"];
  const lines = [profile.name || "School Marks Analytics"];
  const meta = [profile.board, profile.affiliationNo ? `Aff. ${profile.affiliationNo}` : null]
    .filter(Boolean)
    .join("  ·  ");
  if (meta) lines.push(meta);
  return lines;
}

export async function allocateSchoolSlug(name) {
  const base = slugifySchoolName(name);
  return runWithoutTenant(async () => {
    for (let i = 0; i < 50; i += 1) {
      const slug = i === 0 ? base : `${base.slice(0, 40)}-${i + 1}`;
      const exists = await prisma.school.findUnique({ where: { slug } });
      if (!exists) return slug;
    }
    return `${base}-${Date.now().toString(36)}`;
  });
}

export async function allocateJoinCode() {
  return runWithoutTenant(async () => {
    for (let i = 0; i < 24; i += 1) {
      const joinCode = newJoinCode();
      const exists = await prisma.school.findUnique({ where: { joinCode } });
      if (!exists) return joinCode;
    }
    const err = new Error("Could not allocate a school join code");
    err.status = 500;
    throw err;
  });
}

export async function findSchoolByJoinCode(joinCode) {
  if (!joinCode) return null;
  return runWithoutTenant(() => prisma.school.findUnique({ where: { joinCode } }));
}

