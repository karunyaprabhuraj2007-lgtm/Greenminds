/**
 * Navigation. Only pages whose backend is built are listed; visibility per
 * role comes from the capabilities returned by /api/auth/me.
 */
import type { IconName } from "../components/Icon";

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  capability: string | null; // null = every signed-in user
  shortcut?: string;         // "g d" style sequence
  group: "main" | "admin" | "account";
}

export const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Dashboard", icon: "dashboard", capability: "view_dashboard", shortcut: "g d", group: "main" },
  { to: "/map", label: "GIS map", icon: "map", capability: "view_map", shortcut: "g m", group: "main" },
  { to: "/surveys", label: "Surveys", icon: "surveys", capability: "create_survey", shortcut: "g s", group: "main" },
  { to: "/surveys/new", label: "New survey", icon: "plus", capability: "create_survey", shortcut: "g n", group: "main" },
  { to: "/users", label: "Users", icon: "users", capability: "manage_users", group: "admin" },
  { to: "/audit-log", label: "Audit log", icon: "audit", capability: "view_audit_log", group: "admin" },
  { to: "/account", label: "Account & data sources", icon: "account", capability: null, shortcut: "g a", group: "account" },
];

export function visibleNav(can: (c: string) => boolean): NavItem[] {
  return NAV_ITEMS.filter((item) => item.capability === null || can(item.capability));
}

/** Landing page for a user: first visible nav item. */
export function homePath(can: (c: string) => boolean): string {
  return visibleNav(can)[0]?.to ?? "/account";
}
