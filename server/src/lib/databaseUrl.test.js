import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hasDatabaseUrl,
  isPooledDatabaseUrl,
  resolveDatabaseUrl,
} from "./databaseUrl.js";

describe("resolveDatabaseUrl", () => {
  it("prefers DATABASE_URL over aliases outside serverless", () => {
    assert.equal(
      resolveDatabaseUrl({
        DATABASE_URL: "postgresql://a/db",
        POSTGRES_PRISMA_URL: "postgresql://b/db",
        POSTGRES_URL: "postgresql://c/db",
      }),
      "postgresql://a/db"
    );
  });

  it("falls back to POSTGRES_PRISMA_URL then POSTGRES_URL", () => {
    assert.equal(
      resolveDatabaseUrl({ POSTGRES_PRISMA_URL: " postgresql://b/db " }),
      "postgresql://b/db"
    );
    assert.equal(resolveDatabaseUrl({ POSTGRES_URL: "postgresql://c/db" }), "postgresql://c/db");
  });

  it("on Vercel prefers pooled aliases over direct DATABASE_URL", () => {
    assert.equal(
      resolveDatabaseUrl({
        VERCEL: "1",
        DATABASE_URL: "postgresql://ep-direct.us-east-1.aws.neon.tech/neondb",
        POSTGRES_URL: "postgresql://ep-xxx-pooler.us-east-1.aws.neon.tech/neondb",
      }),
      "postgresql://ep-xxx-pooler.us-east-1.aws.neon.tech/neondb"
    );
    assert.equal(
      resolveDatabaseUrl({
        VERCEL: "1",
        DATABASE_URL: "postgresql://direct/db",
        POSTGRES_PRISMA_URL: "postgresql://pooled/db?pgbouncer=true",
        POSTGRES_URL: "postgresql://pooled/db",
      }),
      "postgresql://pooled/db?pgbouncer=true"
    );
  });

  it("on Vercel falls back to POSTGRES_PRISMA_URL then POSTGRES_URL then DATABASE_URL", () => {
    assert.equal(
      resolveDatabaseUrl({
        VERCEL: "1",
        DATABASE_URL: "postgresql://a/db",
        POSTGRES_URL: "postgresql://c/db",
      }),
      "postgresql://c/db"
    );
  });

  it("detects pooled URL shapes", () => {
    assert.equal(isPooledDatabaseUrl("postgresql://ep-x-pooler.neon.tech/db"), true);
    assert.equal(isPooledDatabaseUrl("postgresql://host/db?pgbouncer=true"), true);
    assert.equal(isPooledDatabaseUrl("postgresql://ep-direct.neon.tech/db"), false);
  });

  it("returns null when no usable URL is set", () => {
    assert.equal(resolveDatabaseUrl({}), null);
    assert.equal(resolveDatabaseUrl({ DATABASE_URL: "   " }), null);
    assert.equal(hasDatabaseUrl({}), false);
  });
});
