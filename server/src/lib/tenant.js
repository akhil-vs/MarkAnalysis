import { requireRole } from "../middleware/auth.js";
import { currentTenantId, runWithTenant } from "./tenantContext.js";
import { prisma } from "./prisma.js";

export const RESERVED_SLUGS = new Set([
  "platform",
  "admin",
  "api",
  "login",
  "signup",
  "portal",
  "school",
  "schools",
  "www",
]);

export function isPlatformAdmin(role) {
  return role === "PLATFORM_ADMIN";
}

export function slugifyName(name) {
  return String(name || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function parseSlug(raw, { required = true } = {}) {
  const slug = String(raw || "")
    .trim()
    .toLowerCase();
  if (!slug) {
    return required ? { error: "School code is required" } : { value: "" };
  }
  if (slug.length < 2 || slug.length > 40) {
    return { error: "School code must be 2–40 characters" };
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return { error: "School code must be lowercase letters, numbers, and hyphens" };
  }
  if (RESERVED_SLUGS.has(slug)) {
    return { error: "That school code is reserved" };
  }
  return { value: slug };
}

export function publicSchool(school, extra = {}) {
  if (!school) return school;
  return {
    id: school.id,
    slug: school.slug,
    name: school.name,
    board: school.board,
    affiliationNo: school.affiliationNo,
    address: school.address,
    phone: school.phone,
    email: school.email,
    status: school.status,
    createdAt: school.createdAt,
    updatedAt: school.updatedAt,
    ...extra,
  };
}

export function schoolCreateData(body) {
  const name = String(body?.name || "").trim();
  if (!name) return { error: "School name is required" };
  const slugParsed = parseSlug(body?.slug || slugifyName(name));
  if (slugParsed.error) return { error: slugParsed.error };
  return {
    value: {
      name,
      slug: slugParsed.value,
      board: body?.board ? String(body.board).trim() : null,
      affiliationNo: body?.affiliationNo ? String(body.affiliationNo).trim() : null,
      address: body?.address ? String(body.address).trim() : null,
      phone: body?.phone ? String(body.phone).trim() : null,
      email: body?.email ? String(body.email).trim() : null,
      status: body?.status === "SUSPENDED" ? "SUSPENDED" : "ACTIVE",
    },
  };
}

export async function findActiveSchoolBySlug(slug) {
  const parsed = parseSlug(slug);
  if (parsed.error) return { error: parsed.error };
  const school = await prisma.schoolProfile.findUnique({ where: { slug: parsed.value } });
  if (!school || school.status !== "ACTIVE") {
    return { error: "School not found" };
  }
  return { school };
}

export async function assertSchoolActive(tenantId) {
  if (!tenantId) return { error: "No school assigned to this account" };
  const school = await prisma.schoolProfile.findUnique({
    where: { id: tenantId },
    select: { id: true, status: true, name: true, slug: true },
  });
  if (!school) return { error: "School not found" };
  if (school.status === "SUSPENDED") {
    return { error: "This school is suspended. Contact the platform administrator." };
  }
  return { school };
}

export function requirePlatformAdmin() {
  return requireRole("PLATFORM_ADMIN");
}

/** School APIs: reject platform admins and bind Prisma queries to the caller's school. */
export async function requireSchoolTenant(req, res, next) {
  if (isPlatformAdmin(req.user?.role)) {
    return res.status(403).json({ error: "Use the platform console to manage schools" });
  }
  let tenantId = req.user?.tenantId;
  if (!tenantId && req.user?.userId) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: { tenantId: true },
      });
      tenantId = user?.tenantId || null;
    } catch (err) {
      return next(err);
    }
  }
  if (!tenantId) {
    return res.status(403).json({ error: "No school assigned to this account" });
  }
  req.user.tenantId = tenantId;
  req.tenantId = tenantId;
  runWithTenant(tenantId, () => next());
}

export { currentTenantId, runWithTenant };
