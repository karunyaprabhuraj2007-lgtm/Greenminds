import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { NAV_ITEMS } from "../app/nav";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const title = NAV_ITEMS.find((i) => i.to === pathname)?.label ?? (pathname.startsWith("/surveys/") ? "Survey" : "GreenMinds");

  return (
    <div className="flex h-full">
      {menuOpen && <div className="fixed inset-0 z-20 bg-black/30 lg:hidden" onClick={() => setMenuOpen(false)} />}
      <Sidebar open={menuOpen} onNavigate={() => setMenuOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar title={title} onMenu={() => setMenuOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
