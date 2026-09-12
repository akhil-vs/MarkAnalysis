import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import app from "../app.js";

async function withServer(run) {
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
  }
}

test("API responses skip ETag and refuse caching", async () => {
  await withServer(async (base) => {
    const first = await fetch(`${base}/api/health`);
    assert.equal(first.status, 200);
    assert.equal(first.headers.get("etag"), null);
    assert.match(first.headers.get("cache-control") || "", /no-store/i);
    assert.deepEqual(await first.json(), { ok: true });

    const conditional = await fetch(`${base}/api/health`, {
      headers: { "If-None-Match": '"stale-etag"' },
    });
    assert.equal(conditional.status, 200);
    assert.equal(conditional.headers.get("etag"), null);
    assert.deepEqual(await conditional.json(), { ok: true });
  });
});

test("malformed JSON body returns 400 JSON", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not-json",
    });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "Invalid JSON body" });
  });
});
