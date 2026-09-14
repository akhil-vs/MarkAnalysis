import { Link } from "react-router-dom";
import PoweredBy from "../components/PoweredBy.jsx";

const FEATURES = [
  {
    title: "Role-aware mark entry",
    body: "Teachers draft registers; principals and coordinators approve. AB, EX, and WH codes, electives, and theory-plus-practical papers stay in one workflow.",
  },
  {
    title: "School-wide analytics",
    body: "Class, division, subject, teacher, and student views — plus year-on-year and same-subject teacher comparison when you need a sharper read.",
  },
  {
    title: "Official consolidated lists",
    body: "Scale papers to your consolidation ceiling, lock max marks, then download Excel or PDF with school letterhead when every register is approved.",
  },
  {
    title: "Timetables & free slots",
    body: "Daily boards, weekly grids, and find-free lookups driven by your bell schedule and working week — configured once on the school profile.",
  },
  {
    title: "Parent & student portal",
    body: "Issue a read-only link for an exam so families see approved marks without staff accounts or shared passwords.",
  },
  {
    title: "Multi-school tenancy",
    body: "Each campus keeps staff, marks, and analytics isolated. Register a school, share a join code, and approve teachers from the principal desk.",
  },
];

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: "Free",
    period: "14-day trial",
    blurb: "Prove the workflow with one campus before you commit.",
    highlight: false,
    cta: "Start trial",
    to: "/register-school",
    perks: [
      "1 school · up to 300 students",
      "Mark entry, approvals & late entry",
      "Core class & subject analytics",
      "Preview consolidated downloads",
    ],
  },
  {
    id: "campus",
    name: "Campus",
    price: "₹4,999",
    period: "per school / month",
    blurb: "The full exam desk for a single campus running live terms.",
    highlight: true,
    cta: "Register your school",
    to: "/register-school",
    perks: [
      "Unlimited students & staff",
      "Deep insights & year comparison",
      "Official CML Excel / PDF",
      "Timetables, notices & parent portal",
      "School logo on letterheads",
    ],
  },
  {
    id: "district",
    name: "District",
    price: "Custom",
    period: "multi-campus",
    blurb: "Platform console for trusts and boards that run several schools.",
    highlight: false,
    cta: "Talk to us",
    to: "/register-school",
    perks: [
      "Everything in Campus",
      "Platform admin console",
      "Provision & suspend schools",
      "Shared pricing for your trust",
      "Priority onboarding support",
    ],
  },
];

