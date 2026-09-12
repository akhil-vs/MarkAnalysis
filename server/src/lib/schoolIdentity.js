import { randomInt } from "node:crypto";

const JOIN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function slugifySchoolName(name) {
  const slug = String(name || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "school";
}

export function newJoinCode() {
  function part(n) {
    let out = "";
    for (let i = 0; i < n; i += 1) {
      out += JOIN_ALPHABET[randomInt(JOIN_ALPHABET.length)];
    }
    return out;
  }
  return `${part(4)}-${part(4)}`;
}

/** Accepts `ABCD-EFGH`, `abcdefgh`, or mixed case; returns canonical `ABCD-EFGH` or null. */
export function normalizeJoinCode(value) {
  const raw = String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (raw.length !== 8) return null;
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}
