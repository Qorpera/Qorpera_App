"use client";

import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
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

function SeverityBar({ value }: { value: number }) {
  const bars = 5;
  const filled = Math.round(value * bars);
  const color = value >= 0.7 ? "bg-red-400" : value >= 0.4 ? "bg-amber-400" : "bg-emerald-400";
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: bars }).map((_, i) => (
        <div key={i} className={`w-2 h-3 rounded-sm ${i < filled ? color : "bg-white/10"}`} />
      ))}
    </div>
  );
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

function confidenceColor(c: number): string {
  if (c >= 0.7) return "text-emerald-400";
  if (c >= 0.4) return "text-amber-400";
  return "text-red-400";
}

function statusBadge(status: string) {
  const variant = status === "detected" ? "amber" as const
    : status === "proposed" ? "purple" as const
    : status === "resolved" ? "green" as const
    : status === "rejected" ? "red" as const
    : status === "executing" || status === "auto_executing" ? "blue" as const
    : "default" as const;
  const label = status === "auto_executing" ? "auto-executing" : status;
  return <Badge variant={variant}>{label}</Badge>;
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
  const [detecting, setDetecting] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SituationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [sysStatus, setSysStatus] = useState<{
    situationTypeCount: number;
    lastDetectionRun: string | null;
    cronRunning: boolean;
    aiProviderConfigured: boolean;
    aiReachable: boolean;
  } | null>(null);

  const [activeMode, setActiveMode] = useState<ActiveMode>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackCategory, setFeedbackCategory] = useState("");
  const [editText, setEditText] = useState("");
  const [outcomeValue, setOutcomeValue] = useState("");
  const [outcomeNote, setOutcomeNote] = useState("");
  const [showReasoning, setShowReasoning] = useState(false);

  const resetInteraction = () => {
    setActiveMode(null);
    setFeedbackText("");
    setFeedbackCategory("");
    setEditText("");
    setOutcomeValue("");
    setOutcomeNote("");
  };

  const closeModal = () => {
    setSelectedId(null);
    setDetail(null);
    setShowReasoning(false);
    resetInteraction();
  };

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
    fetch("/api/situations/status")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setSysStatus(data); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const interval = setInterval(fetchSituations, 15000);
    return () => clearInterval(interval);
  }, [fetchSituations]);

  const handleDetect = async () => {
    setDetecting(true);
    try {
      const res = await fetch("/api/situations/detect", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.situationsCreated > 0) await fetchSituations();
      }
    } catch {}
    setDetecting(false);
  };

  const handleSelect = async (id: string) => {
    setSelectedId(id);
    setShowReasoning(false);
    resetInteraction();
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/situations/${id}`);
      if (res.ok) setDetail(await res.json());
    } catch {}
    setDetailLoading(false);
  };

  const patchSituation = async (id: string, body: Record<string, unknown>) => {
    try {
      await fetch(`/api/situations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      closeModal();
      await fetchSituations();
    } catch {}
  };

  const needsAttention = situations.filter((s) => ["detected", "proposed"].includes(s.status));
  const aiHandled = situations.filter((s) => s.status === "resolved" && s.source === "detected");
  const monitoring = situations.filter((s) => s.confidence < 0.5 || s.status === "reasoning" || s.status === "auto_executing" || s.status === "executing");

  const selectedSituation = selectedId ? situations.find((s) => s.id === selectedId) ?? null : null;

  return (
    <AppShell>
      <div className="p-8 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-white/90">Situations</h1>
            {needsAttention.length > 0 && (
              <span className="min-w-[22px] h-[22px] flex items-center justify-center rounded-full bg-amber-500/20 text-amber-300 text-xs font-bold px-1.5">
                {needsAttention.length}
              </span>
            )}
          </div>
          <Button variant="primary" size="sm" onClick={handleDetect} disabled={detecting}>
            {detecting ? (
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Detecting...
              </span>
            ) : "Run Detection"}
          </Button>
        </div>

        {/* Status indicator */}
        {sysStatus && (
          <div className="text-xs">
            {sysStatus.cronRunning && sysStatus.aiReachable ? (
              <p className="text-emerald-400/80">
                Detection active
                {sysStatus.lastDetectionRun && (
                  <> &mdash; last run: {timeAgo(sysStatus.lastDetectionRun)}</>
                )}
                {" "}&mdash; {sysStatus.situationTypeCount} type{sysStatus.situationTypeCount !== 1 ? "s" : ""} monitored
              </p>
            ) : (
              <p className="text-amber-400/80">
                Detection not running
                {!sysStatus.aiProviderConfigured && " \u2014 no AI provider configured"}
                {sysStatus.aiProviderConfigured && !sysStatus.aiReachable && " \u2014 AI credentials missing"}
                {sysStatus.aiReachable && !sysStatus.cronRunning && " \u2014 cron not started"}
              </p>
            )}
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-purple-400" />
          </div>
        )}

        {!loading && situations.length === 0 && (
          <div className="wf-soft p-10 text-center">
            <p className="text-sm text-white/40">No situations detected yet. Complete orientation and run detection to get started.</p>
          </div>
        )}

        {!loading && needsAttention.length > 0 && (
          <Section title="Needs Your Attention" count={needsAttention.length} color="amber">
            {needsAttention.map((s) => (
              <GridCard key={s.id} situation={s} onClick={() => handleSelect(s.id)} />
            ))}
          </Section>
        )}

        {!loading && aiHandled.length > 0 && (
          <Section title="AI Handled" count={aiHandled.length} color="green">
            {aiHandled.map((s) => (
              <GridCard key={s.id} situation={s} onClick={() => handleSelect(s.id)} />
            ))}
          </Section>
        )}

        {!loading && monitoring.length > 0 && (
          <Section title="Monitoring" count={monitoring.length} color="default">
            {monitoring.map((s) => (
              <GridCard key={s.id} situation={s} onClick={() => handleSelect(s.id)} />
            ))}
          </Section>
        )}
      </div>

      {/* Detail Modal */}
      {selectedId && (
        <DetailModal
          situation={selectedSituation}
          detail={detail}
          detailLoading={detailLoading}
          onClose={closeModal}
          showReasoning={showReasoning}
          setShowReasoning={setShowReasoning}
          activeMode={activeMode}
          setActiveMode={setActiveMode}
          feedbackText={feedbackText}
          setFeedbackText={setFeedbackText}
          feedbackCategory={feedbackCategory}
          setFeedbackCategory={setFeedbackCategory}
          editText={editText}
          setEditText={setEditText}
          outcomeValue={outcomeValue}
          setOutcomeValue={setOutcomeValue}
          outcomeNote={outcomeNote}
          setOutcomeNote={setOutcomeNote}
          resetInteraction={resetInteraction}
          patchSituation={patchSituation}
        />
      )}
    </AppShell>
  );
}

