import { examLabel } from "../lib/exams.js";

/** Lightweight exam dropdown — kept out of AnalysisPanels so pages avoid loading recharts. */
export function ExamSelect({ exams = [], value, onChange, id, className = "" }) {
  return (
    <select
      id={id}
      className={`field-filter ${className}`.trim()}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {exams.map((exam) => (
        <option key={exam.id} value={exam.id}>
          {examLabel(exam)}
        </option>
      ))}
    </select>
  );
}
