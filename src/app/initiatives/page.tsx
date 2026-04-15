"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { ContextualChat } from "@/components/contextual-chat";
import { useIsMobile } from "@/hooks/use-media-query";
import { useTranslations, useLocale } from "next-intl";
import { formatRelativeTime } from "@/lib/format-helpers";

// ── Types ────────────────────────────────────────────────────────────────────

interface InitiativeItem {
  id: string;
  aiEntityId: string;
  ownerPageSlug: string | null;
  ownerName: string | null;
  proposalType: string;
  triggerSummary: string;
  status: string;
  rationale: string | null;
  impactAssessment: string | null;
  proposedProjectConfig: unknown | null;
  projectId: string | null;
  content: string | null;
  createdAt: string;
}

interface InitiativeDetail {
  id: string;
  aiEntityId: string;
  ownerPageSlug: string | null;
  ownerName: string | null;
  proposalType: string;
  triggerSummary: string;
  evidence: Array<{ source: string; claim: string }> | null;
  proposal: Record<string, unknown> | null;
  status: string;
  rationale: string | null;
  impactAssessment: string | null;
  proposedProjectConfig: unknown | null;
  projectId: string | null;
  content: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Constants ───────────────────────────────────────────────────────────────

const PROPOSAL_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  project_creation: { label: "Project", color: "var(--accent)" },
  policy_change: { label: "Policy", color: "var(--warn)" },
  autonomy_graduation: { label: "Autonomy", color: "var(--ok)" },
  system_job_creation: { label: "System Job", color: "var(--info)" },
  strategy_revision: { label: "Strategy", color: "var(--warn)" },
  wiki_update: { label: "Wiki", color: "var(--fg3)" },
  resource_recommendation: { label: "Resource", color: "var(--danger)" },
  general: { label: "General", color: "var(--fg4)" },
};

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

