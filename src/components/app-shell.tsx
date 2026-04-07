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

function BillingStatusBanner() {
  const t = useTranslations("shell");
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/billing/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setStatus(data.billingStatus); })
      .catch(() => {});
  }, []);

  if (!status || status === "active" || status === "free" || status === "cancelled") return null;

  const isDepleted = status === "depleted";

  const bgColor = isDepleted
    ? "bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border-[color-mix(in_srgb,var(--danger)_20%,transparent)]"
    : "bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] border-[color-mix(in_srgb,var(--warn)_20%,transparent)]";
  const textColor = isDepleted ? "text-danger" : "text-warn";

  return (
    <div className={`${bgColor} border-b px-4 py-1.5 flex items-center justify-between flex-shrink-0`}>
      <span className={`text-xs ${textColor}`}>
        {isDepleted ? t("balanceEmpty") : t("paymentFailed")}
      </span>
      <a href="/settings?tab=billing" className={`text-xs ${textColor} hover:text-foreground font-medium`}>
        {isDepleted ? t("addCredits") : t("updatePayment")}
      </a>
    </div>
  );
}

function SuperadminBanner() {
  const router = useRouter();
  const { isSuperadmin, actingAsOperator, actingAsUser, impersonatedUserName, refresh } = useUser();
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

  return null;
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
  healthIssues,
  activeProjects,
  collapsed,
  locale,
  onNavClick,
}: {
  pendingApprovals: number;
  healthIssues: number;
  activeProjects: number;
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
          <AppNav pendingApprovals={pendingApprovals} healthIssues={healthIssues} activeProjects={activeProjects} collapsed={collapsed} onNavClick={onNavClick} />
        </Suspense>
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="px-5 py-3 border-t border-border space-y-2">
          <div className="flex items-center justify-between">
            <LocaleSwitcher currentLocale={locale} />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-[var(--fg3)]">{t("version")}</p>
            <NotificationBell />
          </div>
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

export function AppShell({ children, pendingApprovals, topBarContent }: { children: ReactNode; pendingApprovals?: number; topBarContent?: ReactNode }) {
  const t = useTranslations("shell");
  const locale = useLocale();
  const pathname = usePathname();
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  // Fetch badge counts for nav — situations pending + health issues
  const [navBadges, setNavBadges] = useState<{ situations: number; health: number; projects: number }>({ situations: 0, health: 0, projects: 0 });
  useEffect(() => {
    // Situations: count pending proposals
    fetch("/api/situations?status=detected,proposed&limit=1")
      .then(r => r.ok ? r.json() : { total: 0 })
      .then(data => {
        setNavBadges(prev => ({ ...prev, situations: data.total ?? 0 }));
      })
      .catch(() => {});

    // Health: count connector errors + zero-detection situation types
    Promise.all([
      fetch("/api/connectors").then(r => r.ok ? r.json() : { connectors: [] }),
      fetch("/api/situation-types").then(r => r.ok ? r.json() : []),
    ])
      .then(([connRes, stTypes]) => {
        const connectors = connRes.connectors ?? [];
        const errors = connectors.filter((c: { status: string }) => c.status === "error").length;
        const zeroDetections = (Array.isArray(stTypes) ? stTypes : []).filter((st: { totalProposed: number }) => st.totalProposed === 0).length;
        setNavBadges(prev => ({ ...prev, health: errors + zeroDetections }));
      })
      .catch(() => {});

    // Projects: count active projects
    fetch("/api/projects?status=active&limit=1")
      .then(r => r.ok ? r.json() : { total: 0 })
      .then(data => {
        setNavBadges(prev => ({ ...prev, projects: data.total ?? 0 }));
      })
      .catch(() => {});
  }, [pathname]); // Refresh on navigation

  const effectiveSituationsBadge = pendingApprovals ?? navBadges.situations;

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

  // Listen for programmatic sidebar collapse requests from child pages
  useEffect(() => {
    function handleSidebarRequest(e: Event) {
      const detail = (e as CustomEvent<{ collapsed: boolean }>).detail;
      setCollapsed(detail.collapsed);
    }
    window.addEventListener("sidebar-collapse-request", handleSidebarRequest);
    return () => window.removeEventListener("sidebar-collapse-request", handleSidebarRequest);
  }, []);

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

            <SidebarContent pendingApprovals={effectiveSituationsBadge} healthIssues={navBadges.health} activeProjects={navBadges.projects} collapsed={collapsed} locale={locale} />
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

              <SidebarContent pendingApprovals={effectiveSituationsBadge} healthIssues={navBadges.health} activeProjects={navBadges.projects} collapsed={false} locale={locale} onNavClick={handleNavClick} />
            </div>
          </>
        )}

        {/* ── Main content ── */}
        <div className="flex-1 flex flex-col overflow-hidden bg-background">
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

          {/* Superadmin + AI paused + billing banners */}
          <SuperadminBanner />
          <AiPausedBanner />
          <BillingStatusBanner />

          {/* topBarContent rendered inline if provided */}
          {topBarContent && <div className="hidden lg:block px-5 py-2">{topBarContent}</div>}

          {/* Page content */}
          <main className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
