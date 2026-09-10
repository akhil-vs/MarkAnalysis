import { prisma } from "./prisma.js";

const SETTINGS_ID = "default";

export async function getConsolidationSettings() {
  const existing = await prisma.consolidationSettings.findUnique({
    where: { id: SETTINGS_ID },
    include: { lockedBy: { select: { id: true, name: true } } },
  });
  if (existing) return existing;
  return prisma.consolidationSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, maxMarksLocked: false, updatedAt: new Date() },
    update: {},
    include: { lockedBy: { select: { id: true, name: true } } },
  });
}

export async function isMaxMarksLocked() {
  const settings = await getConsolidationSettings();
  return Boolean(settings.maxMarksLocked);
}

/**
 * Reject subject maxMarks edits once consolidation ceilings are locked.
 * @returns {Promise<string|null>} error message or null when allowed
 */
export async function assertMaxMarksEditable() {
  if (await isMaxMarksLocked()) {
    return "Consolidation max marks are locked. Unlock them before changing subject ceilings.";
  }
  return null;
}

export function publicConsolidationSettings(settings) {
  if (!settings) {
    return { maxMarksLocked: false, lockedAt: null, lockedBy: null };
  }
  return {
    maxMarksLocked: Boolean(settings.maxMarksLocked),
    lockedAt: settings.lockedAt || null,
    lockedBy: settings.lockedBy
      ? { id: settings.lockedBy.id, name: settings.lockedBy.name }
      : null,
  };
}
