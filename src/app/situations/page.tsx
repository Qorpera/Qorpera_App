"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { ContextualChat } from "@/components/contextual-chat";
import { useIsMobile } from "@/hooks/use-media-query";
import { useUser } from "@/components/user-provider";
import { useTranslations, useLocale } from "next-intl";
import { formatRelativeTime } from "@/lib/format-helpers";
import { getPreviewComponent, type ExecutionStepForPreview } from "@/components/execution/previews/get-preview-component";
import { SidePanel } from "@/components/execution/side-panel";
import { InlineStepCard, getStepCardMeta, stripLeadingActionVerb } from "@/components/execution/inline-step-card";
import { resolveWikiLinks } from "@/lib/wiki-links";
import { WikiText } from "@/components/wiki-text";
import { OpenQuestionsCard } from "@/components/execution/open-questions-card";
import { DecisionsSection } from "@/components/execution/decisions-section";
import { parseOpenQuestionsSection, parseDecisionsSection } from "@/lib/clarification-helpers";
import { useToast } from "@/components/ui/toast";
import { ActionDraftCard, flushPendingDraftSaves, stepToDraft } from "@/components/action-draft-card";

function getApproveLabelKey(step: ExecutionStepForPreview): "send" | "accept" {
  const slug = step.actionCapability?.slug ?? "";
  if (slug.includes("email") || slug === "reply_to_thread" || slug === "create_draft" || slug === "send_with_attachment" || slug === "forward_email") {
    return "send";
  }
  if (slug.includes("slack") || slug === "send_channel_message" || slug.includes("teams")) {
    return "send";
  }
  // Also check previewType — needed for steps whose actionCapability isn't registered
  // (e.g. promo-seeded steps that carry `[preview: email]` / `[preview: slack_message]`).
  const previewType = (step.parameters as Record<string, unknown> | null)?.previewType;
  if (previewType === "email" || previewType === "slack_message") return "send";
  return "accept";
}

interface SidePanelData {
  step: ExecutionStepForPreview;
  index: number;
  stepOrder: number;
  situationId: string;
  isEditable: boolean;
}

// ── Types ────────────────────────────────────────────────────────────────────

interface SituationItem {
  id: string;
  slug?: string;
  situationType: { name: string; slug: string; autonomyLevel?: string };
  severity: number;
  confidence: number;
  status: string;
  source: string;
  triggerSummary: string | null;
  domainPageSlug: string | null;
  domainName: string | null;
  assignedTo?: string | null;
  autonomyLevel?: string | null;
  editInstruction?: string | null;
  createdAt: string;
  resolvedAt: string | null;
  viewedAt: string | null;
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
  actionBatch?: ActionStep[] | null;
  actionPlan?: ActionStep[] | null; // backward compat with old reasoning JSON
  afterBatch?: "resolve" | "re_evaluate" | "monitor";
  reEvaluationReason?: string;
  monitorDurationHours?: number;
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
    uncertainties?: Array<{ field: string; assumption: string; impact: string }> | null;
  }>;
}

interface SituationDetail {
  id: string;
  slug?: string;
  situationType: { id: string; name: string; slug: string; description: string; autonomyLevel: string };
  severity: number;
  confidence: number;
  status: string;
  source: string;
  triggerSummary: string | null;
  domainPageSlug: string | null;
  assignedPageSlug: string | null;
  autonomyLevel: string | null;
  investigationDepth: string;

  // Wiki content sections (markdown strings)
  wikiContent?: {
    trigger?: string;
    context?: string;
    investigation?: string;
    actionPlan?: string;
    decisions?: string;
    openQuestions?: string;
    deliverables?: string;
    timeline?: string;
    playbookReference?: string;
    monitoringNotes?: string;
    learnings?: string;
    outcomeSummary?: string;
  };
  wikiProperties?: Record<string, unknown>;

  // Inline action plan (replaces separate executionPlan fetch)
  actionPlan?: {
    steps: Array<{
      id: string;
      sequenceOrder: number;
      title: string;
      description: string;
      executionMode: string;
      status: string;
      capabilityName: string | null;
      assignedSlug: string | null;
      params: Record<string, unknown> | null;
      previewType: string | null;
      result: string | null;
    }>;
    totalSteps: number;
    currentStep: number | null;
    status: string;
  };

  // Cross-reference display map
  crossReferences?: Record<string, { slug: string; title: string; pageType: string }>;

  // Legacy fields (kept optional — undefined for wiki situations)
  triggerEntityId?: string | null;
  contextSnapshot?: {
    triggerEntity?: { displayName: string; type: string; properties: Record<string, string> };
    relatedEntities?: {
      base?: Array<{ id: string; type: string; displayName: string; relationship: string; direction: string; properties: Record<string, string> }>;
      digital?: Array<{ id: string; type: string; displayName: string; relationship: string; direction: string; properties: Record<string, string> }>;
      external?: Array<{ id: string; type: string; displayName: string; relationship: string; direction: string; properties: Record<string, string> }>;
    };
    departments?: Array<{ id: string; name: string; description: string | null; lead: { name: string; role: string } | null; memberCount: number }>;
    recentEvents?: Array<{ id: string; source: string; eventType: string; createdAt: string }>;
    priorSituations?: Array<{ id: string; triggerName: string; status: string; outcome: string | null; feedback: string | null; actionTaken: unknown; createdAt: string }>;
  } | null;
  triggerEvidence?: {
    type: "content" | "structured" | "natural" | "hybrid";
    content?: string;
    sender?: string;
    subject?: string;
    summary?: string;
    evidence?: string;
    reasoning?: string;
    matchedSignals?: Array<{ field: string; condition: string; value?: string | number; threshold?: number }>;
    matchedValues?: Record<string, string>;
    entityName?: string;
    entityType?: string;
  } | null;
  resumeSummary?: string | null;
  currentEntityState?: { id: string; displayName: string; typeName: string; properties: Record<string, string> } | null;
  analysisDocument?: {
    sections: Array<{ type: string; level?: number; title?: string; text: string; severity?: string; confidence?: number; sources?: string[] }>;
    overallConfidence: number;
    investigationSummary: string;
  } | null;
  actionTaken?: { error?: string; action?: string; result?: unknown; executedAt?: string; failedAt?: string } | null;
  feedback?: string | null;
  feedbackRating?: number | null;
  feedbackCategory?: string | null;
  editInstruction?: string | null;
  outcome?: string | null;
  outcomeDetails?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
  updatedAt?: string;
  cycles?: Array<{
    id: string;
    cycleNumber: number;
    triggerType: string;
    triggerSummary: string;
    cycleSummary: string | null;
    status: string;
    completedAt: string | null;
    createdAt: string;
    executionPlan: {
      id: string;
      status: string;
      steps: Array<{
        id: string;
        title: string;
        description: string;
        executionMode: string;
        status: string;
        assignedUserId: string | null;
        outputResult: string | null;
        executedAt: string | null;
      }>;
    } | null;
  }>;
}

type ActiveMode = { id: string; mode: "reject" | "teach" | "outcome" } | null;

type FilterValue = "all" | "active" | "monitoring" | "resolved";

// ── Helpers ──────────────────────────────────────────────────────────────────


/**
 * Build a ReasoningData-compatible object from wiki content sections.
 * This lets the existing rendering code work unchanged.
 */
function wikiToReasoning(detail: SituationDetail): ReasoningData | null {
  const investigation = detail.wikiContent?.investigation;
  if (!investigation && !detail.actionPlan) return null;

  return {
    analysis: investigation ?? "",
    evidenceSummary: undefined,
    consideredActions: [],
    actionBatch: detail.actionPlan?.steps.map(s => ({
      title: s.title,
      description: s.description,
      executionMode: s.executionMode as ActionStep["executionMode"],
      actionCapabilityName: s.capabilityName ?? undefined,
      assignedUserId: s.assignedSlug ?? undefined,
      params: s.params ?? undefined,
    })) ?? null,
    actionPlan: null,
    afterBatch: undefined,
    reEvaluationReason: undefined,
    monitorDurationHours: undefined,
    confidence: detail.confidence,
    missingContext: null,
    escalation: null,
  };
}

/**
 * Belt-and-suspenders for step descriptions: drop any
 * [capability: …] / [assigned: …] / [params: …] / [preview: …] lines that
 * slip through the action plan parser (e.g. older seeded content that the
 * parser hasn't been re-run against). Whitespace / trailing CR-tolerant.
 */
