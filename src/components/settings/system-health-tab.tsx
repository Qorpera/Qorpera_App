"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { fetchApi } from "@/lib/fetch-api";
import { formatRelativeTime } from "@/lib/format-helpers";
import { ConnectorLogo } from "@/components/connector-logo";
import { ContextualChat } from "@/components/contextual-chat";
import type {
  ConnectorHealth,
  OperatorHealthSnapshot,
} from "@/lib/system-health/compute-snapshot";

const STATUS_COLORS: Record<string, string> = {
  healthy: "bg-green-500",
  active: "bg-green-500",
  attention: "bg-amber-500",
  degraded: "bg-amber-500",
  critical: "bg-red-500",
  disconnected: "bg-red-500",
  error: "bg-red-500",
  empty: "bg-red-500",
  paused: "bg-gray-500",
  pending: "bg-gray-500",
};

function StatusDot({ status }: { status: string }) {
  return <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${STATUS_COLORS[status] ?? "bg-gray-500"}`} />;
}

function RefreshCw({ className }: { className?: string }) {
  return <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6M1 20v-6h6" /><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" /></svg>;
}
function UnplugIcon() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 5l-7 7M2 22l3-3M6.3 20.3a2.4 2.4 0 003.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 000 3.4z" /><path d="M7.5 13.5L10 11M10.5 16.5L13 14M12 6l6 6 2.3-2.3a2.4 2.4 0 000-3.4L17.7 3.7a2.4 2.4 0 00-3.4 0z" /></svg>;
}

function ActionButton({ label, href }: { label: string; href: string }) {
  return (
    <Link href={href} className="border border-border text-[var(--fg2)] hover:bg-hover text-xs px-3 py-1 rounded inline-block">
      {label}
    </Link>
  );
}

function ConnectorsSection({ connectors, locale, t }: {
  connectors: ConnectorHealth[];
  locale: string;
  t: ReturnType<typeof useTranslations>;
}) {
  if (connectors.length === 0) {
    return (
      <div className="flex flex-col items-center py-8 text-center">
        <div className="text-[var(--fg3)] mb-3"><UnplugIcon /></div>
        <p className="text-sm text-[var(--fg3)] mb-3">{t("noConnectors")}</p>
        <ActionButton label={t("connectTools")} href="/settings?tab=connections" />
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {connectors.map((c) => (
        <ConnectorRow key={c.id} connector={c} locale={locale} t={t} />
      ))}
    </div>
  );
}

function ConnectorRow({ connector: c, locale, t }: {
  connector: ConnectorHealth;
  locale: string;
  t: ReturnType<typeof useTranslations>;
}) {
  const syncText = c.lastSyncAt
    ? t("connectorHealthy", { time: formatRelativeTime(c.lastSyncAt, locale) })
    : t("connectorNeverSynced");

  return (
    <div className="px-1 py-2">
      <div className="flex items-center gap-3">
        <ConnectorLogo provider={c.provider} size={20} />
        <span className="text-sm text-foreground flex-1 min-w-0 truncate">{c.name}</span>
        <div className="flex items-center gap-2 text-xs text-[var(--fg3)]">
          <StatusDot status={c.status} />
          <span>{syncText}</span>
        </div>
        <span className="text-xs text-[var(--fg3)]">{t("entityCount", { count: c.entityCount })}</span>
      </div>
      {c.issue && (
        <div className="ml-8 mt-1 flex items-center gap-2">
          <span className={`text-xs ${c.status === "error" || c.status === "disconnected" ? "text-red-400" : "text-amber-400"}`}>
            {c.issue}
          </span>
          {c.action && <ActionButton label={c.action.label} href={c.action.href} />}
        </div>
      )}
    </div>
  );
}

function WikiSection({ wiki }: { wiki: OperatorHealthSnapshot["wiki"] }) {
  if (wiki.totalPages === 0) {
    return (
      <p className="text-sm text-[var(--fg3)]">No wiki pages yet. Pages are created as the system processes your data.</p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total pages" value={wiki.totalPages} />
        <StatCard label="Verified" value={wiki.verifiedPages} color="text-green-400" />
        <StatCard label="Draft" value={wiki.draftPages} color="text-amber-400" />
        <StatCard label="Stale" value={wiki.stalePages} color={wiki.stalePages > 0 ? "text-red-400" : undefined} />
      </div>
      <p className="text-xs text-[var(--fg3)]">
        Avg confidence: {(wiki.avgConfidence * 100).toFixed(0)}%
      </p>
      {Object.keys(wiki.byPageType).length > 0 && (
        <div className="flex flex-wrap gap-2 mt-1">
          {Object.entries(wiki.byPageType)
            .sort(([, a], [, b]) => b - a)
            .map(([type, count]) => (
              <span key={type} className="text-xs px-2 py-0.5 rounded-full bg-hover text-[var(--fg3)]">
                {type.replace(/_/g, " ")}: {count}
              </span>
            ))}
        </div>
      )}
    </div>
  );
}

function PeopleSection({ people }: { people: OperatorHealthSnapshot["people"] }) {
  if (people.totalProfiles === 0) {
    return <p className="text-sm text-[var(--fg3)]">No person profiles yet.</p>;
  }

  return (
    <div className="grid grid-cols-3 gap-3">
      <StatCard label="Profiles" value={people.totalProfiles} />
      <StatCard label="With roles" value={people.withRoles} />
      <StatCard label="With reporting lines" value={people.withReportingLines} />
    </div>
  );
}

function DetectionSection({ detection }: { detection: OperatorHealthSnapshot["detection"] }) {
  if (detection.totalSituationTypes === 0) {
    return <p className="text-sm text-[var(--fg3)]">No situation types configured.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Situation types" value={detection.totalSituationTypes} />
        <StatCard label="Active" value={detection.activeSituationTypes} color="text-green-400" />
        <StatCard label="Detected (30d)" value={detection.totalDetected30d} />
        <StatCard
          label="Confirmation rate"
          value={detection.confirmationRate !== null ? `${(detection.confirmationRate * 100).toFixed(0)}%` : "—"}
          color={
            detection.confirmationRate !== null && detection.confirmationRate < 0.3
              ? "text-red-400"
              : detection.confirmationRate !== null && detection.confirmationRate < 0.5
                ? "text-amber-400"
                : undefined
          }
        />
      </div>
    </div>
  );
}

function RawContentSection({ rawContent }: { rawContent: OperatorHealthSnapshot["rawContent"] }) {
  if (rawContent.totalItems === 0) {
    return <p className="text-sm text-[var(--fg3)]">No raw content ingested yet.</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-[var(--fg2)]">{rawContent.totalItems.toLocaleString()} items</p>
      {Object.keys(rawContent.bySourceType).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(rawContent.bySourceType)
            .sort(([, a], [, b]) => b - a)
            .map(([type, count]) => (
              <span key={type} className="text-xs px-2 py-0.5 rounded-full bg-hover text-[var(--fg3)]">
                {type.replace(/_/g, " ")}: {count.toLocaleString()}
              </span>
            ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="bg-hover/50 rounded-lg px-3 py-2">
      <p className="text-xs text-[var(--fg3)]">{label}</p>
      <p className={`text-lg font-semibold ${color ?? "text-foreground"}`}>{value}</p>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      <div className="px-5 py-3 border-b border-border">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--fg3)]">{title}</h3>
      </div>
      <div className="p-5">
        {children}
      </div>
    </div>
  );
}

export function SystemHealthTab() {
  const t = useTranslations("systemHealth");
  const locale = useLocale();
  const [snapshot, setSnapshot] = useState<OperatorHealthSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshCooldown, setRefreshCooldown] = useState(false);

  const tRef = useRef(t);
  tRef.current = t;

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetchApi("/api/system-health");
      if (res.ok) {
        setSnapshot(await res.json());
        setError(null);
      } else {
        setError(tRef.current("errorLoading"));
      }
    } catch {
      setError(tRef.current("errorLoading"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 60_000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  async function handleRefresh() {
    if (refreshCooldown || refreshing) return;
    setRefreshing(true);
    try {
      const res = await fetchApi("/api/system-health/recompute", { method: "POST" });
      if (res.status === 429) {
        setError(t("refreshWait"));
        setTimeout(() => setError(null), 3000);
      } else if (res.ok) {
        const data = await res.json();
        setSnapshot(data);
      }
    } catch {
      // ignore
    } finally {
      setRefreshing(false);
      setRefreshCooldown(true);
      setTimeout(() => setRefreshCooldown(false), 60_000);
    }
  }

  const refreshDisabled = refreshing || refreshCooldown;

  let summaryText: string | undefined;
  let summaryColor: string | undefined;
  if (snapshot) {
    switch (snapshot.overallStatus) {
      case "critical":
        summaryText = t("statusCritical", { count: snapshot.connectors.filter((c) => c.issue).length });
        summaryColor = "bg-red-500";
        break;
      case "attention":
        summaryText = t("statusAttentionCount", { count: snapshot.connectors.filter((c) => c.issue).length });
        summaryColor = "bg-amber-500";
        break;
      default:
        summaryText = t("statusHealthy");
        summaryColor = "bg-green-500";
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="bg-skeleton rounded-lg p-6 animate-pulse">
          <div className="h-6 w-48 bg-skeleton rounded mb-2" />
          <div className="h-4 w-32 bg-skeleton rounded" />
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-skeleton rounded-lg p-6 animate-pulse">
            <div className="h-5 w-40 bg-skeleton rounded mb-4" />
            <div className="space-y-3">
              <div className="h-4 w-full bg-skeleton rounded" />
              <div className="h-4 w-3/4 bg-skeleton rounded" />
              <div className="h-4 w-1/2 bg-skeleton rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error && !snapshot) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <p className="text-sm text-[var(--fg3)] mb-4">{t("errorLoading")}</p>
        <button onClick={fetchHealth} className="border border-border text-[var(--fg2)] hover:bg-hover text-sm px-4 py-2 rounded">
          {t("retry")}
        </button>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <p className="text-sm text-[var(--fg3)] mb-4">{t("completeOnboarding")}</p>
        <Link href="/onboarding" className="border border-border text-[var(--fg2)] hover:bg-hover text-sm px-4 py-2 rounded">
          {t("goToOnboarding")}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-surface border border-border rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={`w-3 h-3 rounded-full ${summaryColor}`} />
            <h2 className="text-lg font-semibold text-foreground">{summaryText}</h2>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshDisabled}
            className="flex items-center gap-2 border border-border text-[var(--fg2)] hover:bg-hover disabled:opacity-40 disabled:cursor-not-allowed text-xs px-3 py-1.5 rounded transition"
          >
            <RefreshCw className={refreshing ? "animate-spin" : ""} />
            {refreshing ? t("refreshing") : t("refresh")}
          </button>
        </div>
        <p className="text-xs text-[var(--fg3)] mt-2">
          {t("lastChecked", { time: formatRelativeTime(snapshot.computedAt, locale) })}
        </p>
      </div>

      <SectionCard title={t("dataPipeline")}>
        <ConnectorsSection connectors={snapshot.connectors} locale={locale} t={t} />
      </SectionCard>

      <SectionCard title="Wiki Knowledge">
        <WikiSection wiki={snapshot.wiki} />
      </SectionCard>

      <SectionCard title="People">
        <PeopleSection people={snapshot.people} />
      </SectionCard>

      <SectionCard title={t("detection")}>
        <DetectionSection detection={snapshot.detection} />
      </SectionCard>

      <SectionCard title="Raw Content">
        <RawContentSection rawContent={snapshot.rawContent} />
      </SectionCard>

      <div className="bg-[color-mix(in_srgb,var(--accent)_4%,transparent)] border border-[color-mix(in_srgb,var(--accent)_15%,transparent)] rounded-lg p-5">
        <div className="flex items-center gap-2 mb-3">
          <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
          <h2 className="text-[13px] font-semibold text-accent">{t("weeklyDiagnosticTitle")}</h2>
          <span className="text-[10px] font-medium ml-auto px-2 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-accent">{t("comingSoon")}</span>
        </div>
        <p className="text-sm text-[var(--fg2)] leading-relaxed">{t("weeklyDiagnosticDescription")}</p>
      </div>

      <ContextualChat
        contextType="system-health"
        contextId={snapshot.operatorId}
        placeholder={t("chatPlaceholder")}
        hints={[t("chatHint1"), t("chatHint2"), t("chatHint3")]}
      />

      {error && (
        <div className="fixed bottom-6 right-6 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm px-4 py-3 rounded-lg shadow-lg">
          {error}
        </div>
      )}
    </div>
  );
}
