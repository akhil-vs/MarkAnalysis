import { db, pool } from "../prisma/db.js";
import { createPrismaCompat } from "./prismaCompat.js";
import { extendPrismaWithTenant } from "./tenant.js";

const base = createPrismaCompat(db, { pool: pool || undefined });

/** Tenant-scoped client. Unauthenticated lookups must use `runWithoutTenant`. */
export const prisma = extendPrismaWithTenant(base);

export { db, pool };
