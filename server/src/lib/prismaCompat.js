/**
 * Prisma Client v6-compatible façade over Prisma ORM 8 (`db.orm.public.*`).
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { and, or, not } from "@prisma/orm-postgres/orm-client";

const txAls = new AsyncLocalStorage();

const MODEL_NAMES = [
  "ActivityAudit",
  "BoardPack",
  "ClassSection",
  "CpdAppraisal",
  "CpdCertificate",
  "CpdObservation",
  "CpdTrainingPlan",
  "EmailOutbox",
  "Exam",
  "ExamPaperSchedule",
  "Mark",
  "MarkAudit",
  "MarkEntryAccessRequest",
  "Notification",
  "Period",
  "PortalAccessLink",
  "RefreshToken",
  "ReportCardRelease",
  "RevaluationRequest",
  "School",
  "Student",
  "StudentSubjectEnrollment",
  "Subject",
  "TeacherAssignment",
  "TimetableEntry",
  "User",
];

const FILTER_OPS = new Set([
  "equals",
  "not",
  "in",
  "notIn",
  "lt",
  "lte",
  "gt",
  "gte",
  "contains",
  "startsWith",
  "endsWith",
  "mode",
  "some",
  "none",
  "every",
  "is",
  "isNot",
]);

const LOGIC_KEYS = new Set(["AND", "OR", "NOT"]);

export function delegateName(model) {
  if (!model) return model;
  return model.charAt(0).toLowerCase() + model.slice(1);
}

function modelNameFromDelegate(name) {
  if (!name) return name;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function isPlainObject(value) {
  return (
    value != null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    !(typeof Buffer !== "undefined" && Buffer.isBuffer?.(value))
  );
}

function isFilterOperatorObject(value) {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((k) => FILTER_OPS.has(k));
}

export function flattenUniqueWhere(where) {
  if (!isPlainObject(where)) return where;
  const out = {};
  for (const [key, value] of Object.entries(where)) {
    if (LOGIC_KEYS.has(key)) {
      out[key] = value;
      continue;
    }
    if (
      isPlainObject(value) &&
      !isFilterOperatorObject(value) &&
      Object.keys(value).length >= 2 &&
      Object.keys(value).join("_") === key
    ) {
      Object.assign(out, value);
      continue;
    }
    out[key] = value;
  }
  return out;
}

function escapeLike(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function likePattern(value, kind) {
  const escaped = escapeLike(value);
  if (kind === "contains") return `%${escaped}%`;
  if (kind === "startsWith") return `${escaped}%`;
  if (kind === "endsWith") return `%${escaped}`;
  return escaped;
}

function applyStringMatch(fieldProxy, kind, value, mode) {
  const pattern = likePattern(value, kind);
  return mode === "insensitive" ? fieldProxy.ilike(pattern) : fieldProxy.like(pattern);
}

function combineAnd(parts) {
  const filtered = parts.filter((p) => p != null);
  if (!filtered.length) return null;
  if (filtered.length === 1) return filtered[0];
  return and(...filtered);
}

function combineOr(parts) {
  const filtered = parts.filter((p) => p != null);
  if (!filtered.length) return null;
  if (filtered.length === 1) return filtered[0];
  return or(...filtered);
}

function isRelationFilterProxy(fieldProxy) {
  return (
    fieldProxy != null &&
    typeof fieldProxy === "object" &&
    typeof fieldProxy.some === "function" &&
    typeof fieldProxy.none === "function"
  );
}

/** Prisma Client to-one `is` / nested relation where → ORM 8 `some` / `none`. */
function relationWherePredicate(fieldProxy, inner) {
  if (inner == null || (isPlainObject(inner) && !Object.keys(inner).length)) {
    return fieldProxy.some();
  }
  return fieldProxy.some((rel) => whereToPredicate(rel, inner));
}

