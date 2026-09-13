/**
 * Prisma Client v6-compatible façade over Prisma ORM 8 (`db.orm.public.*`).
 *
 * Usage:
 *   import { db } from "../prisma/db.js";
 *   import pg from "pg";
 *   import { createPrismaCompat } from "./prismaCompat.js";
 *
 *   const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
 *   export const prisma = createPrismaCompat(db, { pool });
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { and, or, not } from "@prisma/orm-postgres/orm-client";

const txAls = new AsyncLocalStorage();

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
  "search",
  "mode",
  "path",
  "string_contains",
  "string_starts_with",
  "string_ends_with",
  "array_contains",
  "array_starts_with",
  "array_ends_with",
  "some",
  "none",
  "every",
  "is",
  "isNot",
]);

const LOGIC_KEYS = new Set(["AND", "OR", "NOT"]);

/** @param {string} model */
export function delegateName(model) {
  if (!model) return model;
  return model.charAt(0).toLowerCase() + model.slice(1);
}

/** @param {string} name */
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
  if (!keys.length) return false;
  return keys.every((k) => FILTER_OPS.has(k));
}

/**
 * Flatten Prisma compound unique where keys, e.g.
 * `{ studentId_subjectId_examId: { studentId, subjectId, examId } }` → flat fields.
 */
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
  if (mode === "insensitive") return fieldProxy.ilike(pattern);
  return fieldProxy.like(pattern);
}

/**
 * Convert a Prisma Client where value for one field into a Prisma 8 predicate.
 * @param {*} fieldProxy
 * @param {*} value
 */
function fieldToPredicate(fieldProxy, value) {
  if (value === null) return fieldProxy.isNull();
  if (value === undefined) return null;

  if (!isPlainObject(value)) {
    return fieldProxy.eq(value);
  }

  // Relation filters
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
      if (value.is === null) {
        parts.push(fieldProxy.isNull());
      } else {
        parts.push(whereToPredicate(fieldProxy, value.is));
      }
    }
    if ("isNot" in value) {
      if (value.isNot === null) {
        parts.push(fieldProxy.isNotNull());
      } else {
        parts.push(not(whereToPredicate(fieldProxy, value.isNot)));
      }
    }
    return combineAnd(parts);
  }

  // Nested to-one where (or relation object without some/none/every) — field access
  if (!isFilterOperatorObject(value)) {
    return whereToPredicate(fieldProxy, value);
  }

  const parts = [];
  const mode = value.mode;

  if ("equals" in value) {
    if (value.equals === null) parts.push(fieldProxy.isNull());
    else parts.push(fieldProxy.eq(value.equals));
  }
  if ("in" in value) {
    const list = value.in;
    if (Array.isArray(list)) {
      if (list.length === 0) {
        // Match nothing
        parts.push(fieldProxy.in([]));
      } else {
        parts.push(fieldProxy.in(list));
      }
    }
  }
  if ("notIn" in value) {
    const list = value.notIn;
    if (Array.isArray(list)) parts.push(not(fieldProxy.in(list)));
  }
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
    if (n === null) {
      parts.push(fieldProxy.isNotNull());
    } else if (isPlainObject(n) && isFilterOperatorObject(n)) {
      parts.push(not(fieldToPredicate(fieldProxy, n)));
    } else if (isPlainObject(n)) {
      parts.push(not(whereToPredicate(fieldProxy, n)));
    } else {
      parts.push(fieldProxy.neq(n));
    }
  }

  return combineAnd(parts);
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

/**
 * @param {*} rowProxy - Prisma 8 field proxy for the model (or nested relation)
 * @param {object|undefined} where - Prisma Client where object
 */
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

/**
 * Strip Prisma nested-write wrappers we don't translate; keep scalars.
 * connect/disconnect/create on relations are left for callers that use P8 APIs directly.
 */
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
        const nested = normalizeOrderByList(val);
        for (const n of nested) {
          specs.push({
            path: [key, ...n.path],
            direction: n.direction,
            relation: true,
          });
        }
      }
    }
  }
  return specs;
}

function orderExpr(rowProxy, spec) {
  let proxy = rowProxy;
  for (const part of spec.path) {
    proxy = proxy[part];
  }
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
  if (typeof a === "bigint" && typeof b === "bigint") return a < b ? -1 : a > b ? 1 : 0;
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

/**
 * Partition select/include into scalar selects, relation includes, and _count reducers.
 */
function partitionProjection(select, include) {
  /** @type {string[]} */
  const scalarSelect = [];
  /** @type {Record<string, any>} */
  const relations = {};
  /** @type {Record<string, any>} */
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
      if (isPlainObject(value)) {
        relations[key] = value;
      }
    }
  }

  absorb(select, false);
  absorb(include, true);

  // If select listed a relation as `true`, it landed in scalarSelect — move known
  // overlaps when the same key also appears under include, otherwise leave as select
  // (Prisma treats bare `true` in select as a scalar). Relation objects always go to relations.

  return { scalarSelect, relations, countSelect };
}

