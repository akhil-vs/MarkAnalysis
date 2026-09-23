import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PoweredBy from "../components/PoweredBy.jsx";
import {
  PRICING_REGIONS,
  detectPricingRegionId,
  formatCampusPrice,
  getPricingRegion,
} from "../lib/pricingRegions.js";
import { SHOW_PUBLIC_PLANS, SHOW_PUBLIC_REGISTRATION } from "../lib/publicAccess.js";

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

function buildPlans(region) {
  const price = formatCampusPrice(region);
  return [
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
      price,
      period: region.period,
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
}

export default function Landing() {
  const [regionId, setRegionId] = useState("GLOBAL");

  useEffect(() => {
    setRegionId(detectPricingRegionId());
  }, []);

  const region = getPricingRegion(regionId);
  const plans = buildPlans(region);

  return (
    <div className="landing min-h-[100dvh] overflow-x-hidden bg-paper text-ink-900">
      <header className="landing-nav absolute inset-x-0 top-0 z-20 safe-pt">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 min-[400px]:px-5 sm:gap-4 sm:px-8 sm:py-5 lg:px-12">
          <a href="#top" className="min-w-0 shrink font-serif text-base text-cream min-[400px]:text-lg sm:text-xl">
            Marks Analytics
          </a>
          <nav className="flex shrink-0 items-center gap-1.5 min-[400px]:gap-2 sm:gap-3">
            <a
              href="#features"
              className="hidden text-sm text-cream/70 hover:text-cream md:inline"
            >
              Features
            </a>
            {SHOW_PUBLIC_PLANS && (
              <a href="#plans" className="hidden text-sm text-cream/70 hover:text-cream md:inline">
                Plans
              </a>
            )}
            <Link
              to="/login"
              className={
                SHOW_PUBLIC_REGISTRATION
                  ? "btn-ghost border-cream/25 bg-transparent px-2.5 py-2 text-xs text-cream hover:bg-cream/10 min-[400px]:px-3.5 min-[400px]:text-sm"
                  : "btn-accent px-2.5 py-2 text-xs min-[400px]:px-3.5 min-[400px]:text-sm"
              }
            >
              Sign in
            </Link>
            {SHOW_PUBLIC_REGISTRATION && (
              <Link
                to="/register-school"
                className="btn-accent px-2.5 py-2 text-xs min-[400px]:px-3.5 min-[400px]:text-sm"
              >
                <span className="min-[400px]:hidden">Register</span>
                <span className="hidden min-[400px]:inline">Register school</span>
              </Link>
            )}
          </nav>
        </div>
      </header>

      <section id="top" className="landing-hero relative isolate overflow-hidden text-cream">
        <div className="landing-hero-wash absolute inset-0" aria-hidden />
        <div className="relative mx-auto grid min-h-[100dvh] max-w-6xl grid-cols-1 items-center gap-8 px-4 pb-12 pt-[5.5rem] min-[400px]:px-5 sm:gap-10 sm:px-8 sm:pb-16 sm:pt-28 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12 lg:px-12 lg:pb-20 lg:pt-24">
          <div className="landing-fade-up w-full max-w-xl">
            <p className="font-serif text-[2rem] leading-[1.05] tracking-tight min-[400px]:text-4xl sm:text-5xl lg:text-6xl">
              Marks Analytics
            </p>
            <h1 className="mt-4 font-serif text-xl leading-snug text-cream/95 min-[400px]:mt-5 min-[400px]:text-2xl sm:text-3xl lg:text-[2.15rem]">
              See the school, not just the scores.
            </h1>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-cream/70 min-[400px]:mt-4 min-[400px]:text-base sm:text-lg">
              Role-based marks, approvals, timetables, and analytics for principals, exam
              coordinators, and teachers — built for live campuses.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-2.5 min-[400px]:mt-8 min-[400px]:gap-3">
              {SHOW_PUBLIC_REGISTRATION && (
                <Link to="/register-school" className="btn-accent px-4 min-[400px]:px-5">
                  Register your school
                </Link>
              )}
              <Link
                to="/login"
                className={
                  SHOW_PUBLIC_REGISTRATION
                    ? "btn border border-cream/30 bg-transparent text-cream hover:bg-cream/10"
                    : "btn-accent px-4 min-[400px]:px-5"
                }
              >
                Sign in
              </Link>
            </div>
          </div>

          <div className="landing-fade-up landing-fade-up-delay relative w-full min-w-0" aria-hidden>
            <ProductStage />
          </div>
        </div>
      </section>

      <section
        id="features"
        className="landing-section mx-auto max-w-6xl px-4 py-14 min-[400px]:px-5 sm:px-8 sm:py-20 lg:px-12"
      >
        <div className="max-w-2xl">
          <h2 className="font-serif text-2xl min-[400px]:text-3xl sm:text-4xl">Built for the exam desk</h2>
          <p className="mt-3 text-sm text-ink-700/75 sm:text-base">
            From draft registers to official lists and leadership insight — one workspace per
            school, with clear roles at every step.
          </p>
        </div>
        <ul className="mt-8 grid grid-cols-1 gap-x-8 gap-y-8 min-[480px]:grid-cols-2 sm:mt-12 sm:gap-x-10 sm:gap-y-12 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <li key={feature.title} className="landing-feature min-w-0">
              <h3 className="font-serif text-lg text-ink-900 sm:text-xl">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-700/75">{feature.body}</p>
            </li>
          ))}
        </ul>
      </section>

      {SHOW_PUBLIC_PLANS && (
      <section id="plans" className="border-y border-ink-900/10 bg-cream/60">
        <div className="mx-auto max-w-6xl px-4 py-14 min-[400px]:px-5 sm:px-8 sm:py-20 lg:px-12">
          <div className="flex flex-col gap-5 sm:gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl min-w-0">
              <h2 className="font-serif text-2xl min-[400px]:text-3xl sm:text-4xl">
                Plans that scale with you
              </h2>
              <p className="mt-3 text-sm text-ink-700/75 sm:text-base">
                Start with a trial campus, run a full school term, or provision every school in your
                trust from one platform console. Prices shown for your region.
              </p>
            </div>
            <label className="landing-region flex w-full max-w-xs flex-col gap-1.5 self-start lg:self-end">
              <span className="text-[11px] font-medium uppercase tracking-wide text-ink-700/60">
                Pricing region
              </span>
              <select
                className="field field-filter w-full max-w-full min-w-0 bg-cream"
                value={regionId}
                onChange={(e) => setRegionId(e.target.value)}
                aria-label="Pricing region"
              >
                {PRICING_REGIONS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label} ({r.currency})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-5 sm:mt-12 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan) => (
              <article
                key={plan.id}
                className={`flex min-w-0 flex-col rounded-2xl border p-5 sm:p-6 md:p-7 ${
                  plan.highlight
                    ? "border-ink-900 bg-ink-950 text-cream shadow-lg shadow-ink-950/15 md:col-span-2 lg:col-span-1"
                    : "border-ink-900/12 bg-cream"
                }`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-serif text-xl sm:text-2xl">{plan.name}</h3>
                  {plan.highlight && (
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-clay-500">
                      Most schools
                    </span>
                  )}
                </div>
                <p className={`mt-2 text-sm ${plan.highlight ? "text-cream/65" : "text-ink-700/70"}`}>
                  {plan.blurb}
                </p>
                <div className="mt-5 sm:mt-6">
                  <div className="font-serif text-3xl tracking-tight sm:text-4xl">{plan.price}</div>
                  <div
                    className={`mt-1 text-sm ${plan.highlight ? "text-cream/50" : "text-ink-700/55"}`}
                  >
                    {plan.period}
                    {plan.id === "campus" ? ` · ${region.label}` : ""}
                  </div>
                </div>
                <ul className="mt-5 flex-1 space-y-2.5 sm:mt-6">
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
                      <span className="min-w-0">{perk}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  to={plan.to}
                  className={`mt-7 w-full text-center sm:mt-8 ${
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
      )}

      <section className="mx-auto max-w-6xl px-4 py-14 min-[400px]:px-5 sm:px-8 sm:py-20 lg:px-12">
        <div className="landing-cta relative overflow-hidden rounded-2xl bg-ink-950 px-5 py-10 text-cream sm:rounded-3xl sm:px-12 sm:py-14">
          <div className="landing-cta-glow absolute inset-0" aria-hidden />
          <div className="relative max-w-xl">
            <h2 className="font-serif text-2xl min-[400px]:text-3xl sm:text-4xl">
              Open your school workspace
            </h2>
            <p className="mt-3 text-sm text-cream/70 sm:text-base">
              {SHOW_PUBLIC_REGISTRATION
                ? "Create the principal account, invite staff with a join code, and run the next exam cycle without shared spreadsheets."
                : "Sign in to run the next exam cycle without shared spreadsheets."}
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5 sm:mt-8 sm:gap-3">
              {SHOW_PUBLIC_REGISTRATION ? (
                <>
                  <Link to="/register-school" className="btn-accent px-4 sm:px-5">
                    Register your school
                  </Link>
                  <Link
                    to="/signup"
                    className="btn border border-cream/25 bg-transparent text-cream hover:bg-cream/10"
                  >
                    Request staff access
                  </Link>
                </>
              ) : (
                <Link to="/login" className="btn-accent px-4 sm:px-5">
                  Sign in
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      <footer className="safe-pb border-t border-ink-900/10 px-4 py-8 min-[400px]:px-5 sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="font-serif text-lg text-ink-900">Marks Analytics</div>
            <p className="mt-1 text-sm text-ink-700/60">School performance suite</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-700/70">
            <Link className="hover:text-ink-900" to="/login">
              Sign in
            </Link>
            {SHOW_PUBLIC_REGISTRATION && (
              <Link className="hover:text-ink-900" to="/register-school">
                Register school
              </Link>
            )}
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
    <div className="landing-stage relative mx-auto aspect-[5/4] w-full max-w-md min-[480px]:max-w-lg lg:mx-0 lg:max-w-none">
      <div className="landing-stage-frame absolute inset-0 overflow-hidden rounded-tl-2xl border border-cream/15 bg-ink-900/55 shadow-2xl shadow-black/40 backdrop-blur-sm sm:rounded-tl-[2rem]">
        <div className="flex items-center gap-2 border-b border-cream/10 px-3 py-2.5 sm:px-4 sm:py-3">
          <span className="h-2 w-2 rounded-full bg-clay-500/80" />
          <span className="h-2 w-2 rounded-full bg-cream/25" />
          <span className="h-2 w-2 rounded-full bg-cream/25" />
          <span className="ml-1 truncate text-[10px] uppercase tracking-wider text-cream/45 sm:ml-2 sm:text-[11px]">
            Final Exam · 2025-26
          </span>
        </div>
        <div className="grid h-[calc(100%-2.5rem)] grid-cols-1 gap-2.5 p-2.5 min-[380px]:grid-cols-[0.9fr_1.1fr] sm:h-[calc(100%-2.75rem)] sm:gap-3 sm:p-4">
          <div className="flex min-w-0 flex-col gap-2.5 sm:gap-3">
            <div className="landing-pulse rounded-xl border border-cream/10 bg-cream/[0.04] p-2.5 sm:p-3">
              <div className="text-[10px] uppercase tracking-wide text-cream/40">School mean</div>
              <div className="mt-1 font-serif text-2xl text-cream sm:text-3xl">72.4%</div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-cream/10">
                <div className="landing-bar h-full w-[72%] rounded-full bg-moss-500" />
              </div>
            </div>
            <div className="hidden min-h-0 flex-1 rounded-xl border border-cream/10 bg-cream/[0.03] p-2.5 min-[380px]:block sm:p-3">
              <div className="text-[10px] uppercase tracking-wide text-cream/40">Pending approvals</div>
              <div className="mt-2 space-y-1.5 sm:mt-3 sm:space-y-2">
                {["Biology 10-A", "English 10-D", "Chemistry 9-B"].map((row, i) => (
                  <div
                    key={row}
                    className="flex items-center justify-between gap-2 text-[11px] text-cream/75 sm:text-xs"
                  >
                    <span className="truncate">{row}</span>
                    <span className={`shrink-0 ${i === 0 ? "text-clay-500" : "text-cream/35"}`}>
                      {i === 0 ? "Due" : "Draft"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="min-w-0 rounded-xl border border-cream/10 bg-cream/[0.03] p-2.5 sm:p-3">
            <div className="text-[10px] uppercase tracking-wide text-cream/40">Subject spread</div>
            <div className="mt-3 flex h-16 items-end gap-1.5 px-0.5 min-[380px]:mt-4 min-[380px]:h-[70%] sm:gap-2 sm:px-1">
              {[42, 68, 55, 81, 63, 74, 58].map((h, i) => (
                <div
                  key={i}
                  className="landing-col flex-1 rounded-t-md bg-gradient-to-t from-clay-500/90 to-cream/50"
                  style={{ height: `${h}%`, animationDelay: `${i * 80}ms` }}
                />
              ))}
            </div>
            <div className="mt-2 flex justify-between text-[10px] text-cream/35 sm:mt-3">
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
