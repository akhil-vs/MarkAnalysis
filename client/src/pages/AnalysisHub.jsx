import { Link } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import { PageHeader } from "../components/Layout.jsx";

export default function AnalysisHub() {
  const { user } = useAuth();
  const leadership = user.role !== "TEACHER";
  const cards = [
    leadership && {
      to: "/analysis/school",
      title: "School",
      body: "KPIs, section averages, grade mix, term trend, and toppers.",
    },
    {
      to: "/analysis/classes",
      title: "Classes",
      body: "Averages, histograms, top and bottom performers, section radar.",
    },
    leadership && {
      to: "/analysis/subjects",
      title: "Subjects",
      body: "Difficulty, class comparison, and teacher-wise results.",
    },
    {
      to: "/analysis/students",
      title: "Students",
      body: "Subject trends, rank, strengths and weaknesses, report cards.",
    },
  ].filter(Boolean);

  return (
    <div>
      <PageHeader title="Marks analysis" subtitle="Pick a level — school, class, subject, or student" />
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