const ACTIVE_STATUSES = ["proposed", "approved", "executing"];

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

  const filteredInitiatives = useMemo(() =>
    filter === "active"
      ? initiatives.filter(i => ACTIVE_STATUSES.includes(i.status))
      : initiatives,
    [initiatives, filter],
  );

  useEffect(() => {
    if (selectedId && !filteredInitiatives.some(i => i.id === selectedId)) {
      setSelectedId(null);
    }
  }, [filteredInitiatives, selectedId]);

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

  return (
    <AppShell>
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── Left: initiative list ── */}
        {(!isMobile || !selectedId) && (
        <div className={`${isMobile ? "w-full" : "w-[300px]"} flex-shrink-0 flex flex-col overflow-hidden`} style={{ borderRight: isMobile ? "none" : "1px solid var(--border)" }}>
          <div className="px-4 py-3 flex-shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--foreground)" }}>{t("title")}</div>
            <div style={{ fontSize: 11, color: "var(--fg3)" }} className="mt-0.5">
              {t("subtitle")}
            </div>
          </div>

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

          <div className="flex-1 overflow-y-auto">
            {loading && (
              <div className="flex justify-center py-10">
                <div className="h-4 w-4 animate-spin rounded-full border border-border border-t-muted" />
              </div>
            )}
            {filteredInitiatives.map(item => {
              const typeConfig = PROPOSAL_TYPE_CONFIG[item.proposalType] ?? PROPOSAL_TYPE_CONFIG.general;
              return (
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
                  <div className="flex items-center gap-2 mb-1">
                    <span className="flex-shrink-0" style={{ width: 7, height: 7, borderRadius: "50%", background: statusColor(item.status) }} />
                    <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 5px", borderRadius: 3, background: `color-mix(in srgb, ${typeConfig.color} 12%, transparent)`, color: typeConfig.color, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                      {typeConfig.label}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--fg4)" }} className="ml-auto flex-shrink-0">
                      {formatRelativeTime(item.createdAt, locale)}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground)", lineHeight: 1.35 }} className="pl-[15px] line-clamp-2">
                    {item.triggerSummary || "Untitled initiative"}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--fg4)" }} className="pl-[15px] mt-0.5 truncate">
                    {item.ownerName ?? "AI"}
                  </div>
                </button>
              );
            })}
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
}: {
  detail: InitiativeDetail;
  detailLoading: boolean;
  patchInitiative: (id: string, body: Record<string, unknown>) => Promise<void>;
}) {
  const t = useTranslations("initiatives");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [showImpact, setShowImpact] = useState(false);

  const canAct = d.status === "proposed";
  const typeConfig = PROPOSAL_TYPE_CONFIG[d.proposalType] ?? PROPOSAL_TYPE_CONFIG.general;

  return (
    <div className="px-6 py-5 space-y-5">
      {/* ── Header ── */}
      <div>
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <Badge variant={
            d.status === "completed" ? "green"
              : d.status === "rejected" || d.status === "failed" ? "red"
              : d.status === "proposed" ? "amber"
              : "default"
          }>
            {d.status.charAt(0).toUpperCase() + d.status.slice(1)}
          </Badge>
          <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 3, background: `color-mix(in srgb, ${typeConfig.color} 12%, transparent)`, color: typeConfig.color, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            {typeConfig.label}
          </span>
          <span style={{ fontSize: 12, color: "var(--fg3)" }}>{d.ownerName ?? "AI"}</span>
          <span style={{ fontSize: 12, color: "var(--fg4)" }}>{formatRelativeTime(d.createdAt, locale)}</span>
        </div>

        <h1 style={{ fontSize: 18, fontWeight: 600, color: "var(--foreground)", lineHeight: 1.3 }}>
          {d.triggerSummary || "Untitled initiative"}
        </h1>
      </div>

      {detailLoading && (
        <div className="flex justify-center py-8">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-muted" />
        </div>
      )}

      {/* ── Evidence ── */}
      {d.evidence && d.evidence.length > 0 && (
        <div>
          <SectionLabel>Evidence</SectionLabel>
          <div style={{ padding: "12px 16px", background: "var(--surface)", border: "1px solid var(--elevated)", borderRadius: 6 }} className="space-y-2">
            {d.evidence.map((e, i) => (
              <div key={i} className="flex items-start gap-2">
                <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 5px", borderRadius: 3, background: "rgba(255,255,255,0.06)", color: "var(--fg3)", textTransform: "uppercase", flexShrink: 0, marginTop: 2 }}>
                  {e.source.replace(/_/g, " ")}
                </span>
                <span style={{ fontSize: 13, color: "var(--fg2)", lineHeight: 1.5 }}>{e.claim}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Rationale ── */}
      {d.rationale && (
      <div>
        <SectionLabel>{t("rationale")}</SectionLabel>
        <div style={{ padding: "14px 16px", background: "var(--surface)", border: "1px solid var(--elevated)", borderRadius: 6 }}>
          <p style={{ fontSize: 13, lineHeight: 1.65, color: "var(--fg2)", whiteSpace: "pre-wrap" }}>{d.rationale}</p>
        </div>
      </div>
      )}

      {/* ── Proposal ── */}
      {d.proposal && (
        <div>
          <SectionLabel>Proposal</SectionLabel>
          <ProposalRenderer proposalType={d.proposalType} proposal={d.proposal} projectId={d.projectId} />
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
            <div className="mt-3" style={{ padding: "14px 16px", background: "var(--surface)", border: "1px solid var(--elevated)", borderRadius: 6 }}>
              <p style={{ fontSize: 13, lineHeight: 1.65, color: "var(--fg2)", whiteSpace: "pre-wrap" }}>{d.impactAssessment}</p>
            </div>
          )}
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
    </div>
  );
}

// ── Section Label ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "var(--fg4)", textTransform: "uppercase" }} className="mb-2">
      {children}
    </div>
  );
}

// ── Proposal Renderer ────────────────────────────────────────────────────────

function ProposalRenderer({
  proposalType,
  proposal,
  projectId,
}: {
  proposalType: string;
  proposal: Record<string, unknown>;
  projectId: string | null;
}) {
  const p = proposal;

  switch (proposalType) {
    case "project_creation": {
      const title = (p.title as string) ?? "";
      const description = (p.description as string) ?? "";
      const deliverables = Array.isArray(p.deliverables) ? p.deliverables : [];
      const members = Array.isArray(p.members) ? p.members : [];
      return (
        <div style={{ padding: "14px 16px", background: "var(--surface)", border: "1px solid var(--elevated)", borderRadius: 8 }} className="space-y-3">
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>{title}</p>
            {description && <p style={{ fontSize: 12, color: "var(--fg2)", marginTop: 4, lineHeight: 1.5 }}>{description}</p>}
          </div>
          {deliverables.length > 0 && (
            <div>
              <p style={{ fontSize: 11, fontWeight: 600, color: "var(--fg3)", marginBottom: 6 }}>Deliverables ({deliverables.length})</p>
              {deliverables.map((del: Record<string, unknown>, i: number) => (
                <div key={i} className="flex items-start gap-2 py-1.5" style={{ borderTop: i > 0 ? "1px solid var(--border)" : "none" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", marginTop: 5, flexShrink: 0 }} />
                  <div>
                    <p style={{ fontSize: 12, color: "var(--foreground)", fontWeight: 500 }}>{String(del.title ?? "")}</p>
                    {del.description != null && <p style={{ fontSize: 11, color: "var(--fg3)", marginTop: 2 }}>{String(del.description)}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {members.length > 0 && (
            <div>
              <p style={{ fontSize: 11, fontWeight: 600, color: "var(--fg3)", marginBottom: 4 }}>Suggested team</p>
              <div className="flex flex-wrap gap-1.5">
                {members.map((m: Record<string, unknown>, i: number) => (
                  <span key={i} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "var(--hover)", color: "var(--fg2)" }}>
                    {String(m.name || m.email || "")} · {String(m.role || "")}
                  </span>
                ))}
              </div>
            </div>
          )}
          {projectId && (
            <a href={`/projects/${projectId}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 500, color: "var(--accent)", textDecoration: "none", marginTop: 4 }}>
              View project →
            </a>
          )}
        </div>
      );
    }

    case "system_job_creation": {
      return (
        <div style={{ padding: "14px 16px", background: "var(--surface)", border: "1px solid var(--elevated)", borderRadius: 6 }} className="space-y-2">
          {p.title != null && <p style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>{String(p.title)}</p>}
          {p.description != null && <p style={{ fontSize: 13, color: "var(--fg2)", lineHeight: 1.5 }}>{String(p.description)}</p>}
          <div className="flex gap-4" style={{ fontSize: 12, color: "var(--fg3)" }}>
            {p.cronExpression != null && <span>Schedule: <code style={{ background: "rgba(255,255,255,0.06)", padding: "1px 4px", borderRadius: 3 }}>{String(p.cronExpression)}</code></span>}
            {p.scope != null && <span>Scope: {String(p.scope)}</span>}
          </div>
        </div>
      );
    }

    case "policy_change": {
      return (
        <div style={{ padding: "14px 16px", background: "var(--surface)", border: "1px solid var(--elevated)", borderRadius: 6 }} className="space-y-2">
          {p.policyName != null && <p style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>{String(p.policyName)}</p>}
          <pre style={{ fontSize: 12, color: "var(--fg2)", whiteSpace: "pre-wrap", fontFamily: "inherit", lineHeight: 1.5, margin: 0 }}>
            {String(p.policyText ?? p.description ?? JSON.stringify(p, null, 2))}
          </pre>
        </div>
      );
    }

    case "autonomy_graduation": {
      return (
        <div style={{ padding: "14px 16px", background: "var(--surface)", border: "1px solid var(--elevated)", borderRadius: 6 }} className="space-y-2">
          {p.situationTypeName != null && (
            <p style={{ fontSize: 13, color: "var(--fg2)" }}>
              Situation type: <span style={{ fontWeight: 600, color: "var(--foreground)" }}>{String(p.situationTypeName)}</span>
            </p>
          )}
          <div className="flex items-center gap-2">
            {p.currentAutonomyLevel != null && <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 4, background: "rgba(255,255,255,0.06)", color: "var(--fg3)" }}>{String(p.currentAutonomyLevel)}</span>}
            <span style={{ color: "var(--fg4)" }}>→</span>
            {p.newAutonomyLevel != null && <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 4, background: "color-mix(in srgb, var(--ok) 12%, transparent)", color: "var(--ok)", fontWeight: 600 }}>{String(p.newAutonomyLevel)}</span>}
          </div>
        </div>
      );
    }

    case "strategy_revision":
    case "wiki_update": {
      return (
        <div style={{ padding: "14px 16px", background: "var(--surface)", border: "1px solid var(--elevated)", borderRadius: 6 }}>
          {p.slug != null && <p style={{ fontSize: 11, color: "var(--fg4)", marginBottom: 6 }}>Page: {String(p.slug)}</p>}
          <pre style={{ fontSize: 12, color: "var(--fg2)", whiteSpace: "pre-wrap", fontFamily: "inherit", lineHeight: 1.6, margin: 0 }}>
            {String(p.content ?? p.proposedContent ?? p.description ?? JSON.stringify(p, null, 2))}
          </pre>
        </div>
      );
    }

    case "resource_recommendation": {
      return (
        <div style={{ padding: "14px 16px", background: "var(--surface)", border: "1px solid var(--elevated)", borderRadius: 6 }}>
          <pre style={{ fontSize: 13, color: "var(--fg2)", whiteSpace: "pre-wrap", fontFamily: "inherit", lineHeight: 1.6, margin: 0 }}>
            {String(p.analysis ?? p.recommendation ?? p.description ?? JSON.stringify(p, null, 2))}
          </pre>
        </div>
      );
    }

    default: {
      return (
        <div style={{ padding: "14px 16px", background: "var(--surface)", border: "1px solid var(--elevated)", borderRadius: 6 }}>
          <pre style={{ fontSize: 12, color: "var(--fg2)", whiteSpace: "pre-wrap", fontFamily: "inherit", lineHeight: 1.5, margin: 0 }}>
            {String(p.description ?? JSON.stringify(p, null, 2))}
          </pre>
        </div>
      );
    }
  }
}
