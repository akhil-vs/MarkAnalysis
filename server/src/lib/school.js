import { prisma } from "./prisma.js";

const DEFAULT_SCHOOL = {
  id: "school",
  name: "School Marks Analytics",
  board: null,
  affiliationNo: null,
  address: null,
  phone: null,
  email: null,
};

export async function getSchoolProfile() {
  const existing = await prisma.schoolProfile.findUnique({ where: { id: "school" } });
  if (existing) return existing;
  return prisma.schoolProfile.upsert({
    where: { id: "school" },
    create: { ...DEFAULT_SCHOOL, updatedAt: new Date() },
    update: {},
  });
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
