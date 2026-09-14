import helmet from "helmet";

/**
 * Security headers for the API. CSP is report-only by default so SPA embeds
 * and Vercel rewrites do not break; set CSP_ENFORCE=true to enforce.
 */
export function securityHeaders() {
  const enforce = process.env.CSP_ENFORCE === "true";
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
