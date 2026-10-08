import { Navigate } from "react-router-dom";

/** Dedicated Exam office entry — Records Exams tab is the editor. */
export default function Exams() {
  return <Navigate to="/manage?tab=Exams" replace />;
}
