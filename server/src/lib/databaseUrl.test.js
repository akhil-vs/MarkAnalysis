import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasDatabaseUrl, resolveDatabaseUrl } from "./databaseUrl.js";

describe("resolveDatabaseUrl", () => {
  it("prefers DATABASE_URL over aliases", () => {
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

  it("returns null when no usable URL is set", () => {
    assert.equal(resolveDatabaseUrl({}), null);
    assert.equal(resolveDatabaseUrl({ DATABASE_URL: "   " }), null);
    assert.equal(hasDatabaseUrl({}), false);
  });
});
