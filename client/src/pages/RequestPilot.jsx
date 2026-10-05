import { useState } from "react";
import { Link } from "react-router-dom";
import PoweredBy from "../components/PoweredBy.jsx";
import { FieldError, fieldClass } from "../components/FieldError.jsx";
import { BusyLabel } from "../components/Spinner.jsx";
import { api } from "../api.js";
import {
  PRODUCT_BLURB,
  PRODUCT_NAME,
  PRODUCT_SHORT_NAME,
  PRODUCT_TAGLINE,
  VENDOR_NAME,
} from "../lib/branding.js";
import { firstError, parseEmail, requiredText } from "../lib/formValidation.js";

const EMPTY = {
  schoolName: "",
  board: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  roleTitle: "Principal",
  examNameOrType: "",
  targetClasses: "",
  preferredStartDate: "",
  notes: "",
};

const PILOT_STEPS = [
  {
    title: "Scope one exam cycle",
    body: "Pick one unit, mid-term, or final and a small set of classes. Success means an official consolidated list without a spreadsheet merge.",
  },
  {
    title: "We provision your campus",
    body: "After review, platform admin creates the school, principal account, and join code. Public self-serve registration stays off for controlled pilots.",
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
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    const schoolName = requiredText(form.schoolName, "School name");
    const contactName = requiredText(form.contactName, "Your name");
    const contactEmail = parseEmail(form.contactEmail, { required: true, label: "Email" });
    const err = firstError(schoolName, contactName, contactEmail);
    if (err) {
      setError(err);
      return;
    }
    setBusy(true);
    try {
      const data = await api("/api/pilot-requests", {
        method: "POST",
        body: {
          schoolName: schoolName.value,
          board: form.board.trim(),
          contactName: contactName.value,
          contactEmail: contactEmail.value,
          contactPhone: form.contactPhone.trim(),
          roleTitle: form.roleTitle.trim(),
          examNameOrType: form.examNameOrType.trim(),
          targetClasses: form.targetClasses.trim(),
          preferredStartDate: form.preferredStartDate.trim(),
          notes: form.notes.trim(),
        },
      });
      setDone(data);
    } catch (err) {
      setError(err.message || "Could not submit your request");
    } finally {
      setBusy(false);
    }
  }

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
          {PRODUCT_BLURB} A pilot is a short, invite-led trial for one campus and one exam cycle.
        </p>

        {done ? (
          <section className="mt-10 rounded-2xl border border-moss-500/30 bg-moss-500/10 px-5 py-8 sm:px-8">
            <h2 className="font-serif text-2xl text-ink-900">Request received</h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-700/80 sm:text-base">
              {done.message || "Thanks — we will follow up shortly."}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/login" className="btn-accent px-4">
                Sign in
              </Link>
              <Link to="/" className="btn-ghost px-4">
                Back to home
              </Link>
            </div>
          </section>
        ) : (
          <form onSubmit={onSubmit} className="mt-10 space-y-5 rounded-2xl border border-ink-900/10 bg-cream/60 p-5 sm:p-8">
            <h2 className="font-serif text-2xl">Request a school pilot</h2>
            <p className="text-sm text-ink-700/70">
              Tell us about your school. {VENDOR_NAME} reviews each request and provisions a private campus if it is a fit.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="label">School name</span>
                <input
                  className={fieldClass(error && !form.schoolName.trim())}
                  value={form.schoolName}
                  onChange={(e) => set("schoolName", e.target.value)}
                  required
                  disabled={busy}
                />
              </label>
              <label className="block">
                <span className="label">Board (optional)</span>
                <input
                  className="field"
                  placeholder="CBSE, ICSE, State…"
                  value={form.board}
                  onChange={(e) => set("board", e.target.value)}
                  disabled={busy}
                />
              </label>
              <label className="block">
                <span className="label">Your role</span>
                <input
                  className="field"
                  placeholder="Principal / Exam co-ordinator"
                  value={form.roleTitle}
                  onChange={(e) => set("roleTitle", e.target.value)}
                  disabled={busy}
                />
              </label>
              <label className="block">
                <span className="label">Your name</span>
                <input
                  className={fieldClass(error && !form.contactName.trim())}
                  value={form.contactName}
                  onChange={(e) => set("contactName", e.target.value)}
                  required
                  disabled={busy}
                />
              </label>
              <label className="block">
                <span className="label">Work email</span>
                <input
                  type="email"
                  className={fieldClass(error && !form.contactEmail.trim())}
                  value={form.contactEmail}
                  onChange={(e) => set("contactEmail", e.target.value)}
                  required
                  disabled={busy}
                />
              </label>
              <label className="block">
                <span className="label">Phone (optional)</span>
                <input
                  className="field"
                  value={form.contactPhone}
                  onChange={(e) => set("contactPhone", e.target.value)}
                  disabled={busy}
                />
              </label>
              <label className="block">
                <span className="label">Preferred start</span>
                <input
                  className="field"
                  placeholder="e.g. mid-November"
                  value={form.preferredStartDate}
                  onChange={(e) => set("preferredStartDate", e.target.value)}
                  disabled={busy}
                />
              </label>
              <label className="block">
                <span className="label">Exam / cycle</span>
                <input
                  className="field"
                  placeholder="Unit test / Mid-term / Final"
                  value={form.examNameOrType}
                  onChange={(e) => set("examNameOrType", e.target.value)}
                  disabled={busy}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="label">Classes / sections</span>
                <input
                  className="field"
                  placeholder="e.g. Class 9–10, divisions A–B"
                  value={form.targetClasses}
                  onChange={(e) => set("targetClasses", e.target.value)}
                  disabled={busy}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="label">Notes (optional)</span>
                <textarea
                  className="field min-h-[6rem]"
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
                  disabled={busy}
                />
              </label>
            </div>

            <FieldError message={error} />

            <div className="flex flex-wrap gap-3 pt-1">
              <button type="submit" className="btn-accent px-4" disabled={busy}>
                <BusyLabel busy={busy} idle="Submit pilot request" busyText="Sending…" />
              </button>
              <Link to="/login" className="btn-ghost px-4">
                Already provisioned? Sign in
              </Link>
            </div>
          </form>
        )}

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

        <div className="mt-10">
          <PoweredBy />
        </div>
      </main>
    </div>
  );
}
