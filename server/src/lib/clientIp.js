/**
 * Resolve the client IP for rate limiting and audit.
 *
 * Never trust a raw `X-Forwarded-For` header unless Express `trust proxy`
 * is enabled (so req.ip is derived from a trusted proxy hop). Without trust
 * proxy, forged XFF would otherwise bypass auth rate limits.
 */
export function clientIp(req) {
  if (!req) return "unknown";
  const ip = req.ip;
  if (ip && String(ip).trim()) return String(ip).trim();
  // Express leaves req.socket.remoteAddress when trust proxy is off.
  const remote = req.socket?.remoteAddress || req.connection?.remoteAddress;
  if (remote && String(remote).trim()) return String(remote).trim();
  return "unknown";
}

/**
 * Configure Express trust proxy from env.
 * - TRUST_PROXY=false|0 → never trust
 * - TRUST_PROXY=true|1 → trust first hop
 * - TRUST_PROXY=<number> → trust N hops
 * - default: trust 1 hop on Vercel / production, else false
 */
export function resolveTrustProxy(env = process.env) {
  const raw = env.TRUST_PROXY;
  if (raw === "false" || raw === "0") return false;
  if (raw === "true" || raw === "1") return 1;
  if (raw != null && String(raw).trim() !== "") {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return n;
    // Non-numeric values (e.g. "loopback") pass through to Express.
    return raw;
  }
  if (env.VERCEL || env.NODE_ENV === "production") return 1;
  return false;
}
