"use client";

import { type ReactNode } from "react";
import { AppNav } from "./app-nav";
import { ToastProvider } from "./ui/toast";

export function AppShell({ children, pendingApprovals = 0 }: { children: ReactNode; pendingApprovals?: number }) {
  return (
    <ToastProvider>
      <div className="flex h-screen wf-shell">
        {/* Sidebar */}
        <aside className="w-60 flex-shrink-0 flex flex-col border-r border-white/[0.06] bg-[rgba(10,14,18,0.6)]">
          {/* Logo */}
          <div className="flex items-center gap-2.5 px-5 py-5">
            <svg viewBox="0 0 32 32" className="w-7 h-7 flex-shrink-0" fill="none">
              <circle cx="18" cy="18" r="5.5" fill="white" />
              <line x1="14" y1="14" x2="4" y2="4" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="18" cy="18" r="8" stroke="white" strokeWidth="0.5" opacity="0.25" />
            </svg>
            <span className="font-heading text-xl font-semibold tracking-[-0.02em] text-white/90">
              Qorpera
            </span>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto px-3 pb-4">
            <AppNav pendingApprovals={pendingApprovals} />
          </nav>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-white/[0.06]">
            <p className="text-[10px] text-white/20">Qorpera Desktop v0.1.0</p>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </ToastProvider>
  );
}
