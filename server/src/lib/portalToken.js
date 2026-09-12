import crypto from "node:crypto";

export function hashPortalToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

export function mintPortalToken() {
  return crypto.randomBytes(24).toString("base64url");
}
