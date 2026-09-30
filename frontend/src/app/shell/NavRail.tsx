import { NavLink } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { Mark } from "../../components/Wordmark";
import { useAuth } from "../auth";
import { visibleNav, type NavItem } from "../nav";

function RailLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end
      aria-label={item.label}
      className={({ isActive }) =>
        `group relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
          isActive ? "bg-white/10 text-white" : "text-navy-200 hover:bg-white/5 hover:text-white"}`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute -left-2 top-2 h-6 w-1 rounded-r bg-accent-500" aria-hidden />}
          <Icon name={item.icon} className="h-5 w-5" />
          {/* Label appears on hover and on keyboard focus */}
          <span className="pointer-events-none absolute left-12 z-50 whitespace-nowrap rounded bg-navy-800 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-e2 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            {item.label}
          </span>
        </>
      )}
    </NavLink>
  );
}

export function NavRail() {
  const { can } = useAuth();
  const items = visibleNav(can);
  const groups = (["main", "admin"] as const).map((g) => items.filter((i) => i.group === g)).filter((g) => g.length);
  const account = items.filter((i) => i.group === "account");
  return (
    <nav aria-label="Main" className="flex w-[var(--gm-rail)] shrink-0 flex-col items-center bg-navy py-3">
      <NavLink to="/" aria-label="GreenMinds home" className="mb-4 rounded-lg">
        <Mark className="h-9 w-9" onDark />
      </NavLink>
      <div className="flex flex-1 flex-col items-center gap-1">
        {groups.map((g, i) => (
          <div key={i} className={`flex flex-col items-center gap-1 ${i > 0 ? "mt-2 border-t border-white/10 pt-3" : ""}`}>
            {g.map((item) => <RailLink key={item.to} item={item} />)}
          </div>
        ))}
      </div>
      <div className="flex flex-col items-center gap-1">
        {account.map((item) => <RailLink key={item.to} item={item} />)}
      </div>
    </nav>
  );
}
