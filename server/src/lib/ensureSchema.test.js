import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { __test } from "./ensureSchema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "../../prisma/migrations");

describe("ensureSchema bootstrap", () => {
  it("embeds timetable statements matching the prisma migration checksum", () => {
    const file = readFileSync(
      join(migrationsDir, "20260908103000_teacher_timetable/migration.sql")
    );
    assert.equal(__test.TIMETABLE_CHECKSUM, createHash("sha256").update(file).digest("hex"));
    assert.equal(__test.TIMETABLE_MIGRATION, "20260908103000_teacher_timetable");
    assert.ok(__test.TIMETABLE_STATEMENTS[0].includes('CREATE TABLE IF NOT EXISTS "Period"'));
    assert.ok(__test.TIMETABLE_STATEMENTS[1].includes('CREATE TABLE IF NOT EXISTS "TimetableEntry"'));
    assert.equal(__test.TIMETABLE_FK_STATEMENTS.length, 4);
  });

  it("tracks staff notice enum migration checksum and labels", () => {
    const file = readFileSync(
      join(migrationsDir, "20260908153000_teacher_staff_notices/migration.sql")
    );
    assert.equal(__test.NOTICES_CHECKSUM, createHash("sha256").update(file).digest("hex"));
    assert.equal(__test.NOTICES_MIGRATION, "20260908153000_teacher_staff_notices");
    assert.deepEqual(__test.STAFF_NOTICE_TYPES, [
      "DEADLINE_REMINDER",
      "INCOMPLETE_MARKLIST",
      "STAFF_NOTICE",
    ]);
  });
});
