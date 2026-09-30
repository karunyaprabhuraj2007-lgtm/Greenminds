import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { useAuth } from "../auth";
import { ROLE_LABELS } from "../types";

export function UserMenu({ onShortcuts }: { onShortcuts: () => void }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, []);
  if (!user) return null;
  const initials = user.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div ref={box} className="relative">
      <button onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open}
        className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-slate-100">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy text-xs font-semibold text-white">{initials}</span>
        <span className="hidden text-left leading-tight md:block">
          <span className="block text-sm font-medium text-slate-900">{user.name}</span>
          <span className="block text-2xs text-slate-500">{ROLE_LABELS[user.role]}</span>
        </span>
        <Icon name="chevronDown" className="h-4 w-4 text-slate-400" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-2 w-64 animate-fade-in rounded-lg border border-slate-200 bg-white py-1 shadow-e3">
          <div className="border-b border-slate-100 px-3 py-2.5">
            <p className="truncate text-sm font-medium text-slate-900">{user.email}</p>
            <p className="text-xs text-slate-500">{ROLE_LABELS[user.role]}{user.is_demo ? " · demo account" : ""}</p>
          </div>
          <Link role="menuitem" to="/account" onClick={() => setOpen(false)} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            <Icon name="account" className="h-4 w-4" /> Account & data sources
          </Link>
          <button role="menuitem" onClick={() => { setOpen(false); onShortcuts(); }} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            <Icon name="keyboard" className="h-4 w-4" /> Keyboard shortcuts
          </button>
          <button role="menuitem" onClick={logout} className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            <Icon name="logout" className="h-4 w-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
