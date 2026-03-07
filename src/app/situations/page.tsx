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
  reasoning: ReasoningData | null;
  proposedAction: ProposedAction | null;
  editInstruction: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

interface ReasoningData {
  analysis: string;
  consideredActions: Array<{
    action: string;
    pros: string[];
    cons: string[];
    expectedOutcome: string;
  }>;
  chosenAction: ProposedAction | null;
  confidence: number;
  missingContext: string[] | null;
}

interface ProposedAction {
  action: string;
  connector: string;
  params: Record<string, unknown>;
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
    neighborhood?: { entities: Array<{ id: string; type: string; displayName: string; relationshipType: string; direction: string; properties: Record<string, string> }> };
    recentEvents?: Array<{ id: string; source: string; eventType: string; createdAt: string }>;
    priorSituations?: Array<{ id: string; triggerEntityName: string; status: string; outcome: string | null; feedback: string | null; actionTaken: unknown; createdAt: string }>;
  } | null;
  currentEntityState: { id: string; displayName: string; typeName: string; properties: Record<string, string> } | null;
  reasoning: ReasoningData | null;
  proposedAction: ProposedAction | null;
  feedback: string | null;
  feedbackRating: number | null;
  feedbackCategory: string | null;
  editInstruction: string | null;
  outcome: string | null;
  outcomeDetails: string | null;
  createdAt: string;
}

type ActiveMode = { id: string; mode: "reject" | "teach" | "edit" | "outcome" } | null;

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SituationsPage() {
  const [situations, setSituations] = useState<SituationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SituationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Interaction state
  const [activeMode, setActiveMode] = useState<ActiveMode>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackCategory, setFeedbackCategory] = useState("");
  const [editText, setEditText] = useState("");
  const [outcomeValue, setOutcomeValue] = useState("");
  const [outcomeNote, setOutcomeNote] = useState("");
  const [showReasoning, setShowReasoning] = useState<string | null>(null);

  const resetInteraction = () => {
    setActiveMode(null);
    setFeedbackText("");
    setFeedbackCategory("");
    setEditText("");
    setOutcomeValue("");
    setOutcomeNote("");
  };

  const fetchSituations = useCallback(async () => {
    try {
      const res = await fetch("/api/situations?status=detected,proposed,reasoning,auto_executing,resolved");
      if (res.ok) {
        const data = await res.json();
        setSituations(data.items);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchSituations(); }, [fetchSituations]);

  // 15-second polling
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

  const handleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      resetInteraction();
      return;
    }
    setExpandedId(id);
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
      resetInteraction();
      setExpandedId(null);
      setDetail(null);
      await fetchSituations();
    } catch {}
  };

  // Group situations
  const needsAttention = situations.filter((s) => ["detected", "proposed"].includes(s.status));
  const aiHandled = situations.filter((s) => s.status === "resolved" && s.source === "detected");
  const monitoring = situations.filter((s) => s.confidence < 0.5 || s.status === "reasoning" || s.status === "auto_executing");

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
              <SituationCard
                key={s.id} situation={s}
                expanded={expandedId === s.id} detail={expandedId === s.id ? detail : null}
                detailLoading={expandedId === s.id && detailLoading}
                onToggle={() => handleExpand(s.id)}
                activeMode={activeMode} setActiveMode={setActiveMode}
                feedbackText={feedbackText} setFeedbackText={setFeedbackText}
                feedbackCategory={feedbackCategory} setFeedbackCategory={setFeedbackCategory}
                editText={editText} setEditText={setEditText}
                outcomeValue={outcomeValue} setOutcomeValue={setOutcomeValue}
                outcomeNote={outcomeNote} setOutcomeNote={setOutcomeNote}
                resetInteraction={resetInteraction}
                patchSituation={patchSituation}
                showReasoning={showReasoning} setShowReasoning={setShowReasoning}
              />
            ))}
          </Section>
        )}

        {!loading && aiHandled.length > 0 && (
          <Section title="AI Handled" count={aiHandled.length} color="green">
            {aiHandled.map((s) => (
              <SituationCard
                key={s.id} situation={s}
                expanded={expandedId === s.id} detail={expandedId === s.id ? detail : null}
                detailLoading={expandedId === s.id && detailLoading}
                onToggle={() => handleExpand(s.id)}
                activeMode={activeMode} setActiveMode={setActiveMode}
                feedbackText={feedbackText} setFeedbackText={setFeedbackText}
                feedbackCategory={feedbackCategory} setFeedbackCategory={setFeedbackCategory}
                editText={editText} setEditText={setEditText}
                outcomeValue={outcomeValue} setOutcomeValue={setOutcomeValue}
                outcomeNote={outcomeNote} setOutcomeNote={setOutcomeNote}
                resetInteraction={resetInteraction}
                patchSituation={patchSituation}
                showReasoning={showReasoning} setShowReasoning={setShowReasoning}
              />
            ))}
          </Section>
        )}

        {!loading && monitoring.length > 0 && (
          <Section title="Monitoring" count={monitoring.length} color="default">
            {monitoring.map((s) => (
              <SituationCard
                key={s.id} situation={s}
                expanded={expandedId === s.id} detail={expandedId === s.id ? detail : null}
                detailLoading={expandedId === s.id && detailLoading}
                onToggle={() => handleExpand(s.id)}
                activeMode={activeMode} setActiveMode={setActiveMode}
                feedbackText={feedbackText} setFeedbackText={setFeedbackText}
                feedbackCategory={feedbackCategory} setFeedbackCategory={setFeedbackCategory}
                editText={editText} setEditText={setEditText}
                outcomeValue={outcomeValue} setOutcomeValue={setOutcomeValue}
                outcomeNote={outcomeNote} setOutcomeNote={setOutcomeNote}
                resetInteraction={resetInteraction}
                patchSituation={patchSituation}
                showReasoning={showReasoning} setShowReasoning={setShowReasoning}
              />
            ))}
          </Section>
        )}
      </div>
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
      {open && <div className="space-y-2">{children}</div>}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// ── Situation Card ───────────────────────────────────────────────────────────

