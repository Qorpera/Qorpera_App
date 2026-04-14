"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import Link from "next/link";
import { fetchApi } from "@/lib/fetch-api";
import { formatRelativeTime } from "@/lib/format-helpers";
import { AppShell } from "@/components/app-shell";
import { ConnectorLogo } from "@/components/connector-logo";
import { ContextualChat } from "@/components/contextual-chat";
import { useUser } from "@/components/user-provider";
import type {
  ConnectorHealth,
  KnowledgeHealth,
  SituationTypeHealthWithLive,
  DetectionHealthWithLive,
  DomainSnapshotWithLive,
  OperatorSnapshotWithLive,
} from "@/lib/system-health/compute-snapshot";

// ─── Status helpers ──────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  healthy: "bg-green-500",
  active: "bg-green-500",
  complete: "bg-green-500",
  attention: "bg-amber-500",
  degraded: "bg-amber-500",
  partial: "bg-amber-500",
  sparse: "bg-amber-500",
  critical: "bg-red-500",
  disconnected: "bg-red-500",
  silent: "bg-red-500",
  empty: "bg-red-500",
  unconfigured: "bg-gray-500",
  minimal: "bg-amber-500",
};

const PILL_STYLES: Record<string, string> = {
  healthy: "bg-green-500/10 text-green-400",
  active: "bg-green-500/10 text-green-400",
  complete: "bg-green-500/10 text-green-400",
  attention: "bg-amber-500/10 text-amber-400",
  degraded: "bg-amber-500/10 text-amber-400",
  partial: "bg-amber-500/10 text-amber-400",
  sparse: "bg-amber-500/10 text-amber-400",
  minimal: "bg-amber-500/10 text-amber-400",
  critical: "bg-red-500/10 text-red-400",
  disconnected: "bg-red-500/10 text-red-400",
  silent: "bg-red-500/10 text-red-400",
  empty: "bg-red-500/10 text-red-400",
  unconfigured: "bg-hover text-[var(--fg3)]",
};