// ── Section ──────────────────────────────────────────────────────────────────

function Section({ title, count, color, children }: { title: string; count: number; color: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  const dotColor = color === "amber" ? "bg-amber-400" : color === "green" ? "bg-emerald-400" : "bg-white/30";

  return (
    <div>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 mb-3 group">
        <div className={`w-2 h-2 rounded-full ${dotColor}`} />
        <span className="text-sm font-medium text-white/70 group-hover:text-white/90 transition-colors">{title}</span>
        <span className="text-xs text-white/30">({count})</span>
        <svg className={`w-3 h-3 text-white/30 transition-transform ${open ? "rotate-0" : "-rotate-90"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Grid Card ────────────────────────────────────────────────────────────────

function GridCard({ situation: s, onClick }: { situation: SituationItem; onClick: () => void }) {
  const reasoning = safeParseReasoning(s.reasoning);
  const snippet = reasoning?.evidenceSummary || reasoning?.analysis || null;

  return (
    <button
      onClick={onClick}
      className="wf-soft p-4 text-left hover:border-white/[0.12] transition-colors w-full"
    >
      {/* Row 1: Type + status + time */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Badge variant={s.situationType.autonomyLevel === "autonomous" ? "blue" : s.situationType.autonomyLevel === "notify" ? "purple" : "default"}>
            {s.situationType.name}
          </Badge>
          {s.editInstruction && <Badge variant="blue">Revised</Badge>}
        </div>
        <span className="text-[11px] text-white/30 flex-shrink-0">{timeAgo(s.createdAt)}</span>
      </div>

      {/* Row 2: Entity + department */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-sm text-white/80 truncate">
          {s.triggerEntityName ?? s.triggerEntityId ?? "Unknown entity"}
        </span>
        {s.departmentName && (
          <span className="text-[11px] text-white/30 flex-shrink-0 truncate max-w-[140px]">
            {s.departmentName}
          </span>
        )}
      </div>

      {/* Row 3: Severity + status + confidence */}
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <SeverityBar value={s.severity} />
          {statusBadge(s.status)}
        </div>
        <span className={`text-[11px] font-medium ${confidenceColor(s.confidence)}`}>
          {(s.confidence * 100).toFixed(0)}%
        </span>
      </div>

      {/* Row 4: Evidence snippet (2 lines) */}
      {snippet && (
        <p className="text-[11px] text-white/40 line-clamp-2 leading-relaxed">
          {snippet}
        </p>
      )}
    </button>
  );
}

// ── Detail Modal ─────────────────────────────────────────────────────────────

function DetailModal({
  situation: s, detail, detailLoading, onClose,
  showReasoning, setShowReasoning,
  activeMode, setActiveMode,
  feedbackText, setFeedbackText,
  feedbackCategory, setFeedbackCategory,
  editText, setEditText,
  outcomeValue, setOutcomeValue,
  outcomeNote, setOutcomeNote,
  resetInteraction, patchSituation,
}: {
  situation: SituationItem | null;
  detail: SituationDetail | null;
  detailLoading: boolean;
  onClose: () => void;
  showReasoning: boolean;
  setShowReasoning: (v: boolean) => void;
  activeMode: ActiveMode;
  setActiveMode: (m: ActiveMode) => void;
  feedbackText: string;
  setFeedbackText: (t: string) => void;
  feedbackCategory: string;
  setFeedbackCategory: (c: string) => void;
  editText: string;
  setEditText: (t: string) => void;
  outcomeValue: string;
  setOutcomeValue: (v: string) => void;
  outcomeNote: string;
  setOutcomeNote: (n: string) => void;
  resetInteraction: () => void;
  patchSituation: (id: string, body: Record<string, unknown>) => Promise<void>;
}) {
  if (!s) return null;

  const isThisCard = activeMode?.id === s.id;
  const currentMode = isThisCard ? activeMode!.mode : null;
  const canAct = s.status === "detected" || s.status === "proposed";
  const reasoning = detail?.reasoning ? safeParseReasoning(detail.reasoning) : null;
  const proposedAction = detail?.proposedAction;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm overflow-y-auto py-8">
      <div
        className="wf-soft max-w-2xl w-full mx-4 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-3 min-w-0">
            <Badge variant={s.situationType.autonomyLevel === "autonomous" ? "blue" : s.situationType.autonomyLevel === "notify" ? "purple" : "default"}>
              {s.situationType.name}
            </Badge>
            {statusBadge(s.status)}
            <span className="text-xs text-white/30">{timeAgo(s.createdAt)}</span>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal body */}
        <div className="px-6 py-5 space-y-5">
          {/* Entity + severity */}
          <div className="flex items-center justify-between">
            <span className="text-base text-white/90 font-medium">
              {s.triggerEntityName ?? "Unknown entity"}
            </span>
            <div className="flex items-center gap-3">
              <span className="text-xs text-white/40">Severity</span>
              <SeverityBar value={s.severity} />
              <span className={`text-xs font-medium ${confidenceColor(s.confidence)}`}>
                {(s.confidence * 100).toFixed(0)}% confidence
              </span>
            </div>
          </div>

          {detailLoading && (
            <div className="flex justify-center py-8">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-purple-400" />
            </div>
          )}

          {detail && !detailLoading && (
            <>
              {/* Revised badge */}
              {detail.editInstruction && (
                <div className="flex items-start gap-2">
                  <Badge variant="blue">Revised</Badge>
                  <p className="text-xs text-white/50 italic">&quot;{detail.editInstruction}&quot;</p>
                </div>
              )}

              {/* Proposed Action */}
              {reasoning && proposedAction ? (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-purple-300">{proposedAction.action}</span>
                    {proposedAction.connector && (
                      <span className="text-xs text-white/30">{proposedAction.connector}</span>
                    )}
                  </div>
                  <p className="text-xs text-white/60">{proposedAction.justification}</p>
                  <p className={`text-xs font-medium ${confidenceColor(reasoning.confidence)}`}>
                    AI confidence: {(reasoning.confidence * 100).toFixed(0)}%
                  </p>
                </div>
              ) : reasoning && !proposedAction ? (
                <p className="text-xs text-white/50 italic">No action recommended — please review.</p>
              ) : s.status === "reasoning" ? (
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 animate-spin rounded-full border-2 border-white/20 border-t-purple-400" />
                  <p className="text-xs text-white/40">AI is analyzing this situation...</p>
                </div>
              ) : s.status === "executing" ? (
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 animate-spin rounded-full border-2 border-white/20 border-t-emerald-400" />
                  <p className="text-xs text-white/40">Executing action...</p>
                </div>
              ) : null}

              {/* Execution error */}
              {detail.actionTaken?.error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
                  <p className="text-xs font-medium text-red-400">Execution failed</p>
                  <p className="text-xs text-red-300/70 mt-0.5">{detail.actionTaken.error}</p>
                </div>
              )}

              {/* Full reasoning toggle */}
              {reasoning && (
                <div>
                  <button
                    onClick={() => setShowReasoning(!showReasoning)}
                    className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/60 transition-colors"
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
                        <h5 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-1">Analysis</h5>
                        <p className="text-xs text-white/60">{reasoning.analysis}</p>
                      </div>

                      {/* Evidence Summary */}
                      {reasoning.evidenceSummary && (
                        <div className="bg-purple-500/5 border border-purple-500/15 rounded-lg p-3">
                          <h5 className="text-xs font-semibold text-purple-300 mb-1">Evidence</h5>
                          <p className="text-xs text-purple-200/60">{reasoning.evidenceSummary}</p>
                        </div>
                      )}

                      {/* Considered actions — handle both string[] and object[] */}
                      {reasoning.consideredActions.length > 0 && (
                        <div>
                          <h5 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">Considered Actions</h5>
                          <div className="space-y-2">
                            {reasoning.consideredActions.map((ca, i) => {
                              // If it's a plain string, render as simple text
                              if (typeof ca === "string") {
                                return (
                                  <div key={i} className="bg-white/[0.03] rounded-lg p-3">
                                    <span className="text-xs text-white/70">{ca}</span>
                                  </div>
                                );
                              }
                              // Object format with evidence
                              const hasEvidence = "evidenceFor" in ca;
                              const supportItems = hasEvidence ? (ca.evidenceFor ?? []) : (ca.pros ?? []);
                              const againstItems = hasEvidence ? (ca.evidenceAgainst ?? []) : (ca.cons ?? []);
                              return (
                                <div key={i} className="bg-white/[0.03] rounded-lg p-3 space-y-1.5">
                                  <span className="text-xs font-medium text-white/70">{ca.action}</span>
                                  {supportItems.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                      {supportItems.map((p, j) => (
                                        <span key={j} className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300">{p}</span>
                                      ))}
                                    </div>
                                  )}
                                  {againstItems.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                      {againstItems.map((c, j) => (
                                        <span key={j} className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-300">{c}</span>
                                      ))}
                                    </div>
                                  )}
                                  {ca.expectedOutcome && (
                                    <p className="text-[10px] text-white/40">{ca.expectedOutcome}</p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Missing context */}
                      {reasoning.missingContext && reasoning.missingContext.length > 0 && (
                        <div className="bg-amber-500/5 border border-amber-500/15 rounded-lg p-3">
                          <h5 className="text-xs font-semibold text-amber-300 mb-1">Missing Context</h5>
                          <ul className="space-y-0.5">
                            {reasoning.missingContext.map((mc, i) => (
                              <li key={i} className="text-xs text-amber-200/60">&bull; {mc}</li>
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
                  <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">Entity Details</h4>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                    {Object.entries(detail.contextSnapshot.triggerEntity.properties).map(([k, v]) => (
                      <div key={k} className="flex justify-between text-xs py-1 border-b border-white/[0.04]">
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
                      <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">Related Entities</h4>
                      <div className="space-y-1">
                        {all.slice(0, 5).map((e: { id: string; type: string; displayName: string; direction: string; relationship: string }) => (
                          <div key={e.id} className="flex items-center gap-2 text-xs">
                            <span className="text-white/30">{e.direction === "outgoing" ? "\u2192" : "\u2190"}</span>
                            <Badge variant="default">{e.type}</Badge>
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
                  <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">Event Timeline</h4>
                  <div className="space-y-1.5">
                    {detail.contextSnapshot.recentEvents.slice(0, 8).map((ev) => (
                      <div key={ev.id} className="flex items-center gap-3 text-xs">
                        <span className="text-white/30 w-16 text-right flex-shrink-0">{timeAgo(ev.createdAt)}</span>
                        <div className="w-1.5 h-1.5 rounded-full bg-purple-400/60 flex-shrink-0" />
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
                  <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">Prior Situations</h4>
                  <div className="space-y-2">
                    {detail.contextSnapshot.priorSituations.map((ps) => (
                      <div key={ps.id} className="flex items-start gap-2 text-xs">
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
                  <Button variant="success" size="sm" onClick={() => patchSituation(s.id, { status: "approved" })}>
                    Approve
                  </Button>
                  <Button variant="primary" size="sm" onClick={() => setActiveMode({ id: s.id, mode: "edit" })}>
                    Edit &amp; Approve
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => setActiveMode({ id: s.id, mode: "reject" })}>
                    Reject
                  </Button>
                  <Button variant="muted" size="sm" onClick={() => setActiveMode({ id: s.id, mode: "teach" })}>
                    Teach
                  </Button>
                </div>
              )}

              {/* Outcome button for resolved without outcome */}
              {detail.status === "resolved" && !detail.outcome && !currentMode && (
                <div className="pt-2 border-t border-white/[0.06]">
                  <Button variant="muted" size="sm" onClick={() => setActiveMode({ id: s.id, mode: "outcome" })}>
                    Mark Outcome
                  </Button>
                </div>
              )}

              {/* Existing outcome display */}
              {detail.outcome && (
                <div className="flex items-center gap-2 pt-2 border-t border-white/[0.06]">
                  <Badge variant={detail.outcome === "positive" ? "green" : detail.outcome === "negative" ? "red" : "default"}>
                    {detail.outcome}
                  </Badge>
                  {detail.outcomeDetails && (() => {
                    try {
                      const parsed = JSON.parse(detail.outcomeDetails);
                      return parsed.note ? <span className="text-xs text-white/40">{parsed.note}</span> : null;
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
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white/80 placeholder:text-white/30 text-sm focus:outline-none focus:border-purple-500/50"
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <Button variant="danger" size="sm" onClick={() => patchSituation(s.id, { status: "rejected", feedback: feedbackText || undefined })}>
                      Reject
                    </Button>
                    <Button variant="muted" size="sm" onClick={resetInteraction}>Cancel</Button>
                  </div>
                </div>
              )}

              {/* Teach mode */}
              {currentMode === "teach" && (
                <div className="space-y-2 pt-2 border-t border-white/[0.06]">
                  <select
                    value={feedbackCategory}
                    onChange={(e) => setFeedbackCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white/80 text-sm focus:outline-none focus:border-purple-500/50"
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
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white/80 placeholder:text-white/30 text-sm focus:outline-none focus:border-purple-500/50"
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="primary" size="sm"
                      disabled={!feedbackText.trim()}
                      onClick={() => patchSituation(s.id, {
                        feedback: feedbackText,
                        feedbackCategory: feedbackCategory || undefined,
                      })}
                    >
                      Save feedback
                    </Button>
                    <Button variant="muted" size="sm" onClick={resetInteraction}>Cancel</Button>
                  </div>
                </div>
              )}

              {/* Edit & Approve mode */}
              {currentMode === "edit" && (
                <div className="space-y-2 pt-2 border-t border-white/[0.06]">
                  <p className="text-xs text-white/40">Describe what to change. The AI will revise and re-propose.</p>
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    placeholder="e.g., Make the email tone more urgent and CC their account manager"
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white/80 placeholder:text-white/30 text-sm focus:outline-none focus:border-purple-500/50"
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="primary" size="sm"
                      disabled={!editText.trim()}
                      onClick={() => patchSituation(s.id, { editInstruction: editText })}
                    >
                      Submit Edit
                    </Button>
                    <Button variant="muted" size="sm" onClick={resetInteraction}>Cancel</Button>
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
                        className={`px-4 py-1.5 rounded-full text-xs font-medium border transition-colors ${
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
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white/80 placeholder:text-white/30 text-sm focus:outline-none focus:border-purple-500/50"
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="primary" size="sm"
                      disabled={!outcomeValue}
                      onClick={() => patchSituation(s.id, {
                        outcome: outcomeValue,
                        outcomeNote: outcomeNote || undefined,
                      })}
                    >
                      Save Outcome
                    </Button>
                    <Button variant="muted" size="sm" onClick={resetInteraction}>Cancel</Button>
                  </div>
                </div>
              )}

              {/* Existing feedback display */}
              {detail.feedback && !currentMode && (
                <div className="flex items-start gap-2 pt-2 border-t border-white/[0.06]">
                  <span className="text-xs text-white/40">Feedback:</span>
                  <span className="text-xs text-white/60">{detail.feedback}</span>
                  {detail.feedbackCategory && (
                    <Badge variant="default">{CATEGORY_LABELS[detail.feedbackCategory] ?? detail.feedbackCategory}</Badge>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
