import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { PageHeader } from "../components/Layout.jsx";
import { analysisHubCards, NAV_TITLES } from "../lib/nav.js";
import { useWorkspaceOptional } from "../workspace.jsx";

export default function AnalysisHub() {
  const { user, features, capabilities } = useAuth();
  const workspace = useWorkspaceOptional();
  const cards = analysisHubCards(user.role, { features });
  const [questions, setQuestions] = useState([]);
  const canViewInsights = capabilities?.canViewInsights !== false;

  useEffect(() => {
    if (!canViewInsights) {
      setQuestions([]);
      return undefined;
    }
    let cancelled = false;
    const q = workspace?.examId ? `?examId=${encodeURIComponent(workspace.examId)}` : "";
    api(`/api/insights/home${q}`)
      .then((res) => {
        if (!cancelled) setQuestions(res.cards || []);
      })
      .catch(() => {
        if (!cancelled) setQuestions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [workspace?.examId, canViewInsights]);

  return (
    <div>
      <PageHeader
        title={NAV_TITLES.analysis}
        subtitle="Start with a question, or browse every report"
      />

      {questions.length > 0 && (
        <section className="mb-8">
          <h2 className="font-serif text-xl mb-3">What should I look at?</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {questions.map((card) => (
              <Link
                key={card.id}
                to={card.to}
                className="rounded-xl border border-clay-500/25 bg-[#fbf4ec] p-4 hover:border-clay-500/50"
              >
                <div className="font-medium text-ink-900">{card.question}</div>
                <p className="mt-1 text-sm text-ink-700/70">{card.body}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="font-serif text-xl mb-3">All reports</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {cards.map((card) => (
            <Link key={card.to} to={card.to} className="card p-5 hover:border-clay-500">
              <div className="font-serif text-2xl">{card.title}</div>
              <p className="mt-2 text-sm text-ink-700/70">{card.body}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
