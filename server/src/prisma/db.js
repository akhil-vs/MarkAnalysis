import "dotenv/config";
import "temporal-polyfill/full/global";
import { Pool } from "pg";
import postgres from "@prisma/orm-postgres/runtime";
import contractJson from "./contract.json" with { type: "json" };

export const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : null;

export const db = postgres({
  contractJson,
  ...(pool ? { pg: pool } : { url: process.env.DATABASE_URL }),
});
