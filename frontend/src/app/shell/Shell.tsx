import { Suspense, useMemo, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { Dialog } from "../../components/ui/Dialog";
import { Kbd } from "../../components/ui/Kbd";
import { SkeletonCard } from "../../components/ui/Skeleton";
import { useAuth } from "../auth";
import { useHotkeys } from "../hotkeys";
import { visibleNav } from "../nav";
import { CommandPalette } from "./CommandPalette";
import { NavRail } from "./NavRail";
import { TopBar } from "./TopBar";

export function Shell() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [palette, setPalette] = useState(false);
  const [help, setHelp] = useState(false);
  const nav = visibleNav(can);

  const bindings = useMemo(() => {
    const b: Record<string, () => void> = { "mod+k": () => setPalette(true), "/": () => setPalette(true), "?": () => setHelp(true) };
    for (const n of nav) if (n.shortcut) b[n.shortcut] = () => navigate(n.to);
    return b;
  }, [nav, navigate]);
  useHotkeys(bindings);

  return (
    <div className="flex h-full">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
      <NavRail />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onSearch={() => setPalette(true)} onShortcuts={() => setHelp(true)} />
        <main id="main" className="relative flex-1 overflow-y-auto">
          <Suspense fallback={<div className="grid gap-4 p-6 md:grid-cols-3"><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
      <Dialog open={help} onClose={() => setHelp(false)} title="Keyboard shortcuts">
        <dl className="divide-y divide-slate-100 text-sm">
          {[["Search and commands", ["Ctrl / ⌘", "K"]], ["Search (alternative)", ["/"]], ["This help", ["?"]],
            ...nav.filter((n) => n.shortcut).map((n) => [`Go to ${n.label}`, n.shortcut!.split(" ")] as [string, string[]]),
            ["Map: toggle layer panel", ["L"]], ["Map: close drawer / cancel tool", ["Esc"]]].map(([label, keys]) => (
            <div key={label as string} className="flex items-center justify-between py-2">
              <dt className="text-slate-700">{label}</dt>
              <dd className="flex gap-1">{(keys as string[]).map((k) => <Kbd key={k}>{k}</Kbd>)}</dd>
            </div>
          ))}
        </dl>
      </Dialog>
    </div>
  );
}
