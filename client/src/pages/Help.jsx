import { PageHeader } from "../components/Layout.jsx";
import { useAuth } from "../auth.jsx";
import { manualsForRole } from "../lib/helpManuals.js";
import { NAV_TITLES } from "../lib/nav.js";
import { isPlatformAdmin } from "../lib/roles.js";

function ManualCard({ manual }) {
  return (
    <article className="card p-5 flex flex-col gap-3 max-w-xl">
      <div>
        <h2 className="font-serif text-2xl text-ink-900">{manual.title}</h2>
        <p className="mt-1 text-sm text-ink-700/55">{manual.audience}</p>
        <p className="mt-2 text-sm text-ink-700/75">{manual.body}</p>
      </div>
      <div className="mt-auto flex flex-wrap gap-2">
        <a className="btn-primary" href={manual.href}>
          Open PDF
        </a>
        <a className="btn-ghost" href={manual.href} download={manual.file}>
          Download
        </a>
      </div>
    </article>
  );
}

export default function Help() {
  const { user } = useAuth();
  const manuals = manualsForRole(user?.role);
  const platform = isPlatformAdmin(user?.role);

  return (
    <div>
      <PageHeader
        title={NAV_TITLES.help}
        subtitle={
          platform
            ? "Downloadable user manuals for every school role"
            : "Your role’s user manual"
        }
      />
      {platform ? (
        <p className="mb-5 max-w-2xl text-sm text-ink-700/70">
          Open any school-role guide. Staff signed in as principal, exam co-ordinator, or teacher
          only see the manual for their own role.
        </p>
      ) : (
        <p className="mb-5 max-w-2xl text-sm text-ink-700/70">
          This guide matches your signed-in role. Open or download the PDF for step-by-step help.
        </p>
      )}
      {manuals.length === 0 ? (
        <p className="text-sm text-ink-700/70">No user manual is available for this account.</p>
      ) : (
        <div className={`grid gap-4 ${platform ? "sm:grid-cols-2 xl:grid-cols-3" : ""}`}>
          {manuals.map((manual) => (
            <ManualCard key={manual.id} manual={manual} />
          ))}
        </div>
      )}

      {!platform && (
        <section className="mt-8 max-w-2xl">
          <h2 className="font-serif text-xl text-ink-900">Glossary</h2>
          <dl className="mt-3 space-y-2 text-sm text-ink-700/80">
            <div>
              <dt className="font-medium text-ink-900">Exam queue</dt>
              <dd>Leadership hub: Missing · Submitted · Access requests · Ready for CML.</dd>
            </div>
            <div>
              <dt className="font-medium text-ink-900">Mark progress</dt>
              <dd>Chase teachers who still have empty registers (Exam queue → Missing).</dd>
            </div>
            <div>
              <dt className="font-medium text-ink-900">CML</dt>
              <dd>Consolidated mark lists — official class lists after every paper is approved.</dd>
            </div>
            <div>
              <dt className="font-medium text-ink-900">AB / EX / WH</dt>
              <dd>Absent, exempt, and withheld mark codes on the register (theory column on split papers).</dd>
            </div>
            <div>
              <dt className="font-medium text-ink-900">Register / paper</dt>
              <dd>One class × subject mark sheet for an exam. Teachers save drafts, then submit for approval.</dd>
            </div>
          </dl>
        </section>
      )}
    </div>
  );
}