function fieldToPredicate(fieldProxy, value) {
  if (fieldProxy == null) {
    throw new Error("prismaCompat: unknown field in where clause");
  }
  if (value === null) return fieldProxy.isNull();
  if (value === undefined) return null;

  if (!isPlainObject(value)) return fieldProxy.eq(value);

  if ("some" in value || "none" in value || "every" in value || "is" in value || "isNot" in value) {
    const parts = [];
    if ("some" in value) {
      const inner = value.some;
      if (inner == null || (isPlainObject(inner) && !Object.keys(inner).length)) {
        parts.push(fieldProxy.some());
      } else {
        parts.push(fieldProxy.some((rel) => whereToPredicate(rel, inner)));
      }
    }
    if ("none" in value) {
      const inner = value.none;
      if (inner == null || (isPlainObject(inner) && !Object.keys(inner).length)) {
        parts.push(fieldProxy.none());
      } else {
        parts.push(fieldProxy.none((rel) => whereToPredicate(rel, inner)));
      }
    }
    if ("every" in value) {
      parts.push(fieldProxy.every((rel) => whereToPredicate(rel, value.every)));
    }
    if ("is" in value) {
      // ORM 8 relation proxies expose some/none (not is/isNull).
      if (value.is === null) {
        parts.push(isRelationFilterProxy(fieldProxy) ? fieldProxy.none() : fieldProxy.isNull());
      } else if (isRelationFilterProxy(fieldProxy)) {
        parts.push(relationWherePredicate(fieldProxy, value.is));
      } else {
        parts.push(whereToPredicate(fieldProxy, value.is));
      }
    }
    if ("isNot" in value) {
      if (value.isNot === null) {
        parts.push(isRelationFilterProxy(fieldProxy) ? fieldProxy.some() : fieldProxy.isNotNull());
      } else if (isRelationFilterProxy(fieldProxy)) {
        parts.push(
          value.isNot == null || (isPlainObject(value.isNot) && !Object.keys(value.isNot).length)
            ? fieldProxy.none()
            : fieldProxy.none((rel) => whereToPredicate(rel, value.isNot))
        );
      } else {
        parts.push(not(whereToPredicate(fieldProxy, value.isNot)));
      }
    }
    return combineAnd(parts);
  }

  if (!isFilterOperatorObject(value)) {
    // Prisma Client allows to-one shorthand: `student: { status: "ACTIVE" }`
    if (isRelationFilterProxy(fieldProxy)) {
      return relationWherePredicate(fieldProxy, value);
    }
    return whereToPredicate(fieldProxy, value);
  }

  const parts = [];
  const mode = value.mode;

  if ("equals" in value) {
    if (value.equals === null) parts.push(fieldProxy.isNull());
    else parts.push(fieldProxy.eq(value.equals));
  }
  if ("in" in value && Array.isArray(value.in)) parts.push(fieldProxy.in(value.in));
  if ("notIn" in value && Array.isArray(value.notIn)) parts.push(not(fieldProxy.in(value.notIn)));
  if ("lt" in value) parts.push(fieldProxy.lt(value.lt));
  if ("lte" in value) parts.push(fieldProxy.lte(value.lte));
  if ("gt" in value) parts.push(fieldProxy.gt(value.gt));
  if ("gte" in value) parts.push(fieldProxy.gte(value.gte));
  if ("contains" in value) parts.push(applyStringMatch(fieldProxy, "contains", value.contains, mode));
  if ("startsWith" in value) {
    parts.push(applyStringMatch(fieldProxy, "startsWith", value.startsWith, mode));
  }
  if ("endsWith" in value) {
    parts.push(applyStringMatch(fieldProxy, "endsWith", value.endsWith, mode));
  }
  if ("not" in value) {
    const n = value.not;
    if (n === null) parts.push(fieldProxy.isNotNull());
    else if (isPlainObject(n) && isFilterOperatorObject(n)) parts.push(not(fieldToPredicate(fieldProxy, n)));
    else if (isPlainObject(n)) parts.push(not(whereToPredicate(fieldProxy, n)));
    else parts.push(fieldProxy.neq(n));
  }

  return combineAnd(parts);
}

export function whereToPredicate(rowProxy, where) {
  if (where == null) return null;
  if (typeof where === "function") return where(rowProxy);

  const flat = flattenUniqueWhere(where);
  if (!isPlainObject(flat)) return null;

  const parts = [];
  for (const [key, value] of Object.entries(flat)) {
    if (value === undefined) continue;
    if (key === "AND") {
      const list = Array.isArray(value) ? value : [value];
      parts.push(combineAnd(list.map((item) => whereToPredicate(rowProxy, item))));
      continue;
    }
    if (key === "OR") {
      const list = Array.isArray(value) ? value : [value];
      parts.push(combineOr(list.map((item) => whereToPredicate(rowProxy, item))));
      continue;
    }
    if (key === "NOT") {
      const list = Array.isArray(value) ? value : [value];
      const inner = combineAnd(list.map((item) => whereToPredicate(rowProxy, item)));
      if (inner) parts.push(not(inner));
      continue;
    }
    const pred = fieldToPredicate(rowProxy[key], value);
    if (pred != null) parts.push(pred);
  }
  return combineAnd(parts);
}