function applyBranchOptions(branch, opts) {
  if (!opts || opts === true) return branch;
  let b = branch;
  if (opts.where && Object.keys(opts.where).length) {
    const pred = (row) => whereToPredicate(row, opts.where);
    b = b.where((row) => pred(row));
  }
  if (opts.select || opts.include) {
    const { scalarSelect, relations, countSelect } = partitionProjection(opts.select, opts.include);
    if (scalarSelect.length) b = b.select(...scalarSelect);
    for (const [rel, relOpts] of Object.entries(relations)) {
      b = b.include(rel, (child) => applyBranchOptions(child, relOpts));
    }
    for (const [rel, relOpts] of Object.entries(countSelect)) {
      b = b.include(rel, (child) => {
        let c = applyBranchOptions(child, relOpts);
        return c.count();
      });
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

/**
 * Apply Prisma Client args onto a Prisma 8 collection.
 * Returns `{ collection, countKeys, postSortSpecs, take, skip, usedSqlPaging }`.
 */
function applyArgs(collection, args = {}, { ignorePaging = false } = {}) {
  let q = collection;
  const countKeys = [];

  if (args.where && Object.keys(args.where).length) {
    q = q.where((row) => whereToPredicate(row, args.where));
  }

  const { scalarSelect, relations, countSelect } = partitionProjection(args.select, args.include);

  if (scalarSelect.length) {
    q = q.select(...scalarSelect);
  }

  for (const [rel, relOpts] of Object.entries(relations)) {
    q = q.include(rel, (child) => applyBranchOptions(child, relOpts));
  }

  for (const [rel, relOpts] of Object.entries(countSelect)) {
    countKeys.push(rel);
    q = q.include(rel, (child) => {
      let c = applyBranchOptions(child, relOpts);
      return c.count();
    });
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
    // Try native nested orderBy first (e.g. u.exam.date.asc()).
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
  if (Object.keys(counts).length) {
    out._count = { ...(out._count || {}), ...counts };
  }
  return out;
}

function reshapeRows(rows, countKeys) {
  if (!countKeys.length) return rows;
  if (Array.isArray(rows)) return rows.map((r) => reshapeCountFields(r, countKeys));
  return reshapeCountFields(rows, countKeys);
}

function finishRead(rows, meta) {
  let list = Array.isArray(rows) ? rows : rows == null ? [] : [rows];
  if (meta.postSortSpecs?.length) {
    list = postSort(list, meta.postSortSpecs);
  }
  if (!meta.usedSqlPaging) {
    const skip = meta.skip ?? 0;
    const take = meta.take;
    list = take == null ? list.slice(skip) : list.slice(skip, skip + take);
  }
  list = reshapeRows(list, meta.countKeys || []);
  return list;
}

function sqlState(err) {
  if (!err || typeof err !== "object") return null;
  return (
    err.code ||
    err.sqlState ||
    err.cause?.code ||
    err.cause?.sqlState ||
    err.meta?.code ||
    err.originalCode ||
    null
  );
}

function constraintTarget(err) {
  const detail = err.detail || err.cause?.detail || err.message || "";
  const constraint = err.constraint || err.cause?.constraint;
  if (constraint) return [constraint];
  const m = String(detail).match(/Key \(([^)]+)\)/);
  if (m) return m[1].split(",").map((s) => s.trim().replace(/"/g, ""));
  return undefined;
}

/**
 * Map Postgres SQLSTATE / driver errors onto Prisma Client-like codes.
 */
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

function notFoundError(model, cause) {
  const err = new Error(`No ${model} record was found for a query.`);
  err.code = "P2025";
  err.meta = { modelName: model, cause };
  return err;
}

/**
 * Lazy thenable so `$transaction([...])` can run ops inside a tx ALS context.
 */
function prismaPromise(executor) {
  let started = null;
  const start = () => {
    if (!started) {
      started = Promise.resolve().then(() => executor()).catch((err) => {
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
      // Nested Prisma.sql-like fragments: { strings, values } or { text, values }
      if (v && typeof v === "object" && Array.isArray(v.strings) && Array.isArray(v.values)) {
        const nested = buildTaggedSql(v.strings, v.values);
        // Remap nested $n placeholders
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
 * @param {any} db - Prisma 8 client (`postgres(...)` result) or transaction client
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

  function publicModels() {
    return getOrm().public;
  }

  function modelCollection(modelName) {
    const models = publicModels();
    const coll = models[modelName];
    if (!coll) {
      throw new Error(`Unknown model on db.orm.public: ${modelName}`);
    }
    return coll;
  }

  function listModelNames() {
    const models = publicModels();
    return Object.keys(models).filter((k) => {
      const v = models[k];
      return v && typeof v === "object" && (typeof v.where === "function" || typeof v.create === "function");
    });
  }

  function createDelegate(modelName) {
    const run = (fn) => prismaPromise(async () => fn(modelCollection(modelName)));

    return {
      findMany(args = {}) {
        return run(async (Model) => {
          const meta = applyArgs(Model, args);
          let rows;
          try {
            rows = await meta.collection.all();
          } catch (err) {
            // Native relation orderBy may fail at execution — fall back to post-sort.
            if (meta.postSortSpecs?.length || normalizeOrderByList(args.orderBy).some((s) => s.relation)) {
              const retry = applyArgs(Model, { ...args, orderBy: undefined }, { ignorePaging: true });
              rows = await retry.collection.all();
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
          return finishRead(rows, meta);
        });
      },

      findFirst(args = {}) {
        return run(async (Model) => {
          const meta = applyArgs(Model, { ...args, take: 1, skip: args.skip });
          let row;
          try {
            if (meta.postSortSpecs?.length) {
              const allMeta = applyArgs(Model, { ...args, take: undefined, skip: undefined });
              const rows = finishRead(await allMeta.collection.all(), {
                ...allMeta,
                take: 1,
                skip: args.skip ?? 0,
                usedSqlPaging: false,
                postSortSpecs: meta.postSortSpecs,
              });
              return rows[0] ?? null;
            }
            row = await meta.collection.first();
          } catch (err) {
            rethrowMapped(err);
          }
          if (row == null) return null;
          return reshapeCountFields(row, meta.countKeys);
        });
      },

      findUnique(args = {}) {
        return run(async (Model) => {
          const where = flattenUniqueWhere(args.where || {});
          const meta = applyArgs(Model, { ...args, where });
          const row = await meta.collection.first();
          if (row == null) return null;
          return reshapeCountFields(row, meta.countKeys);
        });
      },

      findUniqueOrThrow(args = {}) {
        return run(async (Model) => {
          const where = flattenUniqueWhere(args.where || {});
          const meta = applyArgs(Model, { ...args, where });
          const row = await meta.collection.first();
          if (row == null) throw notFoundError(modelName);
          return reshapeCountFields(row, meta.countKeys);
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
          let q = Model;
          if (args.select || args.include) {
            const meta = applyArgs(q, { select: args.select, include: args.include });
            q = meta.collection;
            const row = await q.create(data);
            return reshapeCountFields(row, meta.countKeys);
          }
          return q.create(data);
        });
      },

      createMany(args = {}) {
        return run(async (Model) => {
          const rows = Array.isArray(args.data) ? args.data : args.data == null ? [] : [args.data];
          const cleaned = rows.map(normalizeWriteData);
          if (!cleaned.length) return { count: 0 };

          if (!args.skipDuplicates) {
            const count = await Model.createAndCount(cleaned);
            return { count };
          }

          try {
            const count = await Model.createAndCount(cleaned);
            return { count };
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

          if (!args.skipDuplicates) {
            return await q.createAll(cleaned);
          }

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
          if (args.select || args.include) {
            const meta = applyArgs(Model, {
              where,
              select: args.select,
              include: args.include,
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
          const count = await q.updateAndCount(data);
          return { count };
        });
      },

      delete(args = {}) {
        return run(async (Model) => {
          const where = flattenUniqueWhere(args.where || {});
          let q = Model.where((row) => whereToPredicate(row, where));
          let countKeys = [];
          if (args.select || args.include) {
            const meta = applyArgs(Model, {
              where,
              select: args.select,
              include: args.include,
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
          const count = await q.deleteAndCount();
          return { count };
        });
      },

      upsert(args = {}) {
        return run(async (Model) => {
          const where = flattenUniqueWhere(args.where || {});
          const create = normalizeWriteData(args.create);
          const update = normalizeWriteData(args.update) || {};
          let q = Model;
          let countKeys = [];
          if (args.select || args.include) {
            const meta = applyArgs(Model, {
              select: args.select,
              include: args.include,
            });
            q = meta.collection;
            countKeys = meta.countKeys;
          }
          const conflictOn = { ...where };
          const row = await q.upsert({ create, update, conflictOn });
          return reshapeCountFields(row, countKeys);
        });
      },

      count(args = {}) {
        return run(async (Model) => {
          let q = Model;
          if (args.where && Object.keys(args.where).length) {
            q = q.where((row) => whereToPredicate(row, args.where));
          }
          // Prisma Client `select` on count is for relation counts / field counts;
          // support the common scalar total via aggregate.
          if (args.select && isPlainObject(args.select) && !args.select._all) {
            // Limited: only `_all` / bare count supported for full parity of simple count().
          }
          const result = await q.aggregate((agg) => ({ total: agg.count() }));
          return result?.total ?? 0;
        });
      },

      aggregate(args = {}) {
        return run(async (Model) => {
          let q = Model;
          if (args.where && Object.keys(args.where).length) {
            q = q.where((row) => whereToPredicate(row, args.where));
          }
          const result = await q.aggregate((agg) => {
            const out = {};
            if (args._count) {
              if (args._count === true || args._count._all) {
                out._count = agg.count();
              } else if (isPlainObject(args._count)) {
                // Per-field counts aren't mapped 1:1; expose total under _all when requested.
                out._count = agg.count();
              }
            }
            if (args._min && isPlainObject(args._min)) {
              out._min = {};
              for (const [field, on] of Object.entries(args._min)) {
                if (on) out._min[field] = agg.min(field);
              }
            }
            if (args._max && isPlainObject(args._max)) {
              out._max = {};
              for (const [field, on] of Object.entries(args._max)) {
                if (on) out._max[field] = agg.max(field);
              }
            }
            if (args._avg && isPlainObject(args._avg)) {
              out._avg = {};
              for (const [field, on] of Object.entries(args._avg)) {
                if (on) out._avg[field] = agg.avg(field);
              }
            }
            if (args._sum && isPlainObject(args._sum)) {
              out._sum = {};
              for (const [field, on] of Object.entries(args._sum)) {
                if (on) out._sum[field] = agg.sum(field);
              }
            }
            if (!Object.keys(out).length) {
              out._count = agg.count();
            }
            return out;
          });

          // Prisma shapes `_count: { _all: n }` when `_count: { _all: true }`
          if (args._count && args._count !== true && result && typeof result._count === "number") {
            if (args._count._all) {
              return { ...result, _count: { _all: result._count } };
            }
          }
          return result;
        });
      },
    };
  }

  async function withTransaction(fn) {
    const active = getDb();
    return active.transaction(async (tx) => {
      const txClient = createPrismaCompat(tx, { pool });
      return txAls.run({ db: tx, orm: tx.orm }, () => fn(txClient));
    });
  }

  async function requirePool() {
    if (!pool) {
      throw new Error("createPrismaCompat: `pool` is required for raw SQL helpers");
    }
    return pool;
  }

  const client = {
    get $parent() {
      return client;
    },

    $transaction(arg, _options) {
      return prismaPromise(async () => {
        if (typeof arg === "function") {
          return withTransaction(arg);
        }
        if (Array.isArray(arg)) {
          return withTransaction(async () => {
            const results = [];
            for (const item of arg) {
              results.push(await item);
            }
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
          const result = await p.query(text, params);
          return result.rows;
        }
        // Prisma.sql object / plain text fallback
        if (strings && typeof strings === "object" && strings.text) {
          const result = await p.query(strings.text, strings.values || values);
          return result.rows;
        }
        throw new TypeError("$queryRaw must be used as a tagged template");
      });
    },

    $queryRawUnsafe(query, ...values) {
      return prismaPromise(async () => {
        const p = await requirePool();
        const result = await p.query(query, values);
        return result.rows;
      });
    },

    $executeRaw(strings, ...values) {
      return prismaPromise(async () => {
        const p = await requirePool();
        if (Array.isArray(strings) && Object.prototype.hasOwnProperty.call(strings, "raw")) {
          const { text, params } = buildTaggedSql(strings, values);
          const result = await p.query(text, params);
          return result.rowCount ?? 0;
        }
        throw new TypeError("$executeRaw must be used as a tagged template");
      });
    },

    $executeRawUnsafe(query, ...values) {
      return prismaPromise(async () => {
        const p = await requirePool();
        const result = await p.query(query, values);
        return result.rowCount ?? 0;
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

    async $connect() {
      // Prisma 8 connects lazily; touch runtime if available.
      try {
        getDb().runtime?.();
      } catch {
        /* ignore */
      }
    },
  };

  // Attach camelCase delegates for every model currently on db.orm.public
  for (const name of listModelNames()) {
    const del = delegateName(name);
    client[del] = createDelegate(name);
  }

  // Proxy unknown model access in case models are added later on the same client shape
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop in target || typeof prop === "symbol") {
        return Reflect.get(target, prop, receiver);
      }
      if (typeof prop !== "string" || prop.startsWith("$")) return undefined;
      const model = modelNameFromDelegate(prop);
      const models = publicModels();
      if (models[model]) {
        const delegate = createDelegate(model);
        target[prop] = delegate;
        return delegate;
      }
      return undefined;
    },
  });
}

export default createPrismaCompat;