interface CardProps {
  situation: SituationItem;
  expanded: boolean;
  detail: SituationDetail | null;
  detailLoading: boolean;
  onToggle: () => void;
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
  showReasoning: string | null;
  setShowReasoning: (id: string | null) => void;
}

function SituationCard({
  situation: s, expanded, detail, detailLoading, onToggle,
  activeMode, setActiveMode,
  feedbackText, setFeedbackText,
  feedbackCategory, setFeedbackCategory,
  editText, setEditText,
  outcomeValue, setOutcomeValue,
  outcomeNote, setOutcomeNote,
  resetInteraction, patchSituation,
  showReasoning, setShowReasoning,
}: CardProps) {
  const isThisCard = activeMode?.id === s.id;
  const currentMode = isThisCard ? activeMode!.mode : null;
  const canAct = s.status === "detected" || s.status === "proposed";

  const statusBadgeVariant = s.status === "detected" ? "amber" as const
    : s.status === "proposed" ? "purple" as const
    : s.status === "resolved" ? "green" as const
    : "default" as const;

  return (
    <div className="wf-soft overflow-hidden">
      {/* Collapsed view */}
      <button onClick={onToggle} className="w-full px-5 py-4 text-left hover:bg-white/[0.02] transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Badge variant={statusBadgeVariant}>{s.situationType.name}</Badge>
            {s.editInstruction && <Badge variant="blue">Revised</Badge>}
            <span className="text-xs text-white/40">{timeAgo(s.createdAt)}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-white/40">Severity</span>
            <SeverityBar value={s.severity} />
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-sm text-white/80">{s.triggerEntityName ?? s.triggerEntityId ?? "Unknown entity"}</span>
          <span className="text-xs text-white/40">Confidence: {(s.confidence * 100).toFixed(0)}%</span>
        </div>
      </button>

      {/* Expanded view */}
      {expanded && (
        <div className="border-t border-white/[0.06] px-5 py-4 space-y-5">
          {detailLoading && (
            <div className="flex justify-center py-4">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-purple-400" />
            </div>
          )}

          {detail && !detailLoading && (
            <>
              {/* 1. Revised badge */}
              {detail.editInstruction && (
                <div className="flex items-start gap-2">
                  <Badge variant="blue">Revised</Badge>
                  <p className="text-xs text-white/50 italic">&quot;{detail.editInstruction}&quot;</p>
                </div>
              )}

              {/* 2. Proposed Action */}
              {detail.reasoning && detail.proposedAction ? (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-purple-300">{detail.proposedAction.action}</span>
                    <span className="text-xs text-white/30">{detail.proposedAction.connector}</span>
                  </div>
                  <p className="text-xs text-white/60">{detail.proposedAction.justification}</p>
                  <p className={`text-xs font-medium ${confidenceColor(detail.reasoning.confidence)}`}>
                    AI confidence: {(detail.reasoning.confidence * 100).toFixed(0)}%
                  </p>
                </div>
              ) : detail.reasoning && !detail.proposedAction ? (
                <p className="text-xs text-white/50 italic">No action recommended — please review.</p>
              ) : s.status === "reasoning" ? (
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 animate-spin rounded-full border-2 border-white/20 border-t-purple-400" />
                  <p className="text-xs text-white/40">AI is analyzing this situation...</p>
                </div>
              ) : null}

              {/* 3. Full reasoning toggle */}
              {detail.reasoning && (
                <div>
                  <button
                    onClick={() => setShowReasoning(showReasoning === s.id ? null : s.id)}
                    className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/60 transition-colors"
                  >
                    <svg className={`w-3 h-3 transition-transform ${showReasoning === s.id ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                    {showReasoning === s.id ? "Hide full reasoning" : "Show full reasoning"}
                  </button>

                  {showReasoning === s.id && (
                    <div className="mt-3 space-y-4 pl-4 border-l border-white/[0.06]">
                      {/* Analysis */}
                      <div>
                        <h5 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-1">Analysis</h5>
                        <p className="text-xs text-white/60">{detail.reasoning.analysis}</p>
                      </div>

                      {/* Considered actions */}
                      {detail.reasoning.consideredActions.length > 0 && (
                        <div>
                          <h5 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">Considered Actions</h5>
                          <div className="space-y-2">
                            {detail.reasoning.consideredActions.map((ca, i) => (
                              <div key={i} className="bg-white/[0.03] rounded-lg p-3 space-y-1.5">
                                <span className="text-xs font-medium text-white/70">{ca.action}</span>
                                {ca.pros.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {ca.pros.map((p, j) => (
                                      <span key={j} className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300">{p}</span>
                                    ))}
                                  </div>
                                )}
                                {ca.cons.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {ca.cons.map((c, j) => (
                                      <span key={j} className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-300">{c}</span>
                                    ))}
                                  </div>
                                )}
                                <p className="text-[10px] text-white/40">{ca.expectedOutcome}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Missing context */}
                      {detail.reasoning.missingContext && detail.reasoning.missingContext.length > 0 && (
                        <div className="bg-amber-500/5 border border-amber-500/15 rounded-lg p-3">
                          <h5 className="text-xs font-semibold text-amber-300 mb-1">Missing Context</h5>
                          <ul className="space-y-0.5">
                            {detail.reasoning.missingContext.map((mc, i) => (
                              <li key={i} className="text-xs text-amber-200/60">• {mc}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* 4. Entity Details */}
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
              {detail.contextSnapshot?.neighborhood?.entities && detail.contextSnapshot.neighborhood.entities.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">Related Entities</h4>
                  <div className="space-y-1">
                    {detail.contextSnapshot.neighborhood.entities.slice(0, 5).map((e) => (
                      <div key={e.id} className="flex items-center gap-2 text-xs">
                        <span className="text-white/30">{e.direction === "outgoing" ? "\u2192" : "\u2190"}</span>
                        <Badge variant="default">{e.type}</Badge>
                        <span className="text-white/70">{e.displayName}</span>
                        <span className="text-white/30">({e.relationshipType})</span>
                      </div>
                    ))}
                  </div>
                </div>
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

              {/* 5. Action buttons */}
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

              {/* 6. Outcome button for resolved without outcome */}
              {detail.status === "resolved" && !detail.outcome && !currentMode && (
                <div className="pt-2 border-t border-white/[0.06]">
                  <Button variant="muted" size="sm" onClick={() => setActiveMode({ id: s.id, mode: "outcome" })}>
                    Mark Outcome
                  </Button>
                </div>
              )}

              {/* 7. Existing outcome display */}
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
      )}
    </div>
  );
}
