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
  createdAt: string;
  resolvedAt: string | null;
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
  reasoning: unknown;
  feedback: string | null;
  feedbackRating: number | null;
  createdAt: string;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SituationsPage() {
  const [situations, setSituations] = useState<SituationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SituationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackFor, setFeedbackFor] = useState<string | null>(null);

  const fetchSituations = useCallback(async () => {
    try {
      const res = await fetch("/api/situations");
      if (res.ok) {
        const data = await res.json();
        setSituations(data.items);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchSituations(); }, [fetchSituations]);

  const handleDetect = async () => {
    setDetecting(true);
    try {
      const res = await fetch("/api/situations/detect", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.situationsCreated > 0) {
          await fetchSituations();
        }
      }
    } catch { /* ignore */ }
    setDetecting(false);
  };

  const handleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(id);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/situations/${id}`);
      if (res.ok) {
        setDetail(await res.json());
      }
    } catch { /* ignore */ }
    setDetailLoading(false);
  };

  const handleStatusChange = async (id: string, status: string, feedback?: string) => {
    try {
      const body: Record<string, unknown> = { status };
      if (feedback) body.feedback = feedback;
      await fetch(`/api/situations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setFeedbackFor(null);
      setFeedbackText("");
      setExpandedId(null);
      setDetail(null);
      await fetchSituations();
    } catch { /* ignore */ }
  };

  const handleTeach = async (id: string) => {
    if (!feedbackText.trim()) return;
    try {
      await fetch(`/api/situations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: feedbackText }),
      });
      setFeedbackFor(null);
      setFeedbackText("");
    } catch { /* ignore */ }
  };

  // Group situations
  const needsAttention = situations.filter((s) => ["detected", "proposed"].includes(s.status));
  const aiHandled = situations.filter((s) => s.status === "resolved" && s.source === "detected");
  const monitoring = situations.filter((s) => s.confidence < 0.5 || s.status === "reasoning");

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
            ) : (
              "Run Detection"
            )}
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
                key={s.id}
                situation={s}
                expanded={expandedId === s.id}
                detail={expandedId === s.id ? detail : null}
                detailLoading={expandedId === s.id && detailLoading}
                onToggle={() => handleExpand(s.id)}
                onApprove={() => handleStatusChange(s.id, "approved")}
                onReject={() => setFeedbackFor(s.id)}
                feedbackFor={feedbackFor}
                feedbackText={feedbackText}
                onFeedbackChange={setFeedbackText}
                onFeedbackSubmit={(text) => handleStatusChange(s.id, "rejected", text)}
                onTeach={() => { setFeedbackFor(`teach-${s.id}`); }}
                onTeachSubmit={() => handleTeach(s.id)}
                isTeachMode={feedbackFor === `teach-${s.id}`}
              />
            ))}
          </Section>
        )}

        {!loading && aiHandled.length > 0 && (
          <Section title="AI Handled" count={aiHandled.length} color="green">
            {aiHandled.map((s) => (
              <SituationCard
                key={s.id}
                situation={s}
                expanded={expandedId === s.id}
                detail={expandedId === s.id ? detail : null}
                detailLoading={expandedId === s.id && detailLoading}
                onToggle={() => handleExpand(s.id)}
              />
            ))}
          </Section>
        )}

        {!loading && monitoring.length > 0 && (
          <Section title="Monitoring" count={monitoring.length} color="default">
            {monitoring.map((s) => (
              <SituationCard
                key={s.id}
                situation={s}
                expanded={expandedId === s.id}
                detail={expandedId === s.id ? detail : null}
                detailLoading={expandedId === s.id && detailLoading}
                onToggle={() => handleExpand(s.id)}
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

// ── Situation Card ───────────────────────────────────────────────────────────

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

interface CardProps {
  situation: SituationItem;
  expanded: boolean;
  detail: SituationDetail | null;
  detailLoading: boolean;
  onToggle: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  feedbackFor?: string | null;
  feedbackText?: string;
  onFeedbackChange?: (text: string) => void;
  onFeedbackSubmit?: (text: string) => void;
  onTeach?: () => void;
  onTeachSubmit?: () => void;
  isTeachMode?: boolean;
}

function SituationCard({
  situation: s, expanded, detail, detailLoading, onToggle,
  onApprove, onReject, feedbackFor, feedbackText = "", onFeedbackChange, onFeedbackSubmit,
  onTeach, onTeachSubmit, isTeachMode,
}: CardProps) {
  const isRejectMode = feedbackFor === s.id;

  return (
    <div className="wf-soft overflow-hidden">
      {/* Collapsed view */}
      <button onClick={onToggle} className="w-full px-5 py-4 text-left hover:bg-white/[0.02] transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Badge variant={s.status === "detected" ? "amber" : s.status === "resolved" ? "green" : "default"}>
              {s.situationType.name}
            </Badge>
            <span className="text-xs text-white/40">{timeAgo(s.createdAt)}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-white/40">Severity</span>
            <SeverityBar value={s.severity} />
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <div>
            <span className="text-sm text-white/80">{s.triggerEntityName ?? s.triggerEntityId ?? "Unknown entity"}</span>
          </div>
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

              {/* AI Reasoning placeholder */}
              <div>
                <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">AI Reasoning</h4>
                <p className="text-xs text-white/30 italic">Reasoning will appear here once the AI analyzes this situation.</p>
              </div>

              {/* Action Buttons */}
              {(s.status === "detected" || s.status === "proposed") && (
                <div className="flex items-center gap-2 pt-2 border-t border-white/[0.06]">
                  {onApprove && (
                    <Button variant="success" size="sm" onClick={onApprove}>
                      Approve
                    </Button>
                  )}
                  {onReject && !isRejectMode && (
                    <Button variant="danger" size="sm" onClick={onReject}>
                      Reject
                    </Button>
                  )}
                  {onTeach && !isTeachMode && (
                    <Button variant="muted" size="sm" onClick={onTeach}>
                      Teach
                    </Button>
                  )}
                </div>
              )}

              {/* Reject feedback */}
              {isRejectMode && (
                <div className="space-y-2">
                  <textarea
                    value={feedbackText}
                    onChange={(e) => onFeedbackChange?.(e.target.value)}
                    placeholder="Why is this not a real situation? Your feedback improves detection..."
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white/80 placeholder:text-white/30 text-sm focus:outline-none focus:border-purple-500/50"
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <Button variant="danger" size="sm" onClick={() => onFeedbackSubmit?.(feedbackText)}>
                      Reject with feedback
                    </Button>
                    <Button variant="muted" size="sm" onClick={() => onFeedbackChange?.("")}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {/* Teach feedback */}
              {isTeachMode && (
                <div className="space-y-2">
                  <textarea
                    value={feedbackText}
                    onChange={(e) => onFeedbackChange?.(e.target.value)}
                    placeholder="Teach the AI about this situation — what context is it missing?"
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white/80 placeholder:text-white/30 text-sm focus:outline-none focus:border-purple-500/50"
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <Button variant="primary" size="sm" onClick={onTeachSubmit}>
                      Save feedback
                    </Button>
                    <Button variant="muted" size="sm" onClick={() => onFeedbackChange?.("")}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