function stripMetadataLines(text: string): string {
  if (!text) return text;
  return text
    .split("\n")
    .filter((line) => !/^\s*\[(capability|assigned|params|preview):/i.test(line))
    .join("\n")
    .trim();
}

/**
 * Build an ExecutionPlanData-compatible object from the inline action plan.
 * This lets the step rendering code work unchanged.
 */
function wikiToExecutionPlan(detail: SituationDetail): ExecutionPlanData | null {
  if (!detail.actionPlan || detail.actionPlan.steps.length === 0) return null;

  return {
    id: `wiki-plan-${detail.id}`,
    status: detail.actionPlan.status,
    currentStepOrder: detail.actionPlan.currentStep ?? 1,
    priorityScore: null,
    steps: detail.actionPlan.steps.map(s => ({
      id: s.id,
      sequenceOrder: s.sequenceOrder,
      title: s.title,
      description: s.description,
      executionMode: s.executionMode,
      status: s.status,
      assignedUserId: s.assignedSlug,
      parameters: (() => {
        const p = s.params ? { ...s.params } : {};
        if (s.previewType) p.previewType = s.previewType;
        return Object.keys(p).length > 0 ? p : null;
      })(),
      actionCapability: s.capabilityName
        ? { id: "", slug: s.capabilityName, name: s.capabilityName }
        : null,
      outputResult: s.result,
      approvedAt: null,
      executedAt: null,
      errorMessage: null,
      uncertainties: null,
    })),
  };
}

function severityBadge(s: SituationItem): { label: string; variant: "red" | "amber" | "default" } {
  if (s.severity >= 0.7) return { label: "Critical", variant: "red" };
  if (s.severity >= 0.4) return { label: "High", variant: "amber" };
  return { label: "Medium", variant: "default" };
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
  const tp = useTranslations("execution.preview");
  const locale = useLocale();
  const isMobile = useIsMobile();
  const { isSuperadmin, isAdmin } = useUser();
  const { toast } = useToast();
  const [situations, setSituations] = useState<SituationItem[]>([]);
  const [showAllStatuses, setShowAllStatuses] = useState(false);
  const [showAllSituations, setShowAllSituations] = useState(true);
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
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [detectionCount, setDetectionCount] = useState(0);
  const [sidePanelData, setSidePanelData] = useState<SidePanelData | null>(null);
  const [panelBreadcrumbs, setPanelBreadcrumbs] = useState<Array<{ label: string; icon: React.ReactNode; step: ExecutionStepForPreview }>>([]);
  const [panelEditing, setPanelEditing] = useState(false);
  const [panelWidth, setPanelWidth] = useState(55);
  const [isResizing, setIsResizing] = useState(false);
  const [isPreviewFullScreen, setIsPreviewFullScreen] = useState(false);
  const [isChatVisible, setIsChatVisible] = useState(true);
  const sidebarWasCollapsed = useRef(false);

  // Auto-collapse main nav sidebar when a situation is entered, restore on exit
  useEffect(() => {
    if (selectedId) {
      sidebarWasCollapsed.current = localStorage.getItem("sidebar-collapsed") === "true";
      if (!sidebarWasCollapsed.current) {
        window.dispatchEvent(new CustomEvent("sidebar-collapse-request", { detail: { collapsed: true } }));
      }
    } else {
      if (!sidebarWasCollapsed.current) {
        window.dispatchEvent(new CustomEvent("sidebar-collapse-request", { detail: { collapsed: false } }));
      }
    }
  }, [!!selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for approve-action events from email preview footer
  useEffect(() => {
    function handlePanelApprove() {
      if (selectedSituation && sidePanelData?.isEditable) {
        // Flush any in-flight draft autosaves before approving so the executor
        // reads the latest edits from the wiki.
        void flushPendingDraftSaves().then(() => {
          patchSituation(selectedSituation.id, { status: "approved" });
        });
      }
    }
    window.addEventListener("panel-approve-action", handlePanelApprove);
    return () => window.removeEventListener("panel-approve-action", handlePanelApprove);
  }); // intentionally no deps — reads current closure values

  // ── Fetch situations ────────────────────────────────────────────────────

  const fetchSituations = useCallback(async () => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    try {
      const statusParam = showAllStatuses
        ? "detected,proposed,reasoning,auto_executing,executing,monitoring,resolved"
        : "proposed,auto_executing,executing,monitoring,resolved";
      const res = await fetch(`/api/situations?status=${statusParam}${showAllSituations ? "" : "&showAll=false"}`);
      if (res.ok) {
        const data = await res.json();
        setSituations((prev) => {
          if (prev.length !== data.items.length) return data.items;
          const prevSig = prev.map((s: SituationItem) => `${s.id}:${s.status}:${s.viewedAt ?? ""}`).join("|");
          const newSig = data.items.map((s: SituationItem) => `${s.id}:${s.status}:${s.viewedAt ?? ""}`).join("|");
          return prevSig === newSig ? prev : data.items;
        });
      }
    } catch {}
    setLoading(false);
  }, [showAllStatuses, showAllSituations]);

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
    const interval = setInterval(fetchSituations, 30000);
    return () => clearInterval(interval);
  }, [fetchSituations]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchSituations();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
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

  const refreshDetail = useCallback(() => {
    if (selectedId) fetchDetail(selectedId);
  }, [selectedId, fetchDetail]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    setDetail(null);
    fetchDetail(selectedId);
  }, [selectedId, fetchDetail]);

  // Poll detail refresh while any step in the current plan is executing. Stops
  // automatically once no step reports "executing", so the effect re-evaluates
  // on each detail change and tears down the interval cleanly.
  const anyStepExecuting = !!detail?.actionPlan?.steps?.some(s => s.status === "executing");
  useEffect(() => {
    if (!selectedId || !anyStepExecuting) return;
    const interval = setInterval(() => fetchDetail(selectedId), 2000);
    return () => clearInterval(interval);
  }, [selectedId, anyStepExecuting, fetchDetail]);

  // ── Reset interaction when selection changes ────────────────────────────

  useEffect(() => {
    setActiveMode(null);
    setFeedbackText("");
    setFeedbackCategory("");
    setOutcomeValue("");
    setOutcomeNote("");
    setSidePanelData(null);
    setPanelBreadcrumbs([]);
    setPanelEditing(false);
  }, [selectedId]);

  // ── Derived ─────────────────────────────────────────────────────────────

  const filteredSituations = useMemo(() => {
    if (filter === "all") return situations;
    if (filter === "active") return situations.filter(s => ["proposed", "executing", "auto_executing", "detected", "reasoning"].includes(s.status));
    if (filter === "monitoring") return situations.filter(s => s.status === "monitoring");
    if (filter === "resolved") return situations.filter(s => ["resolved", "rejected", "closed"].includes(s.status));
    return situations;
  }, [situations, filter]);

  const selectedSituation = situations.find(s => s.id === selectedId) ?? null;
  const activeCount = situations.filter(s => ["proposed", "executing", "auto_executing", "detected", "reasoning"].includes(s.status)).length;

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
    <>
    <AppShell pendingApprovals={activeCount}>
      {billingStatus !== "active" && !bannerDismissed && (
        <div className="px-4 py-2 flex items-center justify-between" style={{ background: "var(--card-bg)", borderBottom: "1px solid var(--border)" }}>
          <div>
            <span style={{ fontSize: 12, color: "var(--fg3)", fontWeight: 400 }}>
              {billingStatus === "past_due"
                ? "Payment needs updating. Situation actions are paused."
                : billingStatus === "depleted"
                ? "Your balance is empty. AI operations are paused."
                : `You're viewing Qorpera's AI detections. ${detectionCount}/50 free situations detected.`}
            </span>
          </div>
          <div className="flex items-center">
            <a
              href="/settings?tab=billing"
              className="rounded-full text-[12px] font-medium px-3 py-1"
              style={{ background: "var(--badge-bg)", color: "var(--fg2)" }}
            >
              {billingStatus === "past_due" ? "Update payment" : "Add credits"}
            </a>
            <button onClick={() => setBannerDismissed(true)} className="ml-2 p-1 rounded hover:bg-white/10 transition-colors" style={{ color: "var(--fg4)" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>
      )}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── Left: situation list ── */}
        {(!isMobile || !selectedId) && (
        <div
          className="flex-shrink-0 flex flex-col overflow-hidden"
          style={{
            width: isPreviewFullScreen ? 0 : (isMobile ? "100%" : 280),
            borderRight: isMobile || isPreviewFullScreen ? "none" : "1px solid var(--border)",
            transition: "width 0.25s ease-in-out",
          }}
        >
          {/* Header */}
          <>
          <div className="px-4 py-3 flex-shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--foreground)" }}>{t("title")}</div>
              {isAdmin && (
                <button
                  onClick={() => setShowAllSituations(prev => !prev)}
                  className="text-[10px] font-medium px-2 py-0.5 rounded transition-colors"
                  style={{
                    background: showAllSituations ? "var(--badge-bg-strong)" : "var(--badge-bg)",
                    color: showAllSituations ? "var(--btn-primary-text)" : "var(--fg3)",
                  }}
                >
                  {showAllSituations ? "All" : "Mine"}
                </button>
              )}
            </div>
            <div style={{ fontSize: 11, color: "var(--fg3)" }} className="mt-0.5">
              {situations.length} total &middot; {activeCount} pending
            </div>
          </div>

          {/* Filter tabs */}
          <div className="px-4 py-2 flex gap-1.5 items-center flex-shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
            {(["all", "active", "monitoring", "resolved"] as const).map(f => (
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
            {isSuperadmin && (
              <button
                onClick={() => setShowAllStatuses(prev => !prev)}
                style={{
                  fontSize: 11,
                  padding: "3px 8px",
                  borderRadius: 4,
                  border: `1px solid ${showAllStatuses ? "var(--accent)" : "var(--border)"}`,
                  background: showAllStatuses ? "var(--accent)" : "transparent",
                  color: showAllStatuses ? "white" : "var(--fg3)",
                  cursor: "pointer",
                  marginLeft: 8,
                }}
              >
                {showAllStatuses ? "All statuses" : "Ready only"}
              </button>
            )}
          </div>
          </>

          {/* List */}
          <div className="flex-1 overflow-y-auto">

            {loading && (
              <div className="flex justify-center py-10">
                <div className="h-4 w-4 animate-spin rounded-full border border-border border-t-muted" />
              </div>
            )}
            {filteredSituations.map(s => {
              const isUnread = !s.viewedAt;
              return (
                <button
                  key={s.id}
                  onClick={() => {
                    setSelectedId(s.id);
                    if (isUnread) {
                      setSituations(prev => prev.map(sit => sit.id === s.id ? { ...sit, viewedAt: new Date().toISOString() } : sit));
                      fetch(`/api/situations/${s.id}/view`, { method: "POST" }).catch(() => {});
                    }
                  }}
                  className={`w-full text-left px-4 py-2.5 transition-colors ${
                    selectedId === s.id ? "bg-[var(--surface)]" : "hover:bg-[var(--step-hover)]"
                  }`}
                  style={{
                    borderBottom: "1px solid var(--border)",
                    borderLeft: selectedId === s.id
                      ? "2px solid var(--dot-color)"
                      : "2px solid transparent",
                  }}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="flex-shrink-0" style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--accent)", visibility: isUnread ? "visible" : "hidden" }} />
                    <span style={{ fontSize: 13, fontWeight: isUnread ? 600 : 500, color: "var(--foreground)" }} className="truncate flex-1">
                      {s.triggerSummary
                        ? s.triggerSummary.slice(0, 60) + (s.triggerSummary.length > 60 ? "..." : "")
                        : s.situationType.name
                      }
                    </span>
                    <span style={{ fontSize: 11, color: "var(--fg4)" }} className="flex-shrink-0">
                      {formatRelativeTime(s.createdAt, locale)}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--fg3)" }} className="pl-[15px] truncate">
                    {s.situationType.name}{s.domainName ? ` \u00b7 ${s.domainName}` : ""}
                  </div>
                </button>
              );
            })}
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
        <div className="flex-1 min-h-0 overflow-hidden" style={{
          display: "grid",
          gridTemplateColumns: isPreviewFullScreen
            ? "0fr 1fr"
            : sidePanelData ? `1fr ${panelWidth}%` : "1fr",
          transition: isResizing ? "none" : "grid-template-columns 0.25s ease-in-out",
        }}>
          {/* Detail column — resizes with the side panel; content inside is max-width + centered */}
          <div className="flex flex-col min-h-0 overflow-hidden" style={{
            transition: "opacity 0.2s ease",
            opacity: isPreviewFullScreen ? 0 : 1,
          }}>
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
                    showAllStatuses={showAllStatuses}
                    sidePanelStepIndex={sidePanelData?.index ?? null}
                    onOpenStepPanel={setSidePanelData}
                    onRefreshDetail={refreshDetail}
                  />
                </div>
                {!isPreviewFullScreen && (
                  <ContextualChat
                    contextType="situation"
                    contextId={selectedSituation.id}
                    placeholder={t("discuss")}
                    hints={["What evidence supports this?", "Should I escalate?"]}
                    uncertaintyLevel={"none"}
                  />
                )}
              </>
            ) : (
              <div className="flex items-center justify-center h-full" style={{ fontSize: 18, color: "var(--fg3)" }}>
                {t("selectSituation")}
              </div>
            )}
          </div>

          {/* Side panel */}
          {sidePanelData && (() => {
            const { icon, badge } = getStepCardMeta(sidePanelData.step);
            const PanelPreview = getPreviewComponent(sidePanelData.step);
            const breadcrumbEntries = panelBreadcrumbs.map(crumb => ({
              label: crumb.label,
              icon: crumb.icon,
              onClick: () => {
                setSidePanelData(prev => prev ? { ...prev, step: crumb.step } : null);
                setPanelBreadcrumbs([]);
              },
            }));
            const editableDraft =
              sidePanelData.isEditable && sidePanelData.step.status === "pending"
                ? stepToDraft(sidePanelData.step)
                : null;
            const panelSituationId = sidePanelData.situationId || selectedSituation!.id;
            return (
              <SidePanel
                isOpen={!!sidePanelData}
                onClose={() => { setSidePanelData(null); setPanelBreadcrumbs([]); setPanelEditing(false); setIsPreviewFullScreen(false); setIsChatVisible(true); }}
                title={stripLeadingActionVerb(sidePanelData.step.title)}
                typeBadge={badge}
                typeIcon={icon}
                breadcrumbs={breadcrumbEntries}
                isEditing={editableDraft ? true : panelEditing}
                onToggleEdit={editableDraft ? undefined : () => setPanelEditing(prev => !prev)}
                onWidthChange={setPanelWidth}
                onResizeStart={() => setIsResizing(true)}
                onResizeEnd={() => setIsResizing(false)}
                onApprove={sidePanelData.isEditable ? () => {
                  const situationId = sidePanelData.situationId || selectedSituation!.id;
                  const stepOrder = sidePanelData.stepOrder;
                  // Flush debounced draft edits first (fire-and-forget) so the
                  // executor picks up the latest field values from the wiki.
                  void flushPendingDraftSaves();
                  // Fire the POST immediately (fire-and-forget). UI timing is driven by the
                  // button's 1100ms animation, not by the network round-trip. On failure,
                  // toast the user and let the next fetchDetail reconcile the optimistic flip.
                  fetch(`/api/situations/${situationId}/steps/${stepOrder}/complete`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({}),
                  })
                    .then(async res => {
                      if (!res.ok) {
                        const body = await res.json().catch(() => null);
                        toast(body?.error ?? "Failed to complete step", "error");
                        fetchDetail(situationId);
                      }
                    })
                    .catch(() => {
                      toast("Failed to complete step", "error");
                      fetchDetail(situationId);
                    });
                } : undefined}
                onApprovalComplete={sidePanelData.isEditable ? () => {
                  const situationId = sidePanelData.situationId || selectedSituation!.id;
                  const stepOrder = sidePanelData.stepOrder;
                  // Optimistic update — flip the step to completed locally so the UI
                  // reflects success at animation end without waiting for a poll.
                  setDetail(prev => {
                    if (!prev || !prev.actionPlan) return prev;
                    return {
                      ...prev,
                      actionPlan: {
                        ...prev.actionPlan,
                        steps: prev.actionPlan.steps.map(s =>
                          s.sequenceOrder === stepOrder ? { ...s, status: "completed" } : s
                        ),
                      },
                    };
                  });
                  setSidePanelData(null);
                  setPanelBreadcrumbs([]);
                  setPanelEditing(false);
                  setIsPreviewFullScreen(false);
                  setIsChatVisible(true);
                  // Background reconcile with server state.
                  fetchDetail(situationId);
                } : undefined}
                approveLabel={tp(getApproveLabelKey(sidePanelData.step))}
                onDiscuss={() => {
                  if (isPreviewFullScreen) {
                    setIsChatVisible(true);
                  } else {
                    const chatInput = document.getElementById("situation-chat-input") as HTMLTextAreaElement;
                    if (chatInput) { chatInput.focus(); chatInput.scrollIntoView({ behavior: "smooth", block: "end" }); }
                  }
                }}
                isFullScreen={isPreviewFullScreen}
                onToggleFullScreen={() => setIsPreviewFullScreen(prev => !prev)}
                isChatVisible={isChatVisible}
                onToggleChatVisible={() => setIsChatVisible(prev => !prev)}
                chatElement={isPreviewFullScreen && selectedSituation ? (
                  <ContextualChat
                    contextType="situation"
                    contextId={selectedSituation.id}
                    placeholder={t("discuss")}
                    hints={["What evidence supports this?", "Should I escalate?"]}
                    uncertaintyLevel={"none"}
                  />
                ) : undefined}
              >
                {editableDraft ? (
                  <div style={{ padding: 16 }}>
                    <ActionDraftCard
                      situationId={panelSituationId}
                      draft={editableDraft}
                      editable={true}
                    />
                  </div>
                ) : (
                <PanelPreview
                  step={sidePanelData.step}
                  isEditable={panelEditing && sidePanelData.isEditable}
                  inPanel
                  onParametersUpdate={async (params) => {
                    let finalParams = params;
                    // When viewing an attachment, merge changes back into parent's attachments array
                    if (panelBreadcrumbs.length > 0 && panelBreadcrumbs[0]?.step) {
                      const parentStep = panelBreadcrumbs[0].step;
                      const parentParams = parentStep.parameters ?? {};
                      const attachments = [...((parentParams.attachments ?? []) as Array<Record<string, unknown>>)];
                      // Extract attachment index from synthetic step id (format: "{parentId}-attachment-{idx}")
                      const idParts = sidePanelData.step.id.split("-attachment-");
                      const attachIdx = idParts.length > 1 ? parseInt(idParts[idParts.length - 1], 10) : -1;
                      if (attachIdx >= 0 && attachIdx < attachments.length) {
                        attachments[attachIdx] = { ...attachments[attachIdx], ...params };
                      }
                      finalParams = { ...parentParams, attachments };
                    }
                    await fetch(`/api/situations/${sidePanelData.situationId}/steps/${sidePanelData.stepOrder}/parameters`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ parameters: finalParams }),
                    });
                    setSidePanelData(prev => prev ? { ...prev, step: { ...prev.step, parameters: params } } : null);
                    if (detail?.id) fetchDetail(detail.id);
                  }}
                  onOpenAttachment={(attachment, attachmentIndex) => {
                    const parentStep = sidePanelData.step;
                    const { icon: parentIcon } = getStepCardMeta(parentStep);
                    const syntheticStep: ExecutionStepForPreview = {
                      ...parentStep,
                      id: `${parentStep.id}-attachment-${attachmentIndex}`,
                      title: (attachment as { title?: string }).title ?? `Attachment ${attachmentIndex + 1}`,
                      parameters: attachment,
                    };
                    setPanelBreadcrumbs([{
                      label: (parentStep.parameters?.subject as string) || parentStep.title,
                      icon: parentIcon,
                      step: parentStep,
                    }]);
                    setSidePanelData(prev => prev ? { ...prev, step: syntheticStep } : null);
                  }}
                  onStepComplete={async (notes: string) => {
                    if (!detail?.id) return;
                    await fetch(
                      `/api/situations/${detail.id}/steps/${sidePanelData.stepOrder}/complete`,
                      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notes: notes.trim() || null }) },
                    );
                    fetchDetail(detail.id);
                  }}
                  locale={locale}
                />
                )}
              </SidePanel>
            );
          })()}
        </div>
        )}

      </div>
    </AppShell>
    </>
  );
}


