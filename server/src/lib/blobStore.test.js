import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { blobStorageMode, deleteBlob, getBlob, putBlob } from "./blobStore.js";

describe("blobStore", () => {
  it("defaults to database mode", () => {
    assert.equal(blobStorageMode({}).mode, "database");
    const buf = Buffer.from("hi");
    return putBlob({ kind: "logo", tenantId: "t", entityId: "e", bytes: buf, env: {} }).then((r) => {
      assert.equal(r.storageKey, null);
      assert.ok(Buffer.compare(r.bytes, buf) === 0);
    });
  });

  it("writes and reads filesystem blobs", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "sma-blobs-"));
    try {
      const env = { BLOB_STORAGE: "filesystem", BLOB_STORAGE_PATH: root };
      const put = await putBlob({
        kind: "photo",
        tenantId: "sch1",
        entityId: "stu1",
        bytes: Buffer.from([1, 2, 3]),
        mimeType: "image/png",
        env,
      });
      assert.equal(put.bytes, null);
      assert.match(put.storageKey, /^fs:v1:/);
      const got = await getBlob({ storageKey: put.storageKey, env });
      assert.deepEqual([...got], [1, 2, 3]);
      await deleteBlob(put.storageKey, env);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
