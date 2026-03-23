"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { ContextualChat } from "@/components/contextual-chat";
import { useIsMobile } from "@/hooks/use-media-query";
import { useTranslations, useLocale } from "next-intl";
import { formatRelativeTime } from "@/lib/format-helpers";
import { getPreviewComponent } from "@/components/execution/previews/get-preview-component";

// ── Types ────────────────────────────────────────────────────────────────────

interface SituationItem {
  id: string;
  situationType: { name: string; slug: string; autonomyLevel: string };
  severity: number;
  confidence: number;
  status: string;
  source: string;
  triggerEntityId: string | null;
  triggerEntityName: string | null;
  departmentName: string | null;
  editInstruction: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

interface ActionStep {
  title: string;
  description: string;
  executionMode: "action" | "generate" | "human_task";
  actionCapabilityName?: string;
  assignedUserId?: string;
  params?: Record<string, unknown>;
}

interface ReasoningData {
  analysis: string;
  evidenceSummary?: string;
  consideredActions: Array<string | ConsideredAction>;
  actionPlan: ActionStep[] | null;
  confidence: number;
  missingContext: string[] | null;
  escalation?: { rationale: string; suggestedSteps: ActionStep[] } | null;
}

interface ConsideredAction {
  action: string;
  evidenceFor?: string[];
  evidenceAgainst?: string[];
  pros?: string[];
  cons?: string[];
  expectedOutcome: string;
}

interface ExecutionPlanData {
  id: string;
  status: string;
  currentStepOrder: number;
  priorityScore: number | null;
  steps: Array<{
    id: string;
    sequenceOrder: number;
    title: string;
    description: string;
    executionMode: string;
    status: string;
    assignedUserId: string | null;
    parameters: Record<string, unknown> | null;
    actionCapability: { id: string; slug: string | null; name: string } | null;
    outputResult: string | null;
    approvedAt: string | null;
    executedAt: string | null;
    errorMessage: string | null;
  }>;
}

interface DraftPayload {
  actionType: string;
  provider: string;
  payload: {
    to?: string;
    cc?: string;
    subject?: string;
    body?: string;
    channel?: string;
    message?: string;
    [key: string]: unknown;
  };
  attachments?: unknown[];
}

interface SituationDetail {
  id: string;
  situationType: { id: string; name: string; slug: string; description: string; autonomyLevel: string };
  severity: number;
  confidence: number;
  status: string;
  source: string;
  triggerEntityId: string | null;
  contextSnapshot: {
    triggerEntity?: { displayName: string; type: string; properties: Record<string, string> };
    relatedEntities?: {
      base?: Array<{ id: string; type: string; displayName: string; relationship: string; direction: string; properties: Record<string, string> }>;
      digital?: Array<{ id: string; type: string; displayName: string; relationship: string; direction: string; properties: Record<string, string> }>;
      external?: Array<{ id: string; type: string; displayName: string; relationship: string; direction: string; properties: Record<string, string> }>;
    };
    departments?: Array<{ id: string; name: string; description: string | null; lead: { name: string; role: string } | null; memberCount: number }>;
    recentEvents?: Array<{ id: string; source: string; eventType: string; createdAt: string }>;
    priorSituations?: Array<{ id: string; triggerEntityName: string; status: string; outcome: string | null; feedback: string | null; actionTaken: unknown; createdAt: string }>;
  } | null;
  currentEntityState: { id: string; displayName: string; typeName: string; properties: Record<string, string> } | null;
  reasoning: ReasoningData | null;
  proposedAction: ActionStep[] | null;
  executionPlanId: string | null;
  actionTaken: { error?: string; action?: string; result?: unknown; executedAt?: string; failedAt?: string } | null;
  feedback: string | null;
  feedbackRating: number | null;
  feedbackCategory: string | null;
  editInstruction: string | null;
  outcome: string | null;
  outcomeDetails: string | null;
  createdAt: string;
}

type ActiveMode = { id: string; mode: "reject" | "teach" | "outcome" } | null;

type FilterValue = "all" | "pending" | "resolved";

// ── Helpers ──────────────────────────────────────────────────────────────────

function safeParseReasoning(raw: unknown): ReasoningData | null {
  if (!raw) return null;
  const obj = typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw;
  if (!obj || typeof obj !== "object") return null;
  const r = obj as Record<string, unknown>;
  return {
    analysis: typeof r.analysis === "string" ? r.analysis : "",
    evidenceSummary: typeof r.evidenceSummary === "string" ? r.evidenceSummary : undefined,
    consideredActions: Array.isArray(r.consideredActions) ? r.consideredActions : [],
    actionPlan: Array.isArray(r.actionPlan) ? r.actionPlan as ActionStep[] : null,
    confidence: typeof r.confidence === "number" ? r.confidence : 0,
    missingContext: Array.isArray(r.missingContext) ? r.missingContext : null,
    escalation: r.escalation as ReasoningData["escalation"] ?? null,
  };
}

function extractDraftPayloads(raw: unknown): DraftPayload[] {
  if (!raw) return [];
  const obj = typeof raw === "string" ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw;
  if (!obj || typeof obj !== "object") return [];
  const r = obj as Record<string, unknown>;
  return Array.isArray(r.draftPayloads) ? r.draftPayloads : [];
}

function severityDotColor(s: SituationItem): string {
  if (s.status === "rejected") return "var(--fg3)";
  if (s.status === "approved" || s.status === "resolved") return "var(--ok)";
  if (s.severity >= 0.7) return "var(--danger)";
  if (s.severity >= 0.4) return "var(--warn)";
  return "var(--fg3)";
}

function severityBadge(s: SituationItem): { label: string; variant: "red" | "amber" | "default" } {
  if (s.severity >= 0.7) return { label: "Critical", variant: "red" };
  if (s.severity >= 0.4) return { label: "High", variant: "amber" };
  return { label: "Medium", variant: "default" };
}

function providerLabel(draft: DraftPayload): string {
  const p = draft.provider?.toLowerCase();
  if (p === "google" || p === "gmail") return "Gmail";
  if (p === "slack") return "Slack";
  if (p === "microsoft" || p === "outlook") return "Outlook";
  return draft.provider ?? "Tool";
}

function providerDotColor(draft: DraftPayload): string {
  const p = draft.provider?.toLowerCase();
  if (p === "google" || p === "gmail") return "var(--danger)";
  if (p === "slack") return "var(--accent)";
  if (p === "microsoft" || p === "outlook") return "var(--info)";
  return "var(--fg3)";
}

const CATEGORY_OPTIONS = [
  { value: "", label: "Select category (optional)" },
  { value: "detection_wrong", label: "Detection was wrong" },
  { value: "action_wrong", label: "Action was wrong" },
  { value: "timing_wrong", label: "Timing was wrong" },
  { value: "missing_context", label: "Missing context" },
];

const CATEGORY_LABELS: Record<string, string> = {
  detection_wrong: "Detection wrong",
  action_wrong: "Action wrong",
  timing_wrong: "Timing wrong",
  missing_context: "Missing context",
};

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SituationsPage() {
  const t = useTranslations("situations");
  const tc = useTranslations("common");
  const locale = useLocale();
  const isMobile = useIsMobile();
  const [situations, setSituations] = useState<SituationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SituationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [filter, setFilter] = useState<FilterValue>("all");

  const [activeMode, setActiveMode] = useState<ActiveMode>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackCategory, setFeedbackCategory] = useState("");
  const [outcomeValue, setOutcomeValue] = useState("");
  const [outcomeNote, setOutcomeNote] = useState("");
  const [billingStatus, setBillingStatus] = useState<string>("active");
  const [detectionCount, setDetectionCount] = useState(0);

