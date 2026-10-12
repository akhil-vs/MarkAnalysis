/**
 * Server kill-switch for self-serve school registration.
 * UI already hides CTAs; the API must refuse unless explicitly enabled.
 *
 * ALLOW_PUBLIC_SCHOOL_REGISTRATION=true → allow
 * unset / false → deny (safe default for pilots / production)
 */
export function isPublicSchoolRegistrationAllowed(env = process.env) {
  const raw = String(env.ALLOW_PUBLIC_SCHOOL_REGISTRATION ?? "")
    .trim()
    .toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function publicRegistrationDisabledMessage() {
  return "Self-serve school registration is disabled. Request a school pilot or ask your platform administrator to provision a campus.";
}