function omitUndefined(data) {
  if (data == null || typeof data !== "object" || Array.isArray(data)) return data;
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function normalizeWriteData(data) {
  return omitUndefined(data);
}

function normalizeOrderByList(orderBy) {
  if (!orderBy) return [];
  const list = Array.isArray(orderBy) ? orderBy : [orderBy];
  const specs = [];
  for (const item of list) {
    if (!isPlainObject(item)) continue;
    for (const [key, val] of Object.entries(item)) {
      if (val === "asc" || val === "desc") {
        specs.push({ path: [key], direction: val, relation: false });
      } else if (isPlainObject(val)) {
        for (const n of normalizeOrderByList(val)) {
          specs.push({ path: [key, ...n.path], direction: n.direction, relation: true });
        }
      }
    }
  }
  return specs;
}

function orderExpr(rowProxy, spec) {
  let proxy = rowProxy;
  for (const part of spec.path) proxy = proxy[part];
  return spec.direction === "desc" ? proxy.desc() : proxy.asc();
}

function getByPath(obj, path) {
  let cur = obj;
  for (const p of path) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function compareValues(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "number" && typeof b === "number") return a - b;
  const as = String(a);
  const bs = String(b);
  return as < bs ? -1 : as > bs ? 1 : 0;
}

function postSort(rows, specs) {
  if (!specs.length) return rows;
  return [...rows].sort((ra, rb) => {
    for (const spec of specs) {
      const cmp = compareValues(getByPath(ra, spec.path), getByPath(rb, spec.path));
      if (cmp !== 0) return spec.direction === "desc" ? -cmp : cmp;
    }
    return 0;
  });
}

function partitionProjection(select, include) {
  const scalarSelect = [];
  const relations = {};
  const countSelect = {};

  function absorb(obj, asInclude) {
    if (!obj || typeof obj !== "object") return;
    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined || value === false) continue;
      if (key === "_count") {
        const countSpec = value?.select ?? value;
        if (isPlainObject(countSpec)) {
          for (const [rel, relSpec] of Object.entries(countSpec)) {
            if (relSpec) countSelect[rel] = relSpec === true ? {} : relSpec;
          }
        }
        continue;
      }
      if (value === true) {
        if (asInclude) relations[key] = true;
        else scalarSelect.push(key);
        continue;
      }
      if (isPlainObject(value)) relations[key] = value;
    }
  }

  absorb(select, false);
  absorb(include, true);
  return { scalarSelect, relations, countSelect };
}

/** Scalar column names for a model from the Prisma contract (excludes relations). */
function scalarFieldNames(Model) {
  const modelName = Model?.modelName;
  const ns = Model?.namespaceId || "public";
  const fields = Model?.contract?.domain?.namespaces?.[ns]?.models?.[modelName]?.fields;
  if (!fields || typeof fields !== "object") return [];
  return Object.entries(fields)
    .filter(([, meta]) => meta?.type?.kind === "scalar")
    .map(([name]) => name);
}

/**
 * Prisma `omit` is not honored by the ORM-8 façade unless we rewrite it to `select`.
 * When `select` is already set, Prisma ignores `omit` — we do the same.
 */
function resolveOmitArgs(Model, args = {}) {
  if (!args?.omit || args.select) return args;
  const omitted = Object.entries(args.omit)
    .filter(([, value]) => value === true)
    .map(([key]) => key);
  if (!omitted.length) return args;
  const omitSet = new Set(omitted);
  const select = {};
  for (const name of scalarFieldNames(Model)) {
    if (!omitSet.has(name)) select[name] = true;
  }
  if (!Object.keys(select).length) return args;
  const { omit, ...rest } = args;
  return { ...rest, select };
}

