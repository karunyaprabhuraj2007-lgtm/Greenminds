/**
 * Navigation items. Visibility is driven by the capabilities returned by
 * `/api/auth/me` (backend permission matrix is the single source of truth).
 */
export type IconName =
  | "dashboard" | "map" | "surveys" | "plus" | "live" | "processing" | "crop"
  | "verify" | "field" | "damage" | "reports" | "users" | "audit" | "settings";

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  capability: string | null; // null = every signed-in user
  phase?: number; // phase in which the page becomes functional
  section: "Overview" | "Operations" | "Intelligence" | "Administration";
}

export const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Dashboard", icon: "dashboard", capability: "view_dashboard", phase: 2, section: "Overview" },
  { to: "/map", label: "GIS Map", icon: "map", capability: "view_map", phase: 2, section: "Overview" },
  { to: "/surveys", label: "Surveys", icon: "surveys", capability: "create_survey", phase: 3, section: "Operations" },
  { to: "/surveys/new", label: "New Survey", icon: "plus", capability: "create_survey", phase: 3, section: "Operations" },
  { to: "/mission/live", label: "Live Mission", icon: "live", capability: "fly_mission", phase: 4, section: "Operations" },
  { to: "/processing", label: "Processing", icon: "processing", capability: "view_processing", phase: 5, section: "Operations" },
  { to: "/field", label: "Field Verification", icon: "field", capability: "submit_verification", phase: 7, section: "Intelligence" },
  { to: "/crop-intelligence", label: "Crop Intelligence", icon: "crop", capability: "view_plot_intelligence", phase: 6, section: "Intelligence" },
  { to: "/verification", label: "Verification Review", icon: "verify", capability: "review_verifications", phase: 7, section: "Intelligence" },
  { to: "/damage", label: "Damage & Claims", icon: "damage", capability: "final_decision", phase: 8, section: "Intelligence" },
  { to: "/reports", label: "Reports", icon: "reports", capability: "view_reports", phase: 8, section: "Intelligence" },
  { to: "/users", label: "Users", icon: "users", capability: "manage_users", section: "Administration" },
  { to: "/audit-log", label: "Audit Log", icon: "audit", capability: "view_audit_log", section: "Administration" },
  { to: "/settings", label: "Settings", icon: "settings", capability: null, section: "Administration" },
];

export function visibleNav(can: (c: string) => boolean): NavItem[] {
  return NAV_ITEMS.filter((item) => item.capability === null || can(item.capability));
}

/** Landing page for a user: first visible nav item. */
export function homePath(can: (c: string) => boolean): string {
  return visibleNav(can)[0]?.to ?? "/settings";
}
