/** Parent portal links are credentials. They always expire, and never later than PORTAL_MAX_DAYS. */
export const PORTAL_DEFAULT_DAYS = 30;
export const PORTAL_MAX_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @returns {{ ok: true, expiresAt: Date } | { ok: false, error: string }}
 */
export function resolvePortalExpiry(input, now = new Date()) {
  const latest = now.getTime() + PORTAL_MAX_DAYS * DAY_MS;
  if (input == null || input === "") {
    return { ok: true, expiresAt: new Date(now.getTime() + PORTAL_DEFAULT_DAYS * DAY_MS) };
  }
  const expires = new Date(input);
  if (Number.isNaN(expires.getTime())) return { ok: false, error: "Invalid expiry" };
  if (expires.getTime() <= now.getTime()) {
    return { ok: false, error: "Portal link expiry must be in the future" };
  }
  if (expires.getTime() > latest + 60_000) {
    return { ok: false, error: `Portal links must expire within ${PORTAL_MAX_DAYS} days` };
  }
  return { ok: true, expiresAt: expires };
}