  // ── Fetch situations ────────────────────────────────────────────────────

  const fetchSituations = useCallback(async () => {
    try {
      const res = await fetch("/api/situations?status=detected,proposed,reasoning,auto_executing,executing,resolved");
      if (res.ok) {
        const data = await res.json();
        setSituations(data.items);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchSituations(); }, [fetchSituations]);

  useEffect(() => {
    fetch("/api/billing/status").then(r => r.ok ? r.json() : null).then(data => {
      if (data) {
        setBillingStatus(data.billingStatus);
        setDetectionCount(data.detection?.situationCount ?? 0);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const interval = setInterval(fetchSituations, 15000);
    return () => clearInterval(interval);
  }, [fetchSituations]);

  // ── Fetch detail when selection changes ─────────────────────────────────

  const fetchDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/situations/${id}`);
      if (res.ok) setDetail(await res.json());
    } catch {}
    setDetailLoading(false);
  }, []);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    let cancelled = false;
    setDetail(null);
    setDetailLoading(true);
    fetch(`/api/situations/${selectedId}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (!cancelled && data) setDetail(data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId]);

  // ── Reset interaction when selection changes ────────────────────────────

  useEffect(() => {
    setActiveMode(null);
    setFeedbackText("");
    setFeedbackCategory("");
    setOutcomeValue("");
    setOutcomeNote("");
  }, [selectedId]);

  // ── Derived ─────────────────────────────────────────────────────────────

  const filteredSituations = useMemo(() =>
    filter === "all"
      ? situations
      : filter === "pending"
      ? situations.filter(s => s.status === "detected" || s.status === "proposed")
      : situations.filter(s => s.status === filter),
    [situations, filter],
  );

  const selectedSituation = situations.find(s => s.id === selectedId) ?? null;
  const pendingCount = situations.filter(s => s.status === "detected" || s.status === "proposed").length;

  // Clear selection when filtered out
  useEffect(() => {
    if (selectedId && !filteredSituations.some(s => s.id === selectedId)) {
      setSelectedId(null);
    }
  }, [filteredSituations, selectedId]);

  // ── Actions ─────────────────────────────────────────────────────────────

  const patchSituation = async (id: string, body: Record<string, unknown>) => {
    try {
      await fetch(`/api/situations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setActiveMode(null);
      setFeedbackText("");
      setFeedbackCategory("");
      setOutcomeValue("");
      setOutcomeNote("");
      await fetchSituations();
      if (selectedId) fetchDetail(selectedId);
    } catch {}
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <AppShell pendingApprovals={pendingCount}>
      {billingStatus !== "active" && (
        <div className="px-4 py-3 flex items-center justify-between bg-accent-light" style={{ borderBottom: "1px solid var(--accent)" }}>
          <div>
            <span style={{ fontSize: 13, color: "var(--accent)", fontWeight: 500 }}>
              {billingStatus === "past_due"
                ? "Payment needs updating. Situation actions are paused."
                : `You're viewing Qorpera's AI detections. ${detectionCount}/50 free situations detected.`}
            </span>
          </div>
          <a
            href="/settings?tab=billing"
            className="rounded-full text-[12px] font-medium px-3 py-1 bg-accent text-accent-ink"
          >
            {billingStatus === "past_due" ? "Update payment" : "Activate billing"}
          </a>
        </div>
      )}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── Left: situation list ── */}
        {(!isMobile || !selectedId) && (
        <div className={`${isMobile ? "w-full" : "w-[320px]"} flex-shrink-0 flex flex-col overflow-hidden`} style={{ borderRight: isMobile ? "none" : "1px solid var(--border)" }}>
          {/* Header */}
          <div className="px-4 py-3 flex-shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--foreground)" }}>{t("title")}</div>
            <div style={{ fontSize: 11, color: "var(--fg3)" }} className="mt-0.5">
              {situations.length} total &middot; {pendingCount} pending
            </div>
          </div>

          {/* Filter tabs */}
          <div className="px-4 py-2 flex gap-1.5 flex-shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
            {(["all", "pending", "resolved"] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="text-[11px] font-medium px-2.5 py-1 rounded-full border transition"
                style={{
                  background: filter === f ? "var(--elevated)" : "transparent",
                  borderColor: filter === f ? "var(--border)" : "transparent",
                  color: filter === f ? "var(--foreground)" : "var(--fg4)",
                }}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            <DelegationFeed />
            {loading && (
              <div className="flex justify-center py-10">
                <div className="h-4 w-4 animate-spin rounded-full border border-border border-t-muted" />
              </div>
            )}
            {filteredSituations.map(s => (
              <button
                key={s.id}
                onClick={() => setSelectedId(s.id)}
                className="w-full text-left px-4 py-2.5 transition"
                style={{
                  borderBottom: "1px solid var(--border)",
                  borderLeft: selectedId === s.id ? "2px solid var(--accent)" : "2px solid transparent",
                  background: selectedId === s.id ? "var(--surface)" : "transparent",
                }}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="flex-shrink-0" style={{ width: 7, height: 7, borderRadius: "50%", background: severityDotColor(s) }} />
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground)" }} className="truncate flex-1">
                    {s.triggerEntityName ?? "Unknown"}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--fg4)" }} className="flex-shrink-0">
                    {formatRelativeTime(s.createdAt, locale)}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "var(--fg4)" }} className="pl-[15px] truncate">
                  {s.situationType.name}{s.departmentName ? ` \u00b7 ${s.departmentName}` : ""}
                </div>
              </button>
            ))}
            {!loading && filteredSituations.length === 0 && (
              <div className="px-4 py-8 text-center" style={{ fontSize: 13, color: "var(--fg4)" }}>
                {t("empty")}
              </div>
            )}
          </div>
        </div>
        )}

        {/* ── Right: detail pane ── */}
        {(!isMobile || selectedId) && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {isMobile && (
            <button onClick={() => setSelectedId(null)} className="flex items-center gap-1.5 px-4 py-3 text-sm text-[var(--fg2)] hover:text-[var(--fg2)] min-h-[44px]">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
              Back
            </button>
          )}
          {selectedSituation ? (
            <>
              <div className="flex-1 overflow-y-auto">
                <DetailPane
                  key={selectedId}
                  situation={selectedSituation}
                  detail={detail}
                  detailLoading={detailLoading}
                  activeMode={activeMode}
                  setActiveMode={setActiveMode}
                  patchSituation={patchSituation}
                  feedbackText={feedbackText}
                  setFeedbackText={setFeedbackText}
                  feedbackCategory={feedbackCategory}
                  setFeedbackCategory={setFeedbackCategory}
                  outcomeValue={outcomeValue}
                  setOutcomeValue={setOutcomeValue}
                  outcomeNote={outcomeNote}
                  setOutcomeNote={setOutcomeNote}
                  billingStatus={billingStatus}
                />
              </div>
              <ContextualChat
                contextType="situation"
                contextId={selectedSituation.id}
                placeholder={t("discuss")}
                hints={["What evidence supports this?", "Should I escalate?"]}
              />
            </>
          ) : (
            <div className="flex items-center justify-center h-full" style={{ fontSize: 13, color: "var(--fg4)" }}>
              {t("selectSituation")}
            </div>
          )}
        </div>
        )}

      </div>
    </AppShell>
  );
}

// ── Delegation Feed ──────────────────────────────────────────────────────────

interface DelegationItem {
  id: string;
  instruction: string;
  fromAiEntityName: string | null;
  status: string;
  situationId: string | null;
  createdAt: string;
}

function DelegationFeed() {
  const tc = useTranslations("common");
  const [delegations, setDelegations] = useState<DelegationItem[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    fetch("/api/delegations?status=pending")
      .then(res => res.ok ? res.json() : { items: [] })
      .then(data => setDelegations(data.items ?? []))
      .catch(() => {});
  }, []);

  if (delegations.length === 0) return null;

  const handleComplete = async (id: string) => {
    if (!notes.trim()) return;
    try {
      await fetch(`/api/delegations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete", notes: notes.trim() }),
      });
      setDelegations(prev => prev.filter(d => d.id !== id));
      setCompletingId(null);
      setNotes("");
    } catch {}
  };

  return (
    <div style={{ borderBottom: "1px solid var(--border)" }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-4 py-2 flex items-center gap-2 bg-accent-light"
      >
        <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-ink px-1">
          {delegations.length}
        </span>
        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--accent)" }}>
          task{delegations.length !== 1 ? "s" : ""} assigned to you
        </span>
        <svg className={`w-3 h-3 ml-auto transition-transform ${expanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="var(--accent)" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
      {expanded && (
        <div className="px-4 pb-3 space-y-2">
          {delegations.map(d => (
            <div key={d.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, padding: "8px 12px" }}>
              <p style={{ fontSize: 12, color: "var(--fg2)" }}>{d.instruction}</p>
              <p style={{ fontSize: 11, color: "var(--fg4)", marginTop: 2 }}>
                From: {d.fromAiEntityName ?? "AI"}
              </p>
              {completingId === d.id ? (
                <div className="mt-2 space-y-1.5">
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Describe what you did..."
                    className="w-full outline-none"
                    style={{ background: "var(--sidebar)", border: "1px solid var(--border)", borderRadius: 4, padding: "6px 8px", fontSize: 11, color: "var(--foreground)", resize: "vertical", fontFamily: "inherit" }}
                    rows={2}
                  />
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => handleComplete(d.id)}
                      disabled={!notes.trim()}
                      className="text-[11px] px-2 py-0.5 rounded transition disabled:opacity-40"
                      style={{ background: "rgba(34,197,94,0.15)", color: "var(--ok)" }}
                    >
                      Submit
                    </button>
                    <button
                      onClick={() => { setCompletingId(null); setNotes(""); }}
                      className="text-[11px] px-2 py-0.5 rounded transition"
                      style={{ color: "var(--fg4)" }}
                    >
                      {tc("cancel")}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setCompletingId(d.id)}
                  className="mt-2 text-[11px] px-2 py-0.5 rounded transition"
                  style={{ background: "rgba(34,197,94,0.1)", color: "var(--ok)" }}
                >
                  Mark complete
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Execution Mode Badge ─────────────────────────────────────────────────────

const EXEC_MODE_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  action: { bg: "rgba(168,85,247,0.12)", color: "var(--accent)", label: "action" },
  generate: { bg: "rgba(59,130,246,0.12)", color: "var(--info)", label: "generate" },
  human_task: { bg: "rgba(245,158,11,0.12)", color: "var(--warn)", label: "human task" },
};

function ExecutionModeBadge({ mode }: { mode: string }) {
  const style = EXEC_MODE_STYLES[mode] ?? EXEC_MODE_STYLES.action;
  return (
    <span
      className="flex-shrink-0"
      style={{ fontSize: 10, fontWeight: 500, padding: "1px 6px", borderRadius: 3, background: style.bg, color: style.color }}
    >
      {style.label}
    </span>
  );
}

// ── Detail Pane ──────────────────────────────────────────────────────────────

function DetailPane({
  situation: s,
  detail,
  detailLoading,
  activeMode,
  setActiveMode,
  patchSituation,
  feedbackText, setFeedbackText,
  feedbackCategory, setFeedbackCategory,
  outcomeValue, setOutcomeValue,
  outcomeNote, setOutcomeNote,
  billingStatus,
}: {
  situation: SituationItem;
  detail: SituationDetail | null;
  detailLoading: boolean;
  activeMode: ActiveMode;
  setActiveMode: (m: ActiveMode) => void;
  patchSituation: (id: string, body: Record<string, unknown>) => Promise<void>;
  feedbackText: string;
  setFeedbackText: (t: string) => void;
  feedbackCategory: string;
  setFeedbackCategory: (c: string) => void;
  outcomeValue: string;
  setOutcomeValue: (v: string) => void;
  outcomeNote: string;
  setOutcomeNote: (n: string) => void;
  billingStatus: string;
}) {
  const t = useTranslations("situations");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [showEvidence, setShowEvidence] = useState(false);
  const [editingDraft, setEditingDraft] = useState(false);
  const [editedDraftBody, setEditedDraftBody] = useState("");
  const [savedEditedDraft, setSavedEditedDraft] = useState<DraftPayload | null>(null);
  const [executionPlan, setExecutionPlan] = useState<ExecutionPlanData | null>(null);
  const [linkedWorkStream, setLinkedWorkStream] = useState<{ id: string; title: string } | null>(null);
  const [showStarDropdown, setShowStarDropdown] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [workStreams, setWorkStreams] = useState<Array<{ id: string; title: string }>>([]);
  const starDropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Outside-click dismiss for star dropdown
  useEffect(() => {
    if (!showStarDropdown) return;
    const handler = (e: MouseEvent) => {
      if (starDropdownRef.current && !starDropdownRef.current.contains(e.target as Node)) {
        setShowStarDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showStarDropdown]);

  // Fetch execution plan when situation has one
  useEffect(() => {
    if (!detail?.executionPlanId) { setExecutionPlan(null); return; }
    let cancelled = false;
    fetch(`/api/execution-plans/${detail.executionPlanId}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (!cancelled && data) setExecutionPlan(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [detail?.executionPlanId, detail?.status]);

  // Check if situation is in a WorkStream (single query)
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/workstreams/check-membership?itemType=situation&itemId=${s.id}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (cancelled) return;
        if (data?.workStreamId) {
          setLinkedWorkStream({ id: data.workStreamId, title: data.workStreamTitle });
        } else {
          setLinkedWorkStream(null);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [s.id]);

  // Fetch workstream list for the "add to project" dropdown (lazy, only when dropdown opens)
  useEffect(() => {
    if (!showStarDropdown || workStreams.length > 0) return;
    fetch("/api/workstreams")
      .then(res => res.ok ? res.json() : [])
      .then(data => setWorkStreams(data))
      .catch(() => {});
  }, [showStarDropdown, workStreams.length]);

  const isThisCard = activeMode?.id === s.id;
  const currentMode = isThisCard ? activeMode!.mode : null;
  const canAct = (s.status === "detected" || s.status === "proposed") && billingStatus === "active";
  const reasoning = detail?.reasoning ? safeParseReasoning(detail.reasoning) : null;
  const actionPlan = reasoning?.actionPlan ?? (Array.isArray(detail?.proposedAction) ? detail!.proposedAction as ActionStep[] : null);
  const sev = severityBadge(s);

  // Draft payloads from raw reasoning
  const draftPayloads = detail?.reasoning ? extractDraftPayloads(detail.reasoning) : [];
  const primaryDraft = savedEditedDraft ?? draftPayloads[0] ?? null;
  const originalDraft = draftPayloads[0] ?? null;

  // Policy note (if present in raw reasoning)
  const rawReasoning = detail?.reasoning as Record<string, unknown> | null;
  const policyNote = typeof rawReasoning?.policyNote === "string" ? rawReasoning.policyNote : null;

  const resetInteraction = () => {
    setActiveMode(null);
    setFeedbackText("");
    setFeedbackCategory("");
    setOutcomeValue("");
    setOutcomeNote("");
  };

  const startDraftEdit = () => {
    if (!originalDraft) return;
    const body = originalDraft.payload.body ?? originalDraft.payload.message ?? "";
    setEditedDraftBody(body);
    setEditingDraft(true);
  };

  const saveDraftEdit = () => {
    if (!originalDraft) return;
    const isEmail = originalDraft.payload.body !== undefined;
    const modified: DraftPayload = {
      ...originalDraft,
      payload: {
        ...originalDraft.payload,
        ...(isEmail ? { body: editedDraftBody } : { message: editedDraftBody }),
      },
    };
    setSavedEditedDraft(modified);
    setEditingDraft(false);
  };

  const cancelDraftEdit = () => {
    setEditingDraft(false);
    setEditedDraftBody("");
  };

  const handleApprove = () => {
    patchSituation(s.id, {
      status: "approved",
      ...(savedEditedDraft ? { editedDraftPayload: savedEditedDraft } : {}),
    });
  };

  return (
    <div className="px-6 py-5 space-y-5">
      {/* ── Header ── */}
      <div>
        <div className="flex items-start justify-between">
          <h1 className="font-heading" style={{ fontSize: 18, fontWeight: 600, color: "var(--foreground)" }}>
            {s.triggerEntityName ?? "Unknown"} &mdash; {s.situationType.name}
          </h1>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge variant={sev.variant}>{sev.label}</Badge>
            {/* Star/favorite — WorkStream linkage */}
            <div className="relative" ref={starDropdownRef}>
              <button
                className={`transition-colors ${linkedWorkStream ? "text-warn" : "text-[var(--fg4)] hover:text-[var(--fg3)]"}`}
                title={linkedWorkStream ? `In project: ${linkedWorkStream.title}` : "Add to project"}
                onClick={() => {
                  if (linkedWorkStream) {
                    router.push("/projects");
                  } else {
                    setShowStarDropdown(!showStarDropdown);
                  }
                }}
              >
                <svg className="w-5 h-5" fill={linkedWorkStream ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                </svg>
              </button>

              {showStarDropdown && !linkedWorkStream && (
                <div
                  className="absolute right-0 top-full mt-1 z-10"
                  style={{ background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: 6, boxShadow: "0 4px 12px rgba(0,0,0,0.5)", width: 220, overflow: "hidden" }}
                >
                  <button
                    className="w-full text-left px-3 py-2 text-[12px] transition hover:bg-hover"
                    style={{ color: "var(--accent)", borderBottom: "1px solid var(--border)" }}
                    disabled={creatingProject}
                    onClick={async () => {
                      setCreatingProject(true);
                      try {
                        // Get user's AI entity for ownerAiEntityId
                        const meRes = await fetch("/api/me/ai-entity");
                        const meData = meRes.ok ? await meRes.json() : null;
                        if (!meData?.id) { setCreatingProject(false); return; }

                        const title = `${s.triggerEntityName ?? "Unknown"} — ${s.situationType.name}`;
                        const wsRes = await fetch("/api/workstreams", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ title, description: title, ownerAiEntityId: meData.id }),
                        });
                        if (!wsRes.ok) { setCreatingProject(false); return; }
                        const ws = await wsRes.json();

                        await fetch(`/api/workstreams/${ws.id}/items`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ itemType: "situation", itemId: s.id }),
                        });

                        setLinkedWorkStream({ id: ws.id, title });
                        setShowStarDropdown(false);
                      } catch {}
                      setCreatingProject(false);
                    }}
                  >
                    {creatingProject ? "Creating..." : "+ Create new project"}
                  </button>
                  {workStreams.map(ws => (
                    <button
                      key={ws.id}
                      className="w-full text-left px-3 py-2 text-[12px] transition hover:bg-hover truncate"
                      style={{ color: "var(--fg2)", borderBottom: "1px solid var(--border)" }}
                      onClick={async () => {
                        await fetch(`/api/workstreams/${ws.id}/items`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ itemType: "situation", itemId: s.id }),
                        });
                        setLinkedWorkStream({ id: ws.id, title: ws.title });
                        setShowStarDropdown(false);
                      }}
                    >
                      {ws.title}
                    </button>
                  ))}
                  {workStreams.length === 0 && (
                    <div className="px-3 py-2 text-[11px]" style={{ color: "var(--fg4)" }}>No existing projects</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {s.departmentName && <Badge>{s.departmentName}</Badge>}
          <span style={{ fontSize: 12, color: "var(--fg3)" }}>{(s.confidence * 100).toFixed(0)}%</span>
          <span style={{ fontSize: 12, color: "var(--fg4)" }}>{formatRelativeTime(s.createdAt, locale)}</span>
        </div>
      </div>

      {detailLoading && (
        <div className="flex justify-center py-8">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-muted" />
        </div>
      )}

      {detail && !detailLoading && (
        <>
          {/* Revised badge */}
          {detail.editInstruction && (
            <div className="flex items-start gap-2">
              <Badge variant="blue">Revised</Badge>
              <p style={{ fontSize: 13, color: "var(--fg3)" }} className="italic">&quot;{detail.editInstruction}&quot;</p>
            </div>
          )}

          {/* ── SITUATION section ── */}
          {reasoning ? (
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "var(--fg4)", textTransform: "uppercase" as const }} className="mb-2">
                Situation
              </div>
              <div style={{ padding: "14px 16px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4 }}>
                <p style={{ fontSize: 13, lineHeight: 1.65, color: "var(--fg2)" }}>{reasoning.analysis}</p>
              </div>
            </div>
          ) : (s.status === "detected") ? (
            <div style={{ padding: "14px 16px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4 }}>
              <p style={{ fontSize: 13, color: "var(--fg3)" }}>
                Situation detected — awaiting AI analysis.
              </p>
              {detail.contextSnapshot?.triggerEntity && (
                <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1">
                  {Object.entries(detail.contextSnapshot.triggerEntity.properties).slice(0, 8).map(([k, v]) => (
                    <div key={k} className="flex justify-between text-[13px] py-1" style={{ borderBottom: "1px solid var(--border)" }}>
                      <span style={{ color: "var(--fg3)" }}>{k}</span>
                      <span style={{ color: "var(--fg2)" }}>{v}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {/* ── PROPOSED ACTION / PLAN section ── */}
          {reasoning && actionPlan && actionPlan.length === 1 ? (
            /* Single-step plan: show as simple proposed action */
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "var(--fg4)", textTransform: "uppercase" as const }} className="mb-2">
                Proposed Action
              </div>
              <div style={{ padding: "14px 16px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4 }}>
                <p style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.65, color: "var(--fg2)" }}>{actionPlan[0].title}</p>
                <p style={{ fontSize: 12, color: "var(--fg3)" }} className="mt-1">{actionPlan[0].description}</p>
                {policyNote && (
                  <p style={{ fontSize: 11, color: "var(--fg4)" }} className="mt-1">{policyNote}</p>
                )}
              </div>
            </div>
          ) : reasoning && actionPlan && actionPlan.length > 1 ? (
            /* Multi-step plan display */
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "var(--fg4)", textTransform: "uppercase" as const }} className="mb-2">
                Proposed Plan &middot; {actionPlan.length} steps
              </div>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, overflow: "hidden" }}>
                {actionPlan.map((step, i) => {
                  const planStep = executionPlan?.steps.find(es => es.sequenceOrder === i + 1);
                  const isCompleted = planStep?.status === "completed";
                  const isActive = planStep?.status === "executing" || planStep?.status === "awaiting_approval" || planStep?.status === "approved";
                  const isPending = !planStep || planStep.status === "pending";
                  return (
                    <div
                      key={i}
                      style={{
                        padding: "10px 16px",
                        borderBottom: i < actionPlan.length - 1 ? "1px solid var(--border)" : "none",
                        opacity: executionPlan ? (isPending && !isActive ? 0.5 : 1) : 1,
                        background: isActive ? "rgba(168,85,247,0.04)" : "transparent",
                      }}
                      className="flex items-start gap-3"
                    >
                      {/* Step number or status icon */}
                      <div className="flex-shrink-0 mt-0.5" style={{ width: 20, textAlign: "center" }}>
                        {isCompleted ? (
                          <span style={{ color: "var(--ok)", fontSize: 14 }}>&#10003;</span>
                        ) : (
                          <span style={{ fontSize: 12, fontWeight: 600, color: isActive ? "var(--accent)" : "var(--fg4)" }}>({i + 1})</span>
                        )}
                      </div>
                      {/* Step content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span style={{ fontSize: 13, fontWeight: 500, color: isCompleted ? "var(--fg3)" : "var(--fg2)" }} className="truncate">
                            {step.title}
                          </span>
                          <ExecutionModeBadge mode={step.executionMode} />
                        </div>
                        <p style={{ fontSize: 12, color: "var(--fg3)", marginTop: 2 }} className="line-clamp-2">
                          {step.description}
                        </p>
                        {/* Action preview */}
                        {planStep?.parameters && (() => {
                          const enrichedStep = {
                            ...planStep,
                            plan: {
                              sourceType: "situation" as const,
                              situation: { situationType: { autonomyLevel: detail?.situationType?.autonomyLevel } },
                            },
                          };
                          const PreviewComponent = getPreviewComponent(enrichedStep);
                          return (
                            <div className="mt-2">
                              <PreviewComponent
                                step={enrichedStep}
                                isEditable={planStep.status === "pending"}
                                onParametersUpdate={async (params) => {
                                  await fetch(`/api/execution-steps/${planStep.id}/parameters`, {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ parameters: params }),
                                  });
                                  // Refetch execution plan
                                  if (detail?.executionPlanId) {
                                    const res = await fetch(`/api/execution-plans/${detail.executionPlanId}`);
                                    if (res.ok) setExecutionPlan(await res.json());
                                  }
                                }}
                                locale={locale}
                              />
                            </div>
                          );
                        })()}
                        {planStep?.errorMessage && (
                          <p style={{ fontSize: 11, color: "var(--danger)", marginTop: 2 }}>{planStep.errorMessage}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {policyNote && (
                <p style={{ fontSize: 11, color: "var(--fg4)" }} className="mt-2">{policyNote}</p>
              )}
              {/* Execution plan status */}
              {executionPlan && (
                <div className="flex items-center gap-2 mt-2">
                  <span style={{
                    fontSize: 11,
                    fontWeight: 500,
                    padding: "2px 8px",
                    borderRadius: 3,
                    background: executionPlan.status === "completed" ? "rgba(34,197,94,0.1)" : executionPlan.status === "failed" ? "rgba(239,68,68,0.1)" : "rgba(168,85,247,0.1)",
                    color: executionPlan.status === "completed" ? "var(--ok)" : executionPlan.status === "failed" ? "var(--danger)" : "var(--accent)",
                  }}>
                    Plan {executionPlan.status}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--fg4)" }}>
                    Step {executionPlan.currentStepOrder} of {executionPlan.steps.length}
                  </span>
                </div>
              )}
            </div>
          ) : reasoning && !actionPlan ? (
            <p style={{ fontSize: 13, color: "var(--fg3)" }} className="italic">No action recommended — please review.</p>
          ) : s.status === "reasoning" ? (
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-border border-t-muted" />
              <p style={{ fontSize: 13, color: "var(--fg3)" }}>AI is analyzing this situation...</p>
            </div>
          ) : s.status === "executing" || s.status === "auto_executing" ? (
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-border border-t-ok" />
              <p style={{ fontSize: 13, color: "var(--fg3)" }}>Executing action...</p>
            </div>
          ) : null}

          {/* ── Draft Preview (HERO) ── */}
          {primaryDraft && (
            <div style={{
              border: "1px solid rgba(168,85,247,0.35)",
              borderRadius: 6,
              boxShadow: "0 0 20px rgba(168,85,247,0.08)",
              overflow: "hidden",
            }}>
              {/* Header bar */}
              <div className="flex items-center justify-between px-4 py-2" style={{
                background: "rgba(168,85,247,0.06)",
                borderBottom: "1px solid rgba(168,85,247,0.2)",
              }}>
                <div className="flex items-center gap-2">
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: providerDotColor(primaryDraft) }} />
                  <span style={{ fontSize: 12, fontWeight: 500, color: "var(--fg2)" }}>{providerLabel(primaryDraft)}</span>
                </div>
                {!editingDraft ? (
                  <button
                    onClick={startDraftEdit}
                    style={{ background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: 4, padding: "3px 10px", fontSize: 11, color: "var(--fg2)" }}
                    className="flex items-center gap-1.5 hover:bg-hover transition"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                    </svg>
                    Edit
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={saveDraftEdit}
                      className="transition"
                      style={{ background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.3)", borderRadius: 4, padding: "3px 10px", fontSize: 11, color: "var(--accent)" }}
                    >
                      {t("saveInstruction")}
                    </button>
                    <button
                      onClick={cancelDraftEdit}
                      style={{ background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: 4, padding: "3px 10px", fontSize: 11, color: "var(--fg2)" }}
                      className="hover:bg-hover transition"
                    >
                      {tc("cancel")}
                    </button>
                  </div>
                )}
              </div>

              {/* Body */}
              <div style={{ padding: "14px 16px" }}>
                {/* Email fields */}
                {primaryDraft.payload.to && (
                  <div style={{ fontSize: 12, color: "var(--fg3)" }} className="mb-1">
                    <span style={{ color: "var(--fg4)" }}>{t("to")}</span> {primaryDraft.payload.to}
                    {primaryDraft.payload.cc && <span className="ml-3"><span style={{ color: "var(--fg4)" }}>Cc:</span> {primaryDraft.payload.cc}</span>}
                  </div>
                )}
                {primaryDraft.payload.subject && (
                  <div style={{ fontSize: 12, color: "var(--fg3)" }} className="mb-2">
                    <span style={{ color: "var(--fg4)" }}>{t("subject")}</span> {primaryDraft.payload.subject}
                  </div>
                )}
                {/* Slack channel */}
                {primaryDraft.payload.channel && !primaryDraft.payload.to && (
                  <div style={{ fontSize: 12, color: "var(--fg3)" }} className="mb-2">
                    <span style={{ color: "var(--fg4)" }}>{t("channel")}</span> #{primaryDraft.payload.channel}
                  </div>
                )}

                {/* Divider for email */}
                {primaryDraft.payload.subject && (
                  <div style={{ borderTop: "1px solid var(--border)" }} className="mb-3" />
                )}

                {/* Body / message */}
                {editingDraft ? (
                  <textarea
                    value={editedDraftBody}
                    onChange={e => setEditedDraftBody(e.target.value)}
                    style={{
                      width: "100%",
                      minHeight: 120,
                      background: "var(--sidebar)",
                      border: "1px solid rgba(168,85,247,0.25)",
                      borderRadius: 4,
                      padding: "10px 12px",
                      fontSize: 13,
                      lineHeight: 1.7,
                      color: "var(--foreground)",
                      outline: "none",
                      resize: "vertical",
                      fontFamily: "inherit",
                    }}
                  />
                ) : (
                  <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--fg2)", whiteSpace: "pre-wrap" }}>
                    {primaryDraft.payload.body ?? primaryDraft.payload.message ?? ""}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Execution error */}
          {detail.actionTaken?.error && (
            <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 4 }} className="px-4 py-3">
              <p style={{ fontSize: 13, fontWeight: 500, color: "var(--danger)" }}>Execution failed</p>
              <p style={{ fontSize: 12, color: "var(--danger)", opacity: 0.7 }} className="mt-0.5">{detail.actionTaken.error}</p>
            </div>
          )}

          {/* ── Action buttons ── */}
          {canAct && !currentMode && (
            <div className="flex items-center gap-2 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
              <button
                className="rounded-full text-[13px] font-medium px-4 py-1.5 transition hover:opacity-90"
                style={{ background: "var(--ok)", color: "var(--accent-ink)" }}
                onClick={handleApprove}
              >
                {actionPlan && actionPlan.length > 1 ? t("approvePlan") : tc("approve")}
              </button>
              <button
                className="wf-btn-danger rounded-full text-[13px] font-medium px-4 py-1.5"
                onClick={() => setActiveMode({ id: s.id, mode: "reject" })}
              >
                Reject
              </button>
              <button
                className="rounded-full text-[13px] font-medium px-4 py-1.5 transition"
                style={{ background: "var(--elevated)", border: "1px solid var(--border)", color: "var(--fg2)" }}
                onClick={() => setActiveMode({ id: s.id, mode: "teach" })}
              >
                Teach AI
              </button>
            </div>
          )}

          {/* Outcome button for resolved without outcome */}
          {detail.status === "resolved" && !detail.outcome && !currentMode && (
            <div className="pt-2" style={{ borderTop: "1px solid var(--border)" }}>
              <button
                className="rounded-full text-[13px] font-medium px-4 py-1.5 transition"
                style={{ background: "var(--elevated)", border: "1px solid var(--border)", color: "var(--fg2)" }}
                onClick={() => setActiveMode({ id: s.id, mode: "outcome" })}
              >
                Mark Outcome
              </button>
            </div>
          )}

          {/* Existing outcome display */}
          {detail.outcome && (
            <div className="flex items-center gap-2 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
              <Badge variant={detail.outcome === "positive" ? "green" : detail.outcome === "negative" ? "red" : "default"}>
                {detail.outcome}
              </Badge>
              {detail.outcomeDetails && (() => {
                try {
                  const parsed = JSON.parse(detail.outcomeDetails);
                  return parsed.note ? <span style={{ fontSize: 13, color: "var(--fg3)" }}>{parsed.note}</span> : null;
                } catch { return null; }
              })()}
            </div>
          )}

          {/* ── Evidence & reasoning toggle ── */}
          {reasoning && (
            <div>
              <button
                onClick={() => setShowEvidence(!showEvidence)}
                className="flex items-center gap-1.5 transition-colors hover:text-foreground"
                style={{ fontSize: 12, color: "var(--fg4)" }}
              >
                <svg className={`w-3 h-3 transition-transform ${showEvidence ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                Evidence &amp; reasoning
              </button>

              {showEvidence && (
                <div className="mt-3 space-y-4">
                  {/* Evidence summary */}
                  {reasoning.evidenceSummary && (
                    <div style={{ padding: "14px 16px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "var(--fg4)", textTransform: "uppercase" as const }} className="mb-1.5">{t("evidenceSummary")}</div>
                      <p style={{ fontSize: 13, lineHeight: 1.65, color: "var(--fg2)" }}>{reasoning.evidenceSummary}</p>
                    </div>
                  )}

                  {/* Considered actions */}
                  {reasoning.consideredActions.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "var(--fg4)", textTransform: "uppercase" as const }} className="mb-2">{t("consideredActions")}</div>
                      <div className="space-y-2">
                        {reasoning.consideredActions.map((ca, i) => {
                          if (typeof ca === "string") {
                            return (
                              <div key={i} style={{ padding: "10px 14px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4 }}>
                                <span style={{ fontSize: 13, color: "var(--fg2)" }}>{ca}</span>
                              </div>
                            );
                          }
                          const hasEvidence = "evidenceFor" in ca;
                          const supportItems = hasEvidence ? (ca.evidenceFor ?? []) : (ca.pros ?? []);
                          const againstItems = hasEvidence ? (ca.evidenceAgainst ?? []) : (ca.cons ?? []);
                          return (
                            <div key={i} style={{ padding: "10px 14px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4 }} className="space-y-1.5">
                              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--fg2)" }}>{ca.action}</span>
                              {supportItems.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {supportItems.map((p, j) => (
                                    <span key={j} style={{ fontSize: 11, padding: "2px 6px", borderRadius: 2, background: "rgba(34,197,94,0.1)", color: "var(--ok)" }}>{p}</span>
                                  ))}
                                </div>
                              )}
                              {againstItems.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {againstItems.map((c, j) => (
                                    <span key={j} style={{ fontSize: 11, padding: "2px 6px", borderRadius: 2, background: "rgba(239,68,68,0.1)", color: "var(--danger)" }}>{c}</span>
                                  ))}
                                </div>
                              )}
                              {ca.expectedOutcome && (
                                <p style={{ fontSize: 11, color: "var(--fg3)" }}>{ca.expectedOutcome}</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Missing context */}
                  {reasoning.missingContext && reasoning.missingContext.length > 0 && (
                    <div style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)", borderRadius: 4 }} className="p-3">
                      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "var(--warn)", textTransform: "uppercase" as const }} className="mb-1.5">{t("missingContext")}</div>
                      <ul className="space-y-0.5">
                        {reasoning.missingContext.map((mc, i) => (
                          <li key={i} style={{ fontSize: 13, color: "var(--warn)" }}>&bull; {mc}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Entity Details */}
                  {detail.contextSnapshot?.triggerEntity && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "var(--fg4)", textTransform: "uppercase" as const }} className="mb-2">Entity Details</div>
                      <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                        {Object.entries(detail.contextSnapshot.triggerEntity.properties).map(([k, v]) => (
                          <div key={k} className="flex justify-between text-[13px] py-1" style={{ borderBottom: "1px solid var(--border)" }}>
                            <span style={{ color: "var(--fg3)" }}>{k}</span>
                            <span style={{ color: "var(--fg2)" }}>{v}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Related Entities */}
                  {detail.contextSnapshot?.relatedEntities && (() => {
                    const re = detail.contextSnapshot!.relatedEntities!;
                    const all = [...(re.base ?? []), ...(re.digital ?? []), ...(re.external ?? [])];
                    if (all.length === 0) return null;
                    return (
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "var(--fg4)", textTransform: "uppercase" as const }} className="mb-2">Related Entities</div>
                        <div className="space-y-1">
                          {all.slice(0, 5).map((e: { id: string; type: string; displayName: string; direction: string; relationship: string }) => (
                            <div key={e.id} className="flex items-center gap-2" style={{ fontSize: 13 }}>
                              <span style={{ color: "var(--fg4)" }}>{e.direction === "outgoing" ? "\u2192" : "\u2190"}</span>
                              <Badge>{e.type}</Badge>
                              <span style={{ color: "var(--fg2)" }}>{e.displayName}</span>
                              <span style={{ color: "var(--fg4)" }}>({e.relationship})</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Event Timeline */}
                  {detail.contextSnapshot?.recentEvents && detail.contextSnapshot.recentEvents.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "var(--fg4)", textTransform: "uppercase" as const }} className="mb-2">Event Timeline</div>
                      <div className="space-y-1.5">
                        {detail.contextSnapshot.recentEvents.slice(0, 8).map(ev => (
                          <div key={ev.id} className="flex items-center gap-3" style={{ fontSize: 13 }}>
                            <span style={{ fontSize: 11, color: "var(--fg4)", width: 48, textAlign: "right", flexShrink: 0 }}>{formatRelativeTime(ev.createdAt, locale)}</span>
                            <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--border)", flexShrink: 0 }} />
                            <span style={{ color: "var(--fg2)" }}>{ev.eventType}</span>
                            <span style={{ color: "var(--fg4)" }}>{ev.source}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Prior Situations */}
                  {detail.contextSnapshot?.priorSituations && detail.contextSnapshot.priorSituations.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "var(--fg4)", textTransform: "uppercase" as const }} className="mb-2">Prior Situations</div>
                      <div className="space-y-2">
                        {detail.contextSnapshot.priorSituations.map(ps => (
                          <div key={ps.id} className="flex items-start gap-2" style={{ fontSize: 13 }}>
                            <span className="flex-shrink-0" style={{ color: "var(--fg4)" }}>
                              {ps.outcome === "positive" ? "\u2713" : ps.outcome === "negative" ? "\u2717" : "?"}
                            </span>
                            <div>
                              <span style={{ color: "var(--fg2)" }}>{ps.triggerEntityName}</span>
                              <span style={{ color: "var(--fg4)" }} className="ml-2">{ps.status}</span>
                              {ps.feedback && <p style={{ color: "var(--fg3)" }} className="mt-0.5">{ps.feedback}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Mode UIs ── */}

          {/* Reject mode */}
          {currentMode === "reject" && (
            <div className="space-y-2 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
              <textarea
                value={feedbackText}
                onChange={e => setFeedbackText(e.target.value)}
                placeholder="Why is this not a real situation? (optional)"
                className="w-full outline-none"
                style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, padding: "8px 12px", fontSize: 13, color: "var(--foreground)", resize: "vertical", fontFamily: "inherit" }}
                rows={2}
              />
              <div className="flex gap-2">
                <button
                  className="wf-btn-danger rounded-full text-[13px] font-medium px-4 py-1.5"
                  onClick={() => patchSituation(s.id, { status: "rejected", feedback: feedbackText || undefined })}
                >Reject</button>
                <button
                  className="rounded-full text-[13px] font-medium px-4 py-1.5 transition"
                  style={{ background: "var(--elevated)", border: "1px solid var(--border)", color: "var(--fg2)" }}
                  onClick={resetInteraction}
                >{tc("cancel")}</button>
              </div>
            </div>
          )}

          {/* Teach AI mode */}
          {currentMode === "teach" && (
            <div className="space-y-2 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
              <select
                value={feedbackCategory}
                onChange={e => setFeedbackCategory(e.target.value)}
                className="w-full outline-none"
                style={{ background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: 4, padding: "8px 12px", fontSize: 13, color: "var(--foreground)" }}
              >
                {CATEGORY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value} style={{ background: "var(--elevated)" }}>{opt.label}</option>
                ))}
              </select>
              <textarea
                value={feedbackText}
                onChange={e => setFeedbackText(e.target.value)}
                placeholder="Teach the AI about this situation — what context is it missing?"
                className="w-full outline-none"
                style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, padding: "8px 12px", fontSize: 13, color: "var(--foreground)", resize: "vertical", fontFamily: "inherit" }}
                rows={2}
              />
              <div className="flex gap-2">
                <button
                  className="rounded-full text-[13px] font-medium px-4 py-1.5 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: "var(--ok)", color: "var(--accent-ink)" }}
                  disabled={!feedbackText.trim()}
                  onClick={() => patchSituation(s.id, {
                    feedback: feedbackText,
                    feedbackCategory: feedbackCategory || undefined,
                  })}
                >Save feedback</button>
                <button
                  className="rounded-full text-[13px] font-medium px-4 py-1.5 transition"
                  style={{ background: "var(--elevated)", border: "1px solid var(--border)", color: "var(--fg2)" }}
                  onClick={resetInteraction}
                >{tc("cancel")}</button>
              </div>
            </div>
          )}

          {/* Outcome mode */}
          {currentMode === "outcome" && (
            <div className="space-y-3 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
              <div className="flex gap-2">
                {(["positive", "negative", "neutral"] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => setOutcomeValue(v)}
                    className="px-4 py-1.5 rounded text-[13px] font-medium border transition-colors"
                    style={{
                      background: outcomeValue === v
                        ? v === "positive" ? "rgba(34,197,94,0.15)" : v === "negative" ? "rgba(239,68,68,0.15)" : "var(--hover)"
                        : "var(--surface)",
                      borderColor: outcomeValue === v
                        ? v === "positive" ? "rgba(34,197,94,0.3)" : v === "negative" ? "rgba(239,68,68,0.3)" : "var(--border)"
                        : "var(--border)",
                      color: outcomeValue === v
                        ? v === "positive" ? "var(--ok)" : v === "negative" ? "var(--danger)" : "var(--foreground)"
                        : "var(--fg3)",
                    }}
                  >
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={outcomeNote}
                onChange={e => setOutcomeNote(e.target.value)}
                placeholder="Optional note"
                className="w-full outline-none"
                style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, padding: "8px 12px", fontSize: 13, color: "var(--foreground)" }}
              />
              <div className="flex gap-2">
                <button
                  className="rounded-full text-[13px] font-medium px-4 py-1.5 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: "var(--ok)", color: "var(--accent-ink)" }}
                  disabled={!outcomeValue}
                  onClick={() => patchSituation(s.id, { outcome: outcomeValue, outcomeNote: outcomeNote || undefined })}
                >Save Outcome</button>
                <button
                  className="rounded-full text-[13px] font-medium px-4 py-1.5 transition"
                  style={{ background: "var(--elevated)", border: "1px solid var(--border)", color: "var(--fg2)" }}
                  onClick={resetInteraction}
                >{tc("cancel")}</button>
              </div>
            </div>
          )}

          {/* Existing feedback display */}
          {detail.feedback && !currentMode && (
            <div className="flex items-start gap-2 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
              <span style={{ fontSize: 13, color: "var(--fg3)" }}>Feedback:</span>
              <span style={{ fontSize: 13, color: "var(--fg2)" }}>{detail.feedback}</span>
              {detail.feedbackCategory && (
                <Badge>{CATEGORY_LABELS[detail.feedbackCategory] ?? detail.feedbackCategory}</Badge>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
