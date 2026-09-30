import { NavLink } from "react-router-dom";
import { useAuth } from "../app/auth";
import { visibleNav, type NavItem } from "../app/nav";
import { Icon } from "./Icon";

const SECTIONS: NavItem["section"][] = ["Overview", "Operations", "Intelligence", "Administration"];

export function Sidebar({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  const { can } = useAuth();
  const items = visibleNav(can);

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-30 flex w-64 flex-col bg-navy text-slate-200 transition-transform lg:static lg:translate-x-0 ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-white/10 text-green-400">
          <Icon name="leaf" />
        </span>
        <div className="leading-tight">
          <div className="text-sm font-semibold text-white">GreenMinds</div>
          <div className="text-[11px] text-slate-400">Crop Intelligence Platform</div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Main">
        {SECTIONS.map((section) => {
          const sectionItems = items.filter((i) => i.section === section);
          if (!sectionItems.length) return null;
          return (
            <div key={section} className="mb-5">
              <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{section}</div>
              {sectionItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `mb-0.5 flex items-center gap-3 rounded-md px-3 py-2 text-sm ${
                      isActive ? "bg-white/10 font-medium text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"
                    }`
                  }
                >
                  <Icon name={item.icon} className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>
      <div className="border-t border-white/10 px-5 py-3 text-[11px] text-slate-500">
        Rehydria Technology Pvt. Ltd.
      </div>
    </aside>
  );
}
