import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth.jsx";
import Layout from "./components/Layout.jsx";
import Login from "./pages/Login.jsx";
import Signup from "./pages/Signup.jsx";
import Pending from "./pages/Pending.jsx";
import PrincipalDashboard from "./pages/PrincipalDashboard.jsx";
import TeacherDashboard from "./pages/TeacherDashboard.jsx";
import Users from "./pages/Users.jsx";
import Manage from "./pages/Manage.jsx";
import MarksEntry from "./pages/MarksEntry.jsx";
import MarksUpload from "./pages/MarksUpload.jsx";
import StudentAnalytics from "./pages/StudentAnalytics.jsx";
import ClassAnalytics from "./pages/ClassAnalytics.jsx";
import SubjectAnalytics from "./pages/SubjectAnalytics.jsx";
import AnalysisHub from "./pages/AnalysisHub.jsx";
import AnalysisClasses from "./pages/AnalysisClasses.jsx";
import AnalysisSubjects from "./pages/AnalysisSubjects.jsx";
import AnalysisStudents from "./pages/AnalysisStudents.jsx";
import AnalysisTeachers from "./pages/AnalysisTeachers.jsx";
import AnalysisCompare from "./pages/AnalysisCompare.jsx";
import ClassGroupAnalytics from "./pages/ClassGroupAnalytics.jsx";
import SubjectSchoolAnalytics from "./pages/SubjectSchoolAnalytics.jsx";
import TeacherAnalytics from "./pages/TeacherAnalytics.jsx";
import PendingUploads from "./pages/PendingUploads.jsx";
import LateEntryRequests from "./pages/LateEntryRequests.jsx";
import AuditLog from "./pages/AuditLog.jsx";
import ConsolidatedLists from "./pages/ConsolidatedLists.jsx";

function Guard({ roles, children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-10 text-ink-700/70">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.status === "PENDING") return <Navigate to="/pending" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function Home() {
  const { user } = useAuth();
  if (user.role === "PRINCIPAL" || user.role === "EXAM_COORDINATOR") return <PrincipalDashboard />;
  return <TeacherDashboard />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/pending" element={<Pending />} />
      <Route
        path="/"
        element={
          <Guard>
            <Layout />
          </Guard>
        }
      >
        <Route index element={<Home />} />
        <Route path="users" element={<Guard roles={["PRINCIPAL", "EXAM_COORDINATOR"]}><Users /></Guard>} />
        <Route
          path="manage"
          element={<Guard roles={["PRINCIPAL", "EXAM_COORDINATOR"]}><Manage /></Guard>}
        />
        <Route path="marks" element={<MarksEntry />} />
        <Route path="upload" element={<MarksUpload />} />
        <Route
          path="audit"
          element={<Guard roles={["PRINCIPAL", "EXAM_COORDINATOR"]}><AuditLog /></Guard>}
        />
        <Route path="analysis" element={<AnalysisHub />} />
        <Route
          path="analysis/school"
          element={<Guard roles={["PRINCIPAL", "EXAM_COORDINATOR"]}><PrincipalDashboard /></Guard>}
        />
        <Route path="analysis/classes" element={<AnalysisClasses />} />
        <Route path="analysis/classes/group/:className" element={<ClassGroupAnalytics />} />
        <Route
          path="analysis/subjects"
          element={<Guard roles={["PRINCIPAL", "EXAM_COORDINATOR"]}><AnalysisSubjects /></Guard>}
        />
        <Route
          path="analysis/subjects/name/:name"
          element={<Guard roles={["PRINCIPAL", "EXAM_COORDINATOR"]}><SubjectSchoolAnalytics /></Guard>}
        />
        <Route
          path="analysis/subjects/:id"
          element={<Guard roles={["PRINCIPAL", "EXAM_COORDINATOR"]}><SubjectAnalytics /></Guard>}
        />
        <Route
          path="analysis/teachers"
          element={<Guard roles={["PRINCIPAL", "EXAM_COORDINATOR"]}><AnalysisTeachers /></Guard>}
        />
        <Route path="analysis/teachers/:id" element={<TeacherAnalytics />} />
        <Route
          path="analysis/compare"
          element={<Guard roles={["PRINCIPAL", "EXAM_COORDINATOR"]}><AnalysisCompare /></Guard>}
        />
        <Route path="analysis/students" element={<AnalysisStudents />} />
        <Route
          path="consolidated"
          element={<Guard roles={["PRINCIPAL", "EXAM_COORDINATOR"]}><ConsolidatedLists /></Guard>}
        />
        <Route
          path="pending-uploads"
          element={<Guard roles={["PRINCIPAL", "EXAM_COORDINATOR"]}><PendingUploads /></Guard>}
        />
        <Route
          path="late-entry"
          element={<Guard roles={["PRINCIPAL", "EXAM_COORDINATOR"]}><LateEntryRequests /></Guard>}
        />
        <Route path="students/:id" element={<StudentAnalytics />} />
        <Route path="classes/:id" element={<ClassAnalytics />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