function StatusDot({ status }: { status: string }) {
  return <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${STATUS_COLORS[status] ?? "bg-gray-500"}`} />;
}

const STATUS_LABELS: Record<string, string> = {
  healthy: "Healthy",
  active: "Active",
  complete: "Complete",
  attention: "Attention",
  degraded: "Degraded",
  partial: "Partial",
  sparse: "Sparse",
  minimal: "Minimal",
  critical: "Critical",
  disconnected: "Disconnected",
  silent: "Silent",
  empty: "Empty",
  unconfigured: "Not configured",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${PILL_STYLES[status] ?? "bg-hover text-[var(--fg3)]"}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

// ─── Icons ───────────────────────────────────────────────

function ChevronDown({ className }: { className?: string }) {
  return <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>;
}
function RefreshCw({ className }: { className?: string }) {
  return <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6M1 20v-6h6" /><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" /></svg>;
}
function AlertTriangle() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>;
}
function InfoIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>;
}
function MinusCircle() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="8" y1="12" x2="16" y2="12" /></svg>;
}
function ClockIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>;
}
function CheckIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>;
}
function MinusIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /></svg>;
}
function UnplugIcon() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 5l-7 7M2 22l3-3M6.3 20.3a2.4 2.4 0 003.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 000 3.4z" /><path d="M7.5 13.5L10 11M10.5 16.5L13 14M12 6l6 6 2.3-2.3a2.4 2.4 0 000-3.4L17.7 3.7a2.4 2.4 0 00-3.4 0z" /></svg>;
}
function SearchIcon() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>;
}

function ActionButton({ label, href }: { label: string; href: string }) {
  return (
    <Link href={href} className="border border-border text-[var(--fg2)] hover:bg-hover text-xs px-3 py-1 rounded inline-block">
      {label}
    </Link>
  );
}

// ─── Section components ──────────────────────────────────

function DataPipelineSection({ pipeline, domainId, locale, t }: {
  pipeline: DomainSnapshotWithLive["dataPipeline"];
  domainId: string;
  locale: string;
  t: ReturnType<typeof useTranslations>;
}) {
  if (pipeline.connectors.length === 0) {
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
      {pipeline.connectors.map((c) => (
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

function KnowledgeSection({ knowledge, domainId, t }: {
  knowledge: KnowledgeHealth;
  domainId: string;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="space-y-4">
      {/* People */}
      <div>
        <p className="text-sm text-[var(--fg2)]">
          {t("people", {
            count: knowledge.people.count,
            withRoles: knowledge.people.withRoles,
            withReportingLines: knowledge.people.withReportingLines,
          })}
        </p>
        {knowledge.people.gaps.map((gap, i) => (
          <div key={i} className="text-xs text-amber-400 mt-1 flex items-center gap-2">
            <span>{gap}</span>
            <Link href={`/wiki?domain=${domainId}`} className="text-accent hover:underline flex-shrink-0">
              {gap.includes("reporting") ? t("editHierarchy") : t("editRoles")}
            </Link>
          </div>
        ))}
      </div>

      {/* Documents */}
      <div>
        <p className="text-sm text-[var(--fg2)]">
          {t("documents", { count: knowledge.documents.count, ragChunks: knowledge.documents.ragChunks })}
        </p>
        {knowledge.documents.count === 0 && (
          <p className="text-xs text-amber-400 mt-1">
            {t("noDocuments")} &middot; <Link href={`/wiki?domain=${domainId}`} className="hover:underline">{t("uploadDocuments")}</Link>
          </p>
        )}
        {knowledge.documents.staleCount > 0 && (
          <p className="text-xs text-amber-400 mt-1">{t("staleDocuments", { count: knowledge.documents.staleCount })}</p>
        )}
      </div>

      {/* Operational Knowledge */}
      <div>
        <p className="text-sm text-[var(--fg2)]">
          {t("insights", { count: knowledge.operationalInsights.count, withPromptMods: knowledge.operationalInsights.withPromptMods })}
        </p>
        {knowledge.operationalInsights.count === 0 ? (
          <p className="text-xs text-[var(--fg3)] mt-1">{t("noInsights")}</p>
        ) : (
          <div className="mt-1 space-y-0.5">
            {knowledge.operationalInsights.situationTypeCoverage.map((st) => (
              <div key={st.typeId} className="flex items-center gap-1.5 text-xs">
                {st.hasInsights && st.insightCount > 0 ? (
                  <span className="text-green-400"><CheckIcon /></span>
                ) : (
                  <span className="text-[var(--fg3)]"><MinusIcon /></span>
                )}
                <span className="text-[var(--fg2)]">{st.typeName}</span>
                {!st.hasInsights && <span className="text-[var(--fg3)]">({t("noPatterns")})</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DetectionSection({ detection, t }: {
  detection: DetectionHealthWithLive;
  t: ReturnType<typeof useTranslations>;
}) {
  if (detection.situationTypes.length === 0) {
    return (
      <div className="flex flex-col items-center py-8 text-center">
        <div className="text-[var(--fg3)] mb-3"><SearchIcon /></div>
        <p className="text-sm text-[var(--fg3)] mb-1">{t("noSituationTypes")}</p>
        <p className="text-xs text-[var(--fg3)]">{t("noSituationTypesHint")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {detection.situationTypes.map((st) => (
        <SituationTypeRow key={st.id} st={st} t={t} />
      ))}
    </div>
  );
}

function SituationTypeRow({ st, t }: { st: SituationTypeHealthWithLive; t: ReturnType<typeof useTranslations> }) {
  const last30d = st.last30d;
  const rate = st.confirmationRate;

  let rateColor = "text-[var(--fg3)]";
  if (rate !== null && rate !== undefined) {
    if (rate < 0.3) rateColor = "text-red-400";
    else if (rate < 0.5) rateColor = "text-amber-400";
  }

  return (
    <div className="py-2">
      {/* Top line */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-foreground">{st.name}</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">
          {t("autonomyObserve")}
        </span>
      </div>

      {/* Stats line */}
      <div className="text-xs text-[var(--fg3)] mt-1">
        {last30d && last30d.detected > 0 ? (
          <span>
            {t("last30d", {
              detected: last30d.detected,
              confirmed: last30d.confirmed,
              dismissed: last30d.dismissed,
              rate: rate !== null && rate !== undefined ? Math.round(rate * 100) : 0,
            }).split("·").map((part, i) => {
              const trimmed = part.trim();
              if (i > 0 && trimmed.includes("accuracy")) {
                return <span key={i}> &middot; <span className={rateColor}>{trimmed}</span></span>;
              }
              return i > 0 ? <span key={i}> &middot; {trimmed}</span> : <span key={i}>{trimmed}</span>;
            })}
          </span>
        ) : (
          <span>{t("noDetections30d")}</span>
        )}
      </div>

      {/* Diagnosis line */}
      {st.diagnosis !== "healthy" && (
        <div className="flex items-center gap-2 mt-1.5">
          <DiagnosisIcon diagnosis={st.diagnosis} />
          <span className={`text-xs ${st.diagnosis === "no_data" ? "text-red-400" : st.diagnosis === "inactive" ? "text-[var(--fg3)]" : st.diagnosis === "new" ? "text-blue-400" : "text-amber-400"}`}>
            {st.diagnosisDetail}
          </span>
          {st.action && <ActionButton label={st.action.label} href={st.action.href} />}
        </div>
      )}
    </div>
  );
}

function DiagnosisIcon({ diagnosis }: { diagnosis: string }) {
  switch (diagnosis) {
    case "no_data": return <span className="text-red-400"><AlertTriangle /></span>;
    case "no_matches": return <span className="text-amber-400"><InfoIcon /></span>;
    case "low_accuracy": return <span className="text-amber-400"><AlertTriangle /></span>;
    case "inactive": return <span className="text-[var(--fg3)]"><MinusCircle /></span>;
    case "new": return <span className="text-blue-400"><ClockIcon /></span>;
    default: return null;
  }
}

// ─── Operator Summary Card ────────────────────────────────

function OperatorSummaryCard({ snapshot, summaryText, summaryColor, refreshing, refreshDisabled, onRefresh, locale, t }: {
  snapshot: OperatorSnapshotWithLive;
  summaryText: string;
  summaryColor: string;
  refreshing: boolean;
  refreshDisabled: boolean;
  onRefresh: () => void;
  locale: string;
  t: ReturnType<typeof useTranslations>;
}) {
  const [issuesExpanded, setIssuesExpanded] = useState(false);

  // Collect all critical issues across departments
  const criticalIssues: { department: string; issue: string; action?: { label: string; href: string } }[] = [];
  for (const dept of snapshot.domains) {
    for (const c of dept.dataPipeline.connectors) {
      if (c.status === "disconnected") {
        criticalIssues.push({
          department: dept.domainName,
          issue: `${c.name}: ${c.issue ?? "Disconnected"}`,
          action: c.action ?? undefined,
        });
      }
    }
    if (dept.knowledge.status === "empty") {
      criticalIssues.push({
        department: dept.domainName,
        issue: t("criticalEmptyKnowledge"),
        action: { label: t("goToDomain"), href: `/wiki?domain=${dept.domainId}` },
      });
    }
    for (const st of dept.detection.situationTypes) {
      if (st.diagnosis === "no_data") {
        criticalIssues.push({
          department: dept.domainName,
          issue: `${st.name}: ${st.diagnosisDetail}`,
          action: st.action ?? undefined,
        });
      }
    }
  }

  return (
    <div className="bg-surface border border-border rounded-lg p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`w-3 h-3 rounded-full ${summaryColor}`} />
          <h1 className="text-lg font-semibold text-foreground">{summaryText}</h1>
        </div>
        <button
          onClick={onRefresh}
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

      {/* Expandable critical issues list */}
      {criticalIssues.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <button
            onClick={() => setIssuesExpanded(!issuesExpanded)}
            className="flex items-center gap-2 text-xs font-medium text-red-500 hover:text-red-400 transition"
          >
            <ChevronDown className={`transition-transform duration-200 ${issuesExpanded ? "rotate-180" : ""}`} />
            {criticalIssues.length} critical issue{criticalIssues.length !== 1 ? "s" : ""}
          </button>
          {issuesExpanded && (
            <div className="mt-2 space-y-2">
              {criticalIssues.map((ci, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-foreground">{ci.department}</span>
                    <span className="text-[var(--fg3)]"> — {ci.issue}</span>
                  </div>
                  {ci.action && (
                    <Link href={ci.action.href} className="text-accent hover:underline flex-shrink-0">
                      {ci.action.label}
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Department Card ─────────────────────────────────────

function DepartmentCard({ dept, locale, t, defaultExpanded }: {
  dept: DomainSnapshotWithLive;
  locale: string;
  t: ReturnType<typeof useTranslations>;
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-hover transition"
      >
        <span className="text-sm font-semibold text-foreground flex-1">{dept.domainName}</span>
        <StatusPill status={dept.overallStatus} />
        {dept.criticalIssueCount > 0 && (
          <span className="bg-red-500/10 text-red-400 text-xs px-2 py-0.5 rounded-full">
            {dept.criticalIssueCount}
          </span>
        )}
        <ChevronDown className={`text-[var(--fg3)] transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <div className="border-t border-border">
          <div className="grid grid-cols-1 lg:grid-cols-3">
            {/* Data Pipeline */}
            <div className="p-5 lg:border-r lg:border-border">
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--fg3)]">{t("dataPipeline")}</h3>
                <StatusPill status={dept.dataPipeline.status} />
              </div>
              <DataPipelineSection pipeline={dept.dataPipeline} domainId={dept.domainId} locale={locale} t={t} />
            </div>

            {/* Knowledge */}
            <div className="p-5 border-t lg:border-t-0 lg:border-r border-border">
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--fg3)]">{t("knowledge")}</h3>
                <StatusPill status={dept.knowledge.status} />
              </div>
              <KnowledgeSection knowledge={dept.knowledge} domainId={dept.domainId} t={t} />
            </div>

            {/* Detection */}
            <div className="p-5 border-t lg:border-t-0 border-border">
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--fg3)]">{t("detection")}</h3>
                <StatusPill status={dept.detection.status} />
              </div>
              <DetectionSection detection={dept.detection} t={t} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────

