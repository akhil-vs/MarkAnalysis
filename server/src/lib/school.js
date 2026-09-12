import { prisma } from "./prisma.js";
import { ensurePendingSchema } from "./ensureSchema.js";
import { currentTenantId } from "./tenantContext.js";

export async function getSchoolProfile(explicitId) {
  await ensurePendingSchema();
  const id = explicitId || currentTenantId();
  if (!id) return null;
  return prisma.schoolProfile.findUnique({ where: { id } });
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
