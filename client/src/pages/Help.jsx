import { PageHeader } from "../components/Layout.jsx";
import { useAuth } from "../auth.jsx";
import { HELP_MANUALS, manualsForRole } from "../lib/helpManuals.js";
import { NAV_TITLES } from "../lib/nav.js";

function ManualCard({ manual, highlight }) {
  return (
    <article
      className={`card p-5 flex flex-col gap-3 ${highlight ? "border-clay-500/50 bg-[#fbf7f1]" : ""}`}
    >
      <div>
        {highlight ? (
          <div className="mb-1 text-[11px] uppercase tracking-wide text-clay-600">Your role</div>
        ) : null}
        <h2 className="font-serif text-2xl text-ink-900">{manual.title}</h2>
        <p className="mt-1 text-sm text-ink-700/55">{manual.audience}</p>
        <p className="mt-2 text-sm text-ink-700/75">{manual.body}</p>
      </div>
      <div className="mt-auto flex flex-wrap gap-2">
        <a className="btn-primary" href={manual.href} target="_blank" rel="noopener noreferrer">
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
  const primaryId = manuals[0]?.id;

  return (
    <div>
      <PageHeader
        title={NAV_TITLES.help}
        subtitle="Downloadable user manuals for every school role"
      />
      <p className="mb-5 max-w-2xl text-sm text-ink-700/70">
        Open the guide that matches your role, or browse the other manuals to see how principals,
        exam co-ordinators, and teachers work together on marks.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {manuals.map((manual) => (
          <ManualCard
            key={manual.id}
            manual={manual}
            highlight={user?.role !== "PLATFORM_ADMIN" && manual.id === primaryId}
          />
        ))}
      </div>
      <p className="mt-6 text-xs text-ink-700/45">
        PDFs are generated from the guides in the repository ({HELP_MANUALS.length} manuals).
      </p>
    </div>
  );
}
