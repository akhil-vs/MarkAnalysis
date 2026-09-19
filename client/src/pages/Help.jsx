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
            ? "Downloadable application flows and user manuals for every school role"
            : "Application flows and your role’s user manual"
        }
      />
      {platform ? (
        <p className="mb-5 max-w-2xl text-sm text-ink-700/70">
          Start with the shared application-flows PDF, then open any school-role guide. Staff signed in
          as principal, exam co-ordinator, or teacher see the flows sheet plus the manual for their own
          role.
        </p>
      ) : (
        <p className="mb-5 max-w-2xl text-sm text-ink-700/70">
          Download the application-flows overview for every role, plus the step-by-step manual that
          matches your signed-in role.
        </p>
      )}
      {manuals.length === 0 ? (
        <p className="text-sm text-ink-700/70">No user manual is available for this account.</p>
      ) : (
        <div className={`grid gap-4 ${manuals.length > 1 ? "sm:grid-cols-2 xl:grid-cols-3" : ""}`}>
          {manuals.map((manual) => (
            <ManualCard key={manual.id} manual={manual} />
          ))}
        </div>
      )}
    </div>
  );
}