export default function Landing() {
  return (
    <div className="landing min-h-[100dvh] bg-paper text-ink-900">
      <header className="landing-nav absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-4 px-5 py-5 sm:px-8 lg:px-12">
        <a href="#top" className="font-serif text-lg text-cream sm:text-xl">
          Marks Analytics
        </a>
        <nav className="flex items-center gap-2 sm:gap-3">
          <a href="#features" className="hidden text-sm text-cream/70 hover:text-cream sm:inline">
            Features
          </a>
          <a href="#plans" className="hidden text-sm text-cream/70 hover:text-cream sm:inline">
            Plans
          </a>
          <Link to="/login" className="btn-ghost border-cream/25 bg-transparent text-cream hover:bg-cream/10">
            Sign in
          </Link>
          <Link to="/register-school" className="btn-accent">
            Register school
          </Link>
        </nav>
      </header>

      <section id="top" className="landing-hero relative isolate overflow-hidden text-cream">
        <div className="landing-hero-wash absolute inset-0" aria-hidden />
        <div className="relative mx-auto grid min-h-[100dvh] max-w-6xl items-end gap-10 px-5 pb-16 pt-28 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:px-12 lg:pb-20 lg:pt-24">
          <div className="landing-fade-up max-w-xl">
            <p className="font-serif text-4xl leading-none tracking-tight sm:text-5xl lg:text-6xl">
              Marks Analytics
            </p>
            <h1 className="mt-5 font-serif text-2xl leading-snug text-cream/95 sm:text-3xl lg:text-[2.15rem]">
              See the school, not just the scores.
            </h1>
            <p className="mt-4 max-w-md text-base leading-relaxed text-cream/70 sm:text-lg">
              Role-based marks, approvals, timetables, and analytics for principals, exam
              coordinators, and teachers — built for live campuses.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/register-school" className="btn-accent px-5">
                Register your school
              </Link>
              <Link
                to="/login"
                className="btn border border-cream/30 bg-transparent text-cream hover:bg-cream/10"
              >
                Sign in
              </Link>
            </div>
          </div>

          <div className="landing-fade-up landing-fade-up-delay relative" aria-hidden>
            <ProductStage />
          </div>
        </div>
      </section>

      <section id="features" className="landing-section mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:px-12">
        <div className="max-w-2xl">
          <h2 className="font-serif text-3xl sm:text-4xl">Built for the exam desk</h2>
          <p className="mt-3 text-ink-700/75">
            From draft registers to official lists and leadership insight — one workspace per
            school, with clear roles at every step.
          </p>
        </div>
        <ul className="mt-12 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <li key={feature.title} className="landing-feature">
              <h3 className="font-serif text-xl text-ink-900">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-700/75">{feature.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section id="plans" className="border-y border-ink-900/10 bg-cream/60">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:px-12">
          <div className="max-w-2xl">
            <h2 className="font-serif text-3xl sm:text-4xl">Plans that scale with you</h2>
            <p className="mt-3 text-ink-700/75">
              Start with a trial campus, run a full school term, or provision every school in your
              trust from one platform console.
            </p>
          </div>
          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {PLANS.map((plan) => (
              <article
                key={plan.id}
                className={`flex flex-col rounded-2xl border p-6 sm:p-7 ${
                  plan.highlight
                    ? "border-ink-900 bg-ink-950 text-cream shadow-lg shadow-ink-950/15"
                    : "border-ink-900/12 bg-cream"
                }`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-serif text-2xl">{plan.name}</h3>
                  {plan.highlight && (
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-clay-500">
                      Most schools
                    </span>
                  )}
                </div>
                <p className={`mt-2 text-sm ${plan.highlight ? "text-cream/65" : "text-ink-700/70"}`}>
                  {plan.blurb}
                </p>
                <div className="mt-6">
                  <span className="font-serif text-4xl tracking-tight">{plan.price}</span>
                  <span
                    className={`ml-2 text-sm ${plan.highlight ? "text-cream/50" : "text-ink-700/55"}`}
                  >
                    {plan.period}
                  </span>
                </div>
                <ul className="mt-6 flex-1 space-y-2.5">
                  {plan.perks.map((perk) => (
                    <li
                      key={perk}
                      className={`flex gap-2 text-sm leading-snug ${
                        plan.highlight ? "text-cream/80" : "text-ink-700/80"
                      }`}
                    >
                      <span
                        className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                          plan.highlight ? "bg-clay-500" : "bg-moss-500"
                        }`}
                        aria-hidden
                      />
                      {perk}
                    </li>
                  ))}
                </ul>
                <Link
                  to={plan.to}
                  className={`mt-8 w-full text-center ${
                    plan.highlight ? "btn-accent" : "btn-primary"
                  }`}
                >
                  {plan.cta}
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:px-12">
        <div className="landing-cta relative overflow-hidden rounded-3xl bg-ink-950 px-6 py-14 text-cream sm:px-12">
          <div className="landing-cta-glow absolute inset-0" aria-hidden />
          <div className="relative max-w-xl">
            <h2 className="font-serif text-3xl sm:text-4xl">Open your school workspace</h2>
            <p className="mt-3 text-cream/70">
              Create the principal account, invite staff with a join code, and run the next exam
              cycle without shared spreadsheets.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/register-school" className="btn-accent px-5">
                Register your school
              </Link>
              <Link to="/signup" className="btn border border-cream/25 bg-transparent text-cream hover:bg-cream/10">
                Request staff access
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-ink-900/10 px-5 py-8 sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-serif text-lg text-ink-900">Marks Analytics</div>
            <p className="mt-1 text-sm text-ink-700/60">School performance suite</p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm text-ink-700/70">
            <Link className="hover:text-ink-900" to="/login">
              Sign in
            </Link>
            <Link className="hover:text-ink-900" to="/register-school">
              Register school
            </Link>
            <a className="hover:text-ink-900" href="/portal">
              Parent portal
            </a>
            <PoweredBy />
          </div>
        </div>
      </footer>
    </div>
  );
}

function ProductStage() {
  return (
    <div className="landing-stage relative aspect-[5/4] w-full max-w-lg justify-self-end lg:max-w-none">
      <div className="landing-stage-frame absolute inset-0 overflow-hidden rounded-tl-[2rem] border border-cream/15 bg-ink-900/55 shadow-2xl shadow-black/40 backdrop-blur-sm">
        <div className="flex items-center gap-2 border-b border-cream/10 px-4 py-3">
          <span className="h-2 w-2 rounded-full bg-clay-500/80" />
          <span className="h-2 w-2 rounded-full bg-cream/25" />
          <span className="h-2 w-2 rounded-full bg-cream/25" />
          <span className="ml-2 text-[11px] uppercase tracking-wider text-cream/45">
            Final Exam · 2025-26
          </span>
        </div>
        <div className="grid h-[calc(100%-2.75rem)] grid-cols-[0.9fr_1.1fr] gap-3 p-4">
          <div className="flex flex-col gap-3">
            <div className="landing-pulse rounded-xl border border-cream/10 bg-cream/[0.04] p-3">
              <div className="text-[10px] uppercase tracking-wide text-cream/40">School mean</div>
              <div className="mt-1 font-serif text-3xl text-cream">72.4%</div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-cream/10">
                <div className="landing-bar h-full w-[72%] rounded-full bg-moss-500" />
              </div>
            </div>
            <div className="flex-1 rounded-xl border border-cream/10 bg-cream/[0.03] p-3">
              <div className="text-[10px] uppercase tracking-wide text-cream/40">Pending approvals</div>
              <div className="mt-3 space-y-2">
                {["Biology 10-A", "English 10-D", "Chemistry 9-B"].map((row, i) => (
                  <div key={row} className="flex items-center justify-between text-xs text-cream/75">
                    <span>{row}</span>
                    <span className={i === 0 ? "text-clay-500" : "text-cream/35"}>
                      {i === 0 ? "Due" : "Draft"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-cream/10 bg-cream/[0.03] p-3">
            <div className="text-[10px] uppercase tracking-wide text-cream/40">Subject spread</div>
            <div className="mt-4 flex h-[70%] items-end gap-2 px-1">
              {[42, 68, 55, 81, 63, 74, 58].map((h, i) => (
                <div
                  key={i}
                  className="landing-col flex-1 rounded-t-md bg-gradient-to-t from-clay-500/90 to-cream/50"
                  style={{ height: `${h}%`, animationDelay: `${i * 80}ms` }}
                />
              ))}
            </div>
            <div className="mt-3 flex justify-between text-[10px] text-cream/35">
              <span>Math</span>
              <span>Sci</span>
              <span>Eng</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
