import type { ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { AuditLog } from "../pages/AuditLog";
import { Dashboard } from "../pages/Dashboard";
import { GisMap } from "../pages/GisMap";
import { Login } from "../pages/Login";
import { NotFound } from "../pages/NotFound";
import { PhasePlaceholder } from "../pages/PhasePlaceholder";
import { Settings } from "../pages/Settings";
import { SurveyDetail } from "../pages/SurveyDetail";
import { SurveyNew } from "../pages/SurveyNew";
import { Surveys } from "../pages/Surveys";
import { Users } from "../pages/Users";
import { useAuth } from "./auth";
import { NAV_ITEMS, homePath } from "./nav";

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="p-8 text-sm text-slate-500">Loading...</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return <>{children}</>;
}

/** Renders the page only if the user holds the capability; otherwise redirects home. */
function RequireCapability({ capability, children }: { capability: string | null; children: ReactNode }) {
  const { can } = useAuth();
  if (capability && !can(capability)) return <Navigate to={homePath(can)} replace />;
  return <>{children}</>;
}

const PAGES: Record<string, ReactNode> = {
  "/map": <GisMap />,
  "/surveys": <Surveys />,
  "/surveys/new": <SurveyNew />,
  "/users": <Users />,
  "/audit-log": <AuditLog />,
  "/settings": <Settings />,
};

function Home() {
  const { can } = useAuth();
  // Roles without a dashboard (field verifier) land on their first allowed page.
  if (!can("view_dashboard")) return <Navigate to={homePath(can)} replace />;
  return <Dashboard />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<Home />} />
        {NAV_ITEMS.filter((i) => i.to !== "/").map((item) => (
          <Route
            key={item.to}
            path={item.to}
            element={
              <RequireCapability capability={item.capability}>
                {PAGES[item.to] ?? <PhasePlaceholder />}
              </RequireCapability>
            }
          />
        ))}
        <Route
          path="/surveys/:id"
          element={
            <RequireCapability capability="create_survey">
              <SurveyDetail />
            </RequireCapability>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
