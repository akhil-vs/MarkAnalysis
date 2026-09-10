import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { useAuth } from "./auth.jsx";
import Layout from "./components/Layout.jsx";
import { Spinner } from "./components/Spinner.jsx";
import { guardRolesForRoute, paths } from "./lib/nav.js";

const Login = lazy(() => import("./pages/Login.jsx"));
const Signup = lazy(() => import("./pages/Signup.jsx"));
const Pending = lazy(() => import("./pages/Pending.jsx"));
const PrincipalDashboard = lazy(() => import("./pages/PrincipalDashboard.jsx"));
const CoordinatorDashboard = lazy(() => import("./pages/CoordinatorDashboard.jsx"));
const TeacherDashboard = lazy(() => import("./pages/TeacherDashboard.jsx"));
const Users = lazy(() => import("./pages/Users.jsx"));
const Manage = lazy(() => import("./pages/Manage.jsx"));
const MarksEntry = lazy(() => import("./pages/MarksEntry.jsx"));
const MarksUpload = lazy(() => import("./pages/MarksUpload.jsx"));
const StudentAnalytics = lazy(() => import("./pages/StudentAnalytics.jsx"));
const ClassAnalytics = lazy(() => import("./pages/ClassAnalytics.jsx"));
const SubjectAnalytics = lazy(() => import("./pages/SubjectAnalytics.jsx"));
const AnalysisHub = lazy(() => import("./pages/AnalysisHub.jsx"));
const AnalysisClasses = lazy(() => import("./pages/AnalysisClasses.jsx"));
const AnalysisSubjects = lazy(() => import("./pages/AnalysisSubjects.jsx"));
const AnalysisStudents = lazy(() => import("./pages/AnalysisStudents.jsx"));
const AnalysisTeachers = lazy(() => import("./pages/AnalysisTeachers.jsx"));
const AnalysisCompare = lazy(() => import("./pages/AnalysisCompare.jsx"));
const AnalysisDeepInsights = lazy(() => import("./pages/AnalysisDeepInsights.jsx"));
const ClassGroupAnalytics = lazy(() => import("./pages/ClassGroupAnalytics.jsx"));
const SubjectSchoolAnalytics = lazy(() => import("./pages/SubjectSchoolAnalytics.jsx"));
const TeacherAnalytics = lazy(() => import("./pages/TeacherAnalytics.jsx"));
const PendingUploads = lazy(() => import("./pages/PendingUploads.jsx"));
const LateEntryRequests = lazy(() => import("./pages/LateEntryRequests.jsx"));
const AuditLog = lazy(() => import("./pages/AuditLog.jsx"));
const ConsolidatedLists = lazy(() => import("./pages/ConsolidatedLists.jsx"));
const Profile = lazy(() => import("./pages/Profile.jsx"));
const SchoolSettings = lazy(() => import("./pages/SchoolSettings.jsx"));
const Timetables = lazy(() => import("./pages/Timetables.jsx"));
const TeacherTimetable = lazy(() => import("./pages/TeacherTimetable.jsx"));

function PageFallback() {
  return (
    <div className="flex items-center justify-center gap-2 p-10 text-ink-700/70">
      <Spinner />
      <span>Loading…</span>
    </div>
  );
}

function Guard({ roles, children }) {
  const { user, loading } = useAuth();
  if (loading) return <PageFallback />;
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
    <Suspense fallback={<PageFallback />}>
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
    </Suspense>
  );
}
