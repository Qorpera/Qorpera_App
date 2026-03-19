"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";

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
  reasoning: ReasoningData | null;
  proposedAction: ActionStep[] | null;
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
  if (s.status === "rejected") return "#6b7280";
  if (s.status === "approved" || s.status === "resolved") return "#22c55e";
  if (s.severity >= 0.7) return "#ef4444";
  if (s.severity >= 0.4) return "#f59e0b";
  return "#6b7280";
}

function severityBadge(s: SituationItem): { label: string; variant: "red" | "amber" | "default" } {
  if (s.severity >= 0.7) return { label: "Critical", variant: "red" };
  if (s.severity >= 0.4) return { label: "High", variant: "amber" };
  return { label: "Medium", variant: "default" };
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
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
  if (p === "google" || p === "gmail") return "#ef4444";
  if (p === "slack") return "#a855f7";
  if (p === "microsoft" || p === "outlook") return "#3b82f6";
  return "#6b7280";
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
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── Left: situation list ── */}
        <div className="w-[320px] flex-shrink-0 flex flex-col overflow-hidden" style={{ borderRight: "1px solid #1e1e1e" }}>
          {/* Header */}
          <div className="px-4 py-3 flex-shrink-0" style={{ borderBottom: "1px solid #1e1e1e" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#e8e8e8" }}>Situations</div>
            <div style={{ fontSize: 11, color: "#707070" }} className="mt-0.5">
              {situations.length} total &middot; {pendingCount} pending
            </div>
          </div>

          {/* Filter tabs */}
          <div className="px-4 py-2 flex gap-1.5 flex-shrink-0" style={{ borderBottom: "1px solid #1e1e1e" }}>
            {(["all", "pending", "resolved"] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="text-[11px] font-medium px-2.5 py-1 rounded-full border transition"
                style={{
                  background: filter === f ? "#222" : "transparent",
                  borderColor: filter === f ? "#333" : "transparent",
                  color: filter === f ? "#e8e8e8" : "#484848",
                }}
              >
                {f}
              </button>
            ))}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {loading && (
              <div className="flex justify-center py-10">
                <div className="h-4 w-4 animate-spin rounded-full border border-[#2a2a2a] border-t-[#707070]" />
              </div>
            )}
            {filteredSituations.map(s => (
              <button
                key={s.id}
                onClick={() => setSelectedId(s.id)}
                className="w-full text-left px-4 py-2.5 transition"
                style={{
                  borderBottom: "1px solid #1e1e1e",
                  borderLeft: selectedId === s.id ? "2px solid #c084fc" : "2px solid transparent",
                  background: selectedId === s.id ? "#181818" : "transparent",
                }}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="flex-shrink-0" style={{ width: 7, height: 7, borderRadius: "50%", background: severityDotColor(s) }} />
                  <span style={{ fontSize: 13, fontWeight: 500, color: "#e8e8e8" }} className="truncate flex-1">
                    {s.triggerEntityName ?? "Unknown"}
                  </span>
                  <span style={{ fontSize: 11, color: "#484848" }} className="flex-shrink-0">
                    {timeAgo(s.createdAt)}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "#484848" }} className="pl-[15px] truncate">
                  {s.situationType.name}{s.departmentName ? ` \u00b7 ${s.departmentName}` : ""}
                </div>
              </button>
            ))}
            {!loading && filteredSituations.length === 0 && (
              <div className="px-4 py-8 text-center" style={{ fontSize: 13, color: "#484848" }}>
                No situations
              </div>
            )}
          </div>
        </div>

        {/* ── Right: detail pane ── */}
        <div className="flex-1 overflow-y-auto">
          {selectedSituation ? (
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
            />
          ) : (
            <div className="flex items-center justify-center h-full" style={{ fontSize: 13, color: "#484848" }}>
              Select a situation
            </div>
          )}
        </div>

      </div>
    </AppShell>
  );
}

// ── Execution Mode Badge ─────────────────────────────────────────────────────

