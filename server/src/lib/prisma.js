import { PrismaClient } from "@prisma/client";
import { currentTenantId } from "./tenantContext.js";

const TENANTED_MODELS = new Set(["User", "ClassSection", "Subject", "Exam", "Period", "Student"]);

const DELEGATE = {
  User: "user",
  ClassSection: "classSection",
  Subject: "subject",
  Exam: "exam",
  Period: "period",
  Student: "student",
};

function injectTenantWhere(args, tenantId) {
  const next = { ...(args || {}) };
  if (!next.where) {
    next.where = { tenantId };
  } else if (next.where.tenantId === undefined) {
    next.where = { AND: [next.where, { tenantId }] };
  }
  return next;
}

function injectTenantCreate(data, tenantId) {
  if (data == null || typeof data !== "object") return data;
  if (Array.isArray(data)) {
    return data.map((row) => (row?.tenantId == null ? { ...row, tenantId } : row));
  }
  return data.tenantId == null ? { ...data, tenantId } : data;
}

function notFound(operation) {
  const err = new Error(`Record to ${operation} not found.`);
  err.code = "P2025";
  return err;
}

const base = new PrismaClient();

export const prisma = base.$extends({
  query: {
    $allModels: {
      async findMany({ model, args, query }) {
        const tenantId = currentTenantId();
        if (tenantId && TENANTED_MODELS.has(model)) args = injectTenantWhere(args, tenantId);
        return query(args);
      },
      async findFirst({ model, args, query }) {
        const tenantId = currentTenantId();
        if (tenantId && TENANTED_MODELS.has(model)) args = injectTenantWhere(args, tenantId);
        return query(args);
      },
      async findFirstOrThrow({ model, args, query }) {
        const tenantId = currentTenantId();
        if (tenantId && TENANTED_MODELS.has(model)) args = injectTenantWhere(args, tenantId);
        return query(args);
      },
      async count({ model, args, query }) {
        const tenantId = currentTenantId();
        if (tenantId && TENANTED_MODELS.has(model)) args = injectTenantWhere(args, tenantId);
        return query(args);
      },
      async aggregate({ model, args, query }) {
        const tenantId = currentTenantId();
        if (tenantId && TENANTED_MODELS.has(model)) args = injectTenantWhere(args, tenantId);
        return query(args);
      },
      async groupBy({ model, args, query }) {
        const tenantId = currentTenantId();
        if (tenantId && TENANTED_MODELS.has(model)) args = injectTenantWhere(args, tenantId);
        return query(args);
      },
      async findUnique({ model, args, query }) {
        const tenantId = currentTenantId();
        if (!(tenantId && TENANTED_MODELS.has(model))) return query(args);
        const delegate = DELEGATE[model];
        const { where, ...rest } = args || {};
        return base[delegate].findFirst({ ...rest, where: { AND: [where, { tenantId }] } });
      },
      async findUniqueOrThrow({ model, args, query }) {
        const tenantId = currentTenantId();
        if (!(tenantId && TENANTED_MODELS.has(model))) return query(args);
        const delegate = DELEGATE[model];
        const { where, ...rest } = args || {};
        const found = await base[delegate].findFirst({ ...rest, where: { AND: [where, { tenantId }] } });
        if (!found) throw notFound("find");
        return found;
      },
      async create({ model, args, query }) {
        const tenantId = currentTenantId();
        if (tenantId && TENANTED_MODELS.has(model) && args?.data) {
          args = { ...args, data: injectTenantCreate(args.data, tenantId) };
        }
        return query(args);
      },
      async createMany({ model, args, query }) {
        const tenantId = currentTenantId();
        if (tenantId && TENANTED_MODELS.has(model) && args?.data) {
          args = { ...args, data: injectTenantCreate(args.data, tenantId) };
        }
        return query(args);
      },
      async createManyAndReturn({ model, args, query }) {
        const tenantId = currentTenantId();
        if (tenantId && TENANTED_MODELS.has(model) && args?.data) {
          args = { ...args, data: injectTenantCreate(args.data, tenantId) };
        }
        return query(args);
      },
      async upsert({ model, args, query }) {
        const tenantId = currentTenantId();
        if (tenantId && TENANTED_MODELS.has(model) && args?.create) {
          args = { ...args, create: injectTenantCreate(args.create, tenantId) };
        }
        return query(args);
      },
      async update({ model, args, query }) {
        const tenantId = currentTenantId();
        if (tenantId && TENANTED_MODELS.has(model)) {
          const delegate = DELEGATE[model];
          const found = await base[delegate].findFirst({
            where: { AND: [args.where, { tenantId }] },
            select: { id: true },
          });
          if (!found) throw notFound("update");
        }
        return query(args);
      },
      async updateMany({ model, args, query }) {
        const tenantId = currentTenantId();
        if (tenantId && TENANTED_MODELS.has(model)) args = injectTenantWhere(args, tenantId);
        return query(args);
      },
      async delete({ model, args, query }) {
        const tenantId = currentTenantId();
        if (tenantId && TENANTED_MODELS.has(model)) {
          const delegate = DELEGATE[model];
          const found = await base[delegate].findFirst({
            where: { AND: [args.where, { tenantId }] },
            select: { id: true },
          });
          if (!found) throw notFound("delete");
        }
        return query(args);
      },
      async deleteMany({ model, args, query }) {
        const tenantId = currentTenantId();
        if (tenantId && TENANTED_MODELS.has(model)) args = injectTenantWhere(args, tenantId);
        return query(args);
      },
    },
  },
});
