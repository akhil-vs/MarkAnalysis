import helmet from "helmet";

/**
 * Whether CSP should be enforced (vs report-only).
 * Default: enforce in production / Vercel unless CSP_ENFORCE=false.
 * Local/dev stays report-only unless CSP_ENFORCE=true.
 */
export function shouldEnforceCsp(env = process.env) {
  if (env.CSP_ENFORCE === "false" || env.CSP_ENFORCE === "0") return false;
  if (env.CSP_ENFORCE === "true" || env.CSP_ENFORCE === "1") return true;
  return Boolean(env.VERCEL) || env.NODE_ENV === "production";
}

/**
 * Security headers for the API.
 */
export function securityHeaders() {
  const enforce = shouldEnforceCsp();
  return helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
      reportOnly: !enforce,
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    referrerPolicy: { policy: "no-referrer" },
  });
}
