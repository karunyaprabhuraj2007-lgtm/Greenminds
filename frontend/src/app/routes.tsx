import { lazy, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./auth";
import { homePath } from "./nav";
import { Shell } from "./shell/Shell";

// Route-level code splitting: each page (and MapLibre / charts) loads on demand.
const Login = lazy(() => import("../pages/Login"));
const Dashboard = lazy(() => import("../pages/Dashboard"));
const MapPage = lazy(() => import("../pages/MapPage"));
const Surveys = lazy(() => import("../pages/Surveys"));
const SurveyNew = lazy(() => import("../pages/SurveyNew"));
const SurveyDetail = lazy(() => import("../pages/SurveyDetail"));
const Users = lazy(() => import("../pages/Users"));
const AuditLog = lazy(() => import("../pages/AuditLog"));
const Account = lazy(() => import("../pages/Account"));
const NotFound = lazy(() => import("../pages/NotFound"));

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="flex h-full items-center justify-center text-sm text-slate-500">Loading…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return <>{children}</>;
}

function Allow({ capability, children }: { capability: string | null; children: ReactNode }) {
  const { can } = useAuth();
  if (capability && !can(capability)) return <Navigate to={homePath(can)} replace />;
  return <>{children}</>;
}

function Home() {
  const { can } = useAuth();
  if (!can("view_dashboard")) return <Navigate to={homePath(can)} replace />;
  return <Dashboard />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth><Shell /></RequireAuth>}>
        <Route index element={<Home />} />
        <Route path="/map" element={<Allow capability="view_map"><MapPage /></Allow>} />
        <Route path="/surveys" element={<Allow capability="create_survey"><Surveys /></Allow>} />
        <Route path="/surveys/new" element={<Allow capability="create_survey"><SurveyNew /></Allow>} />
        <Route path="/surveys/:id" element={<Allow capability="create_survey"><SurveyDetail /></Allow>} />
        <Route path="/users" element={<Allow capability="manage_users"><Users /></Allow>} />
        <Route path="/audit-log" element={<Allow capability="view_audit_log"><AuditLog /></Allow>} />
        <Route path="/account" element={<Account />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
