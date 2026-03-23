"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { ContextualChat } from "@/components/contextual-chat";
import { useIsMobile } from "@/hooks/use-media-query";
import { useTranslations, useLocale } from "next-intl";
import { formatRelativeTime } from "@/lib/format-helpers";
import { getPreviewComponent } from "@/components/execution/previews/get-preview-component";

// ── Types ────────────────────────────────────────────────────────────────────

interface InitiativeItem {
  id: string;
  goalId: string;
  goalTitle: string;
  aiEntityId: string;
  aiEntityName: string | null;
  status: string;
  rationale: string;
  impactAssessment: string | null;
  executionPlanId: string | null;
  planStatus: string | null;
  totalSteps: number;
  completedSteps: number;
  createdAt: string;
}

interface InitiativeDetail {
  id: string;
  goalId: string;
  goal: { id: string; title: string; description: string; departmentId: string | null };
  aiEntityId: string;
  aiEntityName: string | null;
  status: string;
  rationale: string;
  impactAssessment: string | null;
  executionPlanId: string | null;
  planStatus: string | null;
  steps: StepData[];
  createdAt: string;
  updatedAt: string;
}

interface StepData {
  id: string;
  sequenceOrder: number;
  title: string;
  description: string;
  executionMode: string;
  status: string;
  assignedUserId: string | null;
  parameters: Record<string, unknown> | null;
  actionCapability: { id: string; slug: string | null; name: string } | null;
  outputResult: unknown;
  approvedAt: string | null;
  approvedById: string | null;
  executedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function statusColor(status: string): string {
  switch (status) {
    case "proposed": return "#f59e0b";
    case "approved":
    case "executing": return "#c084fc";
    case "completed": return "#22c55e";
    case "rejected":
    case "failed": return "#ef4444";
    case "paused": return "#6b7280";
    default: return "#6b7280";
  }
}

function statusLabel(item: InitiativeItem): string {
  if (item.status === "executing" && item.totalSteps > 0) {
    return `Step ${item.completedSteps + 1}/${item.totalSteps}`;
  }
  return item.status.charAt(0).toUpperCase() + item.status.slice(1);
}

const ACTIVE_STATUSES = ["proposed", "approved", "executing"];

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

// ── Page ─────────────────────────────────────────────────────────────────────

export default function InitiativesPage() {
  const t = useTranslations("initiatives");
  const tc = useTranslations("common");
  const locale = useLocale();
  const isMobile = useIsMobile();
  const [initiatives, setInitiatives] = useState<InitiativeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<InitiativeDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [filter, setFilter] = useState<"active" | "all">("active");

  // ── Fetch list ───────────────────────────────────────────────────────────

  const fetchInitiatives = useCallback(async () => {
    try {
      const res = await fetch("/api/initiatives");
      if (res.ok) {
        const data = await res.json();
        setInitiatives(data.items);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchInitiatives(); }, [fetchInitiatives]);

  // ── Fetch detail ─────────────────────────────────────────────────────────

  const fetchDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/initiatives/${id}`);
      if (res.ok) setDetail(await res.json());
    } catch {}
    setDetailLoading(false);
  }, []);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    let cancelled = false;
    setDetail(null);
    setDetailLoading(true);
    fetch(`/api/initiatives/${selectedId}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (!cancelled && data) setDetail(data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId]);

  // ── Derived ────────────────────────────────────────────────────────────

  const filteredInitiatives = useMemo(() =>
    filter === "active"
      ? initiatives.filter(i => ACTIVE_STATUSES.includes(i.status))
      : initiatives,
    [initiatives, filter],
  );

  // Clear selection when filtered out
  useEffect(() => {
    if (selectedId && !filteredInitiatives.some(i => i.id === selectedId)) {
      setSelectedId(null);
    }
  }, [filteredInitiatives, selectedId]);

  // ── Actions ────────────────────────────────────────────────────────────

  const patchInitiative = async (id: string, body: Record<string, unknown>) => {
    try {
      await fetch(`/api/initiatives/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await fetchInitiatives();
      if (selectedId) fetchDetail(selectedId);
    } catch {}
  };

  const advanceStep = async (planId: string, stepId: string, action: "approve" | "skip") => {
    try {
      await fetch(`/api/execution-plans/${planId}/steps/${stepId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      await fetchInitiatives();
      if (selectedId) fetchDetail(selectedId);
    } catch {}
  };

  const completeHumanStep = async (planId: string, stepId: string, notes: string) => {
    try {
      await fetch(`/api/execution-plans/${planId}/steps/${stepId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      await fetchInitiatives();
      if (selectedId) fetchDetail(selectedId);
    } catch {}
  };

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <AppShell>
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── Left: initiative list ── */}
        {(!isMobile || !selectedId) && (
        <div className={`${isMobile ? "w-full" : "w-[300px]"} flex-shrink-0 flex flex-col overflow-hidden`} style={{ borderRight: isMobile ? "none" : "1px solid #1e1e1e" }}>
          {/* Header */}
          <div className="px-4 py-3 flex-shrink-0" style={{ borderBottom: "1px solid #1e1e1e" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#e8e8e8" }}>{t("title")}</div>
            <div style={{ fontSize: 11, color: "#707070" }} className="mt-0.5">
              {t("subtitle")}
            </div>
          </div>

          {/* Filter tabs */}
          <div className="px-4 py-2 flex gap-1.5 flex-shrink-0" style={{ borderBottom: "1px solid #1e1e1e" }}>
            {(["active", "all"] as const).map(f => (
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
                {f === "active" ? tc("active") : tc("all")}
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
            {filteredInitiatives.map(item => (
              <button
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                className="w-full text-left px-4 py-2.5 transition"
                style={{
                  borderBottom: "1px solid #1e1e1e",
                  borderLeft: selectedId === item.id ? "2px solid #c084fc" : "2px solid transparent",
                  background: selectedId === item.id ? "#181818" : "transparent",
                }}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="flex-shrink-0" style={{ width: 7, height: 7, borderRadius: "50%", background: statusColor(item.status) }} />
                  <span style={{ fontSize: 13, fontWeight: 500, color: "#e8e8e8" }} className="truncate flex-1">
                    {item.rationale.split(/[.!?\n]/)[0] || "Untitled initiative"}
                  </span>
                  <span style={{ fontSize: 11, color: "#484848" }} className="flex-shrink-0">
                    {formatRelativeTime(item.createdAt, locale)}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "#484848" }} className="pl-[15px] truncate">
                  {item.aiEntityName ?? "AI"} &middot; {statusLabel(item)}
                </div>
              </button>
            ))}
            {!loading && filteredInitiatives.length === 0 && (
              <div className="px-4 py-8 text-center" style={{ fontSize: 13, color: "#484848" }}>
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
            <button onClick={() => setSelectedId(null)} className="flex items-center gap-1.5 px-4 py-3 text-sm text-white/50 hover:text-white/70 min-h-[44px]">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
              Back
            </button>
          )}
          {selectedId && detail ? (
            <>
              <div className="flex-1 overflow-y-auto">
                <DetailPane
                  key={selectedId}
                  detail={detail}
                  detailLoading={detailLoading}
                  patchInitiative={patchInitiative}
                  advanceStep={advanceStep}
                  completeHumanStep={completeHumanStep}
                  onRefresh={() => { if (selectedId) fetchDetail(selectedId); }}
                />
              </div>
              <ContextualChat
                contextType="initiative"
                contextId={detail.id}
                placeholder={t("discuss")}
                hints={[t("hintRoi"), t("hintDependencies")]}
              />
            </>
          ) : selectedId && detailLoading ? (
            <div className="flex justify-center py-16">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#2a2a2a] border-t-[#707070]" />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full" style={{ fontSize: 13, color: "#484848" }}>
              {t("selectInitiative")}
            </div>
          )}
        </div>
        )}

      </div>
    </AppShell>
  );
}

// ── Detail Pane ──────────────────────────────────────────────────────────────

function DetailPane({
  detail: d,
  detailLoading,
  patchInitiative,
  advanceStep,
  completeHumanStep,
  onRefresh,
}: {
  detail: InitiativeDetail;
  detailLoading: boolean;
  patchInitiative: (id: string, body: Record<string, unknown>) => Promise<void>;
  advanceStep: (planId: string, stepId: string, action: "approve" | "skip") => Promise<void>;
  completeHumanStep: (planId: string, stepId: string, notes: string) => Promise<void>;
  onRefresh: () => void;
}) {
  const t = useTranslations("initiatives");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [showPlan, setShowPlan] = useState(false);
  const [showImpact, setShowImpact] = useState(false);
  const [humanNotes, setHumanNotes] = useState("");

  const canAct = d.status === "proposed";
  const isExecuting = d.status === "executing" || d.status === "approved";

  return (
    <div className="px-6 py-5 space-y-5">
      {/* ── Header ── */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Badge variant={
            d.status === "completed" ? "green"
              : d.status === "rejected" || d.status === "failed" ? "red"
              : d.status === "proposed" ? "amber"
              : "default"
          }>
            {d.status.charAt(0).toUpperCase() + d.status.slice(1)}
          </Badge>
          <span style={{ fontSize: 12, color: "#707070" }}>{d.aiEntityName ?? "AI"}</span>
          <span style={{ fontSize: 12, color: "#484848" }}>{formatRelativeTime(d.createdAt, locale)}</span>
        </div>

        <h1 className="font-heading" style={{ fontSize: 18, fontWeight: 600, color: "#e8e8e8" }}>
          {d.rationale.split(/[.!?\n]/)[0] || "Untitled initiative"}
        </h1>

        {d.goal && (
          <p style={{ fontSize: 13, color: "#707070" }} className="mt-1">
            Goal: {d.goal.title}
          </p>
        )}
      </div>

      {detailLoading && (
        <div className="flex justify-center py-8">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#2a2a2a] border-t-[#707070]" />
        </div>
      )}

      {/* ── Rationale ── */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "#484848", textTransform: "uppercase" as const }} className="mb-2">
          {t("rationale")}
        </div>
        <div style={{ padding: "14px 16px", background: "#161616", border: "1px solid #222", borderRadius: 4 }}>
          <p style={{ fontSize: 13, lineHeight: 1.65, color: "#b0b0b0", whiteSpace: "pre-wrap" }}>{d.rationale}</p>
        </div>
      </div>

      {/* ── Action buttons ── */}
      {canAct && (
        <div className="flex items-center gap-2 pt-2" style={{ borderTop: "1px solid #1e1e1e" }}>
          <button
            className="rounded-full text-[13px] font-medium px-4 py-1.5 transition hover:opacity-90"
            style={{ background: "#16a34a", color: "#fff" }}
            onClick={() => patchInitiative(d.id, { status: "approved" })}
          >
            {tc("approve")}
          </button>
          <button
            className="wf-btn-danger rounded-full text-[13px] font-medium px-4 py-1.5"
            onClick={() => patchInitiative(d.id, { status: "rejected" })}
          >
            {tc("reject")}
          </button>
        </div>
      )}

      {/* ── Execution Plan (collapsible) ── */}
      {d.steps.length > 0 && (
        <div>
          <button
            onClick={() => setShowPlan(!showPlan)}
            className="flex items-center gap-1.5 transition-colors hover:text-[#707070]"
            style={{ fontSize: 12, color: "#484848" }}
          >
            <svg className={`w-3 h-3 transition-transform ${showPlan ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            {t("executionPlan")} &middot; {d.steps.length} steps
            {d.planStatus && (
              <span style={{
                fontSize: 10,
                fontWeight: 500,
                padding: "1px 6px",
                borderRadius: 3,
                marginLeft: 4,
                background: d.planStatus === "completed" ? "rgba(34,197,94,0.1)" : d.planStatus === "failed" ? "rgba(239,68,68,0.1)" : "rgba(168,85,247,0.1)",
                color: d.planStatus === "completed" ? "#22c55e" : d.planStatus === "failed" ? "#ef4444" : "#c084fc",
              }}>
                {d.planStatus}
              </span>
            )}
          </button>

          {showPlan && (
            <div className="mt-3" style={{ background: "#161616", border: "1px solid #222", borderRadius: 4, overflow: "hidden" }}>
              {d.steps.map((step, i) => {
                const isCompleted = step.status === "completed" || step.status === "skipped";
                const isAwaitingApproval = step.status === "awaiting_approval";
                const isHumanExecuting = step.status === "executing" && step.executionMode === "human_task";
                const isActive = isAwaitingApproval || isHumanExecuting || step.status === "executing" || step.status === "approved";
                const isPending = step.status === "pending";
                const isFailed = step.status === "failed";

                return (
                  <div
                    key={step.id}
                    style={{
                      padding: "12px 16px",
                      borderBottom: i < d.steps.length - 1 ? "1px solid #1e1e1e" : "none",
                      opacity: isPending ? 0.5 : 1,
                      background: isActive ? "rgba(168,85,247,0.04)" : "transparent",
                      borderLeft: isActive ? "3px solid rgba(168,85,247,0.4)" : "3px solid transparent",
                    }}
                  >
                    <div className="flex items-start gap-3">
                      {/* Step number / status */}
                      <div className="flex-shrink-0 mt-0.5" style={{ width: 20, textAlign: "center" }}>
                        {isCompleted ? (
                          <span style={{ color: "#22c55e", fontSize: 14 }}>&#10003;</span>
                        ) : isFailed ? (
                          <span style={{ color: "#ef4444", fontSize: 14 }}>&#10007;</span>
                        ) : (
                          <span style={{ fontSize: 12, fontWeight: 600, color: isActive ? "#c084fc" : "#484848" }}>
                            {step.sequenceOrder}
                          </span>
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
                        <p style={{ fontSize: 12, color: "#707070", marginTop: 2 }}>
                          {step.description}
                        </p>
                        {/* Action preview */}
                        {step.parameters && (() => {
                          const PreviewComponent = getPreviewComponent(step);
                          return (
                            <div className="mt-2">
                              <PreviewComponent
                                step={step}
                                isEditable={step.status === "pending"}
                                onParametersUpdate={async (params) => {
                                  await fetch(`/api/execution-steps/${step.id}/parameters`, {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ parameters: params }),
                                  });
                                  onRefresh();
                                }}
                                locale={locale}
                              />
                            </div>
                          );
                        })()}
                        {step.errorMessage && (
                          <p style={{ fontSize: 11, color: "#ef4444", marginTop: 4 }}>{step.errorMessage}</p>
                        )}

                        {/* Step actions for awaiting_approval */}
                        {isAwaitingApproval && isExecuting && d.executionPlanId && (
                          <div className="flex items-center gap-2 mt-3">
                            <button
                              className="rounded-full text-[12px] font-medium px-3 py-1 transition hover:opacity-90"
                              style={{ background: "#16a34a", color: "#fff" }}
                              onClick={() => advanceStep(d.executionPlanId!, step.id, "approve")}
                            >
                              {t("approveStep")}
                            </button>
                            <button
                              className="rounded-full text-[12px] font-medium px-3 py-1 transition"
                              style={{ background: "#222", border: "1px solid #333", color: "#b0b0b0" }}
                              onClick={() => advanceStep(d.executionPlanId!, step.id, "skip")}
                            >
                              {tc("skip")}
                            </button>
                          </div>
                        )}

                        {/* Human task completion */}
                        {isHumanExecuting && d.executionPlanId && (
                          <div className="mt-3 space-y-2">
                            <textarea
                              value={humanNotes}
                              onChange={e => setHumanNotes(e.target.value)}
                              placeholder={t("humanTaskPlaceholder")}
                              className="w-full outline-none"
                              style={{ background: "#111", border: "1px solid #333", borderRadius: 4, padding: "8px 12px", fontSize: 13, color: "#e8e8e8", resize: "vertical", fontFamily: "inherit" }}
                              rows={2}
                            />
                            <button
                              className="rounded-full text-[12px] font-medium px-3 py-1 transition hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                              style={{ background: "#16a34a", color: "#fff" }}
                              disabled={!humanNotes.trim()}
                              onClick={() => {
                                completeHumanStep(d.executionPlanId!, step.id, humanNotes.trim());
                                setHumanNotes("");
                              }}
                            >
                              {t("markComplete")}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Impact Assessment (collapsible) ── */}
      {d.impactAssessment && (
        <div>
          <button
            onClick={() => setShowImpact(!showImpact)}
            className="flex items-center gap-1.5 transition-colors hover:text-[#707070]"
            style={{ fontSize: 12, color: "#484848" }}
          >
            <svg className={`w-3 h-3 transition-transform ${showImpact ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            {t("impactAssessment")}
          </button>

          {showImpact && (
            <div className="mt-3" style={{ padding: "14px 16px", background: "#161616", border: "1px solid #222", borderRadius: 4 }}>
              <p style={{ fontSize: 13, lineHeight: 1.65, color: "#b0b0b0", whiteSpace: "pre-wrap" }}>{d.impactAssessment}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
