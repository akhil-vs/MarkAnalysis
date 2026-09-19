import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import "dotenv/config";
import { prisma } from "./prisma.js";
import { runWithTenant } from "./tenant.js";

describe("prismaCompat omit", () => {
  let tenantId;
  let dbReady = false;

  before(async () => {
    if (!process.env.DATABASE_URL) {
      console.log("skipping: DATABASE_URL not set");
      return;
    }
    try {
      const school = await prisma.school.findFirst({ omit: { logoBytes: true } });
      if (!school) {
        console.log("skipping: no seeded school");
        return;
      }
      tenantId = school.id;
      dbReady = true;
    } catch (err) {
      console.log(`skipping: database unavailable (${err.code || err.message})`);
    }
  });

  it("omits student photoBytes from findMany results", async (t) => {
    if (!dbReady) return t.skip("requires seeded database");
    await runWithTenant(tenantId, async () => {
      const rows = await prisma.student.findMany({
        take: 3,
        omit: { photoBytes: true },
      });
      assert.ok(rows.length > 0);
      for (const row of rows) {
        assert.equal("photoBytes" in row, false);
        assert.ok(row.id);
        assert.ok(row.name);
      }
    });
  });

  it("still returns photoMimeType when photoBytes is omitted", async (t) => {
    if (!dbReady) return t.skip("requires seeded database");
    await runWithTenant(tenantId, async () => {
      const withMime = await prisma.student.findFirst({
        where: { photoMimeType: { not: null } },
        omit: { photoBytes: true },
      });
      if (!withMime) return t.skip("no students with photos in seed");
      assert.equal("photoBytes" in withMime, false);
      assert.ok(withMime.photoMimeType);
    });
  });
});
