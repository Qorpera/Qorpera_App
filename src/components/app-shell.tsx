"use client";

import { type ReactNode, useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { AppNav } from "./app-nav";
import { ToastProvider } from "./ui/toast";
import { NotificationBell } from "./notification-bell";
import { useUser } from "./user-provider";
import { QorperaLogo } from "./qorpera-logo";
import { LocaleSwitcher } from "./locale-switcher";
import { ThemeToggle } from "./theme-toggle";
import { useMediaQuery } from "@/hooks/use-media-query";

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

function AiPausedBanner() {
  const { isAdmin } = useUser();
  const t = useTranslations("shell");
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    fetch("/api/settings/emergency-stop")
      .then((r) => r.json())
      .then((data) => setPaused(!!data.paused))
      .catch(() => {});
  }, []);

  if (!paused) return null;

  return (
    <div className="bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] border-b border-[color-mix(in_srgb,var(--danger)_20%,transparent)] px-4 py-1.5 flex items-center justify-between flex-shrink-0">
      <span className="text-xs text-danger">
        <span className="mr-1">⚠️</span> {t("aiPaused")}
      </span>
      {isAdmin && (
        <a href="/settings" className="text-xs text-danger hover:text-[var(--foreground)] font-medium">
          {t("goToSettings")}
        </a>
      )}
    </div>
  );
}

function SuperadminBanner() {
  const router = useRouter();
  const { isSuperadmin, actingAsOperator } = useUser();
  const t = useTranslations("shell");
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
    <div className="bg-[color-mix(in_srgb,var(--warn)_12%,transparent)] border-b border-[color-mix(in_srgb,var(--warn)_20%,transparent)] px-4 py-1.5 flex items-center justify-between flex-shrink-0">
      <span className="text-xs text-warn">
        {t("viewingAs")} <span className="font-medium">{companyName}</span>
      </span>
      <button
        className="text-xs text-warn hover:text-[var(--foreground)] font-medium"
        onClick={async () => {
          await fetch("/api/admin/exit-operator", { method: "POST" });
          router.push("/admin");
        }}
      >
        {t("exit")}
      </button>
    </div>
  );
}

// ── Hamburger icon ──────────────────────────────────────────────────────────

function HamburgerIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

// ── Sidebar content (shared between desktop aside and mobile drawer) ────────

function SidebarContent({
  pendingApprovals,
  collapsed,
  locale,
  onNavClick,
}: {
  pendingApprovals: number;
  collapsed: boolean;
  locale: string;
  onNavClick?: () => void;
}) {
  const t = useTranslations("shell");

  return (
    <>
      {/* Navigation */}
      <nav className={`flex-1 overflow-y-auto ${collapsed ? "px-1.5" : "px-3"} pb-4`}>
        <Suspense>
          <AppNav pendingApprovals={pendingApprovals} collapsed={collapsed} onNavClick={onNavClick} />
        </Suspense>
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="px-5 py-3 border-t border-border space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[var(--fg3)]">Theme</span>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <LocaleSwitcher currentLocale={locale} />
            </div>
          </div>
          <p className="text-[10px] text-[var(--fg3)]">{t("version")}</p>
          <div className="text-[10px] text-[var(--fg3)]">
            <a href="/terms" className="hover:text-[var(--fg2)]">Terms</a>
            {" · "}
            <a href="/privacy" className="hover:text-[var(--fg2)]">Privacy</a>
            {" · "}
            <a href="/dpa" className="hover:text-[var(--fg2)]">DPA</a>
          </div>
        </div>
      )}
    </>
  );
}

// ── Main AppShell ───────────────────────────────────────────────────────────

export function AppShell({ children, pendingApprovals = 0, topBarContent }: { children: ReactNode; pendingApprovals?: number; topBarContent?: ReactNode }) {
  const t = useTranslations("shell");
  const locale = useLocale();
  const pathname = usePathname();
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  // Desktop sidebar collapse
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("sidebar-collapsed") === "true";
    }
    return false;
  });

  useEffect(() => {
    localStorage.setItem("sidebar-collapsed", String(collapsed));
  }, [collapsed]);

  // Mobile drawer
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Close drawer on navigation
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  // Close drawer on Escape
  useEffect(() => {
    if (!mobileNavOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileNavOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [mobileNavOpen]);

  // Prevent body scroll when drawer open
  useEffect(() => {
    if (mobileNavOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [mobileNavOpen]);

  const handleNavClick = useCallback(() => {
    setMobileNavOpen(false);
  }, []);

  return (
    <ToastProvider>
      <div className="flex h-screen wf-shell">
        {/* ── Desktop sidebar (lg+) — CSS-only visibility to avoid hydration flash ── */}
          <aside
            className={`hidden lg:flex flex-shrink-0 flex-col bg-sidebar border-r border-border transition-[width] duration-200 ${
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
                    className="text-[var(--fg3)] hover:text-[var(--fg2)] transition-colors p-1 rounded-lg hover:bg-hover"
                    title={t("expandSidebar")}
                  >
                    <CollapseChevron collapsed={true} />
                  </button>
                </>
              ) : (
                <>
                  <QorperaLogo width={80} className="flex-shrink-0" />
                  <button
                    onClick={() => setCollapsed(true)}
                    className="ml-auto text-[var(--fg3)] hover:text-[var(--fg2)] transition-colors p-1 -mr-1 rounded-lg hover:bg-hover"
                    title={t("collapseSidebar")}
                  >
                    <CollapseChevron collapsed={false} />
                  </button>
                </>
              )}
            </div>

            <SidebarContent pendingApprovals={pendingApprovals} collapsed={collapsed} locale={locale} />
          </aside>

        {/* ── Mobile drawer overlay (below lg) ── */}
        {!isDesktop && mobileNavOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-overlay z-40"
              onClick={() => setMobileNavOpen(false)}
            />
            {/* Drawer */}
            <div
              className="fixed inset-y-0 left-0 w-72 z-50 flex flex-col bg-sidebar"
            >
              {/* Drawer header */}
              <div className="flex items-center justify-between px-5 py-4">
                <QorperaLogo width={80} />
                <button
                  onClick={() => setMobileNavOpen(false)}
                  className="p-2 -mr-2 rounded-lg text-[var(--fg3)] hover:text-foreground hover:bg-hover min-h-[44px] min-w-[44px] flex items-center justify-center"
                >
                  <CloseIcon />
                </button>
              </div>

              <SidebarContent pendingApprovals={pendingApprovals} collapsed={false} locale={locale} onNavClick={handleNavClick} />
            </div>
          </>
        )}

        {/* ── Main content ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Mobile top bar (below lg) — CSS-only visibility */}
            <div className="flex lg:hidden items-center justify-between px-3 h-14 border-b border-border flex-shrink-0 bg-sidebar">
              <button
                onClick={() => setMobileNavOpen(true)}
                className="p-2 rounded-lg text-[var(--fg2)] hover:text-foreground hover:bg-hover min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <HamburgerIcon />
              </button>
              <QorperaLogo width={60} />
              <div className="flex items-center">
                <NotificationBell />
              </div>
            </div>

          {/* Superadmin + AI paused banners */}
          <SuperadminBanner />
          <AiPausedBanner />

          {/* Desktop top bar (lg+) — CSS-only visibility */}
            <div className="hidden lg:flex items-center justify-end gap-3 px-5 py-2 border-b border-border flex-shrink-0">
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