function applyBranchOptions(branch, opts) {
  if (!opts || opts === true) return branch;
  let b = branch;
  if (opts.where && Object.keys(opts.where).length) {
    b = b.where((row) => whereToPredicate(row, opts.where));
  }
  if (opts.select || opts.include) {
    const { scalarSelect, relations, countSelect } = partitionProjection(opts.select, opts.include);
    if (scalarSelect.length) b = b.select(...scalarSelect);
    for (const [rel, relOpts] of Object.entries(relations)) {
      b = b.include(rel, (child) => applyBranchOptions(child, relOpts));
    }
    for (const [rel, relOpts] of Object.entries(countSelect)) {
      b = b.include(rel, (child) => applyBranchOptions(child, relOpts).count());
    }
  }
  const orderSpecs = normalizeOrderByList(opts.orderBy);
  if (orderSpecs.length && !orderSpecs.some((s) => s.relation)) {
    b =
      orderSpecs.length === 1
        ? b.orderBy((row) => orderExpr(row, orderSpecs[0]))
        : b.orderBy(orderSpecs.map((spec) => (row) => orderExpr(row, spec)));
  }
  if (opts.take != null) b = b.limit(opts.take);
  if (opts.skip != null) b = b.offset(opts.skip);
  return b;
}

function applyArgs(collection, args = {}, { ignorePaging = false } = {}) {
  args = resolveOmitArgs(collection, args);
  let q = collection;
  const countKeys = [];

  if (args.where && Object.keys(args.where).length) {
    q = q.where((row) => whereToPredicate(row, args.where));
  }

  const { scalarSelect, relations, countSelect } = partitionProjection(args.select, args.include);
  if (scalarSelect.length) q = q.select(...scalarSelect);

  for (const [rel, relOpts] of Object.entries(relations)) {
    q = q.include(rel, (child) => applyBranchOptions(child, relOpts));
  }
  for (const [rel, relOpts] of Object.entries(countSelect)) {
    countKeys.push(rel);
    q = q.include(rel, (child) => applyBranchOptions(child, relOpts).count());
  }

  const orderSpecs = normalizeOrderByList(args.orderBy);
  const relationOrder = orderSpecs.some((s) => s.relation);
  let usedSqlPaging = !ignorePaging && !relationOrder;

  if (orderSpecs.length && !relationOrder) {
    q =
      orderSpecs.length === 1
        ? q.orderBy((row) => orderExpr(row, orderSpecs[0]))
        : q.orderBy(orderSpecs.map((spec) => (row) => orderExpr(row, spec)));
  } else if (orderSpecs.length && relationOrder) {
    try {
      q =
        orderSpecs.length === 1
          ? q.orderBy((row) => orderExpr(row, orderSpecs[0]))
          : q.orderBy(orderSpecs.map((spec) => (row) => orderExpr(row, spec)));
      usedSqlPaging = !ignorePaging;
    } catch {
      usedSqlPaging = false;
    }
  }

  if (usedSqlPaging) {
    if (args.take != null) q = q.limit(args.take);
    if (args.skip != null) q = q.offset(args.skip);
  }

  return {
    collection: q,
    countKeys,
    postSortSpecs: relationOrder ? orderSpecs : [],
    take: args.take,
    skip: args.skip,
    usedSqlPaging,
  };
}

function reshapeCountFields(row, countKeys) {
  if (!row || !countKeys.length) return row;
  const out = { ...row };
  const counts = {};
  for (const key of countKeys) {
    if (key in out) {
      counts[key] = out[key] ?? 0;
      delete out[key];
    }
  }
  if (Object.keys(counts).length) out._count = { ...(out._count || {}), ...counts };
  return out;
}

function reshapeRows(rows, countKeys) {
  if (!countKeys.length) return rows;
  if (Array.isArray(rows)) return rows.map((r) => reshapeCountFields(r, countKeys));
  return reshapeCountFields(rows, countKeys);
}

function finishRead(rows, meta) {
  let list = Array.isArray(rows) ? rows : rows == null ? [] : [rows];
  if (meta.postSortSpecs?.length) list = postSort(list, meta.postSortSpecs);
  if (!meta.usedSqlPaging) {
    const skip = meta.skip ?? 0;
    const take = meta.take;
    list = take == null ? list.slice(skip) : list.slice(skip, skip + take);
  }
  return reshapeRows(list, meta.countKeys || []);
}

function sqlState(err) {
  if (!err || typeof err !== "object") return null;
  return err.code || err.sqlState || err.cause?.code || err.cause?.sqlState || err.meta?.code || null;
}

