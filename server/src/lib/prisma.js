import fs from "node:fs";
import { db, pool } from "../prisma/db.js";
import { createPrismaCompat } from "./prismaCompat.js";
import { extendPrismaWithTenant } from "./tenant.js";

// #region agent log
fs.appendFileSync('/opt/cursor/logs/debug.log',JSON.stringify({location:'prisma.js:create',message:'createPrismaCompat pool wiring',data:{importedPoolNull:pool===null,importedPoolTruthy:Boolean(pool),runId:'post-fix'},timestamp:Date.now(),hypothesisId:'B'})+'\n');
// #endregion

const base = createPrismaCompat(db, { pool: pool || undefined });

/** Tenant-scoped client. Unauthenticated lookups must use `runWithoutTenant`. */
export const prisma = extendPrismaWithTenant(base);

export { db, pool };