const EXEC_MODE_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  action: { bg: "rgba(168,85,247,0.12)", color: "#c084fc", label: "action" },
  generate: { bg: "rgba(59,130,246,0.12)", color: "#60a5fa", label: "generate" },
  human_task: { bg: "rgba(245,158,11,0.12)", color: "#f59e0b", label: "human task" },
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
}) {
  const [showEvidence, setShowEvidence] = useState(false);
  const [editingDraft, setEditingDraft] = useState(false);
  const [editedDraftBody, setEditedDraftBody] = useState("");
  const [savedEditedDraft, setSavedEditedDraft] = useState<DraftPayload | null>(null);
  const [executionPlan, setExecutionPlan] = useState<ExecutionPlanData | null>(null);

  // Fetch execution plan when situation has one
  useEffect(() => {
    if (!detail?.executionPlanId) { setExecutionPlan(null); return; }
    let cancelled = false;
    fetch(`/api/execution-plans/${detail.executionPlanId}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (!cancelled && data) setExecutionPlan(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [detail?.executionPlanId]);

  const isThisCard = activeMode?.id === s.id;
  const currentMode = isThisCard ? activeMode!.mode : null;
  const canAct = s.status === "detected" || s.status === "proposed";
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
          <h1 className="font-heading" style={{ fontSize: 18, fontWeight: 600, color: "#e8e8e8" }}>
            {s.triggerEntityName ?? "Unknown"} &mdash; {s.situationType.name}
          </h1>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge variant={sev.variant}>{sev.label}</Badge>
            {/* Star/favorite placeholder — wired to WorkStream in Prompt 3 */}
            <button
              className="text-[#484848] hover:text-[#707070] transition-colors"
              title="Add to workstream"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
              </svg>
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {s.departmentName && <Badge>{s.departmentName}</Badge>}
          <span style={{ fontSize: 12, color: "#707070" }}>{(s.confidence * 100).toFixed(0)}%</span>
          <span style={{ fontSize: 12, color: "#484848" }}>{timeAgo(s.createdAt)}</span>
        </div>
      </div>

      {detailLoading && (
        <div className="flex justify-center py-8">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#2a2a2a] border-t-[#707070]" />
        </div>
      )}

      {detail && !detailLoading && (
        <>
          {/* Revised badge */}
          {detail.editInstruction && (
            <div className="flex items-start gap-2">
              <Badge variant="blue">Revised</Badge>
              <p style={{ fontSize: 13, color: "#707070" }} className="italic">&quot;{detail.editInstruction}&quot;</p>
            </div>
          )}

          {/* ── SITUATION section ── */}
          {reasoning ? (
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "#484848", textTransform: "uppercase" as const }} className="mb-2">
                Situation
              </div>
              <div style={{ padding: "14px 16px", background: "#161616", border: "1px solid #222", borderRadius: 4 }}>
                <p style={{ fontSize: 13, lineHeight: 1.65, color: "#b0b0b0" }}>{reasoning.analysis}</p>
              </div>
            </div>
          ) : (s.status === "detected") ? (
            <div style={{ padding: "14px 16px", background: "#161616", border: "1px solid #222", borderRadius: 4 }}>
              <p style={{ fontSize: 13, color: "#707070" }}>
                Situation detected — awaiting AI analysis.
              </p>
              {detail.contextSnapshot?.triggerEntity && (
                <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1">
                  {Object.entries(detail.contextSnapshot.triggerEntity.properties).slice(0, 8).map(([k, v]) => (
                    <div key={k} className="flex justify-between text-[13px] py-1" style={{ borderBottom: "1px solid #1e1e1e" }}>
                      <span style={{ color: "#707070" }}>{k}</span>
                      <span style={{ color: "#b0b0b0" }}>{v}</span>
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
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "#484848", textTransform: "uppercase" as const }} className="mb-2">
                Proposed Action
              </div>
              <div style={{ padding: "14px 16px", background: "#161616", border: "1px solid #222", borderRadius: 4 }}>
                <p style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.65, color: "#b0b0b0" }}>{actionPlan[0].title}</p>
                <p style={{ fontSize: 12, color: "#707070" }} className="mt-1">{actionPlan[0].description}</p>
                {policyNote && (
                  <p style={{ fontSize: 11, color: "#484848" }} className="mt-1">{policyNote}</p>
                )}
              </div>
            </div>
          ) : reasoning && actionPlan && actionPlan.length > 1 ? (
            /* Multi-step plan display */
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "#484848", textTransform: "uppercase" as const }} className="mb-2">
                Proposed Plan &middot; {actionPlan.length} steps
              </div>
              <div style={{ background: "#161616", border: "1px solid #222", borderRadius: 4, overflow: "hidden" }}>
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
                        borderBottom: i < actionPlan.length - 1 ? "1px solid #1e1e1e" : "none",
                        opacity: executionPlan ? (isPending && !isActive ? 0.5 : 1) : 1,
                        background: isActive ? "rgba(168,85,247,0.04)" : "transparent",
                      }}
                      className="flex items-start gap-3"
                    >
                      {/* Step number or status icon */}
                      <div className="flex-shrink-0 mt-0.5" style={{ width: 20, textAlign: "center" }}>
                        {isCompleted ? (
                          <span style={{ color: "#22c55e", fontSize: 14 }}>&#10003;</span>
                        ) : (
                          <span style={{ fontSize: 12, fontWeight: 600, color: isActive ? "#c084fc" : "#484848" }}>({i + 1})</span>
                        )}
                      </div>
                      {/* Step content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span style={{ fontSize: 13, fontWeight: 500, color: isCompleted ? "#707070" : "#b0b0b0" }} className="truncate">
                            {step.title}
                          </span>
                          <ExecutionModeBadge mode={step.executionMode} />
                        </div>
                        <p style={{ fontSize: 12, color: "#707070", marginTop: 2 }} className="line-clamp-2">
                          {step.description}
                        </p>
                        {planStep?.errorMessage && (
                          <p style={{ fontSize: 11, color: "#ef4444", marginTop: 2 }}>{planStep.errorMessage}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {policyNote && (
                <p style={{ fontSize: 11, color: "#484848" }} className="mt-2">{policyNote}</p>
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
                    color: executionPlan.status === "completed" ? "#22c55e" : executionPlan.status === "failed" ? "#ef4444" : "#c084fc",
                  }}>
                    Plan {executionPlan.status}
                  </span>
                  <span style={{ fontSize: 11, color: "#484848" }}>
                    Step {executionPlan.currentStepOrder} of {executionPlan.steps.length}
                  </span>
                </div>
              )}
            </div>
          ) : reasoning && !actionPlan ? (
            <p style={{ fontSize: 13, color: "#707070" }} className="italic">No action recommended — please review.</p>
          ) : s.status === "reasoning" ? (
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-[#2a2a2a] border-t-[#707070]" />
              <p style={{ fontSize: 13, color: "#707070" }}>AI is analyzing this situation...</p>
            </div>
          ) : s.status === "executing" || s.status === "auto_executing" ? (
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-[#2a2a2a] border-t-emerald-400" />
              <p style={{ fontSize: 13, color: "#707070" }}>Executing action...</p>
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
                  <span style={{ fontSize: 12, fontWeight: 500, color: "#b0b0b0" }}>{providerLabel(primaryDraft)}</span>
                </div>
                {!editingDraft ? (
                  <button
                    onClick={startDraftEdit}
                    style={{ background: "#222", border: "1px solid #333", borderRadius: 4, padding: "3px 10px", fontSize: 11, color: "#b0b0b0" }}
                    className="flex items-center gap-1.5 hover:bg-[#2a2a2a] transition"
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
                      style={{ background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.3)", borderRadius: 4, padding: "3px 10px", fontSize: 11, color: "#c084fc" }}
                    >
                      Save
                    </button>
                    <button
                      onClick={cancelDraftEdit}
                      style={{ background: "#222", border: "1px solid #333", borderRadius: 4, padding: "3px 10px", fontSize: 11, color: "#b0b0b0" }}
                      className="hover:bg-[#2a2a2a] transition"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              {/* Body */}
              <div style={{ padding: "14px 16px" }}>
                {/* Email fields */}
                {primaryDraft.payload.to && (
                  <div style={{ fontSize: 12, color: "#707070" }} className="mb-1">
                    <span style={{ color: "#484848" }}>To:</span> {primaryDraft.payload.to}
                    {primaryDraft.payload.cc && <span className="ml-3"><span style={{ color: "#484848" }}>Cc:</span> {primaryDraft.payload.cc}</span>}
                  </div>
                )}
                {primaryDraft.payload.subject && (
                  <div style={{ fontSize: 12, color: "#707070" }} className="mb-2">
                    <span style={{ color: "#484848" }}>Subject:</span> {primaryDraft.payload.subject}
                  </div>
                )}
                {/* Slack channel */}
                {primaryDraft.payload.channel && !primaryDraft.payload.to && (
                  <div style={{ fontSize: 12, color: "#707070" }} className="mb-2">
                    <span style={{ color: "#484848" }}>Channel:</span> #{primaryDraft.payload.channel}
                  </div>
                )}

                {/* Divider for email */}
                {primaryDraft.payload.subject && (
                  <div style={{ borderTop: "1px solid #222" }} className="mb-3" />
                )}

                {/* Body / message */}
                {editingDraft ? (
                  <textarea
                    value={editedDraftBody}
                    onChange={e => setEditedDraftBody(e.target.value)}
                    style={{
                      width: "100%",
                      minHeight: 120,
                      background: "#111",
                      border: "1px solid rgba(168,85,247,0.25)",
                      borderRadius: 4,
                      padding: "10px 12px",
                      fontSize: 13,
                      lineHeight: 1.7,
                      color: "#e8e8e8",
                      outline: "none",
                      resize: "vertical",
                      fontFamily: "inherit",
                    }}
                  />
                ) : (
                  <div style={{ fontSize: 13, lineHeight: 1.7, color: "#b0b0b0", whiteSpace: "pre-wrap" }}>
                    {primaryDraft.payload.body ?? primaryDraft.payload.message ?? ""}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Execution error */}
          {detail.actionTaken?.error && (
            <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 4 }} className="px-4 py-3">
              <p style={{ fontSize: 13, fontWeight: 500, color: "#ef4444" }}>Execution failed</p>
              <p style={{ fontSize: 12, color: "rgba(239,68,68,0.7)" }} className="mt-0.5">{detail.actionTaken.error}</p>
            </div>
          )}

          {/* ── Action buttons ── */}
          {canAct && !currentMode && (
            <div className="flex items-center gap-2 pt-2" style={{ borderTop: "1px solid #1e1e1e" }}>
              <button
                className="rounded-full text-[13px] font-medium px-4 py-1.5 transition hover:opacity-90"
                style={{ background: "#16a34a", color: "#fff" }}
                onClick={handleApprove}
              >
                {actionPlan && actionPlan.length > 1 ? "Approve plan" : "Approve"}
              </button>
              <button
                className="wf-btn-danger rounded-full text-[13px] font-medium px-4 py-1.5"
                onClick={() => setActiveMode({ id: s.id, mode: "reject" })}
              >
                Reject
              </button>
              <button
                className="rounded-full text-[13px] font-medium px-4 py-1.5 transition"
                style={{ background: "#222", border: "1px solid #333", color: "#b0b0b0" }}
                onClick={() => setActiveMode({ id: s.id, mode: "teach" })}
              >
                Teach AI
              </button>
            </div>
          )}

          {/* Outcome button for resolved without outcome */}
          {detail.status === "resolved" && !detail.outcome && !currentMode && (
            <div className="pt-2" style={{ borderTop: "1px solid #1e1e1e" }}>
              <button
                className="rounded-full text-[13px] font-medium px-4 py-1.5 transition"
                style={{ background: "#222", border: "1px solid #333", color: "#b0b0b0" }}
                onClick={() => setActiveMode({ id: s.id, mode: "outcome" })}
              >
                Mark Outcome
              </button>
            </div>
          )}

          {/* Existing outcome display */}
          {detail.outcome && (
            <div className="flex items-center gap-2 pt-2" style={{ borderTop: "1px solid #1e1e1e" }}>
              <Badge variant={detail.outcome === "positive" ? "green" : detail.outcome === "negative" ? "red" : "default"}>
                {detail.outcome}
              </Badge>
              {detail.outcomeDetails && (() => {
                try {
                  const parsed = JSON.parse(detail.outcomeDetails);
                  return parsed.note ? <span style={{ fontSize: 13, color: "#707070" }}>{parsed.note}</span> : null;
                } catch { return null; }
              })()}
            </div>
          )}

          {/* ── Evidence & reasoning toggle ── */}
          {reasoning && (
            <div>
              <button
                onClick={() => setShowEvidence(!showEvidence)}
                className="flex items-center gap-1.5 transition-colors hover:text-[#707070]"
                style={{ fontSize: 12, color: "#484848" }}
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
                    <div style={{ padding: "14px 16px", background: "#161616", border: "1px solid #222", borderRadius: 4 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "#484848", textTransform: "uppercase" as const }} className="mb-1.5">Evidence</div>
                      <p style={{ fontSize: 13, lineHeight: 1.65, color: "#b0b0b0" }}>{reasoning.evidenceSummary}</p>
                    </div>
                  )}

                  {/* Considered actions */}
                  {reasoning.consideredActions.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "#484848", textTransform: "uppercase" as const }} className="mb-2">Considered Actions</div>
                      <div className="space-y-2">
                        {reasoning.consideredActions.map((ca, i) => {
                          if (typeof ca === "string") {
                            return (
                              <div key={i} style={{ padding: "10px 14px", background: "#161616", border: "1px solid #222", borderRadius: 4 }}>
                                <span style={{ fontSize: 13, color: "#b0b0b0" }}>{ca}</span>
                              </div>
                            );
                          }
                          const hasEvidence = "evidenceFor" in ca;
                          const supportItems = hasEvidence ? (ca.evidenceFor ?? []) : (ca.pros ?? []);
                          const againstItems = hasEvidence ? (ca.evidenceAgainst ?? []) : (ca.cons ?? []);
                          return (
                            <div key={i} style={{ padding: "10px 14px", background: "#161616", border: "1px solid #222", borderRadius: 4 }} className="space-y-1.5">
                              <span style={{ fontSize: 13, fontWeight: 500, color: "#b0b0b0" }}>{ca.action}</span>
                              {supportItems.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {supportItems.map((p, j) => (
                                    <span key={j} style={{ fontSize: 11, padding: "2px 6px", borderRadius: 2, background: "rgba(34,197,94,0.1)", color: "rgba(34,197,94,0.85)" }}>{p}</span>
                                  ))}
                                </div>
                              )}
                              {againstItems.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {againstItems.map((c, j) => (
                                    <span key={j} style={{ fontSize: 11, padding: "2px 6px", borderRadius: 2, background: "rgba(239,68,68,0.1)", color: "rgba(239,68,68,0.8)" }}>{c}</span>
                                  ))}
                                </div>
                              )}
                              {ca.expectedOutcome && (
                                <p style={{ fontSize: 11, color: "#707070" }}>{ca.expectedOutcome}</p>
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
                      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "rgba(245,158,11,0.85)", textTransform: "uppercase" as const }} className="mb-1.5">Missing Context</div>
                      <ul className="space-y-0.5">
                        {reasoning.missingContext.map((mc, i) => (
                          <li key={i} style={{ fontSize: 13, color: "rgba(245,158,11,0.85)" }}>&bull; {mc}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Entity Details */}
                  {detail.contextSnapshot?.triggerEntity && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "#484848", textTransform: "uppercase" as const }} className="mb-2">Entity Details</div>
                      <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                        {Object.entries(detail.contextSnapshot.triggerEntity.properties).map(([k, v]) => (
                          <div key={k} className="flex justify-between text-[13px] py-1" style={{ borderBottom: "1px solid #1e1e1e" }}>
                            <span style={{ color: "#707070" }}>{k}</span>
                            <span style={{ color: "#b0b0b0" }}>{v}</span>
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
                        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "#484848", textTransform: "uppercase" as const }} className="mb-2">Related Entities</div>
                        <div className="space-y-1">
                          {all.slice(0, 5).map((e: { id: string; type: string; displayName: string; direction: string; relationship: string }) => (
                            <div key={e.id} className="flex items-center gap-2" style={{ fontSize: 13 }}>
                              <span style={{ color: "#484848" }}>{e.direction === "outgoing" ? "\u2192" : "\u2190"}</span>
                              <Badge>{e.type}</Badge>
                              <span style={{ color: "#b0b0b0" }}>{e.displayName}</span>
                              <span style={{ color: "#484848" }}>({e.relationship})</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Event Timeline */}
                  {detail.contextSnapshot?.recentEvents && detail.contextSnapshot.recentEvents.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "#484848", textTransform: "uppercase" as const }} className="mb-2">Event Timeline</div>
                      <div className="space-y-1.5">
                        {detail.contextSnapshot.recentEvents.slice(0, 8).map(ev => (
                          <div key={ev.id} className="flex items-center gap-3" style={{ fontSize: 13 }}>
                            <span style={{ fontSize: 11, color: "#484848", width: 48, textAlign: "right", flexShrink: 0 }}>{timeAgo(ev.createdAt)}</span>
                            <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#333", flexShrink: 0 }} />
                            <span style={{ color: "#b0b0b0" }}>{ev.eventType}</span>
                            <span style={{ color: "#484848" }}>{ev.source}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Prior Situations */}
                  {detail.contextSnapshot?.priorSituations && detail.contextSnapshot.priorSituations.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "#484848", textTransform: "uppercase" as const }} className="mb-2">Prior Situations</div>
                      <div className="space-y-2">
                        {detail.contextSnapshot.priorSituations.map(ps => (
                          <div key={ps.id} className="flex items-start gap-2" style={{ fontSize: 13 }}>
                            <span className="flex-shrink-0" style={{ color: "#484848" }}>
                              {ps.outcome === "positive" ? "\u2713" : ps.outcome === "negative" ? "\u2717" : "?"}
                            </span>
                            <div>
                              <span style={{ color: "#b0b0b0" }}>{ps.triggerEntityName}</span>
                              <span style={{ color: "#484848" }} className="ml-2">{ps.status}</span>
                              {ps.feedback && <p style={{ color: "#707070" }} className="mt-0.5">{ps.feedback}</p>}
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
            <div className="space-y-2 pt-2" style={{ borderTop: "1px solid #1e1e1e" }}>
              <textarea
                value={feedbackText}
                onChange={e => setFeedbackText(e.target.value)}
                placeholder="Why is this not a real situation? (optional)"
                className="w-full outline-none"
                style={{ background: "#161616", border: "1px solid #222", borderRadius: 4, padding: "8px 12px", fontSize: 13, color: "#e8e8e8", resize: "vertical", fontFamily: "inherit" }}
                rows={2}
              />
              <div className="flex gap-2">
                <button
                  className="wf-btn-danger rounded-full text-[13px] font-medium px-4 py-1.5"
                  onClick={() => patchSituation(s.id, { status: "rejected", feedback: feedbackText || undefined })}
                >Reject</button>
                <button
                  className="rounded-full text-[13px] font-medium px-4 py-1.5 transition"
                  style={{ background: "#222", border: "1px solid #333", color: "#b0b0b0" }}
                  onClick={resetInteraction}
                >Cancel</button>
              </div>
            </div>
          )}

          {/* Teach AI mode */}
          {currentMode === "teach" && (
            <div className="space-y-2 pt-2" style={{ borderTop: "1px solid #1e1e1e" }}>
              <select
                value={feedbackCategory}
                onChange={e => setFeedbackCategory(e.target.value)}
                className="w-full outline-none"
                style={{ background: "#1c1c1c", border: "1px solid #222", borderRadius: 4, padding: "8px 12px", fontSize: 13, color: "#e8e8e8" }}
              >
                {CATEGORY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value} style={{ background: "#1c1c1c" }}>{opt.label}</option>
                ))}
              </select>
              <textarea
                value={feedbackText}
                onChange={e => setFeedbackText(e.target.value)}
                placeholder="Teach the AI about this situation — what context is it missing?"
                className="w-full outline-none"
                style={{ background: "#161616", border: "1px solid #222", borderRadius: 4, padding: "8px 12px", fontSize: 13, color: "#e8e8e8", resize: "vertical", fontFamily: "inherit" }}
                rows={2}
              />
              <div className="flex gap-2">
                <button
                  className="rounded-full text-[13px] font-medium px-4 py-1.5 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: "#16a34a", color: "#fff" }}
                  disabled={!feedbackText.trim()}
                  onClick={() => patchSituation(s.id, {
                    feedback: feedbackText,
                    feedbackCategory: feedbackCategory || undefined,
                  })}
                >Save feedback</button>
                <button
                  className="rounded-full text-[13px] font-medium px-4 py-1.5 transition"
                  style={{ background: "#222", border: "1px solid #333", color: "#b0b0b0" }}
                  onClick={resetInteraction}
                >Cancel</button>
              </div>
            </div>
          )}

          {/* Outcome mode */}
          {currentMode === "outcome" && (
            <div className="space-y-3 pt-2" style={{ borderTop: "1px solid #1e1e1e" }}>
              <div className="flex gap-2">
                {(["positive", "negative", "neutral"] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => setOutcomeValue(v)}
                    className="px-4 py-1.5 rounded text-[13px] font-medium border transition-colors"
                    style={{
                      background: outcomeValue === v
                        ? v === "positive" ? "rgba(34,197,94,0.15)" : v === "negative" ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.08)"
                        : "#161616",
                      borderColor: outcomeValue === v
                        ? v === "positive" ? "rgba(34,197,94,0.3)" : v === "negative" ? "rgba(239,68,68,0.3)" : "#333"
                        : "#222",
                      color: outcomeValue === v
                        ? v === "positive" ? "#22c55e" : v === "negative" ? "#ef4444" : "#e8e8e8"
                        : "#707070",
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
                style={{ background: "#161616", border: "1px solid #222", borderRadius: 4, padding: "8px 12px", fontSize: 13, color: "#e8e8e8" }}
              />
              <div className="flex gap-2">
                <button
                  className="rounded-full text-[13px] font-medium px-4 py-1.5 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: "#16a34a", color: "#fff" }}
                  disabled={!outcomeValue}
                  onClick={() => patchSituation(s.id, { outcome: outcomeValue, outcomeNote: outcomeNote || undefined })}
                >Save Outcome</button>
                <button
                  className="rounded-full text-[13px] font-medium px-4 py-1.5 transition"
                  style={{ background: "#222", border: "1px solid #333", color: "#b0b0b0" }}
                  onClick={resetInteraction}
                >Cancel</button>
              </div>
            </div>
          )}

          {/* Existing feedback display */}
          {detail.feedback && !currentMode && (
            <div className="flex items-start gap-2 pt-2" style={{ borderTop: "1px solid #1e1e1e" }}>
              <span style={{ fontSize: 13, color: "#707070" }}>Feedback:</span>
              <span style={{ fontSize: 13, color: "#b0b0b0" }}>{detail.feedback}</span>
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
