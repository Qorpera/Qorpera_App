"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useUser } from "./user-provider";

function SuperadminNavInfo() {
  const { isSuperadmin } = useUser();
  const [companyName, setCompanyName] = useState<string | null>(null);

  useEffect(() => {
    if (isSuperadmin) {
      fetch("/api/auth/me")
        .then(r => r.json())
        .then(data => setCompanyName(data.operator?.companyName || null))
        .catch(() => {});
    }
  }, [isSuperadmin]);

  if (!companyName) return null;

  return (
    <div className="px-2 pt-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[var(--fg4)] truncate">{companyName}</span>
        <a href="/admin" className="text-[10px] text-[var(--fg4)] hover:text-[var(--fg2)] transition-colors flex-shrink-0 ml-2">
          Exit
        </a>
      </div>
    </div>
  );
}

type BadgeKey = "situations" | "projects";
type NavItem = { href: string; labelKey: string; icon: string; badgeKey?: BadgeKey; superadminOnly?: boolean; adminOnly?: boolean };
type NavGroup = { labelKey: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: "operations",
    items: [
      { href: "/situations", labelKey: "situations", icon: "briefcase", badgeKey: "situations" },
      { href: "/ideas", labelKey: "ideas", icon: "lightbulb", adminOnly: true },
      { href: "/projects", labelKey: "projects", icon: "layers", badgeKey: "projects", adminOnly: true },
      { href: "/system-jobs", labelKey: "systemJobs", icon: "robot", adminOnly: true },
    ],
  },
  {
    labelKey: "intelligence",
    items: [
      { href: "/copilot", labelKey: "copilot", icon: "sparkles" },
      { href: "/wiki", labelKey: "wiki", icon: "scroll" },
    ],
  },
  {
    labelKey: "",
    items: [
      { href: "/admin", labelKey: "admin", icon: "shield", superadminOnly: true },
      { href: "/settings", labelKey: "settings", icon: "settings" },
    ],
  },
];

const ICONS: Record<string, string> = {
  grid: "M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z",
  map: "M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7",
  database: "M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4",
  layers: "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
  upload: "M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12",
  sparkles: "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z",
  workflow: "M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.15c0 .415.336.75.75.75z",
  shield: "M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z",
  "check-circle": "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  scroll: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z",
  "alert-triangle": "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z",
  briefcase: "M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2zM16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2",
  activity: "M22 12h-4l-3 9L9 3l-3 9H2",
  "trending-up": "M2 20h.01M7 14l4-4 4 4 5-5M21 4h-5m5 0v5",
  lightbulb: "M12 2a7 7 0 00-4 12.74V17a1 1 0 001 1h6a1 1 0 001-1v-2.26A7 7 0 0012 2zM9 21h6",
  zap: "M13 10V3L4 14h7v7l9-11h-7z",
  user: "M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z",
  "clipboard-list": "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  "book-open": "M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25",
  settings: "M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
  robot: "M12 2v4 M7 6h10a2 2 0 012 2v11a2 2 0 01-2 2H7a2 2 0 01-2-2V8a2 2 0 012-2z M9.5 12h1 M13.5 12h1 M9 17h6",
};

const ROLE_BADGE_COLORS: Record<string, string> = {
  admin: "bg-accent-light text-accent",
  member: "bg-surface text-[var(--fg3)]",
  superadmin: "bg-[color-mix(in_srgb,var(--warn)_15%,transparent)] text-warn",
};

export function AppNav({ pendingApprovals = 0, activeProjects = 0, collapsed = false, onNavClick }: { pendingApprovals?: number; activeProjects?: number; collapsed?: boolean; onNavClick?: () => void }) {
  const badgeCounts: Record<BadgeKey, number> = {
    situations: pendingApprovals,
    projects: activeProjects,
  };
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fullPath = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : "");
  const { role, isSuperadmin, user } = useUser();
  const t = useTranslations("nav");

  return (
    <div className="space-y-5">
      {NAV_GROUPS.map((group, gi) => {
        const visibleItems = group.items.filter(
          (item) =>
            (!item.superadminOnly || isSuperadmin) &&
            (!item.adminOnly || role === "admin" || isSuperadmin),
        );
        if (visibleItems.length === 0) return null;
        return (
          <div key={gi}>
            {group.labelKey && !collapsed && (
              <p className="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--fg3)]">
                {t(group.labelKey)}
              </p>
            )}
            <div className="space-y-0.5">
              {visibleItems.map((item) => {
                const label = t(item.labelKey);
                const active = item.href.includes("?")
                  ? fullPath === item.href
                  : pathname === item.href || pathname?.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavClick}
                    title={collapsed ? label : undefined}
                    className={`flex items-center ${collapsed ? "justify-center" : "gap-2.5"} rounded-lg ${collapsed ? "px-2 py-2" : "px-2.5 py-2"} text-[13px] font-medium transition min-h-[44px] ${
                      active
                        ? "bg-white/[0.06] text-[var(--foreground)]"
                        : "text-[var(--fg2)] hover:bg-white/[0.04] hover:text-foreground"
                    }`}
                  >
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={ICONS[item.icon] || ICONS.grid} />
                    </svg>
                    {!collapsed && <span className="flex-1">{label}</span>}
                    {!collapsed && item.badgeKey && badgeCounts[item.badgeKey] > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--fg3)", textShadow: "0 0 4px rgba(0,0,0,0.5)" }}>
                        {badgeCounts[item.badgeKey]}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Role badge */}
      {!collapsed && user && role && (
        <div className="px-2 pt-2">
          <span className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full ${ROLE_BADGE_COLORS[role] || ROLE_BADGE_COLORS.member}`}>
            {role.charAt(0).toUpperCase() + role.slice(1)}
          </span>
        </div>
      )}
      {!collapsed && isSuperadmin && <SuperadminNavInfo />}
    </div>
  );
}
