import { AsyncLocalStorage } from "node:async_hooks";

export const tenantAls = new AsyncLocalStorage();

export const TENANT_MODELS = new Set([
  "User",
  "ClassSection",
  "Subject",
  "Student",
  "StudentSubjectEnrollment",
  "TeacherAssignment",
  "Exam",
  "Mark",
  "MarkAudit",
  "MarkEntryAccessRequest",
  "PortalAccessLink",
  "Notification",
  "ActivityAudit",
  "Period",
  "TimetableEntry",
]);

const UNIQUE_READS = new Set(["findUnique", "findUniqueOrThrow"]);
const UNIQUE_WRITES = new Set(["update", "delete"]);
const CREATE_OPS = new Set(["create", "createMany", "createManyAndReturn"]);
const WHERE_OPS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "updateMany",
  "updateManyAndReturn",
  "deleteMany",
  "count",
  "aggregate",
  "groupBy",
]);

export function getTenantId() {
  return tenantAls.getStore()?.tenantId || null;
}

export function isTenantBypass() {
  return Boolean(tenantAls.getStore()?.bypass);
}

export function runWithTenant(tenantId, fn) {
  if (!tenantId) {
    throw new Error("Missing tenant id");
  }
  return tenantAls.run({ tenantId: String(tenantId) }, fn);
}

export function runWithoutTenant(fn) {
  return tenantAls.run({ bypass: true }, fn);
}

export function requireTenantId() {
  if (isTenantBypass()) return null;
  const tenantId = getTenantId();
  if (!tenantId) {
    const err = new Error("Missing tenant context");
    err.status = 500;
    throw err;
  }
  return tenantId;
}

function withTenantWhere(where, tenantId) {
  if (!where || Object.keys(where).length === 0) return { tenantId };
  if (where.tenantId === tenantId) return where;
  if (where.AND) return { AND: [...(Array.isArray(where.AND) ? where.AND : [where.AND]), { tenantId }] };
  return { AND: [where, { tenantId }] };
}

function withTenantData(data, tenantId) {
  if (data == null) return data;
  if (Array.isArray(data)) return data.map((row) => ({ tenantId, ...row }));
  return { tenantId, ...data };
}

function delegateName(model) {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

function notFoundError(model) {
  const err = new Error(`Record to update or delete not found (${model})`);
  err.code = "P2025";
  err.status = 404;
  return err;
}

/**
 * Fail-closed tenant scoping for school-owned tables.
 * Unauthenticated lookups must run inside `runWithoutTenant`.
 */
export function extendPrismaWithTenant(client) {
  return client.$extends({
    name: "tenantScope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model)) return query(args || {});
          if (isTenantBypass()) return query(args || {});

          const tenantId = requireTenantId();
          const nextArgs = { ...(args || {}) };

          if (CREATE_OPS.has(operation)) {
            nextArgs.data = withTenantData(nextArgs.data, tenantId);
            return query(nextArgs);
          }

          if (operation === "upsert") {
            const delegate = client[delegateName(model)];
            const existing = await delegate.findFirst({
              where: withTenantWhere(nextArgs.where, tenantId),
              select: { id: true },
            });
            const opts = {};
            if (nextArgs.include) opts.include = nextArgs.include;
            if (nextArgs.select) opts.select = nextArgs.select;
            if (existing) {
              return delegate.update({
                where: { id: existing.id },
                data: nextArgs.update || {},
                ...opts,
              });
            }
            return delegate.create({
              data: withTenantData(nextArgs.create, tenantId),
              ...opts,
            });
          }

          if (UNIQUE_READS.has(operation) || UNIQUE_WRITES.has(operation)) {
            const scoped = await client[delegateName(model)].findFirst({
              where: withTenantWhere(nextArgs.where, tenantId),
              select: { id: true },
            });
            if (!scoped) {
              if (operation === "findUnique") return null;
              if (operation === "findUniqueOrThrow" || UNIQUE_WRITES.has(operation)) {
                throw notFoundError(model);
              }
            }
            if (operation === "findUnique" || operation === "findUniqueOrThrow") {
              return query({ ...nextArgs, where: { id: scoped.id } });
            }
            return query({ ...nextArgs, where: { id: scoped.id } });
          }

          if (WHERE_OPS.has(operation)) {
            nextArgs.where = withTenantWhere(nextArgs.where, tenantId);
            return query(nextArgs);
          }

          return query(nextArgs);
        },
      },
    },
  });
}

export function tenantWhere(extra = {}) {
  const tenantId = requireTenantId();
  return tenantId ? { tenantId, ...extra } : extra;
}

export function attachTenantContext(req, res, next) {
  const tenantId = req.user?.tenantId || req.portal?.tenantId;
  if (!tenantId) return next();
  tenantAls.run({ tenantId }, () => next());
}

export const currentTenantId = getTenantId;

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
    joinCode: school.joinCode,
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

export function requirePlatformAdmin() {
  return (req, res, next) => {
    if (!isPlatformAdmin(req.user?.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}

/** School APIs: reject platform admins. Auth already binds Prisma to the caller's school. */
export function requireSchoolTenant(req, res, next) {
  if (isPlatformAdmin(req.user?.role)) {
    return res.status(403).json({ error: "Use the platform console to manage schools" });
  }
  const tenantId = req.user?.tenantId;
  if (!tenantId) {
    return res.status(403).json({ error: "No school assigned to this account" });
  }
  req.tenantId = tenantId;
  if (getTenantId() === String(tenantId) || isTenantBypass()) return next();
  return runWithTenant(tenantId, () => next());
}
