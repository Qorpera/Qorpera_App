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

interface ProposedProjectConfig {
  title: string;
  description: string;
  members: Array<{ name: string; email: string; role: string }>;
  deliverables: Array<{ title: string; description: string; assignedToEmail: string; format: string; suggestedDeadline: string | null }>;
}

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
  proposedProjectConfig: ProposedProjectConfig | null;
  projectId: string | null;
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
  proposedProjectConfig: ProposedProjectConfig | null;
  projectId: string | null;
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
    case "proposed": return "var(--warn)";
    case "approved":
    case "executing": return "var(--accent)";
    case "completed": return "var(--ok)";
    case "rejected":
    case "failed": return "var(--danger)";
    case "paused": return "var(--fg3)";
    default: return "var(--fg3)";
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
  action: { bg: "var(--accent-light)", color: "var(--accent)", label: "action" },
  generate: { bg: "color-mix(in srgb, var(--info) 12%, transparent)", color: "var(--info)", label: "generate" },
  human_task: { bg: "color-mix(in srgb, var(--warn) 12%, transparent)", color: "var(--warn)", label: "human task" },
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
      const res = await fetch(`/api/initiatives/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.projectId) {
          window.location.href = `/projects/${data.projectId}`;
          return;
        }
        fetchInitiatives();
        if (selectedId === id) fetchDetail(id);
      }
    } catch (err) {
      console.error("Failed to update initiative:", err);
    }
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
        <div className={`${isMobile ? "w-full" : "w-[300px]"} flex-shrink-0 flex flex-col overflow-hidden`} style={{ borderRight: isMobile ? "none" : "1px solid var(--border)" }}>
          {/* Header */}
          <div className="px-4 py-3 flex-shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--foreground)" }}>{t("title")}</div>
            <div style={{ fontSize: 11, color: "var(--fg3)" }} className="mt-0.5">
              {t("subtitle")}
            </div>
          </div>

          {/* Filter tabs */}
          <div className="px-4 py-2 flex gap-1.5 flex-shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
            {(["active", "all"] as const).map(f => (
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
                {f === "active" ? tc("active") : tc("all")}
              </button>
            ))}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {loading && (
              <div className="flex justify-center py-10">
                <div className="h-4 w-4 animate-spin rounded-full border border-border border-t-muted" />
              </div>
            )}
            {filteredInitiatives.map(item => (
              <button
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                className="w-full text-left px-4 py-2.5 transition"
                style={{
                  borderBottom: "1px solid var(--border)",
                  borderLeft: selectedId === item.id ? "2px solid var(--accent)" : "2px solid transparent",
                  background: selectedId === item.id ? "var(--hover)" : "transparent",
                }}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="flex-shrink-0" style={{ width: 7, height: 7, borderRadius: "50%", background: statusColor(item.status) }} />
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground)" }} className="truncate flex-1">
                    {item.rationale.split(/[.!?\n]/)[0] || "Untitled initiative"}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--fg4)" }} className="flex-shrink-0">
                    {formatRelativeTime(item.createdAt, locale)}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "var(--fg4)" }} className="pl-[15px] truncate">
                  {item.aiEntityName ?? "AI"} &middot; {statusLabel(item)}
                </div>
              </button>
            ))}
            {!loading && filteredInitiatives.length === 0 && (
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
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-muted" />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full" style={{ fontSize: 13, color: "var(--fg4)" }}>
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
          <span style={{ fontSize: 12, color: "var(--fg3)" }}>{d.aiEntityName ?? "AI"}</span>
          <span style={{ fontSize: 12, color: "var(--fg4)" }}>{formatRelativeTime(d.createdAt, locale)}</span>
        </div>

        <h1 className="font-heading" style={{ fontSize: 18, fontWeight: 600, color: "var(--foreground)" }}>
          {d.rationale.split(/[.!?\n]/)[0] || "Untitled initiative"}
        </h1>

        {d.goal && (
          <p style={{ fontSize: 13, color: "var(--fg3)" }} className="mt-1">
            Goal: {d.goal.title}
          </p>
        )}
      </div>

      {detailLoading && (
        <div className="flex justify-center py-8">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-muted" />
        </div>
      )}

      {/* ── Rationale ── */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "var(--fg4)", textTransform: "uppercase" as const }} className="mb-2">
          {t("rationale")}
        </div>
        <div style={{ padding: "14px 16px", background: "var(--surface)", border: "1px solid var(--elevated)", borderRadius: 4 }}>
          <p style={{ fontSize: 13, lineHeight: 1.65, color: "var(--fg2)", whiteSpace: "pre-wrap" }}>{d.rationale}</p>
        </div>
      </div>

      {/* ── Proposed Project ── */}
      {d.proposedProjectConfig && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "var(--fg4)", textTransform: "uppercase" as const }} className="mb-2">
            Proposed Project
          </div>
          <div style={{ padding: "14px 16px", background: "var(--surface)", border: "1px solid var(--elevated)", borderRadius: 8 }} className="space-y-3">
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>
                {d.proposedProjectConfig.title}
              </p>
              {d.proposedProjectConfig.description && (
                <p style={{ fontSize: 12, color: "var(--fg2)", marginTop: 4, lineHeight: 1.5 }}>
                  {d.proposedProjectConfig.description}
                </p>
              )}
            </div>

            {d.proposedProjectConfig.deliverables?.length > 0 && (
              <div>
                <p style={{ fontSize: 11, fontWeight: 600, color: "var(--fg3)", marginBottom: 6 }}>
                  Deliverables ({d.proposedProjectConfig.deliverables.length})
                </p>
                {d.proposedProjectConfig.deliverables.map((del, i) => (
                  <div key={i} className="flex items-start gap-2 py-1.5" style={{ borderTop: i > 0 ? "1px solid var(--border)" : "none" }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", marginTop: 5, flexShrink: 0 }} />
                    <div>
                      <p style={{ fontSize: 12, color: "var(--foreground)", fontWeight: 500 }}>{del.title}</p>
                      {del.description && (
                        <p style={{ fontSize: 11, color: "var(--fg3)", marginTop: 2 }}>{del.description}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {d.proposedProjectConfig.members?.length > 0 && (
              <div>
                <p style={{ fontSize: 11, fontWeight: 600, color: "var(--fg3)", marginBottom: 4 }}>
                  Suggested team
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {d.proposedProjectConfig.members.map((m, i) => (
                    <span
                      key={i}
                      style={{
                        fontSize: 11,
                        padding: "2px 8px",
                        borderRadius: 4,
                        background: "var(--hover)",
                        color: "var(--fg2)",
                      }}
                    >
                      {m.name || m.email} · {m.role}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {d.projectId && (
              <a
                href={`/projects/${d.projectId}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--accent)",
                  textDecoration: "none",
                  marginTop: 4,
                }}
              >
                View project →
              </a>
            )}
          </div>
        </div>
      )}

      {/* ── Action buttons ── */}
      {canAct && (
        <div className="flex items-center gap-2 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
          <button
            className="rounded-full text-[13px] font-medium px-4 py-1.5 transition hover:opacity-90"
            style={{ background: "var(--ok)", color: "var(--accent-ink)" }}
            onClick={() => patchInitiative(d.id, { status: "approved" })}
          >
            {d.proposedProjectConfig ? "Create Project" : tc("approve")}
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
            className="flex items-center gap-1.5 transition-colors hover:text-[var(--fg3)]"
            style={{ fontSize: 12, color: "var(--fg4)" }}
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
                background: d.planStatus === "completed" ? "color-mix(in srgb, var(--ok) 12%, transparent)" : d.planStatus === "failed" ? "color-mix(in srgb, var(--danger) 12%, transparent)" : "var(--accent-light)",
                color: d.planStatus === "completed" ? "var(--ok)" : d.planStatus === "failed" ? "var(--danger)" : "var(--accent)",
              }}>
                {d.planStatus}
              </span>
            )}
          </button>

          {showPlan && (
            <div className="mt-3" style={{ background: "var(--surface)", border: "1px solid var(--elevated)", borderRadius: 4, overflow: "hidden" }}>
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
                      borderBottom: i < d.steps.length - 1 ? "1px solid var(--border)" : "none",
                      opacity: isPending ? 0.5 : 1,
                      background: isActive ? "rgba(255,255,255,0.04)" : "transparent",
                      borderLeft: isActive ? "3px solid rgba(255,255,255,0.4)" : "3px solid transparent",
                    }}
                  >
                    <div className="flex items-start gap-3">
                      {/* Step number / status */}
                      <div className="flex-shrink-0 mt-0.5" style={{ width: 20, textAlign: "center" }}>
                        {isCompleted ? (
                          <span style={{ color: "var(--ok)", fontSize: 14 }}>&#10003;</span>
                        ) : isFailed ? (
                          <span style={{ color: "var(--danger)", fontSize: 14 }}>&#10007;</span>
                        ) : (
                          <span style={{ fontSize: 12, fontWeight: 600, color: isActive ? "var(--accent)" : "var(--fg4)" }}>
                            {step.sequenceOrder}
                          </span>
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
                        <p style={{ fontSize: 12, color: "var(--fg3)", marginTop: 2 }}>
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
                          <p style={{ fontSize: 11, color: "var(--danger)", marginTop: 4 }}>{step.errorMessage}</p>
                        )}

                        {/* Step actions for awaiting_approval */}
                        {isAwaitingApproval && isExecuting && d.executionPlanId && (
                          <div className="flex items-center gap-2 mt-3">
                            <button
                              className="rounded-full text-[12px] font-medium px-3 py-1 transition hover:opacity-90"
                              style={{ background: "var(--ok)", color: "var(--accent-ink)" }}
                              onClick={() => advanceStep(d.executionPlanId!, step.id, "approve")}
                            >
                              {t("approveStep")}
                            </button>
                            <button
                              className="rounded-full text-[12px] font-medium px-3 py-1 transition"
                              style={{ background: "var(--elevated)", border: "1px solid var(--border)", color: "var(--fg2)" }}
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
                              style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, padding: "8px 12px", fontSize: 13, color: "var(--foreground)", resize: "vertical", fontFamily: "inherit" }}
                              rows={2}
                            />
                            <button
                              className="rounded-full text-[12px] font-medium px-3 py-1 transition hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                              style={{ background: "var(--ok)", color: "var(--accent-ink)" }}
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
            className="flex items-center gap-1.5 transition-colors hover:text-[var(--fg3)]"
            style={{ fontSize: 12, color: "var(--fg4)" }}
          >
            <svg className={`w-3 h-3 transition-transform ${showImpact ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            {t("impactAssessment")}
          </button>

          {showImpact && (
            <div className="mt-3" style={{ padding: "14px 16px", background: "var(--surface)", border: "1px solid var(--elevated)", borderRadius: 4 }}>
              <p style={{ fontSize: 13, lineHeight: 1.65, color: "var(--fg2)", whiteSpace: "pre-wrap" }}>{d.impactAssessment}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
