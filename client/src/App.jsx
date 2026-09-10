import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { useAuth } from "./auth.jsx";
import Layout from "./components/Layout.jsx";
import { guardRolesForRoute, paths } from "./lib/nav.js";
import Login from "./pages/Login.jsx";
import Signup from "./pages/Signup.jsx";
import Pending from "./pages/Pending.jsx";
import PrincipalDashboard from "./pages/PrincipalDashboard.jsx";
import CoordinatorDashboard from "./pages/CoordinatorDashboard.jsx";
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
import AnalysisDeepInsights from "./pages/AnalysisDeepInsights.jsx";
import ClassGroupAnalytics from "./pages/ClassGroupAnalytics.jsx";
import SubjectSchoolAnalytics from "./pages/SubjectSchoolAnalytics.jsx";
import TeacherAnalytics from "./pages/TeacherAnalytics.jsx";
import PendingUploads from "./pages/PendingUploads.jsx";
import LateEntryRequests from "./pages/LateEntryRequests.jsx";
import AuditLog from "./pages/AuditLog.jsx";
import ConsolidatedLists from "./pages/ConsolidatedLists.jsx";
import Profile from "./pages/Profile.jsx";
import SchoolSettings from "./pages/SchoolSettings.jsx";
import Timetables from "./pages/Timetables.jsx";
import TeacherTimetable from "./pages/TeacherTimetable.jsx";

function Guard({ roles, children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-10 text-ink-700/70">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.status === "PENDING") return <Navigate to="/pending" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function Guarded({ route, children }) {
  return <Guard roles={guardRolesForRoute(route)}>{children}</Guard>;
}

function Home() {
  const { user } = useAuth();
  if (user.role === "PRINCIPAL") return <PrincipalDashboard />;
  if (user.role === "EXAM_COORDINATOR") return <CoordinatorDashboard />;
  return <TeacherDashboard />;
}

function TeacherAnalyticsGuard() {
  const { user } = useAuth();
  const { id } = useParams();
  if (user.role === "TEACHER" && user.id !== id) {
    return <Navigate to={paths.teacher(user.id)} replace />;
  }
  return <TeacherAnalytics />;
}

function RedirectClasses() {
  const { id } = useParams();
  return <Navigate to={paths.classSection(id)} replace />;
}

function RedirectStudents() {
  const { id } = useParams();
  return <Navigate to={paths.student(id)} replace />;
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
        <Route path="users" element={<Guarded route="users"><Users /></Guarded>} />
        <Route path="manage" element={<Guarded route="manage"><Manage /></Guarded>} />
        <Route path="marks" element={<MarksEntry />} />
        <Route path="upload" element={<MarksUpload />} />
        <Route path="audit" element={<Guarded route="audit"><AuditLog /></Guarded>} />
        <Route path="analysis" element={<AnalysisHub />} />
        <Route
          path="analysis/school"
          element={<Guarded route="analysis/school"><PrincipalDashboard /></Guarded>}
        />
        <Route path="analysis/classes" element={<AnalysisClasses />} />
        <Route path="analysis/classes/group/:className" element={<ClassGroupAnalytics />} />
        <Route path="analysis/classes/:id" element={<ClassAnalytics />} />
        <Route
          path="analysis/subjects"
          element={<Guarded route="analysis/subjects"><AnalysisSubjects /></Guarded>}
        />
        <Route
          path="analysis/subjects/name/:name"
          element={<Guarded route="analysis/subjects/name/:name"><SubjectSchoolAnalytics /></Guarded>}
        />
        <Route
          path="analysis/subjects/:id"
          element={<Guarded route="analysis/subjects/:id"><SubjectAnalytics /></Guarded>}
        />
        <Route
          path="analysis/teachers"
          element={<Guarded route="analysis/teachers"><AnalysisTeachers /></Guarded>}
        />
        <Route path="analysis/teachers/:id" element={<TeacherAnalyticsGuard />} />
        <Route
          path="analysis/compare"
          element={<Guarded route="analysis/compare"><AnalysisCompare /></Guarded>}
        />
        <Route
          path="analysis/deep"
          element={<Guarded route="analysis/deep"><AnalysisDeepInsights /></Guarded>}
        />
        <Route path="analysis/students" element={<AnalysisStudents />} />
        <Route path="analysis/students/:id" element={<StudentAnalytics />} />
        <Route
          path="consolidated"
          element={<Guarded route="consolidated"><ConsolidatedLists /></Guarded>}
        />
        <Route
          path="pending-uploads"
          element={<Guarded route="pending-uploads"><PendingUploads /></Guarded>}
        />
        <Route
          path="late-entry"
          element={<Guarded route="late-entry"><LateEntryRequests /></Guarded>}
        />
        <Route path="timetables" element={<Guarded route="timetables"><Timetables /></Guarded>} />
        <Route
          path="timetables/teachers/:id"
          element={<Guarded route="timetables/teachers/:id"><TeacherTimetable /></Guarded>}
        />
        <Route path="profile" element={<Profile />} />
        <Route path="school" element={<Guarded route="school"><SchoolSettings /></Guarded>} />
        {/* Legacy bookmarks */}
        <Route path="students/:id" element={<RedirectStudents />} />
        <Route path="classes/:id" element={<RedirectClasses />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
