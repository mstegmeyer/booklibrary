import { Outlet } from "@tanstack/react-router";
import { Sidebar } from "./sidebar";
import { TabBar } from "./tab-bar";

export function AppShell() {
  return (
    <div className="min-h-dvh md:flex">
      <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 border-border border-r bg-sidebar md:block">
        <Sidebar />
      </aside>
      <main className="min-w-0 flex-1 px-4 pt-[max(env(safe-area-inset-top),16px)] pb-28 md:px-10 md:pt-8 md:pb-12">
        <Outlet />
      </main>
      <div className="md:hidden">
        <TabBar />
      </div>
    </div>
  );
}
