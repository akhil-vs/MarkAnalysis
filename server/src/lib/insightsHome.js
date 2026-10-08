import { isLeadership } from "../middleware/auth.js";

/**
 * Role-filtered “what should I look at?” cards for the analysis hub.
 * Links reuse existing report routes — no new analytics math.
 */
export function insightsHomeCards(role, { examId } = {}) {
  const examQ = examId ? `?examId=${encodeURIComponent(examId)}` : "";
  const leadership = isLeadership(role);

  const teacherCards = [
    {
      id: "my-classes",
      question: "How are my sections doing?",
      body: "Subject stats and rankings for the classes you teach.",
      to: "/analysis/classes",
    },
    {
      id: "watchlist",
      question: "Who needs attention?",
      body: "Students at risk or slipping across your papers.",
      to: "/analysis/students",
    },
  ];

  if (!leadership) return teacherCards;

  return [
    {
      id: "upload-queue",
      question: "Who still needs to upload?",
      body: "Missing and awaiting-approval registers for the working exam.",
      to: examId ? `/pending-uploads?examId=${encodeURIComponent(examId)}` : "/pending-uploads",
    },
    {
      id: "weak-sections",
      question: "Which classes are weakest?",
      body: "Division averages, subject splits, and rankings.",
      to: "/analysis/classes",
    },
    {
      id: "hard-subjects",
      question: "Which subjects are hardest?",
      body: "School-wide subject results and teacher comparison.",
      to: "/analysis/subjects",
    },
    {
      id: "year-compare",
      question: "How does this exam compare to last year?",
      body: "Same exam type across academic years, plus teacher pairs.",
      to: `/analysis/compare${examQ}`,
    },
    {
      id: "deep",
      question: "What are the deep readiness signals?",
      body: "Outcomes, division gaps, improvement cohorts, and teacher load.",
      to: "/analysis/deep",
    },
  ];
}
