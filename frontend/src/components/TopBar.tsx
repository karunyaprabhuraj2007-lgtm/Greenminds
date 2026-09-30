import { useAuth } from "../app/auth";
import { ROLE_LABELS } from "../app/types";
import { DemoBadge } from "./DemoBadge";
import { Icon } from "./Icon";

export function TopBar({ title, onMenu }: { title: string; onMenu: () => void }) {
  const { user, logout } = useAuth();
  if (!user) return null;
  return (
    <header className="flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 lg:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button className="rounded p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={onMenu} aria-label="Open menu">
          <Icon name="menu" />
        </button>
        <h1 className="truncate text-lg font-semibold text-navy">{title}</h1>
      </div>
      <div className="flex items-center gap-4">
        <div className="hidden text-right sm:block">
          <div className="flex items-center justify-end gap-2 text-sm font-medium text-slate-800">
            {user.name}
            {user.is_demo && <DemoBadge label="Demo account" />}
          </div>
          <div className="text-xs text-slate-500">{ROLE_LABELS[user.role]}</div>
        </div>
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-leaf-50 text-sm font-semibold text-leaf">
          {user.name.charAt(0).toUpperCase()}
        </span>
        <button className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800" onClick={logout} title="Sign out" aria-label="Sign out">
          <Icon name="logout" />
        </button>
      </div>
    </header>
  );
}
