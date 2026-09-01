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
      body: "KPIs, class and division averages, grade mix, and year-on-year movement.",
    },
    {
      to: "/analysis/classes",
      title: "Classes & divisions",
      body: "Whole-class analysis plus each section, with subject stats and rankings.",
    },
    leadership && {
      to: "/analysis/subjects",
      title: "Subjects",
      body: "School-wide subject results, class splits, and teacher-to-teacher comparison.",
    },
    leadership && {
      to: "/analysis/teachers",
      title: "Teachers",
      body: "Each teacher’s averages, registers, and how they compare in shared subjects.",
    },
    {
      to: "/analysis/students",
      title: "Students",
      body: "Subject trends, rank, strengths and weaknesses, report cards.",
    },
    leadership && {
      to: "/analysis/compare",
      title: "Comparisons",
      body: "Previous years for the same exam type, and same-subject results across teachers.",
    },
  ].filter(Boolean);

  return (
    <div>
      <PageHeader title="Marks analysis" subtitle="Class, division, subject, teacher, and year-on-year comparison" />
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
