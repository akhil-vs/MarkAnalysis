/**
 * Blob storage for school logos and student photos.
 * Default: database bytes (existing behaviour).
 * Optional filesystem backend when BLOB_STORAGE=filesystem and BLOB_STORAGE_PATH is set.
 *
 * Stored reference format in *StorageKey columns: fs:v1:<relative/path>
 */
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

const FS_PREFIX = "fs:v1:";

export function blobStorageMode(env = process.env) {
  const mode = String(env.BLOB_STORAGE || "database")
    .trim()
    .toLowerCase();
  if (mode === "filesystem" || mode === "fs") {
    const root = String(env.BLOB_STORAGE_PATH || "").trim();
    if (root) return { mode: "filesystem", root: path.resolve(root) };
  }
  return { mode: "database", root: null };
}

function safeSegment(value) {
  return String(value || "x")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 80);
}

export function isFilesystemBlobKey(key) {
  return typeof key === "string" && key.startsWith(FS_PREFIX);
}

function relativeFromKey(key) {
  return String(key).slice(FS_PREFIX.length);
}

/**
 * Persist a blob. Returns { bytes, storageKey }.
 * - database mode: bytes set, storageKey null
 * - filesystem mode: bytes null (caller should clear DB bytes), storageKey set
 */
export async function putBlob({
  kind,
  tenantId,
  entityId,
  bytes,
  mimeType,
  env = process.env,
} = {}) {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || []);
  if (!buf.length) {
    return { bytes: null, storageKey: null, mimeType: mimeType || null };
  }
  const cfg = blobStorageMode(env);
  if (cfg.mode !== "filesystem") {
    return { bytes: buf, storageKey: null, mimeType: mimeType || null };
  }
  const ext =
    mimeType === "image/png" ? "png" : mimeType === "image/jpeg" || mimeType === "image/jpg" ? "jpg" : "bin";
  const rel = path.join(
    safeSegment(kind),
    safeSegment(tenantId || "platform"),
    `${safeSegment(entityId)}-${randomBytes(4).toString("hex")}.${ext}`
  );
  const abs = path.join(cfg.root, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, buf);
  return { bytes: null, storageKey: `${FS_PREFIX}${rel}`, mimeType: mimeType || null };
}

/** Load blob bytes from DB buffer and/or storage key. */
export async function getBlob({ bytes, storageKey, env = process.env } = {}) {
  if (bytes) {
    if (Buffer.isBuffer(bytes)) return bytes;
    if (bytes instanceof Uint8Array) return Buffer.from(bytes);
    if (typeof bytes === "string") return Buffer.from(bytes, "base64");
  }
  if (!isFilesystemBlobKey(storageKey)) return null;
  const cfg = blobStorageMode(env);
  if (cfg.mode !== "filesystem") {
    // Still allow reading absolute path under configured root if present
    const root = String(env.BLOB_STORAGE_PATH || "").trim();
    if (!root) return null;
    const abs = path.join(path.resolve(root), relativeFromKey(storageKey));
    try {
      return await readFile(abs);
    } catch {
      return null;
    }
  }
  const abs = path.join(cfg.root, relativeFromKey(storageKey));
  try {
    return await readFile(abs);
  } catch {
    return null;
  }
}

/** Best-effort delete of a filesystem blob. */
export async function deleteBlob(storageKey, env = process.env) {
  if (!isFilesystemBlobKey(storageKey)) return;
  const root = String(env.BLOB_STORAGE_PATH || "").trim();
  if (!root) return;
  const abs = path.join(path.resolve(root), relativeFromKey(storageKey));
  try {
    await unlink(abs);
  } catch {
    // ignore missing
  }
}
