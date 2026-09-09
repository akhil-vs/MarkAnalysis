import { Link } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import { PageHeader } from "../components/Layout.jsx";
import { analysisHubCards, NAV_TITLES } from "../lib/nav.js";

export default function AnalysisHub() {
  const { user } = useAuth();
  const cards = analysisHubCards(user.role);

  return (
    <div>
      <PageHeader
        title={NAV_TITLES.analysis}
        subtitle="Class, division, subject, teacher, and year-on-year comparison"
      />
      <div className="grid sm:grid-cols-2 gap-4">
        {cards.map((card) => (
          <Link key={card.to} to={card.to} className="card p-5 hover:border-clay-500">
            <div className="font-serif text-2xl">{card.title}</div>
            <p className="mt-2 text-sm text-ink-700/70">{card.body}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