function constraintTarget(err) {
  const detail = err.detail || err.cause?.detail || err.message || "";
  const constraint = err.constraint || err.cause?.constraint;
  if (constraint) return [constraint];
  const m = String(detail).match(/Key \(([^)]+)\)/);
  if (m) return m[1].split(",").map((s) => s.trim().replace(/"/g, ""));
  return undefined;
}

export function mapDriverError(err) {
  if (!err || typeof err !== "object") return err;
  const state = String(sqlState(err) || "");
  if (state === "23505" || state === "P2002") {
    err.code = "P2002";
    err.meta = { ...(err.meta || {}), target: constraintTarget(err) ?? err.meta?.target };
  } else if (state === "23503" || state === "P2003") {
    err.code = "P2003";
    err.meta = { ...(err.meta || {}), field_name: err.constraint || err.cause?.constraint };
  }
  return err;
}

function rethrowMapped(err) {
  throw mapDriverError(err);
}

function notFoundError(model) {
  const err = new Error(`No ${model} record was found for a query.`);
  err.code = "P2025";
  err.meta = { modelName: model };
  return err;
}

function prismaPromise(executor) {
  let started = null;
  const start = () => {
    if (!started) {
      started = Promise.resolve()
        .then(() => executor())
        .catch((err) => {
          rethrowMapped(err);
        });
    }
    return started;
  };
  return {
    then(onFulfilled, onRejected) {
      return start().then(onFulfilled, onRejected);
    },
    catch(onRejected) {
      return start().catch(onRejected);
    },
    finally(onFinally) {
      return start().finally(onFinally);
    },
    [Symbol.toStringTag]: "PrismaPromise",
  };
}

function buildTaggedSql(strings, values) {
  let text = "";
  const params = [];
  for (let i = 0; i < strings.length; i++) {
    text += strings[i];
    if (i < values.length) {
      const v = values[i];
      if (v && typeof v === "object" && Array.isArray(v.strings) && Array.isArray(v.values)) {
        const nested = buildTaggedSql(v.strings, v.values);
        let nestedText = nested.text;
        const offset = params.length;
        nestedText = nestedText.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + offset}`);
        text += nestedText;
        params.push(...nested.params);
      } else {
        params.push(v);
        text += `$${params.length}`;
      }
    }
  }
  return { text, params };
}

/**
 * @param {any} db Prisma 8 client or transaction client
 * @param {{ pool?: import('pg').Pool }} [options]
 */
export function createPrismaCompat(db, options = {}) {
  const pool = options.pool;

  function getDb() {
    return txAls.getStore()?.db ?? db;
  }

  function getOrm() {
    return txAls.getStore()?.orm ?? getDb().orm ?? db.orm;
  }

  function modelCollection(modelName) {
    const coll = getOrm().public[modelName];
    if (!coll) throw new Error(`Unknown model on db.orm.public: ${modelName}`);
    return coll;
  }

  function createDelegate(modelName) {
    const run = (fn) => prismaPromise(async () => fn(modelCollection(modelName)));

    return {
      findMany(args = {}) {
        return run(async (Model) => {
          const meta = applyArgs(Model, args);
          try {
            const rows = await meta.collection.all();
            return finishRead(rows, meta);
          } catch (err) {
            if (meta.postSortSpecs?.length || normalizeOrderByList(args.orderBy).some((s) => s.relation)) {
              const retry = applyArgs(Model, { ...args, orderBy: undefined }, { ignorePaging: true });
              const rows = await retry.collection.all();
              return finishRead(rows, {
                countKeys: meta.countKeys,
                postSortSpecs: normalizeOrderByList(args.orderBy),
                take: args.take,
                skip: args.skip,
                usedSqlPaging: false,
              });
            }
            rethrowMapped(err);
          }
        });
      },

      findFirst(args = {}) {
        return run(async (Model) => {
          const orderSpecs = normalizeOrderByList(args.orderBy);
          if (orderSpecs.some((s) => s.relation)) {
            const rows = await createDelegate(modelName).findMany({ ...args, take: 1 });
            return rows[0] ?? null;
          }
          const meta = applyArgs(Model, { ...args, take: 1 });
          const row = await meta.collection.first();
          return row == null ? null : reshapeCountFields(row, meta.countKeys);
        });
      },

      findUnique(args = {}) {
        return run(async (Model) => {
          const where = flattenUniqueWhere(args.where || {});
          const meta = applyArgs(Model, { ...args, where });
          const row = await meta.collection.first();
          return row == null ? null : reshapeCountFields(row, meta.countKeys);
        });
      },

      findUniqueOrThrow(args = {}) {
        return run(async () => {
          const row = await createDelegate(modelName).findUnique(args);
          if (row == null) throw notFoundError(modelName);
          return row;
        });
      },

      findFirstOrThrow(args = {}) {
        return run(async () => {
          const row = await createDelegate(modelName).findFirst(args);
          if (row == null) throw notFoundError(modelName);
          return row;
        });
      },

      create(args = {}) {
        return run(async (Model) => {
          const data = normalizeWriteData(args.data);
          if (args.select || args.include || args.omit) {
            const meta = applyArgs(Model, {
              select: args.select,
              include: args.include,
              omit: args.omit,
            });
            return reshapeCountFields(await meta.collection.create(data), meta.countKeys);
          }
          return Model.create(data);
        });
      },

      createMany(args = {}) {
        return run(async (Model) => {
          const rows = Array.isArray(args.data) ? args.data : args.data == null ? [] : [args.data];
          const cleaned = rows.map(normalizeWriteData);
          if (!cleaned.length) return { count: 0 };
          if (!args.skipDuplicates) {
            return { count: await Model.createAndCount(cleaned) };
          }
          try {
            return { count: await Model.createAndCount(cleaned) };
          } catch (err) {
            mapDriverError(err);
            if (err.code !== "P2002" && sqlState(err) !== "23505") rethrowMapped(err);
            let count = 0;
            for (const row of cleaned) {
              try {
                await Model.create(row);
                count += 1;
              } catch (rowErr) {
                mapDriverError(rowErr);
                if (rowErr.code === "P2002" || sqlState(rowErr) === "23505") continue;
                rethrowMapped(rowErr);
              }
            }
            return { count };
          }
        });
      },

      createManyAndReturn(args = {}) {
        return run(async (Model) => {
          const rows = Array.isArray(args.data) ? args.data : args.data == null ? [] : [args.data];
          const cleaned = rows.map(normalizeWriteData);
          if (!cleaned.length) return [];
          let q = Model;
          if (args.select) {
            const scalars = Object.entries(args.select)
              .filter(([, v]) => v === true)
              .map(([k]) => k);
            if (scalars.length) q = q.select(...scalars);
          }
          if (!args.skipDuplicates) return q.createAll(cleaned);
          try {
            return await q.createAll(cleaned);
          } catch (err) {
            mapDriverError(err);
            if (err.code !== "P2002" && sqlState(err) !== "23505") rethrowMapped(err);
            const out = [];
            for (const row of cleaned) {
              try {
                out.push(await q.create(row));
              } catch (rowErr) {
                mapDriverError(rowErr);
                if (rowErr.code === "P2002" || sqlState(rowErr) === "23505") continue;
                rethrowMapped(rowErr);
              }
            }
            return out;
          }
        });
      },

      update(args = {}) {
        return run(async (Model) => {
          const where = flattenUniqueWhere(args.where || {});
          const data = normalizeWriteData(args.data);
          let q = Model.where((row) => whereToPredicate(row, where));
          let countKeys = [];
          if (args.select || args.include || args.omit) {
            const meta = applyArgs(Model, {
              where,
              select: args.select,
              include: args.include,
              omit: args.omit,
            });
            q = meta.collection;
            countKeys = meta.countKeys;
          }
          const row = await q.update(data);
          if (row == null) throw notFoundError(modelName);
          return reshapeCountFields(row, countKeys);
        });
      },

      updateMany(args = {}) {
        return run(async (Model) => {
          const where = args.where && Object.keys(args.where).length ? args.where : undefined;
          const data = normalizeWriteData(args.data);
          let q = Model;
          if (where) q = q.where((row) => whereToPredicate(row, where));
          return { count: await q.updateAndCount(data) };
        });
      },

      delete(args = {}) {
        return run(async (Model) => {
          const where = flattenUniqueWhere(args.where || {});
          let q = Model.where((row) => whereToPredicate(row, where));
          let countKeys = [];
          if (args.select || args.include || args.omit) {
            const meta = applyArgs(Model, {
              where,
              select: args.select,
              include: args.include,
              omit: args.omit,
            });
            q = meta.collection;
            countKeys = meta.countKeys;
          }
          const row = await q.delete();
          if (row == null) throw notFoundError(modelName);
          return reshapeCountFields(row, countKeys);
        });
      },

      deleteMany(args = {}) {
        return run(async (Model) => {
          const where = args.where && Object.keys(args.where).length ? args.where : undefined;
          let q = Model;
          if (where) q = q.where((row) => whereToPredicate(row, where));
          return { count: await q.deleteAndCount() };
        });
      },

      upsert(args = {}) {
        return run(async (Model) => {
          const where = flattenUniqueWhere(args.where || {});
          const create = normalizeWriteData(args.create);
          const update = normalizeWriteData(args.update) || {};
          let q = Model;
          let countKeys = [];
          if (args.select || args.include || args.omit) {
            const meta = applyArgs(Model, {
              select: args.select,
              include: args.include,
              omit: args.omit,
            });
            q = meta.collection;
            countKeys = meta.countKeys;
          }
          const row = await q.upsert({ create, update, conflictOn: { ...where } });
          return reshapeCountFields(row, countKeys);
        });
      },

      count(args = {}) {
        return run(async (Model) => {
          let q = Model;
          if (args.where && Object.keys(args.where).length) {
            q = q.where((row) => whereToPredicate(row, args.where));
          }
          const result = await q.aggregate((agg) => ({ total: agg.count() }));
          return result?.total ?? 0;
        });
      },
    };
  }

  async function withTransaction(fn) {
    return getDb().transaction(async (tx) => {
      const txClient = createPrismaCompat(tx, { pool });
      return txAls.run({ db: tx, orm: tx.orm }, () => fn(txClient));
    });
  }

  async function requirePool() {
    if (!pool) throw new Error("createPrismaCompat: `pool` is required for raw SQL helpers");
    return pool;
  }

  const client = {
    $transaction(arg) {
      return prismaPromise(async () => {
        if (typeof arg === "function") return withTransaction(arg);
        if (Array.isArray(arg)) {
          return withTransaction(async () => {
            const results = [];
            for (const item of arg) results.push(await item);
            return results;
          });
        }
        throw new TypeError("$transaction expects a function or an array of promises");
      });
    },

    $queryRaw(strings, ...values) {
      return prismaPromise(async () => {
        const p = await requirePool();
        if (Array.isArray(strings) && Object.prototype.hasOwnProperty.call(strings, "raw")) {
          const { text, params } = buildTaggedSql(strings, values);
          return (await p.query(text, params)).rows;
        }
        throw new TypeError("$queryRaw must be used as a tagged template");
      });
    },

    $queryRawUnsafe(query, ...values) {
      return prismaPromise(async () => {
        const p = await requirePool();
        return (await p.query(query, values)).rows;
      });
    },

    $executeRaw(strings, ...values) {
      return prismaPromise(async () => {
        const p = await requirePool();
        if (Array.isArray(strings) && Object.prototype.hasOwnProperty.call(strings, "raw")) {
          const { text, params } = buildTaggedSql(strings, values);
          return (await p.query(text, params)).rowCount ?? 0;
        }
        throw new TypeError("$executeRaw must be used as a tagged template");
      });
    },

    $executeRawUnsafe(query, ...values) {
      return prismaPromise(async () => {
        const p = await requirePool();
        return (await p.query(query, values)).rowCount ?? 0;
      });
    },

    async $disconnect() {
      const errors = [];
      try {
        if (typeof db.close === "function") await db.close();
      } catch (err) {
        errors.push(err);
      }
      try {
        if (pool && typeof pool.end === "function") await pool.end();
      } catch (err) {
        errors.push(err);
      }
      if (errors.length) throw mapDriverError(errors[0]);
    },

    async $connect() {},
  };

  for (const name of MODEL_NAMES) {
    client[delegateName(name)] = createDelegate(name);
  }

  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop in target || typeof prop === "symbol") return Reflect.get(target, prop, receiver);
      if (typeof prop !== "string" || prop.startsWith("$")) return undefined;
      const model = modelNameFromDelegate(prop);
      if (MODEL_NAMES.includes(model) || getOrm().public[model]) {
        const delegate = createDelegate(model);
        target[prop] = delegate;
        return delegate;
      }
      return undefined;
    },
  });
}

export default createPrismaCompat;
