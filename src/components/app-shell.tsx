"use client";

import { type ReactNode, useState, useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import { AppNav } from "./app-nav";
import { ToastProvider } from "./ui/toast";
import { NotificationBell } from "./notification-bell";
import { useUser } from "./user-provider";
import { QorperaLogo } from "./qorpera-logo";

function CollapseChevron({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      className={`w-4 h-4 transition-transform duration-200 ${collapsed ? "rotate-180" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
    </svg>
  );
}

function SuperadminBanner() {
  const router = useRouter();
  const { isSuperadmin, actingAsOperator } = useUser();
  const [companyName, setCompanyName] = useState<string | null>(null);

  useEffect(() => {
    if (isSuperadmin && actingAsOperator) {
      fetch("/api/auth/me")
        .then((r) => r.json())
        .then((data) => setCompanyName(data.operator?.companyName || "Unknown"))
        .catch(() => {});
    }
  }, [isSuperadmin, actingAsOperator]);

  if (!isSuperadmin || !actingAsOperator || !companyName) return null;

  return (
    <div className="bg-amber-500/15 border-b border-amber-500/20 px-4 py-1.5 flex items-center justify-between flex-shrink-0">
      <span className="text-xs text-amber-300">
        Viewing as: <span className="font-medium">{companyName}</span>
      </span>
      <button
        className="text-xs text-amber-400 hover:text-amber-300 font-medium"
        onClick={async () => {
          await fetch("/api/admin/exit-operator", { method: "POST" });
          router.push("/admin");
        }}
      >
        Exit
      </button>
    </div>
  );
}

export function AppShell({ children, pendingApprovals = 0, topBarContent }: { children: ReactNode; pendingApprovals?: number; topBarContent?: ReactNode }) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("sidebar-collapsed") === "true";
    }
    return false;
  });

  useEffect(() => {
    localStorage.setItem("sidebar-collapsed", String(collapsed));
  }, [collapsed]);

  return (
    <ToastProvider>
      <div className="flex h-screen wf-shell">
        {/* Sidebar */}
        <aside
          className={`flex-shrink-0 flex flex-col border-r border-white/[0.06] bg-black transition-[width] duration-200 ${
            collapsed ? "w-14" : "w-60"
          }`}
        >
          {/* Logo + collapse toggle */}
          <div className={`flex items-center ${collapsed ? "flex-col gap-2 px-2" : "px-5"} py-5`}>
            {collapsed ? (
              <>
                <QorperaLogo width={44} />
                <button
                  onClick={() => setCollapsed(false)}
                  className="text-white/20 hover:text-white/50 transition-colors p-1 rounded-lg hover:bg-white/[0.04]"
                  title="Expand sidebar"
                >
                  <CollapseChevron collapsed={true} />
                </button>
              </>
            ) : (
              <>
                <QorperaLogo width={80} className="flex-shrink-0" />
                <button
                  onClick={() => setCollapsed(true)}
                  className="ml-auto text-white/20 hover:text-white/50 transition-colors p-1 -mr-1 rounded-lg hover:bg-white/[0.04]"
                  title="Collapse sidebar"
                >
                  <CollapseChevron collapsed={false} />
                </button>
              </>
            )}
          </div>

          {/* Navigation */}
          <nav className={`flex-1 overflow-y-auto ${collapsed ? "px-1.5" : "px-3"} pb-4`}>
            <Suspense>
              <AppNav pendingApprovals={pendingApprovals} collapsed={collapsed} />
            </Suspense>
          </nav>

          {/* Footer */}
          {!collapsed && (
            <div className="px-5 py-3 border-t border-white/[0.06]">
              <p className="text-[10px] text-white/20">Qorpera Desktop v0.1.0</p>
            </div>
          )}
        </aside>

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Superadmin banner */}
          <SuperadminBanner />
          {/* Top bar */}
          <div className="flex items-center justify-end gap-3 px-5 py-2 border-b border-white/[0.04] flex-shrink-0">
            {topBarContent}
            <NotificationBell />
          </div>
          {/* Scrollable content */}
          <main className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