// ── Execution Mode Badge ─────────────────────────────────────────────────────

const EXEC_MODE_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  action: { bg: "var(--badge-bg)", color: "var(--accent)", label: "action" },
  generate: { bg: "rgba(59,130,246,0.12)", color: "var(--info)", label: "generate" },
  human_task: { bg: "rgba(245,158,11,0.12)", color: "var(--warn)", label: "human task" },
};

const STEP_BTN_PRIMARY: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 4,
  background: "var(--btn-primary-bg)", color: "var(--btn-primary-text)", border: "none", cursor: "pointer",
};
const STEP_BTN_SECONDARY: React.CSSProperties = {
  fontSize: 11, fontWeight: 500, padding: "3px 10px", borderRadius: 4,
  background: "var(--elevated)", color: "var(--fg2)", border: "1px solid var(--border)", cursor: "pointer",
};
const PLAN_STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  completed: { bg: "rgba(34,197,94,0.1)", color: "var(--ok)", label: "Completed" },
  failed: { bg: "rgba(239,68,68,0.1)", color: "var(--danger)", label: "Failed" },
  pending: { bg: "var(--badge-bg)", color: "var(--accent)", label: "Plan pending" },
  executing: { bg: "transparent", color: "var(--fg3)", label: "Executing" },
  re_evaluating: { bg: "rgba(245,158,11,0.12)", color: "var(--warn)", label: "Re-evaluating" },
};
// ── Thinking Step (Claude-style reasoning trace) ────────────────────────────

