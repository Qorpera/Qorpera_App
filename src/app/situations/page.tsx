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
  proposedAction: ProposedAction | null;
  editInstruction: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

interface ReasoningData {
  analysis: string;
  evidenceSummary?: string;
  consideredActions: Array<string | ConsideredAction>;
  chosenAction: ProposedAction | null;
  confidence: number;
  missingContext: string[] | null;
}

interface ConsideredAction {
  action: string;
  evidenceFor?: string[];
  evidenceAgainst?: string[];
  pros?: string[];
  cons?: string[];
  expectedOutcome: string;
}

interface ProposedAction {
  action: string;
  connector?: string;
  params?: Record<string, unknown>;
  justification: string;
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
  proposedAction: ProposedAction | null;
  actionTaken: { error?: string; action?: string; result?: unknown; executedAt?: string; failedAt?: string } | null;
  feedback: string | null;
  feedbackRating: number | null;
  feedbackCategory: string | null;
  editInstruction: string | null;
  outcome: string | null;
  outcomeDetails: string | null;
  createdAt: string;
}

type ActiveMode = { id: string; mode: "reject" | "teach" | "edit" | "outcome" } | null;

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
    chosenAction: r.chosenAction as ProposedAction | null ?? null,
    confidence: typeof r.confidence === "number" ? r.confidence : 0,
    missingContext: Array.isArray(r.missingContext) ? r.missingContext : null,
  };
}

function urgencyDot(s: SituationItem): string {
  if (s.status === "rejected") return "bg-white/[0.20]";
  if (s.status === "approved" || s.status === "resolved") return "bg-[#3da676]";
  if (s.severity >= 0.7) return "bg-[#d94f4f]";
  if (s.severity >= 0.4) return "bg-[#c49b16]";
  return "bg-[#3da676]";
}

