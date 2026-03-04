"use client";

import { type ReactNode, useState, useEffect } from "react";
import { AppNav } from "./app-nav";
import { ToastProvider } from "./ui/toast";

function QorperaLogo({ className = "w-7 h-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Curved tail — swoops from circle edge to upper-left like a Q's tail */}
      <path d="M22.5 23 C17 21, 9 12, 3 5" stroke="white" strokeWidth="1.1" strokeLinecap="round" />
      {/* Thin outlined circle */}
      <circle cx="27" cy="27" r="6.5" stroke="white" strokeWidth="1.1" />
    </svg>
  );
}

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

export function AppShell({ children, pendingApprovals = 0 }: { children: ReactNode; pendingApprovals?: number }) {
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
          className={`flex-shrink-0 flex flex-col border-r border-white/[0.06] bg-[rgba(10,14,18,0.6)] transition-[width] duration-200 ${
            collapsed ? "w-14" : "w-60"
          }`}
        >
          {/* Logo + collapse toggle */}
          <div className={`flex items-center ${collapsed ? "flex-col gap-2 px-2" : "px-5"} py-5`}>
            {collapsed ? (
              <>
                <QorperaLogo className="w-6 h-6" />
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
                <QorperaLogo className="w-7 h-7 flex-shrink-0" />
                <span className="font-heading text-xl font-semibold tracking-[-0.02em] text-white/90 ml-2.5 whitespace-nowrap">
                  Qorpera
                </span>
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
            <AppNav pendingApprovals={pendingApprovals} collapsed={collapsed} />
          </nav>

          {/* Footer */}
          {!collapsed && (
            <div className="px-5 py-3 border-t border-white/[0.06]">
              <p className="text-[10px] text-white/20">Qorpera Desktop v0.1.0</p>
            </div>
          )}
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </ToastProvider>
  );
}