const THINKING_ICONS: Record<string, React.ReactNode> = {
  search: <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>,
  entity: <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
  graph: <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="6" cy="6" r="3" /><circle cx="18" cy="18" r="3" /><path d="M8.59 8.59 15.42 15.42" /><circle cx="18" cy="6" r="3" /><path d="M15.41 8.59 8.59 15.42" /></svg>,
  timeline: <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
  history: <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>,
  evaluate: <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>,
  gap: <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>,
};

function ThinkingStep({
  icon,
  title,
  badge,
  defaultOpen = false,
  children,
}: {
  icon: string;
  title: string;
  badge?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ position: "relative", padding: "8px 0" }}>
      {/* Dot on rail */}
      <div style={{ position: "absolute", left: -24 + 4, top: 12, width: 8, height: 8, borderRadius: "50%", background: "var(--elevated)", border: "1.5px solid rgba(255,255,255,0.2)", zIndex: 1 }} />
      {/* Header */}
      <button
        onClick={() => setOpen(!open)}
        style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", padding: 0, width: "100%", textAlign: "left" }}
      >
        <span style={{ color: "var(--fg3)", flexShrink: 0, display: "flex" }}>{THINKING_ICONS[icon]}</span>
        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground)" }}>{title}</span>
        {badge && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, background: "rgba(255,255,255,0.06)", color: "var(--fg3)" }}>{badge}</span>}
        <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="var(--fg4)" strokeWidth={2} style={{ marginLeft: "auto", flexShrink: 0, transform: open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>
          <path d="M9 5l7 7-7 7" />
        </svg>
      </button>
      {/* Content */}
      {open && (
        <div style={{ marginTop: 8, marginLeft: 20, padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 6, border: "0.5px solid rgba(255,255,255,0.06)" }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ── Collapsible Action (within evaluated actions) ───────────────────────────

function CollapsibleAction({
  title,
  tagCount,
  isLast,
  children,
}: {
  title: string;
  tagCount: number;
  isLast: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: isLast ? 0 : 10, paddingBottom: isLast ? 0 : 10, borderBottom: isLast ? "none" : "1px solid rgba(255,255,255,0.04)" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", padding: 0, width: "100%", textAlign: "left" }}
      >
        <svg width={8} height={8} viewBox="0 0 24 24" fill="none" stroke="var(--fg4)" strokeWidth={2.5} style={{ flexShrink: 0, transform: open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>
          <path d="M9 5l7 7-7 7" />
        </svg>
        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--foreground)" }}>{title}</span>
        {tagCount > 0 && (
          <span style={{ fontSize: 10, color: "var(--fg4)", marginLeft: "auto", flexShrink: 0 }}>
            {tagCount} tag{tagCount !== 1 ? "s" : ""}
          </span>
        )}
      </button>
      {open && (
        <div style={{ marginTop: 6, marginLeft: 14 }}>
          {children}
        </div>
      )}
    </div>
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
  showAllStatuses,
  sidePanelStepIndex,
  onOpenStepPanel,
  onRefreshDetail,
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
  showAllStatuses: boolean;
  sidePanelStepIndex: number | null;
  onOpenStepPanel: (data: SidePanelData) => void;
  onRefreshDetail: () => void;
}) {
  const t = useTranslations("situations");
  const tc = useTranslations("common");
  const locale = useLocale();
  const { toast } = useToast();
  const [showEvidence, setShowEvidence] = useState(false);
  const [executionPlan, setExecutionPlan] = useState<ExecutionPlanData | null>(null);
  const router = useRouter();
  const [openSteps, setOpenSteps] = useState<Set<number>>(new Set([0]));
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [showTeachForm, setShowTeachForm] = useState(false);
  const [notesStepId, setNotesStepId] = useState<number | null>(null);
  const [stepNotes, setStepNotes] = useState("");
  const [submittingNotes, setSubmittingNotes] = useState(false);
  const toggleStep = (i: number) => {
    setOpenSteps(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  // Derive execution plan from inline action plan (no separate fetch)
  useEffect(() => {
    if (!detail) { setExecutionPlan(null); return; }
    const plan = wikiToExecutionPlan(detail);
    setExecutionPlan(plan);
  }, [detail]);

  const isThisCard = activeMode?.id === s.id;
  const currentMode = isThisCard && activeMode ? activeMode.mode : null;
  const canAct = showAllStatuses
    ? (s.status === "detected" || s.status === "proposed")
    : s.status === "proposed";
  const reasoning = useMemo(() => detail ? wikiToReasoning(detail) : null, [detail]);
  const actionPlan = reasoning?.actionBatch ?? null;

  const currentStepIndex = (() => {
    if (!actionPlan || !executionPlan) return 0;
    for (let i = 0; i < actionPlan.length; i++) {
      const planStep = executionPlan.steps.find(es => es.sequenceOrder === i + 1);
      if (!planStep || planStep.status !== "completed") return i;
    }
    return actionPlan.length;
  })();

  useEffect(() => {
    setOpenSteps(new Set([currentStepIndex]));
  }, [currentStepIndex]);

  // Auto-expand evidence when no action is recommended
  useEffect(() => {
    if (reasoning && !actionPlan) setShowEvidence(true);
  }, [reasoning, actionPlan]);

  const sev = severityBadge(s);

  const resetInteraction = () => {
    setActiveMode(null);
    setFeedbackText("");
    setFeedbackCategory("");
    setOutcomeValue("");
    setOutcomeNote("");
  };

  const submitStepNotes = async (stepOrder: number, notes: string) => {
    if (!detail?.id) return;
    setSubmittingNotes(true);
    try {
      const resp = await fetch(
        `/api/situations/${detail.id}/steps/${stepOrder}/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: notes.trim() || null }),
        },
      );
      if (!resp.ok) {
        const body = await resp.json().catch(() => null);
        toast(body?.error ?? "Failed to complete step", "error");
        return;
      }
      setNotesStepId(null);
      setStepNotes("");
      onRefreshDetail();
    } catch {
      toast("Failed to complete step", "error");
    } finally {
      setSubmittingNotes(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-5 space-y-5">
      {/* ── Header ── */}
      <div>
        <div className="flex items-start justify-between">
          <h1 style={{ fontSize: 18, fontWeight: 600, color: "var(--foreground)" }}>
            {s.triggerSummary
              ? s.triggerSummary.slice(0, 80) + (s.triggerSummary.length > 80 ? "..." : "")
              : s.situationType.name
            }
          </h1>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge variant={sev.variant}>{sev.label}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {s.domainName && <Badge>{s.domainName}</Badge>}
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

          {/* ── Situation resume ── */}
          {(() => {
            const rawResume = detail.wikiContent?.investigation
              ?? reasoning?.analysis
              ?? "";
            const rawTrigger = detail.wikiContent?.trigger
              ?? detail.triggerSummary
              ?? "";
            const resumeText = rawResume;
            const triggerText = rawTrigger;
            return resumeText || triggerText ? (
              <div style={{ marginBottom: 16 }}>
                {resumeText && (
                  <p style={{ fontSize: 13, color: "var(--fg2)", lineHeight: 1.6, marginBottom: triggerText ? 10 : 0 }}>
                    <WikiText
                      text={resumeText.slice(0, 500) + (resumeText.length > 500 ? "..." : "")}
                      crossReferences={detail.crossReferences}
                    />
                  </p>
                )}
                {triggerText && (
                  <p style={{ fontSize: 12, color: "var(--fg3)", display: "flex", alignItems: "center", gap: 5 }}>
                    <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                    </svg>
                    <WikiText
                      text={triggerText.slice(0, 200) + (triggerText.length > 200 ? "..." : "")}
                      crossReferences={detail.crossReferences}
                    />
                  </p>
                )}
              </div>
            ) : null;
          })()}

          {showAllStatuses && !reasoning && s.status === "detected" && (
            <div style={{ padding: 16, color: "var(--fg3)", fontSize: 13 }}>
              {t("awaitingAnalysis")}
            </div>
          )}

          {showAllStatuses && s.status === "reasoning" && (
            <div style={{ padding: 16, color: "var(--fg3)", fontSize: 13 }}>
              {t("planExecuting")}…
            </div>
          )}

          {/* ── SITUATION RESUME (only for multi-cycle situations) ── */}
          {detail.resumeSummary && detail.cycles && detail.cycles.length >= 2 && (
            <div className="w-[70%] mx-auto my-6">
              <div className="text-xs uppercase tracking-widest mb-3" style={{ color: "var(--fg3)" }}>
                {t("situationSummary") ?? "Situation Summary"}
              </div>
              <div
                className="rounded-lg border"
                style={{
                  background: "var(--card-bg)",
                  borderColor: "var(--card-border)",
                  padding: "16px 20px",
                }}
              >
                <p style={{
                  fontSize: 14,
                  lineHeight: 1.65,
                  color: "var(--foreground)",
                  margin: 0,
                }}>
                  {detail.resumeSummary}
                </p>
              </div>
            </div>
          )}

          {/* ── ANALYSIS DOCUMENT (thorough investigations) ── */}
          {detail?.analysisDocument && detail?.investigationDepth === "thorough" && (
            <div className="w-[70%] mx-auto" style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 12 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>
                  Investigation Analysis
                </span>
                <span style={{ fontSize: 11, color: "var(--fg3)", marginLeft: 8 }}>
                  {(detail.analysisDocument.overallConfidence * 100).toFixed(0)}% confidence
                </span>
              </div>
              {detail.analysisDocument.sections.map((section, i) => {
                if (section.type === "heading") {
                  const Tag = (section.level ?? 2) <= 2 ? "h3" : "h4";
                  return (
                    <Tag key={i} style={{ fontSize: section.level === 1 ? 16 : 14, fontWeight: 500, color: "var(--foreground)", marginTop: i > 0 ? 16 : 0, marginBottom: 8 }}>
                      {section.text}
                    </Tag>
                  );
                }
                if (section.type === "risk") {
                  return (
                    <div key={i} style={{ padding: "8px 12px", borderRadius: 6, marginBottom: 8, background: section.severity === "high" ? "rgba(248,113,113,0.08)" : section.severity === "medium" ? "rgba(250,204,21,0.08)" : "rgba(255,255,255,0.03)", border: `0.5px solid ${section.severity === "high" ? "rgba(248,113,113,0.2)" : section.severity === "medium" ? "rgba(250,204,21,0.2)" : "rgba(255,255,255,0.06)"}` }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: section.severity === "high" ? "rgb(248,113,113)" : section.severity === "medium" ? "rgb(250,204,21)" : "var(--fg2)", marginBottom: 4 }}>
                        {section.title ?? "Risk"}
                      </div>
                      <div style={{ fontSize: 13, color: "var(--fg2)", lineHeight: 1.5 }}>{section.text}</div>
                    </div>
                  );
                }
                if (section.type === "finding") {
                  return (
                    <div key={i} style={{ padding: "8px 12px", borderRadius: 6, marginBottom: 8, background: "rgba(52,211,153,0.05)", border: "0.5px solid rgba(52,211,153,0.15)" }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "rgb(52,211,153)", marginBottom: 4 }}>{section.title ?? "Finding"}</div>
                      <div style={{ fontSize: 13, color: "var(--fg2)", lineHeight: 1.5 }}>{section.text}</div>
                    </div>
                  );
                }
                if (section.type === "recommendation") {
                  return (
                    <div key={i} style={{ padding: "8px 12px", borderRadius: 6, marginBottom: 8, background: "rgba(139,92,246,0.05)", border: "0.5px solid rgba(139,92,246,0.15)" }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "rgb(139,92,246)", marginBottom: 4 }}>{section.title ?? "Recommendation"}</div>
                      <div style={{ fontSize: 13, color: "var(--fg2)", lineHeight: 1.5 }}>{section.text}</div>
                    </div>
                  );
                }
                if (section.type === "gap") {
                  return (
                    <div key={i} style={{ padding: "8px 12px", borderRadius: 6, marginBottom: 8, background: "rgba(255,255,255,0.02)", border: "0.5px dashed rgba(255,255,255,0.1)" }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: "var(--fg3)", marginBottom: 4 }}>{section.title ?? "Data Gap"}</div>
                      <div style={{ fontSize: 12, color: "var(--fg4)", lineHeight: 1.5 }}>{section.text}</div>
                    </div>
                  );
                }
                return (
                  <p key={i} style={{ fontSize: 13, lineHeight: 1.6, color: "var(--fg2)", marginBottom: 10 }}>
                    {section.text}
                  </p>
                );
              })}
              {detail.analysisDocument.investigationSummary && (
                <div style={{ fontSize: 12, color: "var(--fg4)", marginTop: 12, padding: "8px 0", borderTop: "0.5px solid rgba(255,255,255,0.06)" }}>
                  {detail.analysisDocument.investigationSummary}
                </div>
              )}
            </div>
          )}

          {/* Divider */}
          <div style={{ borderTop: "1px solid var(--card-border)", margin: "8px 0" }} />

          {/* ── CLARIFICATION + DECISIONS ── */}
          {(() => {
            const openQuestions = detail?.wikiContent?.openQuestions
              ? parseOpenQuestionsSection(detail.wikiContent.openQuestions)
              : [];
            const decisions = detail?.wikiContent?.decisions
              ? parseDecisionsSection(detail.wikiContent.decisions)
              : [];

            if (openQuestions.length === 0 && decisions.length === 0) return null;

            return (
              <>
                {openQuestions.length > 0 && detail?.id && (
                  <OpenQuestionsCard
                    situationId={detail.id}
                    questions={openQuestions}
                    onAnswered={onRefreshDetail}
                  />
                )}
                {decisions.length > 0 && detail?.id && (
                  <DecisionsSection
                    situationId={detail.id}
                    decisions={decisions}
                    onOverridden={onRefreshDetail}
                  />
                )}
              </>
            );
          })()}

          {/* ── CURRENT ACTION PLAN ── */}
          {reasoning && actionPlan && actionPlan.length > 0 ? (
            <div className="overflow-hidden min-w-0">
              {/* Section header */}
              <div style={{ marginBottom: 16 }}>
                <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: "0.02em", color: "var(--foreground)" }}>
                  {t("actionBatch")}
                </span>
              </div>
              {/* Re-evaluating banner */}
              {executionPlan?.status === "re_evaluating" && (
                <div style={{
                  padding: "10px 14px",
                  background: "rgba(245,158,11,0.08)",
                  border: "0.5px solid rgba(245,158,11,0.2)",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "var(--warn)",
                  marginBottom: 12,
                }}>
                  Re-evaluating next steps based on your input...
                </div>
              )}

              {/* Step list — D-style inline expand */}
              <div style={{ position: "relative", paddingLeft: 30 }}>
                {/* Timeline rail */}
                <div className="bg-[var(--rail-color)]" style={{ position: "absolute", left: 10, top: 6, bottom: 6, width: 2 }} />

                {actionPlan.map((step, i) => {
                  const planStep = executionPlan?.steps.find(es => es.sequenceOrder === i + 1);
                  const isCompleted = planStep?.status === "completed";
                  const isCurrentStep = i === currentStepIndex;
                  const isFutureStep = i > currentStepIndex;
                  const isReEvaluating = executionPlan?.status === "re_evaluating";
                  const isOpen = openSteps.has(i);

                  return (
                    <div key={i} className="overflow-hidden min-w-0 rounded" style={{ position: "relative", padding: "14px 0", opacity: (isFutureStep || (isReEvaluating && !isCompleted)) ? 0.5 : 1, transition: "all 0.2s" }}>
                      {/* Status dot */}
                      <div style={{
                        position: "absolute", left: -30 + 5, top: 4, width: 12, height: 12, borderRadius: "50%", zIndex: 1,
                        background: isCompleted ? "var(--ok)" : isCurrentStep ? "var(--accent)" : "var(--elevated)",
                        border: `2px solid ${isCompleted ? "var(--ok)" : isCurrentStep ? "var(--accent)" : "var(--fg4)"}`,
                        display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s",
                      }}>
                        {isCompleted && <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>}
                      </div>

                      {/* Collapsed row — hover scoped here */}
                      <div className="cursor-pointer hover:bg-[var(--step-hover)] rounded transition-colors" onClick={() => toggleStep(i)} style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 2, minWidth: 0, padding: "2px 4px", margin: "-2px -4px" }}>
                        <span className="truncate" style={{
                          fontSize: isCurrentStep ? 14 : 13, fontWeight: isCurrentStep ? 600 : 500, flex: 1, minWidth: 0,
                          color: isCompleted ? "var(--fg2)" : "var(--fg1, var(--foreground))",
                          textDecoration: isCompleted ? "line-through" : "none",
                        }}>
                          {stripLeadingActionVerb(step.title)}
                        </span>
                        {planStep?.status === "awaiting_clarification" && (
                          <span
                            className="flex-shrink-0"
                            style={{
                              fontSize: 10,
                              fontWeight: 500,
                              textTransform: "uppercase",
                              letterSpacing: "0.08em",
                              padding: "2px 6px",
                              borderRadius: 3,
                              background: "color-mix(in srgb, var(--warn) 14%, transparent)",
                              color: "var(--warn)",
                              fontFamily: "ui-monospace, monospace",
                              whiteSpace: "nowrap",
                            }}
                          >
                            Awaiting
                          </span>
                        )}
                        {isCompleted ? (
                          <span className="flex-shrink-0" style={{ fontSize: 11, fontWeight: 600, padding: "2px 10px", borderRadius: 4, background: "var(--badge-bg)", color: "var(--fg3)", display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 72 }}>complete</span>
                        ) : isCurrentStep ? (
                          <span className="flex-shrink-0" style={{ fontSize: 11, fontWeight: 600, padding: "2px 10px", borderRadius: 4, background: "var(--badge-bg-strong)", color: "var(--btn-primary-text)", display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 72 }}>current</span>
                        ) : (
                          <span className="flex-shrink-0" style={{ fontSize: 11, fontWeight: 600, padding: "2px 10px", borderRadius: 4, background: "var(--badge-bg)", color: "var(--fg3)", display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 72 }}>next step</span>
                        )}
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--fg3)" strokeWidth="2"
                          style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.15s", flexShrink: 0 }}>
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </div>

                      {/* Expanded content */}
                      {isOpen && (
                        <div className="overflow-hidden" style={{ marginTop: 10, marginLeft: 2, paddingLeft: 14, borderLeft: `2px solid ${isCurrentStep ? "var(--fg3)" : "var(--border)"}` }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                            <span style={{ fontSize: 11, color: "var(--fg3)" }}>
                              {step.assignedUserId ? step.assignedUserId : (step.executionMode === "action" ? "AI" : "")}
                            </span>
                            {isCompleted && <span style={{ fontSize: 10, fontWeight: 600, color: "var(--ok)" }}>&#10003; Done</span>}
                            {isCompleted && planStep?.outputResult && (() => {
                              try {
                                const out = JSON.parse(planStep.outputResult);
                                const receiptText = out.type === "email"
                                  ? `Sent to ${(out.recipients ?? []).join(", ")}${out._demo ? " (demo)" : ""}`
                                  : out.type === "calendar_event"
                                  ? `Event created${out.attendees?.length ? ` · ${out.attendees.length} attendees` : ""}${out._demo ? " (demo)" : ""}`
                                  : out.type === "message"
                                  ? `Sent to ${out.channelId ?? "channel"}${out._demo ? " (demo)" : ""}`
                                  : out.type === "document"
                                  ? `Created${out.url ? ` · ${out.url}` : ""}${out._demo ? " (demo)" : ""}`
                                  : null;
                                if (!receiptText) return null;
                                return (
                                  <span style={{ fontSize: 10, color: "var(--fg3)", marginLeft: 8 }}>
                                    {receiptText}
                                  </span>
                                );
                              } catch { return null; }
                            })()}
                          </div>

                          <p className="break-words" style={{ fontSize: 12, color: isCurrentStep ? "var(--foreground)" : "var(--fg3)", lineHeight: 1.55, margin: "0 0 8px", maxWidth: "100%", overflowWrap: "break-word" }}>{resolveWikiLinks(stripMetadataLines(step.description), detail?.crossReferences)}</p>

                          {(planStep?.parameters || planStep?.actionCapability) && (() => {
                            const enrichedStep: ExecutionStepForPreview = {
                              ...planStep,
                              plan: { sourceType: "situation" as const, situation: { situationType: { autonomyLevel: detail?.situationType?.autonomyLevel } } },
                            };
                            return (
                              <div className="mt-2 mb-2" onClick={e => e.stopPropagation()}>
                                <InlineStepCard
                                  step={enrichedStep}
                                  isActive={sidePanelStepIndex === i}
                                  onClick={() => {
                                    onOpenStepPanel({
                                      step: enrichedStep,
                                      index: i,
                                      stepOrder: planStep.sequenceOrder,
                                      situationId: detail?.id ?? "",
                                      isEditable: ["pending", "proposed", "planned", "awaiting_approval"].includes(planStep.status),
                                    });
                                  }}
                                />
                              </div>
                            );
                          })()}

                          {/* Uncertainty annotations */}
                          {planStep?.uncertainties && Array.isArray(planStep.uncertainties) && planStep.uncertainties.length > 0 && (
                            <div className="mt-2 space-y-1.5">
                              {(planStep.uncertainties as Array<{ field: string; assumption: string; impact: string }>).map((u, ui) => {
                                const hasPlaceholder = /\[.+?\]/.test(u.assumption);
                                const isDanger = hasPlaceholder;
                                const isWarn = !hasPlaceholder && u.impact === "high";
                                const colorVar = isDanger ? "var(--danger)" : isWarn ? "var(--warn)" : "var(--fg3)";
                                const bgOpacity = isDanger ? "8%" : isWarn ? "8%" : "6%";
                                const borderOpacity = isDanger ? "15%" : isWarn ? "15%" : "10%";
                                return (
                                  <div key={ui} className="flex items-start gap-2 rounded px-3 py-2" style={{
                                    background: `color-mix(in srgb, ${colorVar} ${bgOpacity}, transparent)`,
                                    border: `1px solid color-mix(in srgb, ${colorVar} ${borderOpacity}, transparent)`,
                                  }}>
                                    <span style={{ fontSize: 12, flexShrink: 0, marginTop: 1, color: isDanger ? "var(--danger)" : undefined }}>
                                      {isDanger ? "⚠" : isWarn ? "⚠" : "?"}
                                    </span>
                                    <span style={{ fontSize: 12, color: isDanger ? "var(--danger)" : "var(--fg2)", lineHeight: 1.5 }}>
                                      {u.assumption}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Awaiting clarification badge */}
                          {planStep?.status === "awaiting_clarification" && (
                            <div
                              style={{
                                marginTop: 8,
                                padding: "8px 12px",
                                background: "color-mix(in srgb, var(--warn) 8%, transparent)",
                                border: "1px dashed color-mix(in srgb, var(--warn) 28%, transparent)",
                                borderRadius: 4,
                                fontSize: 11,
                                color: "var(--warn)",
                              }}
                            >
                              Waiting on clarification — answer the open question above to unblock this step.
                            </div>
                          )}

                          {planStep?.errorMessage && (
                            <p style={{ fontSize: 11, color: "var(--danger)", marginTop: 2 }}>{planStep.errorMessage}</p>
                          )}

                          {isCurrentStep && !isCompleted && !isReEvaluating && planStep?.status !== "awaiting_clarification" ? (
                            (step.executionMode === "action" || step.executionMode === "generate") ? (
                              <div style={{ marginTop: 16 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const chatInput = document.getElementById("situation-chat-input") as HTMLTextAreaElement;
                                      if (chatInput) { chatInput.focus(); chatInput.scrollIntoView({ behavior: "smooth", block: "end" }); }
                                    }}
                                    style={{ ...STEP_BTN_SECONDARY }}
                                    className="hover:opacity-80 transition-opacity"
                                  >
                                    Discuss action
                                  </button>
                                </div>
                              </div>
                            ) : step.executionMode === "human_task" && planStep ? (
                              <div style={{ marginTop: 6 }}>
                                {notesStepId === planStep.sequenceOrder ? (
                                  <div style={{ marginTop: 4 }}>
                                    <textarea
                                      autoFocus
                                      placeholder="What happened? Any details that affect next steps..."
                                      value={stepNotes}
                                      onChange={(e) => setStepNotes(e.target.value)}
                                      onClick={(e) => e.stopPropagation()}
                                      style={{
                                        width: "100%",
                                        minHeight: 80,
                                        padding: "10px 12px",
                                        background: "rgba(255,255,255,0.04)",
                                        border: "0.5px solid var(--border)",
                                        borderRadius: 8,
                                        color: "var(--foreground)",
                                        fontSize: 13,
                                        resize: "vertical",
                                        outline: "none",
                                        fontFamily: "inherit",
                                      }}
                                    />
                                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                                      <button
                                        disabled={submittingNotes}
                                        onClick={async (e) => {
                                          e.stopPropagation();
                                          await submitStepNotes(planStep.sequenceOrder, stepNotes);
                                        }}
                                        style={{ ...STEP_BTN_PRIMARY, opacity: submittingNotes ? 0.5 : 1 }}
                                      >
                                        {submittingNotes ? "Submitting..." : "Complete & Submit"}
                                      </button>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); setNotesStepId(null); }}
                                        style={STEP_BTN_SECONDARY}
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <button className="hover:opacity-80 transition-opacity" onClick={(e) => { e.stopPropagation(); setNotesStepId(planStep.sequenceOrder); setStepNotes(""); }} style={STEP_BTN_PRIMARY}>{t("markComplete")}</button>
                                )}
                              </div>
                            ) : null
                          ) : isFutureStep ? (
                            <span style={{ fontSize: 10, color: "var(--fg4)", fontStyle: "italic", marginTop: 6, display: "inline-block" }}>
                              {t("completeStepFirst")?.replace("{n}", String(currentStepIndex + 1)) ?? `Complete step ${currentStepIndex + 1} first`}
                            </span>
                          ) : null}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Plan status footer */}
              {executionPlan && (() => {
                const ps = PLAN_STATUS_STYLES[executionPlan.status] ?? PLAN_STATUS_STYLES.executing;
                return (
                  <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                    <span style={{ padding: "2px 8px", borderRadius: 4, background: ps.bg, color: ps.color, fontWeight: 600, fontSize: 10 }}>{ps.label}</span>
                    <span style={{ color: "var(--fg3)" }}>Step {currentStepIndex + 1} of {actionPlan.length}</span>
                  </div>
                );
              })()}

              {/* Failed plan error */}
              {executionPlan?.status === "failed" && (() => {
                const failedStep = executionPlan.steps.find(s => s.status === "failed");
                const err = failedStep?.errorMessage?.toLowerCase() || "";
                const isAuthFailure = err.includes("deauthorized") || err.includes("revoked") || err.includes("401") || err.includes("unauthorized");
                const isLoopBreaker = err.includes("maximum") || err.includes("loop") || err.includes("attempts");
                return (
                  <p style={{ fontSize: 11, color: "var(--danger)", lineHeight: 1.4, marginTop: 4 }}>
                    {isAuthFailure
                      ? <>{t("planFailAuthBefore")} <a href="/settings?tab=connections" className="underline">{t("planFailAuthLink")}</a>{t("planFailAuthAfter")}</>
                      : isLoopBreaker ? t("planFailLoop")
                      : t("planFailStep", { step: String(failedStep?.sequenceOrder ?? "?"), error: failedStep?.errorMessage ? `: ${failedStep.errorMessage.slice(0, 100)}` : "" })}
                  </p>
                );
              })()}
            </div>
          ) : reasoning && !actionPlan ? (
            <div className="w-[70%] mx-auto" style={{ maxWidth: "calc(100% - 150px)" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--fg2)", marginBottom: 12 }}>
                No action recommended
              </div>
              <p style={{ fontSize: 13, color: "var(--fg3)", lineHeight: 1.6, marginBottom: 8 }}>
                {resolveWikiLinks(reasoning.analysis, detail?.crossReferences)}
              </p>
              {reasoning.evidenceSummary && (
                <p style={{ fontSize: 12, color: "var(--fg4)", lineHeight: 1.5, marginBottom: 16 }}>
                  {reasoning.evidenceSummary}
                </p>
              )}
              {!currentMode && s.status !== "resolved" && s.status !== "rejected" && (
                <div className="flex gap-3 mt-4">
                  <button
                    className="rounded-full text-[13px] font-medium px-4 py-1.5 transition-colors bg-[var(--elevated)] hover:bg-[var(--step-hover)]"
                    style={{ border: "1px solid var(--border)", color: "var(--fg2)" }}
                    onClick={() => patchSituation(s.id, { status: "resolved", outcome: "no_action_confirmed" })}
                  >
                    Conclude situation
                  </button>
                  <button
                    className="rounded-full text-[13px] font-medium px-4 py-1.5 transition-colors bg-[var(--elevated)] hover:bg-[var(--step-hover)]"
                    style={{ border: "1px solid var(--border)", color: "var(--fg2)" }}
                    onClick={() => { setShowTeachForm(!showTeachForm); setShowRejectForm(false); }}
                  >
                    Teach AI
                  </button>
                </div>
              )}
            </div>
          ) : s.status === "executing" || s.status === "auto_executing" ? (
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-border border-t-ok" />
              <p style={{ fontSize: 13, color: "var(--fg3)" }}>Executing action...</p>
            </div>
          ) : s.status === "monitoring" ? (() => {
            let criteria: { waitingFor?: string; expectedWithinDays?: number; followUpAction?: string } | null = null;
            if (detail?.contextSnapshot) {
              try {
                const snap = typeof detail.contextSnapshot === "string" ? JSON.parse(detail.contextSnapshot) : detail.contextSnapshot;
                criteria = snap.monitoringCriteria ?? null;
              } catch {}
            }
            if (!criteria && reasoning) {
              criteria = (reasoning as unknown as Record<string, unknown>).monitoringCriteria as typeof criteria ?? null;
            }
            return (
              <div className="rounded-lg p-4" style={{ background: "color-mix(in srgb, var(--accent) 5%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 12%, transparent)" }}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-3 w-3 rounded-full animate-pulse" style={{ background: "var(--accent)" }} />
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground)" }}>Monitoring</span>
                </div>
                {criteria ? (
                  <div className="space-y-1.5 pl-5">
                    <p style={{ fontSize: 12, color: "var(--fg2)" }}>
                      <span style={{ color: "var(--fg3)", fontWeight: 500 }}>Waiting for:</span> {criteria.waitingFor}
                    </p>
                    {criteria.expectedWithinDays && (
                      <p style={{ fontSize: 12, color: "var(--fg2)" }}>
                        <span style={{ color: "var(--fg3)", fontWeight: 500 }}>Expected within:</span> {criteria.expectedWithinDays} business days
                      </p>
                    )}
                    {criteria.followUpAction && (
                      <p style={{ fontSize: 12, color: "var(--fg2)" }}>
                        <span style={{ color: "var(--fg3)", fontWeight: 500 }}>If no response:</span> {criteria.followUpAction}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="pl-5" style={{ fontSize: 12, color: "var(--fg3)" }}>Waiting for external response</p>
                )}
              </div>
            );
          })() : null}

          {/* Action drafts have moved into the side panel — click a step card to edit. */}

          {/* Execution error */}
          {detail.actionTaken?.error && (
            <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 4 }} className="px-4 py-3">
              <p style={{ fontSize: 13, fontWeight: 500, color: "var(--danger)" }}>Execution failed</p>
              <p style={{ fontSize: 12, color: "var(--danger)", opacity: 0.7 }} className="mt-0.5">{detail.actionTaken.error}</p>
            </div>
          )}

          {/* ── Reasoning trace (Claude-style thinking) ── */}
          {reasoning && (
            <div className="w-[70%] mx-auto" style={{ maxWidth: "calc(100% - 150px)" }}>
              <button
                onClick={() => setShowEvidence(!showEvidence)}
                className="flex items-center gap-2 transition-colors hover:text-foreground"
                style={{ fontSize: 13, color: "var(--fg3)" }}
              >
                <svg className={`w-3 h-3 transition-transform ${showEvidence ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                {t("evidenceAndReasoning")}
              </button>

              {showEvidence && (
                <div style={{ marginTop: 12, position: "relative", paddingLeft: 24 }}>
                  {/* Vertical rail */}
                  <div style={{ position: "absolute", left: 7, top: 8, bottom: 8, width: 1.5, background: "rgba(255,255,255,0.06)", borderRadius: 1 }} />

                  {/* Wiki context (markdown prose — replaces structured trail for wiki situations) */}
                  {detail.wikiContent?.context && (
                    <WikiText
                      text={detail.wikiContent.context}
                      crossReferences={detail.crossReferences}
                      asParagraphs
                      style={{ padding: "12px 16px", fontSize: 13, color: "var(--fg2)", lineHeight: 1.6 }}
                    />
                  )}

                  {/* Step 1: Gathered evidence */}
                  {reasoning.evidenceSummary && (
                    <ThinkingStep
                      icon="search"
                      title="Gathered evidence"
                    >
                      {reasoning.evidenceSummary.split(/(?<=\.)\s+(?=\d+\.)/).map((sentence, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 6 }}>
                          <span style={{ fontSize: 11, color: "var(--fg4)", flexShrink: 0, marginTop: 1 }}>{i + 1}.</span>
                          <span style={{ fontSize: 12, color: "var(--fg2)", lineHeight: 1.6 }}>{sentence.replace(/^\d+\.\s*/, "")}</span>
                        </div>
                      ))}
                    </ThinkingStep>
                  )}

                  {/* Step 2: Inspected entity */}
                  {detail.contextSnapshot?.triggerEntity && (
                    <ThinkingStep
                      icon="entity"
                      title={`Inspected ${detail.contextSnapshot.triggerEntity.displayName}`}
                      badge={detail.contextSnapshot.triggerEntity.type}
                    >
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 16px" }}>
                        {Object.entries(detail.contextSnapshot.triggerEntity.properties).map(([k, v]) => (
                          <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                            <span style={{ color: "var(--fg4)" }}>{k}</span>
                            <span style={{ color: "var(--fg2)" }}>{v}</span>
                          </div>
                        ))}
                      </div>
                    </ThinkingStep>
                  )}

                  {/* Step 3: Checked relationships */}
                  {detail.contextSnapshot?.relatedEntities && (() => {
                    const re = detail.contextSnapshot!.relatedEntities!;
                    const all = [...(re.base ?? []), ...(re.digital ?? []), ...(re.external ?? [])];
                    if (all.length === 0) return null;
                    return (
                      <ThinkingStep icon="graph" title={`Checked ${all.length} related entities`}>
                        {all.slice(0, 5).map((e: { id: string; type: string; displayName: string; direction: string; relationship: string }) => (
                          <div key={e.id} className="flex items-center gap-2" style={{ fontSize: 12, marginBottom: 3 }}>
                            <span style={{ color: "var(--fg4)", fontSize: 10 }}>{e.direction === "outgoing" ? "\u2192" : "\u2190"}</span>
                            <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 3, background: "rgba(255,255,255,0.06)", color: "var(--fg3)" }}>{e.type}</span>
                            <span style={{ color: "var(--fg2)" }}>{e.displayName}</span>
                            <span style={{ color: "var(--fg4)", fontSize: 11 }}>({e.relationship})</span>
                          </div>
                        ))}
                      </ThinkingStep>
                    );
                  })()}

                  {/* Step 4: Reviewed timeline */}
                  {detail.contextSnapshot?.recentEvents && detail.contextSnapshot.recentEvents.length > 0 && (
                    <ThinkingStep icon="timeline" title={`Reviewed ${detail.contextSnapshot.recentEvents.length} recent events`}>
                      {detail.contextSnapshot.recentEvents.slice(0, 6).map(ev => (
                        <div key={ev.id} className="flex items-center gap-2" style={{ fontSize: 12, marginBottom: 3 }}>
                          <span style={{ fontSize: 10, color: "var(--fg4)", width: 40, textAlign: "right", flexShrink: 0 }}>{formatRelativeTime(ev.createdAt, locale)}</span>
                          <div style={{ width: 4, height: 4, borderRadius: "50%", background: "rgba(255,255,255,0.15)", flexShrink: 0 }} />
                          <span style={{ color: "var(--fg2)" }}>{ev.eventType}</span>
                          <span style={{ color: "var(--fg4)", fontSize: 11 }}>{ev.source}</span>
                        </div>
                      ))}
                    </ThinkingStep>
                  )}

                  {/* Step 5: Prior situations */}
                  {detail.contextSnapshot?.priorSituations && detail.contextSnapshot.priorSituations.length > 0 && (
                    <ThinkingStep icon="history" title={`Checked ${detail.contextSnapshot.priorSituations.length} prior situations`}>
                      {detail.contextSnapshot.priorSituations.map(ps => (
                        <div key={ps.id} className="flex items-start gap-2" style={{ fontSize: 12, marginBottom: 4 }}>
                          <span style={{ color: ps.outcome === "positive" ? "var(--ok)" : ps.outcome === "negative" ? "var(--danger)" : "var(--fg4)", flexShrink: 0, fontSize: 11 }}>
                            {ps.outcome === "positive" ? "\u2713" : ps.outcome === "negative" ? "\u2717" : "\u25CB"}
                          </span>
                          <div>
                            <span style={{ color: "var(--fg2)" }}>{ps.triggerName}</span>
                            <span style={{ color: "var(--fg4)", marginLeft: 6 }}>{ps.status}</span>
                            {ps.feedback && <p style={{ color: "var(--fg3)", marginTop: 2, fontSize: 11 }}>{ps.feedback}</p>}
                          </div>
                        </div>
                      ))}
                    </ThinkingStep>
                  )}

                  {/* Step 6: Evaluated options */}
                  {reasoning.consideredActions.length > 0 && (
                    <ThinkingStep icon="evaluate" title={`Evaluated ${reasoning.consideredActions.length} possible actions`}>
                      {reasoning.consideredActions.map((ca, i) => {
                        if (typeof ca === "string") {
                          return <div key={i} style={{ fontSize: 12, color: "var(--fg2)", marginBottom: 6 }}>{ca}</div>;
                        }
                        const hasEvidence = "evidenceFor" in ca;
                        const supportItems = hasEvidence ? (ca.evidenceFor ?? []) : (ca.pros ?? []);
                        const againstItems = hasEvidence ? (ca.evidenceAgainst ?? []) : (ca.cons ?? []);
                        const tagCount = supportItems.length + againstItems.length;
                        return (
                          <CollapsibleAction
                            key={i}
                            title={ca.action}
                            tagCount={tagCount}
                            isLast={i === reasoning.consideredActions.length - 1}
                          >
                            {supportItems.length > 0 && (
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 3 }}>
                                {supportItems.map((p, j) => (
                                  <span key={j} style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, background: "rgba(34,197,94,0.1)", color: "var(--ok)" }}>{p}</span>
                                ))}
                              </div>
                            )}
                            {againstItems.length > 0 && (
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 3 }}>
                                {againstItems.map((c, j) => (
                                  <span key={j} style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, background: "rgba(239,68,68,0.1)", color: "var(--danger)" }}>{c}</span>
                                ))}
                              </div>
                            )}
                            {ca.expectedOutcome && (
                              <p style={{ fontSize: 11, color: "var(--fg3)", marginTop: 2 }}>{ca.expectedOutcome}</p>
                            )}
                          </CollapsibleAction>
                        );
                      })}
                    </ThinkingStep>
                  )}

                  {/* Step 7: Missing context */}
                  {reasoning.missingContext && reasoning.missingContext.length > 0 && (
                    <ThinkingStep icon="gap" title={`Identified ${reasoning.missingContext.length} data gaps`}>
                      {reasoning.missingContext.map((mc, i) => (
                        <div key={i} style={{ fontSize: 12, color: "var(--warn)", marginBottom: 4, display: "flex", gap: 6, alignItems: "flex-start" }}>
                          <span style={{ flexShrink: 0, marginTop: 1, fontSize: 10 }}>&#x26A0;</span>
                          <span>{mc}</span>
                        </div>
                      ))}
                    </ThinkingStep>
                  )}

                  {/* Final: Conclusion */}
                  <div style={{ position: "relative", padding: "10px 0", display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ position: "absolute", left: -24 + 3, top: 12, width: 10, height: 10, borderRadius: "50%", background: "var(--accent)", zIndex: 1 }} />
                    <div style={{ fontSize: 12, color: "var(--fg2)", lineHeight: 1.6 }}>
                      <span style={{ fontWeight: 600, color: "var(--foreground)" }}>Concluded</span>
                      <span style={{ color: "var(--fg4)", marginLeft: 6, fontSize: 11 }}>{(reasoning.confidence * 100).toFixed(0)}% confidence</span>
                      <p style={{ marginTop: 4 }}>{resolveWikiLinks(reasoning.analysis, detail?.crossReferences)}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Bottom Action Bar ── */}
          {canAct && !currentMode && (
            <div className="flex items-center gap-2 pt-3 w-[70%] mx-auto">
                <button className="rounded-full text-[13px] font-medium px-4 py-1.5 transition-colors bg-[var(--elevated)] hover:bg-[var(--step-hover)]"
                  style={{ border: "1px solid var(--border)", color: "var(--fg2)" }}
                  onClick={() => { setShowRejectForm(!showRejectForm); setShowTeachForm(false); }}>
                  Reject
                </button>
                <button className="rounded-full text-[13px] font-medium px-4 py-1.5 transition-colors bg-[var(--elevated)] hover:bg-[var(--step-hover)]"
                  style={{ border: "1px solid var(--border)", color: "var(--fg2)" }}
                  onClick={() => { setShowTeachForm(!showTeachForm); setShowRejectForm(false); }}>
                  Teach AI
                </button>
            </div>
          )}
          {/* Inline reject form */}
          {showRejectForm && (
            <div className="w-[70%] mx-auto mt-3 space-y-2">
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
                  onClick={() => { patchSituation(s.id, { status: "rejected", feedback: feedbackText || undefined }); setShowRejectForm(false); }}
                >Reject</button>
                <button
                  className="rounded-full text-[13px] font-medium px-4 py-1.5 transition"
                  style={{ background: "var(--elevated)", border: "1px solid var(--border)", color: "var(--fg2)" }}
                  onClick={() => setShowRejectForm(false)}
                >{tc("cancel")}</button>
              </div>
            </div>
          )}
          {/* Inline teach form */}
          {showTeachForm && (
            <div className="w-[70%] mx-auto mt-3 space-y-2">
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
                  style={{ background: "var(--foreground)", color: "var(--background)" }}
                  disabled={!feedbackText.trim()}
                  onClick={() => { patchSituation(s.id, { feedback: feedbackText, feedbackCategory: feedbackCategory || undefined }); setShowTeachForm(false); }}
                >Save feedback</button>
                <button
                  className="rounded-full text-[13px] font-medium px-4 py-1.5 transition"
                  style={{ background: "var(--elevated)", border: "1px solid var(--border)", color: "var(--fg2)" }}
                  onClick={() => setShowTeachForm(false)}
                >{tc("cancel")}</button>
              </div>
            </div>
          )}
          {/* Outcome button for resolved without outcome */}
          {detail.status === "resolved" && !detail.outcome && !currentMode && (
            <div className="pt-2">
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
            <div className="flex items-center gap-2 pt-2">
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

          {/* ── Mode UIs ── */}

          {/* Outcome mode */}
          {currentMode === "outcome" && (
            <div className="space-y-3 pt-2">
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
            <div className="flex items-start gap-2 pt-2">
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