function urgencyPill(s: SituationItem): { label: string; className: string } {
  if (s.status === "approved") return { label: "Approved", className: "bg-[rgba(61,166,118,0.10)] border-[rgba(61,166,118,0.22)] text-[rgba(61,166,118,0.9)]" };
  if (s.status === "rejected") return { label: "Rejected", className: "bg-white/[0.05] border-white/[0.10] text-white/40" };
  if (s.status === "resolved") return { label: "Resolved", className: "bg-[rgba(61,166,118,0.08)] border-[rgba(61,166,118,0.18)] text-[rgba(61,166,118,0.7)]" };
  if (s.severity >= 0.7) return { label: "Critical", className: "bg-[rgba(217,79,79,0.10)] border-[rgba(217,79,79,0.22)] text-[rgba(217,79,79,0.85)]" };
  if (s.severity >= 0.4) return { label: "Review", className: "bg-[rgba(196,155,22,0.10)] border-[rgba(196,155,22,0.22)] text-[rgba(196,155,22,0.90)]" };
  return { label: "Monitoring", className: "bg-[rgba(61,166,118,0.08)] border-[rgba(61,166,118,0.18)] text-[rgba(61,166,118,0.8)]" };
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
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
  const [editText, setEditText] = useState("");
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
    if (!selectedId) {
      setDetail(null);
      return;
    }
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
    setEditText("");
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
      setEditText("");
      setOutcomeValue("");
      setOutcomeNote("");
      await fetchSituations();
      if (selectedId) fetchDetail(selectedId);
    } catch {}
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <AppShell pendingApprovals={pendingCount}>
      <div className="flex h-full overflow-hidden">

        {/* Left: situation list */}
        <div className="w-[252px] flex-shrink-0 border-r border-white/[0.055] flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-3 py-3 border-b border-white/[0.04] flex-shrink-0">
            <div className="font-heading italic font-semibold text-[16px] tracking-[-0.01em] text-white/90">
              Situations
            </div>
            <div className="text-[12px] font-mono text-white/[0.28] mt-0.5">
              {situations.length} total · {pendingCount} pending
            </div>
          </div>

          {/* Filter chips */}
          <div className="px-3 py-2 border-b border-white/[0.04] flex gap-1.5 flex-wrap flex-shrink-0">
            {(["all", "pending", "resolved"] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`text-[12px] font-mono px-2 py-0.5 rounded-[2px] border transition
                  ${filter === f
                    ? "bg-white/[0.08] border-white/[0.16] text-white/80"
                    : "bg-transparent border-white/[0.07] text-white/[0.32] hover:text-white/60"}`}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Situation list */}
          <div className="flex-1 overflow-y-auto">
            {loading && (
              <div className="flex justify-center py-10">
                <div className="h-4 w-4 animate-spin rounded-full border border-white/20 border-t-white/60" />
              </div>
            )}
            {filteredSituations.map(s => (
              <button
                key={s.id}
                onClick={() => setSelectedId(s.id)}
                className={`w-full text-left px-3 py-2.5 border-b border-white/[0.04] border-l-2 transition
                  ${selectedId === s.id
                    ? "bg-white/[0.05] border-l-white/[0.40]"
                    : "border-l-transparent hover:bg-white/[0.025]"}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-[5px] h-[5px] rounded-full flex-shrink-0 ${urgencyDot(s)}`} />
                  <span className="text-[14px] font-medium text-white/80 truncate flex-1">
                    {s.triggerEntityName ?? "Unknown"}
                  </span>
                  <span className="text-[12px] font-mono text-white/[0.22] flex-shrink-0">
                    {timeAgo(s.createdAt)}
                  </span>
                </div>
                <div className="text-[13px] text-white/[0.38] pl-[13px] truncate">
                  {s.situationType.name}
                  {s.departmentName ? ` · ${s.departmentName}` : ""}
                </div>
              </button>
            ))}
            {!loading && filteredSituations.length === 0 && (
              <div className="px-4 py-8 text-center text-[14px] text-white/[0.25]">
                No situations
              </div>
            )}
          </div>
        </div>

        {/* Right: detail pane */}
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
              editText={editText}
              setEditText={setEditText}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-[14px] text-white/[0.22] font-mono">
              Select a situation
            </div>
          )}
        </div>

      </div>
    </AppShell>
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
  editText, setEditText,
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
  editText: string;
  setEditText: (t: string) => void;
}) {
  const [showReasoning, setShowReasoning] = useState(false);

  const isThisCard = activeMode?.id === s.id;
  const currentMode = isThisCard ? activeMode!.mode : null;
  const canAct = s.status === "detected" || s.status === "proposed";
  const reasoning = detail?.reasoning ? safeParseReasoning(detail.reasoning) : null;
  const proposedAction = detail?.proposedAction;
  const pill = urgencyPill(s);

  const resetInteraction = () => {
    setActiveMode(null);
    setFeedbackText("");
    setFeedbackCategory("");
    setEditText("");
    setOutcomeValue("");
    setOutcomeNote("");
  };

  return (
    <div className="px-6 py-5 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Badge variant={s.situationType.autonomyLevel === "autonomous" ? "blue" : "default"} className="!rounded-[2px]">
          {s.situationType.name}
        </Badge>
        <span className={`inline-flex items-center px-2 py-0.5 text-[12px] font-medium rounded-[2px] border ${pill.className}`}>
          {pill.label}
        </span>
        <span className="text-[12px] font-mono text-white/[0.22]">{timeAgo(s.createdAt)}</span>
      </div>

      {/* Entity + urgency dot */}
      <div className="flex items-center justify-between">
        <span className="text-[18px] text-white/90 font-medium">
          {s.triggerEntityName ?? "Unknown entity"}
        </span>
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${urgencyDot(s)}`} />
          <span className="text-[13px] text-white/[0.38]">
            {(s.confidence * 100).toFixed(0)}% confidence
          </span>
        </div>
      </div>

      {detailLoading && (
        <div className="flex justify-center py-8">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
        </div>
      )}

      {detail && !detailLoading && (
        <>
          {/* Revised badge */}
          {detail.editInstruction && (
            <div className="flex items-start gap-2">
              <Badge variant="blue" className="!rounded-[2px]">Revised</Badge>
              <p className="text-[14px] text-white/50 italic">&quot;{detail.editInstruction}&quot;</p>
            </div>
          )}

          {/* Proposed Action */}
          {reasoning && proposedAction ? (
            <div className="bg-white/[0.025] border border-white/[0.09] border-l-2 border-l-white/[0.28] rounded-none rounded-r-[4px] px-3 py-2.5 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-medium text-white/[0.65] leading-relaxed">{proposedAction.action}</span>
                {proposedAction.connector && (
                  <span className="text-[13px] text-white/[0.38]">{proposedAction.connector}</span>
                )}
              </div>
              <p className="text-[13px] text-white/[0.38] mt-1.5">{proposedAction.justification}</p>
              <p className="text-[13px] text-white/[0.38]">
                AI confidence: {(reasoning.confidence * 100).toFixed(0)}%
              </p>
            </div>
          ) : reasoning && !proposedAction ? (
            <p className="text-[14px] text-white/50 italic">No action recommended — please review.</p>
          ) : s.status === "reasoning" ? (
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
              <p className="text-[14px] text-white/40">AI is analyzing this situation...</p>
            </div>
          ) : s.status === "executing" ? (
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-white/20 border-t-emerald-400" />
              <p className="text-[14px] text-white/40">Executing action...</p>
            </div>
          ) : null}

          {/* Execution error */}
          {detail.actionTaken?.error && (
            <div className="bg-[rgba(217,79,79,0.10)] border border-[rgba(217,79,79,0.22)] rounded-[4px] px-4 py-3">
              <p className="text-[14px] font-medium text-red-400">Execution failed</p>
              <p className="text-[14px] text-red-300/70 mt-0.5">{detail.actionTaken.error}</p>
            </div>
          )}

          {/* Full reasoning toggle */}
          {reasoning && (
            <div>
              <button
                onClick={() => setShowReasoning(!showReasoning)}
                className="flex items-center gap-1.5 text-[14px] text-white/40 hover:text-white/60 transition-colors"
              >
                <svg className={`w-3 h-3 transition-transform ${showReasoning ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                {showReasoning ? "Hide full reasoning" : "Show full reasoning"}
              </button>

              {showReasoning && (
                <div className="mt-3 space-y-4 pl-4 border-l border-white/[0.06]">
                  {/* Analysis */}
                  <div>
                    <h5 className="text-[11px] font-mono uppercase tracking-[0.1em] text-white/[0.22] mb-1.5">Analysis</h5>
                    <div className="bg-white/[0.025] border border-white/[0.07] rounded-[4px] px-3 py-2.5">
                      <p className="text-[14px] text-white/60 leading-relaxed">{reasoning.analysis}</p>
                    </div>
                  </div>

                  {/* Evidence Summary */}
                  {reasoning.evidenceSummary && (
                    <div className="bg-white/[0.03] border border-white/[0.07] rounded-[4px] p-3">
                      <h5 className="text-[11px] font-mono uppercase tracking-[0.1em] text-white/[0.22] mb-1.5">Evidence</h5>
                      <p className="text-[14px] text-white/60 leading-relaxed">{reasoning.evidenceSummary}</p>
                    </div>
                  )}

                  {/* Considered actions */}
                  {reasoning.consideredActions.length > 0 && (
                    <div>
                      <h5 className="text-[11px] font-mono uppercase tracking-[0.1em] text-white/[0.22] mb-2">Considered Actions</h5>
                      <div className="space-y-2">
                        {reasoning.consideredActions.map((ca, i) => {
                          if (typeof ca === "string") {
                            return (
                              <div key={i} className="bg-white/[0.03] rounded-[4px] p-3">
                                <span className="text-[14px] text-white/70">{ca}</span>
                              </div>
                            );
                          }
                          const hasEvidence = "evidenceFor" in ca;
                          const supportItems = hasEvidence ? (ca.evidenceFor ?? []) : (ca.pros ?? []);
                          const againstItems = hasEvidence ? (ca.evidenceAgainst ?? []) : (ca.cons ?? []);
                          return (
                            <div key={i} className="bg-white/[0.03] rounded-[4px] p-3 space-y-1.5">
                              <span className="text-[14px] font-medium text-white/70">{ca.action}</span>
                              {supportItems.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {supportItems.map((p, j) => (
                                    <span key={j} className="text-[12px] px-1.5 py-0.5 rounded-[2px] bg-[rgba(61,166,118,0.10)] text-[rgba(61,166,118,0.85)]">{p}</span>
                                  ))}
                                </div>
                              )}
                              {againstItems.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {againstItems.map((c, j) => (
                                    <span key={j} className="text-[12px] px-1.5 py-0.5 rounded-[2px] bg-[rgba(217,79,79,0.10)] text-[rgba(217,79,79,0.80)]">{c}</span>
                                  ))}
                                </div>
                              )}
                              {ca.expectedOutcome && (
                                <p className="text-[12px] text-white/40">{ca.expectedOutcome}</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Missing context */}
                  {reasoning.missingContext && reasoning.missingContext.length > 0 && (
                    <div className="bg-[rgba(196,155,22,0.07)] border border-[rgba(196,155,22,0.18)] rounded-[4px] p-3">
                      <h5 className="text-[11px] font-mono uppercase tracking-[0.1em] text-[rgba(196,155,22,0.85)] mb-1.5">Missing Context</h5>
                      <ul className="space-y-0.5">
                        {reasoning.missingContext.map((mc, i) => (
                          <li key={i} className="text-[14px] text-[rgba(196,155,22,0.85)]">&bull; {mc}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Entity Details */}
          {detail.contextSnapshot?.triggerEntity && (
            <div>
              <h4 className="text-[11px] font-mono uppercase tracking-[0.1em] text-white/[0.22] mb-2">Entity Details</h4>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                {Object.entries(detail.contextSnapshot.triggerEntity.properties).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-[14px] py-1 border-b border-white/[0.04]">
                    <span className="text-white/40">{k}</span>
                    <span className="text-white/70">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Related Entities */}
          {detail.contextSnapshot?.relatedEntities && (
            (() => {
              const re = detail.contextSnapshot.relatedEntities;
              const all = [...(re.base ?? []), ...(re.digital ?? []), ...(re.external ?? [])];
              if (all.length === 0) return null;
              return (
                <div>
                  <h4 className="text-[11px] font-mono uppercase tracking-[0.1em] text-white/[0.22] mb-2">Related Entities</h4>
                  <div className="space-y-1">
                    {all.slice(0, 5).map((e: { id: string; type: string; displayName: string; direction: string; relationship: string }) => (
                      <div key={e.id} className="flex items-center gap-2 text-[14px]">
                        <span className="text-white/30">{e.direction === "outgoing" ? "\u2192" : "\u2190"}</span>
                        <Badge variant="default" className="!rounded-[2px]">{e.type}</Badge>
                        <span className="text-white/70">{e.displayName}</span>
                        <span className="text-white/30">({e.relationship})</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()
          )}

          {/* Event Timeline */}
          {detail.contextSnapshot?.recentEvents && detail.contextSnapshot.recentEvents.length > 0 && (
            <div>
              <h4 className="text-[11px] font-mono uppercase tracking-[0.1em] text-white/[0.22] mb-2">Event Timeline</h4>
              <div className="space-y-1.5">
                {detail.contextSnapshot.recentEvents.slice(0, 8).map((ev) => (
                  <div key={ev.id} className="flex items-center gap-3 text-[14px]">
                    <span className="text-[12px] font-mono text-white/[0.22] w-16 text-right flex-shrink-0">{timeAgo(ev.createdAt)}</span>
                    <div className="w-1.5 h-1.5 rounded-full bg-white/[0.20] flex-shrink-0" />
                    <span className="text-white/60">{ev.eventType}</span>
                    <span className="text-white/30">{ev.source}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Prior Situations */}
          {detail.contextSnapshot?.priorSituations && detail.contextSnapshot.priorSituations.length > 0 && (
            <div>
              <h4 className="text-[11px] font-mono uppercase tracking-[0.1em] text-white/[0.22] mb-2">Prior Situations</h4>
              <div className="space-y-2">
                {detail.contextSnapshot.priorSituations.map((ps) => (
                  <div key={ps.id} className="flex items-start gap-2 text-[14px]">
                    <span className="flex-shrink-0">
                      {ps.outcome === "positive" ? "\u2713" : ps.outcome === "negative" ? "\u2717" : "?"}
                    </span>
                    <div>
                      <span className="text-white/70">{ps.triggerEntityName}</span>
                      <span className="text-white/30 ml-2">{ps.status}</span>
                      {ps.feedback && <p className="text-white/40 mt-0.5">{ps.feedback}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons */}
          {canAct && !currentMode && (
            <div className="flex items-center gap-2 pt-2 border-t border-white/[0.06]">
              <button
                className="px-3 py-1.5 rounded-[3px] border border-[rgba(61,166,118,0.22)] bg-[rgba(61,166,118,0.10)] text-[rgba(61,166,118,0.9)] text-[13px] font-medium hover:bg-[rgba(61,166,118,0.18)] transition"
                onClick={() => patchSituation(s.id, { status: "approved" })}
              >
                Approve
              </button>
              <button
                className="px-3 py-1.5 rounded-[3px] border border-white/[0.10] bg-white/[0.04] text-white/50 text-[13px] font-medium hover:bg-white/[0.08] hover:text-white/70 transition"
                onClick={() => setActiveMode({ id: s.id, mode: "edit" })}
              >
                Edit &amp; Approve
              </button>
              <button
                className="px-3 py-1.5 rounded-[3px] border border-[rgba(217,79,79,0.22)] bg-[rgba(217,79,79,0.10)] text-[rgba(217,79,79,0.85)] text-[13px] font-medium hover:bg-[rgba(217,79,79,0.18)] transition"
                onClick={() => setActiveMode({ id: s.id, mode: "reject" })}
              >
                Reject
              </button>
              <button
                className="px-3 py-1.5 rounded-[3px] border border-white/[0.10] bg-white/[0.04] text-white/50 text-[13px] font-medium hover:bg-white/[0.08] hover:text-white/70 transition"
                onClick={() => setActiveMode({ id: s.id, mode: "teach" })}
              >
                Teach
              </button>
            </div>
          )}

          {/* Outcome button for resolved without outcome */}
          {detail.status === "resolved" && !detail.outcome && !currentMode && (
            <div className="pt-2 border-t border-white/[0.06]">
              <button
                className="px-3 py-1.5 rounded-[3px] border border-white/[0.10] bg-white/[0.04] text-white/50 text-[13px] font-medium hover:bg-white/[0.08] hover:text-white/70 transition"
                onClick={() => setActiveMode({ id: s.id, mode: "outcome" })}
              >
                Mark Outcome
              </button>
            </div>
          )}

          {/* Existing outcome display */}
          {detail.outcome && (
            <div className="flex items-center gap-2 pt-2 border-t border-white/[0.06]">
              <Badge variant={detail.outcome === "positive" ? "green" : detail.outcome === "negative" ? "red" : "default"} className="!rounded-[2px]">
                {detail.outcome}
              </Badge>
              {detail.outcomeDetails && (() => {
                try {
                  const parsed = JSON.parse(detail.outcomeDetails);
                  return parsed.note ? <span className="text-[14px] text-white/40">{parsed.note}</span> : null;
                } catch { return null; }
              })()}
            </div>
          )}

          {/* ── Mode UIs ────────────────────────────────── */}

          {/* Reject mode */}
          {currentMode === "reject" && (
            <div className="space-y-2 pt-2 border-t border-white/[0.06]">
              <textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="Why is this not a real situation? (optional)"
                className="w-full bg-white/[0.04] border border-white/[0.09] rounded-[3px] px-3 py-2 text-[14px] text-white/80 placeholder:text-white/[0.25] outline-none focus:border-white/[0.22] font-sans"
                rows={2}
              />
              <div className="flex gap-2">
                <button
                  className="px-3 py-1.5 rounded-[3px] border border-[rgba(217,79,79,0.22)] bg-[rgba(217,79,79,0.10)] text-[rgba(217,79,79,0.85)] text-[13px] font-medium hover:bg-[rgba(217,79,79,0.18)] transition"
                  onClick={() => patchSituation(s.id, { status: "rejected", feedback: feedbackText || undefined })}
                >
                  Reject
                </button>
                <button
                  className="px-3 py-1.5 rounded-[3px] border border-white/[0.10] bg-white/[0.04] text-white/50 text-[13px] font-medium hover:bg-white/[0.08] hover:text-white/70 transition"
                  onClick={resetInteraction}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Teach mode */}
          {currentMode === "teach" && (
            <div className="space-y-2 pt-2 border-t border-white/[0.06]">
              <select
                value={feedbackCategory}
                onChange={(e) => setFeedbackCategory(e.target.value)}
                className="w-full bg-white/[0.04] border border-white/[0.09] rounded-[3px] px-3 py-2 text-[14px] text-white/80 outline-none focus:border-white/[0.22] font-sans"
                style={{ backgroundColor: "#182027" }}
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value} style={{ backgroundColor: "#182027" }}>{opt.label}</option>
                ))}
              </select>
              <textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="Teach the AI about this situation — what context is it missing?"
                className="w-full bg-white/[0.04] border border-white/[0.09] rounded-[3px] px-3 py-2 text-[14px] text-white/80 placeholder:text-white/[0.25] outline-none focus:border-white/[0.22] font-sans"
                rows={2}
              />
              <div className="flex gap-2">
                <button
                  className="px-3 py-1.5 rounded-[3px] border border-[rgba(61,166,118,0.22)] bg-[rgba(61,166,118,0.10)] text-[rgba(61,166,118,0.9)] text-[13px] font-medium hover:bg-[rgba(61,166,118,0.18)] transition disabled:opacity-40 disabled:cursor-not-allowed"
                  disabled={!feedbackText.trim()}
                  onClick={() => patchSituation(s.id, {
                    feedback: feedbackText,
                    feedbackCategory: feedbackCategory || undefined,
                  })}
                >
                  Save feedback
                </button>
                <button
                  className="px-3 py-1.5 rounded-[3px] border border-white/[0.10] bg-white/[0.04] text-white/50 text-[13px] font-medium hover:bg-white/[0.08] hover:text-white/70 transition"
                  onClick={resetInteraction}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Edit & Approve mode */}
          {currentMode === "edit" && (
            <div className="space-y-2 pt-2 border-t border-white/[0.06]">
              <p className="text-[13px] text-white/[0.38]">Describe what to change. The AI will revise and re-propose.</p>
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                placeholder="e.g., Make the email tone more urgent and CC their account manager"
                className="w-full bg-white/[0.04] border border-white/[0.09] rounded-[3px] px-3 py-2 text-[14px] text-white/80 placeholder:text-white/[0.25] outline-none focus:border-white/[0.22] font-sans"
                rows={2}
              />
              <div className="flex gap-2">
                <button
                  className="px-3 py-1.5 rounded-[3px] border border-[rgba(61,166,118,0.22)] bg-[rgba(61,166,118,0.10)] text-[rgba(61,166,118,0.9)] text-[13px] font-medium hover:bg-[rgba(61,166,118,0.18)] transition disabled:opacity-40 disabled:cursor-not-allowed"
                  disabled={!editText.trim()}
                  onClick={() => patchSituation(s.id, { editInstruction: editText })}
                >
                  Submit Edit
                </button>
                <button
                  className="px-3 py-1.5 rounded-[3px] border border-white/[0.10] bg-white/[0.04] text-white/50 text-[13px] font-medium hover:bg-white/[0.08] hover:text-white/70 transition"
                  onClick={resetInteraction}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Outcome mode */}
          {currentMode === "outcome" && (
            <div className="space-y-3 pt-2 border-t border-white/[0.06]">
              <div className="flex gap-2">
                {(["positive", "negative", "neutral"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setOutcomeValue(v)}
                    className={`px-4 py-1.5 rounded-[2px] text-[14px] font-medium border transition-colors ${
                      outcomeValue === v
                        ? v === "positive" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                        : v === "negative" ? "bg-red-500/20 text-red-300 border-red-500/40"
                        : "bg-white/10 text-white/70 border-white/20"
                        : "bg-white/[0.03] text-white/40 border-white/[0.08] hover:bg-white/[0.06]"
                    }`}
                  >
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={outcomeNote}
                onChange={(e) => setOutcomeNote(e.target.value)}
                placeholder="Optional note"
                className="w-full bg-white/[0.04] border border-white/[0.09] rounded-[3px] px-3 py-2 text-[14px] text-white/80 placeholder:text-white/[0.25] outline-none focus:border-white/[0.22] font-sans"
              />
              <div className="flex gap-2">
                <button
                  className="px-3 py-1.5 rounded-[3px] border border-[rgba(61,166,118,0.22)] bg-[rgba(61,166,118,0.10)] text-[rgba(61,166,118,0.9)] text-[13px] font-medium hover:bg-[rgba(61,166,118,0.18)] transition disabled:opacity-40 disabled:cursor-not-allowed"
                  disabled={!outcomeValue}
                  onClick={() => patchSituation(s.id, {
                    outcome: outcomeValue,
                    outcomeNote: outcomeNote || undefined,
                  })}
                >
                  Save Outcome
                </button>
                <button
                  className="px-3 py-1.5 rounded-[3px] border border-white/[0.10] bg-white/[0.04] text-white/50 text-[13px] font-medium hover:bg-white/[0.08] hover:text-white/70 transition"
                  onClick={resetInteraction}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Existing feedback display */}
          {detail.feedback && !currentMode && (
            <div className="flex items-start gap-2 pt-2 border-t border-white/[0.06]">
              <span className="text-[14px] text-white/40">Feedback:</span>
              <span className="text-[14px] text-white/60">{detail.feedback}</span>
              {detail.feedbackCategory && (
                <Badge variant="default" className="!rounded-[2px]">{CATEGORY_LABELS[detail.feedbackCategory] ?? detail.feedbackCategory}</Badge>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
