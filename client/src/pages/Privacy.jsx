import { Link } from "react-router-dom";
import PoweredBy from "../components/PoweredBy.jsx";
import { PRODUCT_NAME, PRODUCT_SHORT_NAME } from "../lib/branding.js";

const SECTIONS = [
  {
    title: "What we store",
    body: "Student and staff personal data used to run exams: names, emails, dates of birth, admission numbers, guardian contacts, photos, and marks. Operators must treat this as regulated education / personal data.",
  },
  {
    title: "Who can see it",
    body: "Access is role-scoped. Teachers see assigned registers; leadership sees school-wide views; parent portal holders see only approved marks for linked students via an issued link. Passwords are stored as bcrypt hashes only.",
  },
  {
    title: "School control",
    body: "Each campus is a tenant. Principals approve staff, set the school profile and letterhead, and can revoke parent portal links. Platform tools support campus offboarding and category deletes.",
  },
  {
    title: "Safeguards already in place",
    body: "httpOnly session cookies with refresh rotation, optional TOTP MFA, activity and mark audit logs, and official consolidated downloads blocked until registers are approved. Platform backups omit photos and guardian contact fields.",
  },
  {
    title: "Operator obligations",
    body: "Before a live pilot, confirm your board or school policy covers processing of student marks and photos (for example DPDP, GDPR, FERPA, or the local equivalent). Define retention after a student leaves, prefer least privilege, and enable MFA for leadership.",
  },
];

export default function Privacy() {
  return (
    <div className="min-h-[100dvh] bg-paper text-ink-900">
      <header className="border-b border-ink-900/10 bg-cream/70">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-4 sm:px-8">
          <Link to="/" className="font-serif text-lg text-ink-900 sm:text-xl">
            {PRODUCT_SHORT_NAME}
          </Link>
          <Link to="/login" className="btn-ghost px-3 py-2 text-sm">
            Sign in
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-8 sm:py-14">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-700/55">Trust</p>
        <h1 className="mt-2 font-serif text-3xl sm:text-4xl">Privacy & data protection</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-700/75 sm:text-base">
          How {PRODUCT_NAME} handles school data during pilots and live terms. This page is a
          product summary, not legal advice — engage counsel for production deployments that
          process minors’ data.
        </p>
        <ul className="mt-10 space-y-8">
          {SECTIONS.map((section) => (
            <li key={section.title}>
              <h2 className="font-serif text-xl text-ink-900">{section.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-700/75 sm:text-base">
                {section.body}
              </p>
            </li>
          ))}
        </ul>
        <div className="mt-12 flex flex-wrap gap-3">
          <Link to="/request-pilot" className="btn-accent px-4">
            Request a school pilot
          </Link>
          <Link to="/" className="btn-ghost px-4">
            Back to home
          </Link>
        </div>
        <div className="mt-10">
          <PoweredBy />
        </div>
      </main>
    </div>
  );
}
