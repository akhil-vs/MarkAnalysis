import { PrismaClient } from "@prisma/client";
import { extendPrismaWithTenant } from "./tenant.js";

const base = new PrismaClient();

/** Tenant-scoped client. Unauthenticated lookups must use `runWithoutTenant`. */
export const prisma = extendPrismaWithTenant(base);
