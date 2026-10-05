import { Link } from "react-router-dom";
import PoweredBy from "../components/PoweredBy.jsx";
import {
  PRODUCT_BLURB,
  PRODUCT_NAME,
  PRODUCT_SHORT_NAME,
  PRODUCT_TAGLINE,
  VENDOR_NAME,
  pilotContactHref,
  pilotContactLabel,
} from "../lib/branding.js";

const PILOT_STEPS = [
  {
    title: "Scope one exam cycle",
    body: "Pick one unit, mid-term, or final and a small set of classes. Success means an official consolidated list without a spreadsheet merge.",
  },
  {
    title: "We provision your campus",
    body: "Platform admin creates the school, principal account, and join code. Public self-serve registration stays off for controlled pilots.",
  },
  {
    title: "Staff join with your code",
    body: "Teachers and the exam co-ordinator request access; you approve. Role manuals and in-app help cover the day-to-day workflow.",
  },
  {
    title: "Run draft → approve → download",
    body: "Teachers enter marks, leadership approves, then school-branded CML / reports unlock. Parent portal links stay optional and time-boxed.",
  },
];

export default function RequestPilot() {
  const contactHref = pilotContactHref();
  const contactLabel = pilotContactLabel();
  const external = contactHref.startsWith("http");

  return (
    <div className="min-h-[100dvh] bg-paper text-ink-900">
      <header className="border-b border-ink-900/10 bg-cream/70">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-4 sm:px-8">
          <Link to="/" className="font-serif text-lg text-ink-900 sm:text-xl">
            {PRODUCT_SHORT_NAME}
          </Link>
          <nav className="flex items-center gap-2">
            <Link to="/privacy" className="hidden text-sm text-ink-700/70 hover:text-ink-900 sm:inline">
              Privacy
            </Link>
            <Link to="/login" className="btn-ghost px-3 py-2 text-sm">
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-8 sm:py-14">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-700/55">
          School pilot
        </p>
        <h1 className="mt-2 font-serif text-3xl leading-tight sm:text-4xl">{PRODUCT_NAME}</h1>
        <p className="mt-3 font-serif text-xl text-ink-800 sm:text-2xl">{PRODUCT_TAGLINE}</p>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-700/75 sm:text-base">
          {PRODUCT_BLURB} Pilots are invite-led so your campus stays isolated and supported.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href={contactHref}
            className="btn-accent px-4"
            {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            {contactLabel}
          </a>
          <Link to="/login" className="btn-ghost px-4">
            Already provisioned? Sign in
          </Link>
        </div>

        <section className="mt-12">
          <h2 className="font-serif text-2xl">Suggested 2–4 week pilot</h2>
          <ol className="mt-6 space-y-6">
            {PILOT_STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-4">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-950 text-sm font-medium text-cream"
                  aria-hidden
                >
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <h3 className="font-serif text-lg text-ink-900">{step.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-ink-700/75">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-12 rounded-2xl bg-ink-950 px-5 py-8 text-cream sm:px-8">
          <h2 className="font-serif text-2xl">What to bring to the first call</h2>
          <ul className="mt-4 space-y-2 text-sm text-cream/75 sm:text-base">
            <li>Exam name / type and target classes</li>
            <li>Champion exam co-ordinator (and optional class teacher)</li>
            <li>School display name, address, and crest for letterheads</li>
            <li>Preferred pilot start date and follow-up window</li>
          </ul>
          <p className="mt-5 text-sm text-cream/55">
            {VENDOR_NAME} can share a short leave-behind and walk a live demo with you on
            campus or by video.
          </p>
        </section>

        <div className="mt-10">
          <PoweredBy />
        </div>
      </main>
    </div>
  );
}