export default function SystemHealthPage() {
  const t = useTranslations("systemHealth");
  const locale = useLocale();
  const { isAdmin } = useUser();

  const [snapshot, setSnapshot] = useState<OperatorSnapshotWithLive | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshCooldown, setRefreshCooldown] = useState(false);

  // Stable ref for t() so fetchHealth doesn't depend on it
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

  // Sort domains: critical → attention → healthy → unconfigured
  const statusOrder: Record<string, number> = { critical: 0, attention: 1, healthy: 2, unconfigured: 3 };
  const sortedDepartments = snapshot?.domains
    ? [...snapshot.domains].sort((a, b) => (statusOrder[a.overallStatus] ?? 9) - (statusOrder[b.overallStatus] ?? 9))
    : [];

  // Determine mobile
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Operator summary
  let summaryText: string | undefined;
  let summaryColor: string | undefined;
  if (snapshot && sortedDepartments.length > 0) {
    switch (snapshot.overallStatus) {
      case "critical":
        summaryText = t("statusCritical", { count: snapshot.criticalIssueCount });
        summaryColor = "bg-red-500";
        break;
      case "attention":
        summaryText = t("statusAttentionCount", { count: snapshot.criticalIssueCount });
        summaryColor = "bg-amber-500";
        break;
      default:
        summaryText = t("statusHealthy");
        summaryColor = "bg-green-500";
    }
  }

  return (
    <AppShell>
      {loading ? (
        <div className="p-6 space-y-6">
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
      ) : error && !snapshot ? (
        <div className="p-6 flex flex-col items-center justify-center min-h-[400px] text-center">
          <p className="text-sm text-[var(--fg3)] mb-4">{t("errorLoading")}</p>
          <button onClick={fetchHealth} className="border border-border text-[var(--fg2)] hover:bg-hover text-sm px-4 py-2 rounded">
            {t("retry")}
          </button>
        </div>
      ) : !snapshot || sortedDepartments.length === 0 ? (
        <div className="p-6 flex flex-col items-center justify-center min-h-[400px] text-center">
          <p className="text-sm text-[var(--fg3)] mb-4">{t("completeOnboarding")}</p>
          <Link href="/onboarding" className="border border-border text-[var(--fg2)] hover:bg-hover text-sm px-4 py-2 rounded">
            {t("goToOnboarding")}
          </Link>
        </div>
      ) : (
        <div className="p-6 space-y-6">
          {/* Operator Summary */}
          <OperatorSummaryCard
            snapshot={snapshot}
            summaryText={summaryText!}
            summaryColor={summaryColor!}
            refreshing={refreshing}
            refreshDisabled={refreshDisabled}
            onRefresh={handleRefresh}
            locale={locale}
            t={t}
          />

          {/* Stale worker jobs warning */}
          {snapshot.staleJobCount > 0 && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-5 py-3 flex items-start gap-3">
              <span className="text-red-400 text-sm">
                {snapshot.staleJobCount} reasoning job{snapshot.staleJobCount > 1 ? "s" : ""} queued for 15+ minutes — the reasoning service may be offline.
              </span>
            </div>
          )}

          {/* Department Cards */}
          {sortedDepartments.map((dept) => (
            <DepartmentCard
              key={dept.domainId}
              dept={dept}
              locale={locale}
              t={t}
              defaultExpanded={isMobile ? false : dept.overallStatus !== "healthy"}
            />
          ))}

          {/* Weekly AI Diagnostic */}
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

          {/* Contextual Chat — no card wrapper */}
          <ContextualChat
            contextType="system-health"
            contextId={snapshot.operatorId}
            placeholder={t("chatPlaceholder")}
            hints={[t("chatHint1"), t("chatHint2"), t("chatHint3")]}
          />

          {/* Toast for rate limit */}
          {error && (
            <div className="fixed bottom-6 right-6 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm px-4 py-3 rounded-lg shadow-lg">
              {error}
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
