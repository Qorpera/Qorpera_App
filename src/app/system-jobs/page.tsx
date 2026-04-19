"use client";

import { useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { ContextualChat } from "@/components/contextual-chat";
import { SidePanel } from "@/components/execution/side-panel";
import { formatRelativeTime } from "@/lib/format-helpers";
import { replaceWikiLinksWithMarkdown, type WikiLinkLookup } from "@/lib/wiki-links";
import { fetchApi } from "@/lib/fetch-api";
import { useLocale } from "next-intl";

// ── Types ────────────────────────────────────────────────────────────────────

type DeliverableKind = "report" | "proposals" | "edits" | "mixed";
type PostPolicy = "always" | "importance_threshold" | "actionable_only";
type ExecutionStatus = "completed" | "compressed" | "failed";

type Trigger =
  | { type: "cron"; expression: string }
  | { type: "event"; eventType: string; filter?: Record<string, unknown> };

interface SystemJobItem {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: string;
  schedule: string;
  triggers: Trigger[];
  deliverableKind: DeliverableKind;
  postPolicy: PostPolicy;
  importanceThreshold: number | null;
  reachMode: string | null;
  trustLevel: string | null;
  ownerPageSlug: string | null;
  ownerName: string | null;
  domainPageSlug: string | null;
  domainName: string | null;
  lastRun: string | null;
  nextRun: string | null;
  pendingDecisionsCount: number;
  latestRun: { summary: string; status: string; needsReview: boolean } | null;
}

interface ExecutionHistoryEntry {
  runDate: string;
  status: ExecutionStatus;
  importanceScore: number;
  summary: string;
  proposedSlugs: string[];
  reportSubPageSlug: string | null;
  editCount: number;
  toolCalls: number | null;
  costCents: number | null;
  errorMessage: string | null;
  trustBannerNote: string | null;
}

interface LinkedInitiative {
  id: string;
  slug: string;
  title: string;
  status: string;
  proposalType: string;
  autoAccepted: boolean;
  proposedAt: string;
}

interface RunReport {
  slug: string;
  title: string;
  runDate: string;
  importanceScore: number | null;
}

interface JobDetail {
  id: string;
  slug: string;
  title: string;
  content: string;
  description: string;
  status: string;
  triggers: Trigger[];
  schedule: string;
  deliverableKind: DeliverableKind;
  trustLevel: string | null;
  postPolicy: PostPolicy;
  importanceThreshold: number | null;
  anchorPages: { slug: string; title: string }[];
  reachMode: string | null;
  domainScope: string[];
  ownerPageSlug: string | null;
  ownerName: string | null;
  domainPageSlug: string | null;
  domainName: string | null;
  recipients: { slug: string; name: string }[];
  budgetSoft: number;
  budgetHard: number;
  dedupWindowRuns: number;
  creatorUserIdSnapshot: string | null;
  creatorRoleSnapshot: string | null;
  lastRun: string | null;
  nextRun: string | null;
  latestRun: { summary: string; status: string; needsReview: boolean } | null;
  executionHistory: ExecutionHistoryEntry[];
  linkedInitiatives: LinkedInitiative[];
  runReports: RunReport[];
  crossReferences: string[];
  createdAt: string;
  updatedAt: string;
}

type TabKey = "overview" | "configuration" | "history" | "instructions";

// ── Constants ────────────────────────────────────────────────────────────────

const STATUS_DOT: Record<string, string> = {
  active: "var(--ok)",
  paused: "var(--fg4)",
  proposed: "var(--warn)",
  deactivated: "var(--danger)",
  disabled: "var(--danger)",
};

const DELIVERABLE_KIND_LABEL: Record<DeliverableKind, string> = {
  report: "Report",
  proposals: "Proposals",
  edits: "Edits",
  mixed: "Mixed",
};

const POST_POLICY_LABEL: Record<PostPolicy, string> = {
  always: "Always",
  importance_threshold: "Importance threshold",
  actionable_only: "Actionable only",
};

const EXECUTION_STATUS_VARIANT: Record<ExecutionStatus, "green" | "amber" | "red"> = {
  completed: "green",
  compressed: "amber",
  failed: "red",
};

const TABS: readonly TabKey[] = ["overview", "configuration", "history", "instructions"] as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

function cronToHuman(cron: string): string {
  if (!cron) return "";
  const parts = cron.split(" ");
  if (parts.length < 5) return cron;
  const [min, hour, dom, , dow] = parts;
  if (dom === "*" && dow === "*") {
    if (hour === "*") return `Every ${min === "0" ? "" : min + " "}minute${min === "0" ? "" : "s"}`;
    return `Daily at ${hour}:${min.padStart(2, "0")}`;
  }
  if (dow !== "*") {
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dayName = dayNames[parseInt(dow)] ?? `day ${dow}`;
    return `Weekly on ${dayName} at ${hour}:${min.padStart(2, "0")}`;
  }
  return cron;
}

function scheduleSummary(job: { schedule: string; triggers: Trigger[] }): string {
  if (job.schedule) return cronToHuman(job.schedule);
  const firstCron = job.triggers.find((t): t is Extract<Trigger, { type: "cron" }> => t.type === "cron");
  if (firstCron) return cronToHuman(firstCron.expression);
  const hasEvent = job.triggers.some(t => t.type === "event");
  if (hasEvent) return "Event-triggered";
  return "No schedule";
}

function formatCents(cents: number | null): string | null {
  if (cents == null) return null;
  return `$${(cents / 100).toFixed(2)}`;
}

type InitiativeBucket = "pending" | "accepted" | "closed";

function initiativeStatusBucket(item: LinkedInitiative): InitiativeBucket {
  if (item.status === "proposed" || item.status === "concerns_raised") {
    return "pending";
  }
  if (
    item.status === "accepted" ||
    item.status === "ready" ||
    item.status === "implementing" ||
    item.status === "implemented" ||
    item.autoAccepted === true
  ) {
    return "accepted";
  }
  return "closed";
}

function statusBadge(item: LinkedInitiative): { variant: "amber" | "green" | "blue" | "red" | "default"; label: string } {
  if (item.autoAccepted) return { variant: "blue", label: "Auto-accepted" };
  switch (item.status) {
    case "proposed": return { variant: "default", label: "Proposed" };
    case "concerns_raised": return { variant: "amber", label: "Concerns raised" };
    case "accepted": return { variant: "green", label: "Accepted" };
    case "ready": return { variant: "green", label: "Ready" };
    case "implementing": return { variant: "green", label: "Implementing" };
    case "implemented": return { variant: "green", label: "Implemented" };
    case "rejected": return { variant: "red", label: "Rejected" };
    case "failed": return { variant: "red", label: "Failed" };
    case "dismissed": return { variant: "default", label: "Dismissed" };
    case "cancelled": return { variant: "default", label: "Cancelled" };
    default: return { variant: "default", label: item.status };
  }
}

// ── Icons ────────────────────────────────────────────────────────────────────

function GearIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function ExternalLinkIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SystemJobsPage() {
  const locale = useLocale();
  const [jobs, setJobs] = useState<SystemJobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetchApi("/api/system-jobs");
      if (res.ok) {
        const data = await res.json();
        setJobs(data.items ?? []);
      }
    } catch { /* network error */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    let cancelled = false;
    setDetail(null);
    setDetailLoading(true);
    fetchApi(`/api/system-jobs/${selectedId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (!cancelled && data) setDetail(data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId]);

  const openJob = useCallback((id: string) => {
    setSelectedId(id);
    setPanelOpen(true);
    setActiveTab("overview");
  }, []);

  const closePanel = useCallback(() => {
    setPanelOpen(false);
    setSelectedId(null);
    setDetail(null);
    setActiveTab("overview");
  }, []);

  return (
    <AppShell>
      <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
        {!panelOpen && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "auto" }}>
            {/* ── Chat bar: ~20% from top ── */}
            <div style={{ paddingTop: "min(12vh, 80px)", paddingBottom: 32 }}>
              <div style={{ maxWidth: 700, margin: "0 auto", padding: "0 20px" }}>
                <ContextualChat
                  contextType="system_jobs"
                  contextId="global"
                  placeholder="Ask about system jobs, create new ones, or adjust schedules..."
                />
              </div>
            </div>

            {/* ── Divider ── */}
            <div style={{ maxWidth: 900, margin: "0 auto", width: "100%", padding: "0 20px" }}>
              <div style={{ borderTop: "1px solid var(--border)", marginBottom: 20 }} />
            </div>

            {/* ── Job grid ── */}
            <div style={{ maxWidth: 900, margin: "0 auto", width: "100%", padding: "0 20px 40px" }}>
              {loading && (
                <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
                  <div style={{ width: 20, height: 20, border: "2px solid var(--border)", borderTopColor: "var(--fg4)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                </div>
              )}

              {!loading && jobs.length === 0 && (
                <div style={{ textAlign: "center", padding: "48px 0", color: "var(--fg4)", fontSize: 13 }}>
                  No system jobs yet. Use the chat above to create one.
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
                {jobs.map(job => (
                  <JobCard key={job.id} job={job} locale={locale} onOpen={openJob} />
                ))}
              </div>
            </div>
          </div>
        )}

        {panelOpen && selectedId && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            <JobPanel
              selectedId={selectedId}
              detail={detail && detail.id === selectedId ? detail : null}
              detailLoading={detailLoading}
              isOpen={panelOpen}
              onClose={closePanel}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              locale={locale}
            />
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </AppShell>
  );
}

// ── JobCard ─────────────────────────────────────────────────────────────────

function JobCard({
  job,
  locale,
  onOpen,
}: {
  job: SystemJobItem;
  locale: string;
  onOpen: (id: string) => void;
}) {
  return (
    <button
      onClick={() => onOpen(job.id)}
      style={{
        width: "100%",
        textAlign: "left",
        padding: "14px 16px",
        borderRadius: 8,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        cursor: "pointer",
        transition: "border-color 150ms, background 150ms",
      }}
      className="hover:bg-[var(--hover)] transition-colors"
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{
          width: 8, height: 8, borderRadius: "50%",
          background: STATUS_DOT[job.status] ?? "var(--fg4)",
          flexShrink: 0,
        }} />
        <span style={{
          fontSize: 14, fontWeight: 600, color: "var(--foreground)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
        }}>
          {job.title}
        </span>
        {job.pendingDecisionsCount > 0 && (
          <Badge variant="amber">{job.pendingDecisionsCount} pending</Badge>
        )}
        {!job.pendingDecisionsCount && job.latestRun?.needsReview && (
          <Badge variant="amber">Awaiting review</Badge>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, paddingLeft: 16 }}>
        {job.domainName && <span style={{ fontSize: 11, color: "var(--fg3)" }}>{job.domainName}</span>}
        {job.ownerName && (
          <>
            {job.domainName && <span style={{ fontSize: 11, color: "var(--fg4)" }}>/</span>}
            <span style={{ fontSize: 11, color: "var(--fg3)" }}>{job.ownerName}</span>
          </>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 16, marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: "var(--fg4)" }}>{scheduleSummary(job)}</span>
        {job.nextRun && (
          <>
            <span style={{ fontSize: 11, color: "var(--fg4)" }}>·</span>
            <span style={{ fontSize: 11, color: "var(--fg4)" }}>
              Next {formatRelativeTime(job.nextRun, locale)}
            </span>
          </>
        )}
      </div>

      {job.latestRun?.summary && (
        <p style={{
          fontSize: 12, lineHeight: 1.5, color: "var(--fg2)",
          paddingLeft: 16, margin: 0, overflow: "hidden",
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
        }}>
          {job.latestRun.summary}
        </p>
      )}
    </button>
  );
}

// ── JobPanel ────────────────────────────────────────────────────────────────

function JobPanel({
  selectedId,
  detail,
  detailLoading,
  isOpen,
  onClose,
  activeTab,
  onTabChange,
  locale,
}: {
  selectedId: string;
  detail: JobDetail | null;
  detailLoading: boolean;
  isOpen: boolean;
  onClose: () => void;
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  locale: string;
}) {
  const typeIcon = <GearIcon size={14} />;
  const typeBadge = detail?.title ?? "System Job";

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={typeBadge}
      typeBadge={typeBadge}
      typeIcon={typeIcon}
      isFullScreen={true}
    >
      {detailLoading && !detail && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%", minHeight: 240 }}>
          <div style={{
            width: 20, height: 20,
            border: "2px solid var(--border)", borderTopColor: "var(--fg4)",
            borderRadius: "50%", animation: "spin 0.8s linear infinite",
          }} />
        </div>
      )}

      {!detailLoading && !detail && (
        <div style={{ padding: "40px 24px", textAlign: "center", color: "var(--fg3)", fontSize: 13 }}>
          Failed to load job details.
        </div>
      )}

      {detail && detail.id === selectedId && (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
          <JobPanelHeader detail={detail} />
          <TabStrip activeTab={activeTab} onChange={onTabChange} />
          <div style={{ flex: 1, overflow: "auto", padding: "20px 24px 32px" }}>
            {activeTab === "overview" && <OverviewTab detail={detail} locale={locale} />}
            {activeTab === "configuration" && <ConfigurationTab detail={detail} />}
            {activeTab === "history" && <ExecutionHistoryTab detail={detail} locale={locale} />}
            {activeTab === "instructions" && <InstructionsTab detail={detail} />}
          </div>
        </div>
      )}
    </SidePanel>
  );
}

// ── JobPanelHeader ──────────────────────────────────────────────────────────

function JobPanelHeader({ detail }: { detail: JobDetail }) {
  const trailParts: string[] = [];
  if (detail.domainName) trailParts.push(detail.domainName);
  if (detail.ownerName) trailParts.push(detail.ownerName);

  const policyLabel = (() => {
    const base = POST_POLICY_LABEL[detail.postPolicy] ?? detail.postPolicy;
    if (detail.postPolicy === "importance_threshold" && detail.importanceThreshold != null) {
      return `${base} ≥ ${detail.importanceThreshold.toFixed(2)}`;
    }
    return base;
  })();

  return (
    <div style={{
      padding: "16px 24px 14px",
      borderBottom: "1px solid var(--border)",
      background: "var(--surface)",
      flexShrink: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <span style={{
          width: 9, height: 9, borderRadius: "50%",
          background: STATUS_DOT[detail.status] ?? "var(--fg4)",
          flexShrink: 0,
        }} />
        <h1 style={{
          fontSize: 18, fontWeight: 600, color: "var(--foreground)",
          margin: 0, lineHeight: 1.3, flex: 1,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {detail.title}
        </h1>
        <Link
          href={`/wiki/${detail.slug}`}
          prefetch={false}
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: 12, color: "var(--accent)",
            textDecoration: "none", flexShrink: 0,
          }}
          className="hover:opacity-80"
        >
          Edit in wiki <ExternalLinkIcon size={11} />
        </Link>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 19, flexWrap: "wrap" }}>
        {trailParts.length > 0 && (
          <span style={{ fontSize: 12, color: "var(--fg3)" }}>
            {trailParts.join(" / ")}
          </span>
        )}
        {trailParts.length > 0 && <span style={{ fontSize: 11, color: "var(--fg4)" }}>·</span>}
        <span style={{ fontSize: 12, color: "var(--fg3)" }}>{scheduleSummary(detail)}</span>
        <span style={{ fontSize: 11, color: "var(--fg4)" }}>·</span>
        <span style={{ fontSize: 12, color: "var(--fg3)" }}>{policyLabel}</span>
        <span style={{ fontSize: 11, color: "var(--fg4)" }}>·</span>
        <span style={{ fontSize: 12, color: "var(--fg3)" }}>{DELIVERABLE_KIND_LABEL[detail.deliverableKind]}</span>
      </div>
    </div>
  );
}

// ── TabStrip ────────────────────────────────────────────────────────────────

function TabStrip({
  activeTab,
  onChange,
}: {
  activeTab: TabKey;
  onChange: (tab: TabKey) => void;
}) {
  return (
    <div style={{
      display: "flex", gap: 4,
      borderBottom: "1px solid var(--border)",
      padding: "0 20px",
      flexShrink: 0,
    }}>
      {TABS.map(tab => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          style={{
            padding: "10px 12px",
            fontSize: 13,
            fontWeight: activeTab === tab ? 600 : 400,
            color: activeTab === tab ? "var(--foreground)" : "var(--fg3)",
            borderBottom: activeTab === tab ? "2px solid var(--accent)" : "2px solid transparent",
            marginBottom: -1,
            background: "transparent",
            border: "none",
            cursor: "pointer",
          }}
        >
          {tab === "history" ? "Execution History" : tab.charAt(0).toUpperCase() + tab.slice(1)}
        </button>
      ))}
    </div>
  );
}

// ── OverviewTab ─────────────────────────────────────────────────────────────

function OverviewTab({ detail, locale }: { detail: JobDetail; locale: string }) {
  return (
    <div>
      <MetaStrip detail={detail} />
      <LatestRunBlock detail={detail} locale={locale} />
    </div>
  );
}

function MetaStrip({ detail }: { detail: JobDetail }) {
  const pills: { label: string; value: string }[] = [
    { label: "Schedule", value: scheduleSummary(detail) },
    { label: "Status", value: detail.status },
    ...(detail.trustLevel ? [{ label: "Trust", value: detail.trustLevel }] : []),
    { label: "Kind", value: DELIVERABLE_KIND_LABEL[detail.deliverableKind] },
    ...(detail.domainName ? [{ label: "Domain", value: detail.domainName }] : []),
    ...(detail.ownerName ? [{ label: "Owner", value: detail.ownerName }] : []),
  ];

  return (
    <div style={{
      display: "flex", flexWrap: "wrap", gap: 8,
      marginBottom: 24,
    }}>
      {pills.map((p, i) => (
        <span
          key={i}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            fontSize: 11, padding: "4px 10px", borderRadius: 4,
            background: "var(--hover)", color: "var(--fg2)",
          }}
        >
          <span style={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--fg4)", fontSize: 10 }}>
            {p.label}
          </span>
          <span>{p.value}</span>
        </span>
      ))}
    </div>
  );
}

function LatestRunBlock({ detail, locale }: { detail: JobDetail; locale: string }) {
  if (!detail.latestRun) {
    return (
      <div style={{
        padding: "32px 20px",
        textAlign: "center",
        border: "1px dashed var(--border)",
        borderRadius: 8,
        color: "var(--fg3)",
        fontSize: 13,
      }}>
        No runs yet.
        {detail.nextRun
          ? ` Next scheduled ${formatRelativeTime(detail.nextRun, locale)}.`
          : detail.triggers.some(t => t.type === "cron")
            ? ""
            : " Event-triggered only."}
      </div>
    );
  }

  switch (detail.deliverableKind) {
    case "report":
      return <ReportDeliverable detail={detail} locale={locale} />;
    case "proposals":
      return <ProposalsDeliverable detail={detail} locale={locale} />;
    case "edits":
      return <EditsDeliverable detail={detail} locale={locale} />;
    case "mixed":
      return <MixedDeliverable detail={detail} locale={locale} />;
    default:
      return null;
  }
}

// ── Deliverables ────────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <h2 style={{
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      color: "var(--fg4)",
      margin: "0 0 10px",
    }}>
      {children}
    </h2>
  );
}

function ReportDeliverable({ detail, locale }: { detail: JobDetail; locale: string }) {
  const latest = detail.runReports[0];
  if (!latest) {
    return (
      <div style={{ fontSize: 13, color: "var(--fg3)" }}>
        Latest run completed, but no report page was written.
      </div>
    );
  }
  return (
    <div>
      <SectionHeader>Latest report</SectionHeader>
      <div style={{
        padding: "14px 16px",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 8,
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)", marginBottom: 4 }}>
          {latest.title}
        </div>
        <div style={{ fontSize: 12, color: "var(--fg3)", marginBottom: 10 }}>
          Generated {formatRelativeTime(latest.runDate, locale)}
          {latest.importanceScore != null && (
            <> · Importance {latest.importanceScore.toFixed(2)}</>
          )}
        </div>
        <Link
          href={`/wiki/${latest.slug}`}
          prefetch={false}
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: 12, color: "var(--accent)",
            textDecoration: "none",
          }}
          className="hover:opacity-80"
        >
          View full report <ExternalLinkIcon size={11} />
        </Link>
      </div>
    </div>
  );
}

function ProposalsDeliverable({ detail, locale }: { detail: JobDetail; locale: string }) {
  const groups = useMemo(() => bucketInitiatives(detail.linkedInitiatives), [detail.linkedInitiatives]);

  if (detail.linkedInitiatives.length === 0) {
    return <div style={{ fontSize: 13, color: "var(--fg3)" }}>No initiatives produced yet.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <InitiativeGroup
        label={`Awaiting decision: ${groups.pending.length}`}
        items={groups.pending}
        rowRenderer={renderInitiativeRow}
        locale={locale}
        defaultOpen
        showAcceptHint
      />
      <InitiativeGroup
        label={`Accepted: ${groups.accepted.length}`}
        items={groups.accepted}
        rowRenderer={renderInitiativeRow}
        locale={locale}
        defaultOpen={false}
      />
      <InitiativeGroup
        label={`Closed: ${groups.closed.length}`}
        items={groups.closed}
        rowRenderer={renderInitiativeRow}
        locale={locale}
        defaultOpen={false}
      />
    </div>
  );
}

function bucketInitiatives(items: LinkedInitiative[]): Record<InitiativeBucket, LinkedInitiative[]> {
  const pending: LinkedInitiative[] = [];
  const accepted: LinkedInitiative[] = [];
  const closed: LinkedInitiative[] = [];
  for (const item of items) {
    const bucket = initiativeStatusBucket(item);
    if (bucket === "pending") pending.push(item);
    else if (bucket === "accepted") accepted.push(item);
    else closed.push(item);
  }
  return { pending, accepted, closed };
}

function renderInitiativeRow(item: LinkedInitiative, locale: string) {
  return <InitiativeRow key={item.id} item={item} locale={locale} />;
}

function renderEditRow(item: LinkedInitiative, locale: string) {
  return <EditRow key={item.id} item={item} locale={locale} />;
}

function EditsDeliverable({ detail, locale }: { detail: JobDetail; locale: string }) {
  const groups = useMemo(() => {
    const edits = detail.linkedInitiatives.filter(i => i.proposalType === "wiki_update");
    return { edits, buckets: bucketInitiatives(edits) };
  }, [detail.linkedInitiatives]);

  if (groups.edits.length === 0) {
    return <div style={{ fontSize: 13, color: "var(--fg3)" }}>No initiatives produced yet.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <InitiativeGroup
        label={`Awaiting decision: ${groups.buckets.pending.length}`}
        items={groups.buckets.pending}
        rowRenderer={renderEditRow}
        locale={locale}
        defaultOpen
        showAcceptHint
      />
      <InitiativeGroup
        label={`Accepted: ${groups.buckets.accepted.length}`}
        items={groups.buckets.accepted}
        rowRenderer={renderEditRow}
        locale={locale}
        defaultOpen={false}
      />
      <InitiativeGroup
        label={`Closed: ${groups.buckets.closed.length}`}
        items={groups.buckets.closed}
        rowRenderer={renderEditRow}
        locale={locale}
        defaultOpen={false}
      />
    </div>
  );
}

function MixedDeliverable({ detail, locale }: { detail: JobDetail; locale: string }) {
  const hasReport = detail.runReports.length > 0;
  const proposals = detail.linkedInitiatives.filter(i => i.proposalType !== "wiki_update");
  const edits = detail.linkedInitiatives.filter(i => i.proposalType === "wiki_update");
  const sections: ReactNode[] = [];
  if (hasReport) {
    sections.push(<ReportDeliverable key="report" detail={detail} locale={locale} />);
  }
  if (proposals.length > 0) {
    sections.push(
      <div key="proposals">
        <SectionHeader>Proposals ({proposals.length})</SectionHeader>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {proposals.map(i => (
            <InitiativeRow key={i.id} item={i} locale={locale} />
          ))}
        </div>
      </div>,
    );
  }
  if (edits.length > 0) {
    sections.push(
      <div key="edits">
        <SectionHeader>Wiki updates ({edits.length})</SectionHeader>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {edits.map(i => (
            <EditRow key={i.id} item={i} locale={locale} />
          ))}
        </div>
      </div>,
    );
  }
  if (sections.length === 0) {
    return <div style={{ fontSize: 13, color: "var(--fg3)" }}>Latest run produced no visible outputs.</div>;
  }
  return <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>{sections}</div>;
}

function InitiativeGroup({
  label,
  items,
  rowRenderer,
  locale,
  defaultOpen,
  showAcceptHint,
}: {
  label: string;
  items: LinkedInitiative[];
  rowRenderer: (item: LinkedInitiative, locale: string) => ReactNode;
  locale: string;
  defaultOpen: boolean;
  showAcceptHint?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          width: "100%", textAlign: "left",
          background: "transparent", border: "none",
          padding: "0 0 10px", cursor: "pointer",
          fontSize: 11, fontWeight: 600,
          letterSpacing: "0.06em", textTransform: "uppercase",
          color: "var(--fg4)",
        }}
      >
        <span style={{ fontSize: 10, transform: open ? "rotate(90deg)" : undefined, transition: "transform 0.15s" }}>▸</span>
        {label}
      </button>
      {open && items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map(item => rowRenderer(item, locale))}
          {showAcceptHint && (
            <div style={{ fontSize: 11, color: "var(--fg4)", marginTop: 6, fontStyle: "italic" }}>
              Open an initiative to accept or reject.
            </div>
          )}
        </div>
      )}
      {open && items.length === 0 && (
        <div style={{ fontSize: 12, color: "var(--fg4)", paddingLeft: 16 }}>None.</div>
      )}
    </div>
  );
}

function InitiativeRow({ item, locale }: { item: LinkedInitiative; locale: string }) {
  const status = statusBadge(item);
  return (
    <Link
      href={`/initiatives?id=${item.id}`}
      prefetch={false}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 12px",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        textDecoration: "none",
      }}
      className="hover:bg-[var(--hover)] transition-colors"
    >
      <Badge variant={status.variant}>{status.label}</Badge>
      <span style={{
        fontSize: 13, color: "var(--foreground)", flex: 1,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {item.title}
      </span>
      <span style={{
        fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 3,
        background: "rgba(255,255,255,0.06)", color: "var(--fg3)",
        textTransform: "uppercase", letterSpacing: "0.04em",
      }}>
        {item.proposalType.replace(/_/g, " ")}
      </span>
      <span style={{ fontSize: 11, color: "var(--fg4)", flexShrink: 0 }}>
        {formatRelativeTime(item.proposedAt, locale)}
      </span>
    </Link>
  );
}

function EditRow({ item, locale }: { item: LinkedInitiative; locale: string }) {
  const target = item.slug || item.title;
  const status = statusBadge(item);
  return (
    <Link
      href={`/initiatives?id=${item.id}`}
      prefetch={false}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 12px",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        textDecoration: "none",
      }}
      className="hover:bg-[var(--hover)] transition-colors"
    >
      <span style={{ fontSize: 12, color: "var(--fg3)", fontFamily: "monospace" }}>[[{target}]]</span>
      <span style={{ fontSize: 11, color: "var(--fg4)" }}>—</span>
      <span style={{ fontSize: 12, color: "var(--fg2)", flex: 1 }}>{item.title}</span>
      <span style={{ fontSize: 11, color: "var(--fg4)", flexShrink: 0 }}>
        {formatRelativeTime(item.proposedAt, locale)}
      </span>
      <Badge variant={status.variant}>{status.label}</Badge>
    </Link>
  );
}

// ── ConfigurationTab ────────────────────────────────────────────────────────

function ConfigurationTab({ detail }: { detail: JobDetail }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{
        padding: "10px 14px", fontSize: 12, color: "var(--fg3)",
        background: "var(--hover)", borderRadius: 6,
      }}>
        To change any of this, edit the wiki page directly via <Link href={`/wiki/${detail.slug}`} prefetch={false} style={{ color: "var(--accent)" }}>{detail.slug}</Link>.
      </div>

      <ConfigSection title="Triggers">
        {detail.triggers.length === 0 && detail.schedule && (
          <div style={{ fontSize: 12, color: "var(--warn)" }}>
            Legacy schedule: <code style={{ background: "rgba(255,255,255,0.06)", padding: "1px 4px", borderRadius: 3 }}>{detail.schedule}</code>
          </div>
        )}
        {detail.triggers.length === 0 && !detail.schedule && (
          <div style={{ fontSize: 12, color: "var(--fg4)" }}>No triggers configured.</div>
        )}
        {detail.triggers.map((trigger, i) => (
          <TriggerRow key={i} trigger={trigger} />
        ))}
      </ConfigSection>

      <ConfigSection title="Scope & reach">
        {detail.reachMode && (
          <KeyValueRow label="Reach mode">
            <span style={{
              fontSize: 11, padding: "2px 8px", borderRadius: 4,
              background: "var(--hover)", color: "var(--fg2)",
            }}>
              {detail.reachMode.replace(/_/g, " ")}
            </span>
          </KeyValueRow>
        )}
        {detail.anchorPages.length > 0 && (
          <KeyValueRow label="Anchor pages">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {detail.anchorPages.map(p => (
                <Link
                  key={p.slug}
                  href={`/wiki/${p.slug}`}
                  prefetch={false}
                  style={{
                    fontSize: 12, color: "var(--accent)",
                    textDecoration: "underline", textDecorationStyle: "dotted",
                  }}
                >
                  [[{p.title}]]
                </Link>
              ))}
            </div>
          </KeyValueRow>
        )}
        {detail.reachMode === "domain_bounded" && detail.domainScope.length > 0 && (
          <KeyValueRow label="Domain scope">
            <div style={{ fontSize: 12, color: "var(--fg2)" }}>
              {detail.domainScope.join(", ")}
            </div>
          </KeyValueRow>
        )}
      </ConfigSection>

      <ConfigSection title="Deliverable & policy">
        <KeyValueRow label="Kind">
          <Badge variant="default">{DELIVERABLE_KIND_LABEL[detail.deliverableKind]}</Badge>
        </KeyValueRow>
        <KeyValueRow label="Post policy">
          <Badge variant="default">
            {POST_POLICY_LABEL[detail.postPolicy] ?? detail.postPolicy}
            {detail.postPolicy === "importance_threshold" && detail.importanceThreshold != null
              ? ` · ≥ ${detail.importanceThreshold.toFixed(2)}`
              : ""}
          </Badge>
        </KeyValueRow>
        {detail.trustLevel && (
          <KeyValueRow label="Trust level">
            <Badge variant="default">{detail.trustLevel}</Badge>
          </KeyValueRow>
        )}
        <KeyValueRow label="Dedup window">
          <span style={{ fontSize: 12, color: "var(--fg2)" }}>{detail.dedupWindowRuns} runs</span>
        </KeyValueRow>
      </ConfigSection>

      <ConfigSection title="Budget">
        <KeyValueRow label="Soft / hard tool calls">
          <span style={{ fontSize: 12, color: "var(--fg2)" }}>
            {detail.budgetSoft} / {detail.budgetHard}
          </span>
        </KeyValueRow>
      </ConfigSection>

      <ConfigSection title="People">
        {detail.ownerName && (
          <KeyValueRow label="Owner">
            {detail.ownerPageSlug ? (
              <Link href={`/wiki/${detail.ownerPageSlug}`} prefetch={false} style={{ fontSize: 12, color: "var(--accent)" }}>
                {detail.ownerName}
              </Link>
            ) : (
              <span style={{ fontSize: 12, color: "var(--fg2)" }}>{detail.ownerName}</span>
            )}
          </KeyValueRow>
        )}
        {detail.domainName && (
          <KeyValueRow label="Domain">
            {detail.domainPageSlug ? (
              <Link href={`/wiki/${detail.domainPageSlug}`} prefetch={false} style={{ fontSize: 12, color: "var(--accent)" }}>
                {detail.domainName}
              </Link>
            ) : (
              <span style={{ fontSize: 12, color: "var(--fg2)" }}>{detail.domainName}</span>
            )}
          </KeyValueRow>
        )}
        {detail.recipients.length > 0 && (
          <KeyValueRow label="Recipients">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {detail.recipients.map(r => (
                <span key={r.slug} style={{ fontSize: 12, color: "var(--fg2)" }}>{r.name}</span>
              ))}
            </div>
          </KeyValueRow>
        )}
      </ConfigSection>

      <ConfigSection title="Permissions">
        {detail.creatorUserIdSnapshot && (
          <KeyValueRow label="Creator (snapshot)">
            <code style={{ fontSize: 11, background: "rgba(255,255,255,0.06)", padding: "1px 5px", borderRadius: 3, color: "var(--fg3)" }}>
              {detail.creatorUserIdSnapshot}
            </code>
          </KeyValueRow>
        )}
        {detail.creatorRoleSnapshot && (
          <KeyValueRow label="Creator role (snapshot)">
            <span style={{ fontSize: 12, color: "var(--fg2)" }}>{detail.creatorRoleSnapshot}</span>
          </KeyValueRow>
        )}
        {!detail.creatorUserIdSnapshot && !detail.creatorRoleSnapshot && (
          <div style={{ fontSize: 12, color: "var(--fg4)" }}>No creator snapshot recorded.</div>
        )}
      </ConfigSection>
    </div>
  );
}

function ConfigSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div style={{
        fontSize: 11, fontWeight: 600, letterSpacing: "0.06em",
        textTransform: "uppercase", color: "var(--fg4)",
        marginBottom: 12,
      }}>
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {children}
      </div>
    </div>
  );
}

function KeyValueRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
      <span style={{
        fontSize: 12, color: "var(--fg3)", minWidth: 180, flexShrink: 0,
      }}>
        {label}
      </span>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

function TriggerRow({ trigger }: { trigger: Trigger }) {
  if (trigger.type === "cron") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
        <span style={{ color: "var(--foreground)" }}>{cronToHuman(trigger.expression)}</span>
        <code style={{
          fontSize: 11, fontFamily: "monospace",
          background: "rgba(255,255,255,0.06)", padding: "1px 5px", borderRadius: 3,
          color: "var(--fg3)",
        }}>
          {trigger.expression}
        </code>
      </div>
    );
  }
  return (
    <div style={{ fontSize: 13 }}>
      <span style={{ color: "var(--foreground)" }}>Wakes on </span>
      <code style={{
        fontSize: 12, fontFamily: "monospace",
        background: "rgba(255,255,255,0.06)", padding: "1px 5px", borderRadius: 3,
        color: "var(--accent)",
      }}>
        {trigger.eventType}
      </code>
      {trigger.filter && Object.keys(trigger.filter).length > 0 && (
        <div style={{ fontSize: 11, color: "var(--fg3)", marginTop: 4, paddingLeft: 12 }}>
          {Object.entries(trigger.filter).map(([k, v]) => (
            <div key={k}>{k}: <code style={{ fontSize: 11, background: "rgba(255,255,255,0.06)", padding: "0 4px", borderRadius: 2 }}>{JSON.stringify(v)}</code></div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── ExecutionHistoryTab ─────────────────────────────────────────────────────

function ExecutionHistoryTab({ detail, locale }: { detail: JobDetail; locale: string }) {
  if (detail.executionHistory.length === 0) {
    return (
      <div style={{ padding: "32px 0", textAlign: "center", color: "var(--fg3)", fontSize: 13 }}>
        No executions recorded yet.
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {detail.executionHistory.map((entry, i) => (
        <ExecutionHistoryCard key={`${entry.runDate}-${i}`} entry={entry} locale={locale} />
      ))}
    </div>
  );
}

function ExecutionHistoryCard({ entry, locale }: { entry: ExecutionHistoryEntry; locale: string }) {
  const [expanded, setExpanded] = useState(false);
  const dateObj = new Date(entry.runDate);
  const dateStr = dateObj.toLocaleString(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const costStr = formatCents(entry.costCents);

  return (
    <div style={{
      padding: "12px 14px",
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--foreground)" }}>{dateStr}</span>
        <Badge variant={EXECUTION_STATUS_VARIANT[entry.status]}>{entry.status}</Badge>
        <span style={{ fontSize: 11, color: "var(--fg4)" }}>
          importance {entry.importanceScore.toFixed(2)}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: "var(--fg4)" }}>
          {formatRelativeTime(entry.runDate, locale)}
        </span>
      </div>

      {entry.trustBannerNote && (
        <div style={{
          padding: "8px 10px", marginBottom: 8,
          background: "color-mix(in srgb, var(--warn) 6%, transparent)",
          border: "1px solid color-mix(in srgb, var(--warn) 25%, transparent)",
          borderRadius: 4,
          fontSize: 12, color: "var(--warn)",
        }}>
          {entry.trustBannerNote}
        </div>
      )}

      {entry.errorMessage && (
        <div style={{
          padding: "8px 10px", marginBottom: 8,
          background: "color-mix(in srgb, var(--danger) 6%, transparent)",
          border: "1px solid color-mix(in srgb, var(--danger) 25%, transparent)",
          borderRadius: 4,
          fontSize: 12, color: "var(--danger)",
          whiteSpace: "pre-wrap",
        }}>
          {entry.errorMessage}
        </div>
      )}

      {entry.summary && (
        <p
          onClick={() => setExpanded(v => !v)}
          style={{
            fontSize: 13, lineHeight: 1.55, color: "var(--fg2)",
            margin: "0 0 8px", cursor: "pointer",
            ...(expanded ? {} : {
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }),
          }}
        >
          {entry.summary}
        </p>
      )}

      {entry.proposedSlugs.length > 0 && (
        <div style={{ fontSize: 12, color: "var(--fg3)", marginBottom: 6 }}>
          Proposed:{" "}
          {entry.proposedSlugs.map((slug, i) => (
            <span key={slug}>
              {i > 0 && ", "}
              <Link href={`/wiki/${slug}`} prefetch={false} style={{ color: "var(--accent)", textDecoration: "underline", textDecorationStyle: "dotted" }}>
                [[{slug}]]
              </Link>
            </span>
          ))}
        </div>
      )}

      <div style={{ fontSize: 11, color: "var(--fg4)", display: "flex", gap: 12, flexWrap: "wrap" }}>
        {entry.toolCalls != null && <span>{entry.toolCalls} tool calls</span>}
        {costStr && <span>{costStr}</span>}
        {entry.editCount > 0 && <span>{entry.editCount} edits</span>}
        {entry.reportSubPageSlug && (
          <Link
            href={`/wiki/${entry.reportSubPageSlug}`}
            prefetch={false}
            style={{ color: "var(--accent)", textDecoration: "none", marginLeft: "auto" }}
          >
            View report →
          </Link>
        )}
      </div>
    </div>
  );
}

// ── InstructionsTab ─────────────────────────────────────────────────────────

function InstructionsTab({ detail }: { detail: JobDetail }) {
  const processedContent = useMemo(() => {
    const lookup: WikiLinkLookup = {};
    for (const slug of detail.crossReferences) {
      lookup[slug] = { title: slug };
    }
    let text = detail.content;
    const titleMatch = text.match(/^#{1,2}\s+(.+)\n/);
    if (titleMatch && titleMatch[1].trim().toLowerCase() === detail.title.trim().toLowerCase()) {
      text = text.slice(titleMatch[0].length);
    }
    return replaceWikiLinksWithMarkdown(text, lookup);
  }, [detail.content, detail.title, detail.crossReferences]);

  return (
    <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--foreground)" }}>
      <ReactMarkdown
        components={{
          p: ({ children }) => <p style={{ marginBottom: 12, color: "var(--fg2)" }}>{children}</p>,
          h1: ({ children }) => <h1 style={{ fontSize: 18, fontWeight: 600, marginTop: 20, marginBottom: 10, color: "var(--foreground)" }}>{children}</h1>,
          h2: ({ children }) => <h2 style={{ fontSize: 15, fontWeight: 600, marginTop: 18, marginBottom: 8, color: "var(--foreground)" }}>{children}</h2>,
          h3: ({ children }) => <h3 style={{ fontSize: 13, fontWeight: 600, marginTop: 14, marginBottom: 6, color: "var(--foreground)" }}>{children}</h3>,
          ul: ({ children }) => <ul style={{ paddingLeft: 20, marginBottom: 12 }}>{children}</ul>,
          ol: ({ children }) => <ol style={{ paddingLeft: 20, marginBottom: 12 }}>{children}</ol>,
          li: ({ children }) => <li style={{ marginBottom: 4, color: "var(--fg2)" }}>{children}</li>,
          strong: ({ children }) => <strong style={{ fontWeight: 600, color: "var(--foreground)" }}>{children}</strong>,
          em: ({ children }) => <em style={{ color: "var(--fg2)" }}>{children}</em>,
          hr: () => <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "16px 0" }} />,
          code: ({ children }) => (
            <code style={{ padding: "2px 5px", borderRadius: 3, background: "rgba(255,255,255,0.06)", fontSize: 12, fontFamily: "monospace" }}>
              {children}
            </code>
          ),
          blockquote: ({ children }) => (
            <blockquote style={{ borderLeft: "2px solid var(--border)", paddingLeft: 14, color: "var(--fg3)", margin: "12px 0" }}>
              {children}
            </blockquote>
          ),
          a: ({ href, children }) => {
            if (href?.startsWith("/wiki/")) {
              return (
                <Link
                  href={href}
                  prefetch={false}
                  style={{ color: "var(--accent)", textDecoration: "underline", textDecorationStyle: "dotted" }}
                >
                  {children}
                </Link>
              );
            }
            return <a href={href} style={{ color: "var(--accent)" }}>{children}</a>;
          },
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}
