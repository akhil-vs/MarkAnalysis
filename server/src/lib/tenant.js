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
