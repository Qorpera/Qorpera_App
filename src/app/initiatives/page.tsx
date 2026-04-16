"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { ContextualChat } from "@/components/contextual-chat";
import { SidePanel } from "@/components/execution/side-panel";
import { useIsMobile } from "@/hooks/use-media-query";
import { useTranslations, useLocale } from "next-intl";
import { formatRelativeTime } from "@/lib/format-helpers";
import { parseInitiativePage } from "@/lib/initiative-page-parser";

// ── Types ────────────────────────────────────────────────────────────────────

interface InitiativeItem {
  id: string;
  ownerPageSlug: string | null;
  ownerName: string | null;
  proposalType: string;
  triggerSummary: string;
  status: string;
  createdAt: string;
}

type PrimaryDeliverable = {
  type: "wiki_update" | "wiki_create" | "document" | "settings_change";
  targetPageSlug?: string;
  targetPageType?: string;
  title: string;
  description: string;
  rationale: string;
};

type DownstreamEffect = {
  targetPageSlug: string;
  targetPageType: string;
  changeType: "update" | "create" | "review";
  summary: string;
};

interface InitiativeDetail {
  id: string;
  ownerPageSlug: string | null;
  ownerName: string | null;
  proposalType: string;
  triggerSummary: string;
  status: string;
  content: string;
  primaryDeliverable: PrimaryDeliverable | null;
  downstreamEffects: DownstreamEffect[] | null;
  resolvedTargetTitles: Record<string, string>;
  dismissalReason: string | null;
  severity: string | null;
  priority: string | null;
  expectedImpact: string | null;
  effortEstimate: string | null;
  investigatedAt: string | null;
  synthesizedByModel: string | null;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Constants ───────────────────────────────────────────────────────────────

const PROPOSAL_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  project_creation: { label: "Project", color: "var(--accent)" },
  wiki_update: { label: "Wiki Update", color: "var(--fg3)" },
  process_creation: { label: "New Process", color: "var(--info)" },
  strategy_revision: { label: "Strategy", color: "var(--warn)" },
  system_job_creation: { label: "System Job", color: "var(--info)" },
  general: { label: "General", color: "var(--fg4)" },
};

function statusColor(status: string): string {
  switch (status) {
    case "proposed":
    case "concerns_raised": return "var(--warn)";
    case "accepted":
    case "ready":
    case "implementing": return "var(--accent)";
    case "implemented": return "var(--ok)";
    case "rejected":
    case "dismissed":
    case "failed": return "var(--danger)";
    case "deferred": return "var(--fg3)";
    default: return "var(--fg3)";
  }
}

function statusBadgeVariant(status: string): "green" | "red" | "amber" | "blue" | "default" {
  switch (status) {
    case "implemented": return "green";
    case "rejected":
    case "dismissed":
    case "failed": return "red";
    case "proposed":
    case "concerns_raised": return "amber";
    case "accepted":
    case "ready":
    case "implementing": return "blue";
    case "deferred":
    case "detected":
    case "reasoning":
    default: return "default";
  }
}

const ACTIVE_STATUSES = ["proposed", "accepted", "concerns_raised", "ready", "implementing"];

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

  // Panel state
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelActiveTab, setPanelActiveTab] = useState<string>("overview");
  const [panelEditing, setPanelEditing] = useState(false);
  const [panelFullScreen, setPanelFullScreen] = useState(true);
  const [panelChatVisible, setPanelChatVisible] = useState(true);
  const [panelWidth, setPanelWidth] = useState(55);

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

  // Reset panel when switching initiatives
  useEffect(() => {
    setPanelOpen(false);
    setPanelActiveTab("overview");
    setPanelEditing(false);
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
        fetchInitiatives();
        if (selectedId === id) fetchDetail(id);
      }
    } catch (err) {
      console.error("Failed to update initiative:", err);
    }
  };

  const openPanelAt = useCallback((tab: string) => {
    setPanelActiveTab(tab);
    setPanelFullScreen(true);
    setPanelEditing(false);
    setPanelOpen(true);
  }, []);

  const closePanel = useCallback(() => {
    setPanelOpen(false);
    setPanelEditing(false);
    setPanelActiveTab("overview");
  }, []);

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

        {/* ── Right: detail pane + optional panel ── */}
        {(!isMobile || selectedId) && (
        <div className="flex-1 min-h-0 overflow-hidden" style={{
          display: "grid",
          gridTemplateColumns: panelFullScreen && panelOpen
            ? "0fr 1fr"
            : (selectedId && detail && panelOpen) ? `1fr ${panelWidth}%` : "1fr",
          transition: "grid-template-columns 0.25s ease-in-out",
        }}>
          {/* Detail column */}
          <div className="flex flex-col min-h-0 overflow-hidden" style={{
            opacity: panelFullScreen && panelOpen ? 0 : 1,
            transition: "opacity 0.2s ease",
          }}>
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
                    onOpenPanel={openPanelAt}
                  />
                </div>
                {!(panelFullScreen && panelOpen) && (
                  <ContextualChat
                    contextType="initiative"
                    contextId={detail.id}
                    placeholder={t("discuss")}
                    hints={[t("hintRoi"), t("hintDependencies")]}
                  />
                )}
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

          {/* Panel */}
          {selectedId && detail && panelOpen && (
            <InitiativePanel
              detail={detail}
              isOpen={panelOpen}
              onClose={closePanel}
              activeTab={panelActiveTab}
              setActiveTab={setPanelActiveTab}
              isEditing={panelEditing}
              setIsEditing={setPanelEditing}
              isFullScreen={panelFullScreen}
              setIsFullScreen={setPanelFullScreen}
              isChatVisible={panelChatVisible}
              setIsChatVisible={setPanelChatVisible}
              panelWidth={panelWidth}
              setPanelWidth={setPanelWidth}
              onPrimaryDeliverableSaved={() => fetchDetail(detail.id)}
            />
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
  onOpenPanel,
}: {
  detail: InitiativeDetail;
  detailLoading: boolean;
  patchInitiative: (id: string, body: Record<string, unknown>) => Promise<void>;
  onOpenPanel: (tab: string) => void;
}) {
  const t = useTranslations("initiatives");
  const tc = useTranslations("common");
  const locale = useLocale();

  const { evidenceItems } = useMemo(
    () => parseInitiativePage(d.content),
    [d.content],
  );

  const typeConfig = PROPOSAL_TYPE_CONFIG[d.proposalType] ?? PROPOSAL_TYPE_CONFIG.general;
  const isDismissed = d.status === "dismissed";
  const canAct = d.status === "proposed";

  const statusLabel = (() => {
    try { return t(`status.${d.status}` as any); } catch { return d.status; }
  })();

  const metaPills: Array<{ label: string; value: string }> = [];
  if (d.severity) metaPills.push({ label: "Severity", value: d.severity });
  if (d.priority) metaPills.push({ label: "Priority", value: d.priority });
  if (d.expectedImpact) metaPills.push({ label: "Impact", value: d.expectedImpact });
  if (d.effortEstimate) metaPills.push({ label: "Effort", value: d.effortEstimate });

  return (
    <div className="px-6 py-5 space-y-5" style={{ opacity: isDismissed ? 0.7 : 1 }}>
      {/* ── Header ── */}
      <div>
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <Badge variant={statusBadgeVariant(d.status)}>{statusLabel}</Badge>
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

      {/* ── Dismissal reason (when user navigates to a dismissed initiative by URL) ── */}
      {isDismissed && d.dismissalReason && (
        <div style={{
          padding: "14px 16px",
          background: "color-mix(in srgb, var(--warn) 6%, transparent)",
          border: "1px solid color-mix(in srgb, var(--warn) 25%, transparent)",
          borderRadius: 6,
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--warn)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
            {t("dismissalReasonLabel")}
          </div>
          <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--fg2)", whiteSpace: "pre-wrap" }}>{d.dismissalReason}</p>
        </div>
      )}

      {/* ── Evidence (inline — the at-a-glance case for why) ── */}
      {evidenceItems.length > 0 && (
        <Section label={t("evidence")}>
          <div className="space-y-2">
            {evidenceItems.map((e, i) => (
              <div key={i} className="flex items-start gap-2">
                {e.slug ? (
                  <a
                    href={`/wiki/${e.slug}`}
                    style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3, background: "rgba(255,255,255,0.06)", color: "var(--fg3)", flexShrink: 0, marginTop: 2, textDecoration: "none" }}
                    className="hover:opacity-80"
                  >
                    {e.slug}
                  </a>
                ) : (
                  <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3, background: "rgba(255,255,255,0.06)", color: "var(--fg4)", flexShrink: 0, marginTop: 2 }}>
                    —
                  </span>
                )}
                <span style={{ fontSize: 13, color: "var(--fg2)", lineHeight: 1.5 }}>{e.claim}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Proposed Changes container ── */}
      {d.primaryDeliverable && (
        <ChangesetContainer detail={d} onOpenPanel={onOpenPanel} />
      )}

      {/* ── Metadata footer ── */}
      {(metaPills.length > 0 || d.synthesizedByModel) && (
        <div className="pt-3 space-y-2" style={{ borderTop: "1px solid var(--border)" }}>
          {metaPills.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {metaPills.map((p, i) => (
                <span key={i} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "var(--hover)", color: "var(--fg2)" }}>
                  {p.label}: <span style={{ fontWeight: 600 }}>{p.value}</span>
                </span>
              ))}
            </div>
          )}
          {d.synthesizedByModel && (
            <div style={{ fontSize: 11, color: "var(--fg4)" }}>
              {t("synthesizedBy", { model: d.synthesizedByModel })}
              {d.investigatedAt ? ` · ${formatRelativeTime(d.investigatedAt, locale)}` : ""}
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
            onClick={() => patchInitiative(d.id, { action: "accept" })}
          >
            {t("accept")}
          </button>
          <button
            className="wf-btn-danger rounded-full text-[13px] font-medium px-4 py-1.5"
            onClick={() => patchInitiative(d.id, { action: "reject" })}
          >
            {tc("reject")}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Changeset Container ──────────────────────────────────────────────────────

function ChangesetContainer({
  detail: d,
  onOpenPanel,
}: {
  detail: InitiativeDetail;
  onOpenPanel: (tab: string) => void;
}) {
  const t = useTranslations("initiatives");
  if (!d.primaryDeliverable) return null;

  type Row = {
    key: string;
    tab: string;
    primary: boolean;
    targetSlug: string;
    targetTitle: string;
    changeType: string;
    summary: string;
  };
  const rows: Row[] = [];

  const primarySlug = d.primaryDeliverable.targetPageSlug ?? "";
  rows.push({
    key: "primary",
    tab: "primary",
    primary: true,
    targetSlug: primarySlug,
    targetTitle: primarySlug
      ? (d.resolvedTargetTitles[primarySlug] ?? primarySlug)
      : d.primaryDeliverable.title,
    changeType: d.primaryDeliverable.type === "wiki_update" ? "update"
      : d.primaryDeliverable.type === "wiki_create" ? "create"
      : d.primaryDeliverable.type,
    summary: d.primaryDeliverable.description.slice(0, 140),
  });

  (d.downstreamEffects ?? []).forEach((de, idx) => {
    rows.push({
      key: `downstream-${idx}`,
      tab: `downstream-${idx}`,
      primary: false,
      targetSlug: de.targetPageSlug,
      targetTitle: d.resolvedTargetTitles[de.targetPageSlug] ?? de.targetPageSlug,
      changeType: de.changeType,
      summary: de.summary,
    });
  });

  return (
    <div
      onClick={() => onOpenPanel("overview")}
      className="cursor-pointer rounded-lg transition hover:opacity-95"
      style={{
        padding: "12px 14px",
        background: "var(--surface)",
        border: "1px solid var(--border)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--fg3)" }}>
          {t("proposedChanges", { count: rows.length })}
        </div>
        <div style={{ fontSize: 11, color: "var(--fg4)" }}>{t("clickToReview")} →</div>
      </div>

      <div className="space-y-1.5">
        {rows.map(row => (
          <button
            key={row.key}
            onClick={(e) => { e.stopPropagation(); onOpenPanel(row.tab); }}
            className="w-full text-left flex items-start gap-3 py-1.5 px-2 rounded hover:bg-[var(--hover)] transition"
          >
            <span style={{
              fontSize: 12,
              color: row.primary ? "var(--accent)" : "var(--fg4)",
              width: 14,
              flexShrink: 0,
              marginTop: 2,
            }}>
              {row.primary ? "✦" : "↪"}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground)" }}>
                  {row.targetTitle}
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: "1px 5px", borderRadius: 3,
                  background: "rgba(255,255,255,0.06)", color: "var(--fg3)",
                  textTransform: "uppercase", letterSpacing: "0.04em",
                }}>
                  {t(`changeType.${row.changeType}` as any)}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "var(--fg3)", marginTop: 2, lineHeight: 1.4 }}>
                {row.summary}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Initiative Panel ─────────────────────────────────────────────────────────

function InitiativePanel({
  detail: d,
  isOpen,
  onClose,
  activeTab,
  setActiveTab,
  isEditing,
  setIsEditing,
  isFullScreen,
  setIsFullScreen,
  isChatVisible,
  setIsChatVisible,
  panelWidth: _panelWidth,
  setPanelWidth,
  onPrimaryDeliverableSaved,
}: {
  detail: InitiativeDetail;
  isOpen: boolean;
  onClose: () => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isEditing: boolean;
  setIsEditing: (editing: boolean) => void;
  isFullScreen: boolean;
  setIsFullScreen: (fs: boolean) => void;
  isChatVisible: boolean;
  setIsChatVisible: (v: boolean) => void;
  panelWidth: number;
  setPanelWidth: (n: number) => void;
  onPrimaryDeliverableSaved: () => void;
}) {
  const t = useTranslations("initiatives");

  const downstream = d.downstreamEffects ?? [];
  const canEditPrimary = d.status === "proposed" && activeTab === "primary";

  const tabTitle = useMemo(() => {
    if (activeTab === "overview") return t("tabOverview");
    if (activeTab === "primary") {
      const slug = d.primaryDeliverable?.targetPageSlug ?? "";
      return slug ? (d.resolvedTargetTitles[slug] ?? slug) : (d.primaryDeliverable?.title ?? "");
    }
    const idx = Number(activeTab.replace("downstream-", ""));
    const de = downstream[idx];
    return de ? (d.resolvedTargetTitles[de.targetPageSlug] ?? de.targetPageSlug) : "";
  }, [activeTab, d, downstream, t]);

  const tabBadge = useMemo(() => {
    if (activeTab === "overview") return t("tabOverviewBadge");
    if (activeTab === "primary") return "Primary";
    return "Downstream";
  }, [activeTab, t]);

  const typeIcon = (
    <span>{activeTab === "primary" ? "✦" : activeTab === "overview" ? "○" : "↪"}</span>
  );

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={`${d.triggerSummary} — ${tabTitle}`}
      typeBadge={tabBadge}
      typeIcon={typeIcon}
      isEditing={canEditPrimary ? isEditing : false}
      onToggleEdit={canEditPrimary ? () => setIsEditing(!isEditing) : undefined}
      onDiscuss={() => {
        if (isFullScreen) {
          setIsChatVisible(true);
        } else {
          const chatInput = document.getElementById("initiative-chat-input") as HTMLTextAreaElement | null;
          if (chatInput) { chatInput.focus(); chatInput.scrollIntoView({ behavior: "smooth", block: "end" }); }
        }
      }}
      onWidthChange={setPanelWidth}
      isFullScreen={isFullScreen}
      onToggleFullScreen={() => setIsFullScreen(!isFullScreen)}
      isChatVisible={isChatVisible}
      onToggleChatVisible={() => setIsChatVisible(!isChatVisible)}
      chatElement={isFullScreen ? (
        <ContextualChat
          contextType="initiative"
          contextId={d.id}
          placeholder={t("discuss")}
          hints={[t("hintRoi"), t("hintDependencies")]}
        />
      ) : undefined}
    >
      {/* ── Tab bar ── */}
      <div className="flex items-center gap-1 px-4 py-2 border-b overflow-x-auto"
           style={{ borderColor: "var(--border)" }}>
        <TabButton active={activeTab === "overview"} onClick={() => { setActiveTab("overview"); setIsEditing(false); }}>
          ○ {t("tabOverview")}
        </TabButton>
        {d.primaryDeliverable && (
          <TabButton active={activeTab === "primary"} onClick={() => setActiveTab("primary")}>
            ✦ {d.primaryDeliverable.targetPageSlug
              ? (d.resolvedTargetTitles[d.primaryDeliverable.targetPageSlug] ?? d.primaryDeliverable.targetPageSlug)
              : d.primaryDeliverable.title.slice(0, 24)}
          </TabButton>
        )}
        {downstream.map((de, idx) => (
          <TabButton
            key={`downstream-${idx}`}
            active={activeTab === `downstream-${idx}`}
            onClick={() => { setActiveTab(`downstream-${idx}`); setIsEditing(false); }}
          >
            ↪ {d.resolvedTargetTitles[de.targetPageSlug] ?? de.targetPageSlug}
          </TabButton>
        ))}
      </div>

      {/* ── Tab content ── */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {activeTab === "overview" && <OverviewTab detail={d} />}
        {activeTab === "primary" && d.primaryDeliverable && (
          <PrimaryDeliverableTab
            detail={d}
            isEditing={canEditPrimary && isEditing}
            onCancel={() => setIsEditing(false)}
            onSaved={() => { setIsEditing(false); onPrimaryDeliverableSaved(); }}
          />
        )}
        {activeTab.startsWith("downstream-") && (() => {
          const idx = Number(activeTab.replace("downstream-", ""));
          const de = downstream[idx];
          if (!de) return null;
          return <DownstreamEffectTab detail={d} effect={de} />;
        })()}
      </div>
    </SidePanel>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-full text-[12px] whitespace-nowrap transition"
      style={{
        background: active ? "var(--accent)" : "transparent",
        color: active ? "var(--accent-ink)" : "var(--fg2)",
        fontWeight: active ? 600 : 500,
        border: active ? "none" : "1px solid var(--border)",
      }}
    >
      {children}
    </button>
  );
}

// ── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ detail: d }: { detail: InitiativeDetail }) {
  const t = useTranslations("initiatives");
  const { sections } = useMemo(() => parseInitiativePage(d.content), [d.content]);

  const blocks: Array<{ label: string; body: string }> = [];
  if (sections.investigation) blocks.push({ label: t("investigation"), body: sections.investigation });
  if (sections.proposal) blocks.push({ label: t("proposal"), body: sections.proposal });
  if (sections.impactAssessment) blocks.push({ label: t("impactAssessment"), body: sections.impactAssessment });
  if (sections.alternativesConsidered) blocks.push({ label: t("alternativesConsidered"), body: sections.alternativesConsidered });
  if (sections.timeline) blocks.push({ label: t("timeline"), body: sections.timeline });

  if (blocks.length === 0) {
    return (
      <div className="flex items-center justify-center py-12" style={{ fontSize: 13, color: "var(--fg4)" }}>
        No overview content available.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {blocks.map((b, i) => (
        <Section key={i} label={b.label}>
          <p style={{ fontSize: 13, lineHeight: 1.65, color: "var(--fg2)", whiteSpace: "pre-wrap" }}>{b.body}</p>
        </Section>
      ))}
    </div>
  );
}

// ── Primary Deliverable Tab ──────────────────────────────────────────────────

function PrimaryDeliverableTab({
  detail: d,
  isEditing,
  onCancel,
  onSaved,
}: {
  detail: InitiativeDetail;
  isEditing: boolean;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("initiatives");
  const tc = useTranslations("common");

  const primary = d.primaryDeliverable!;
  const [title, setTitle] = useState(primary.title);
  const [description, setDescription] = useState(primary.description);
  const [rationale, setRationale] = useState(primary.rationale);
  const [targetPageSlug, setTargetPageSlug] = useState(primary.targetPageSlug ?? "");
  const [targetPageType, setTargetPageType] = useState(primary.targetPageType ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when switching initiative or exiting edit mode
  useEffect(() => {
    setTitle(primary.title);
    setDescription(primary.description);
    setRationale(primary.rationale);
    setTargetPageSlug(primary.targetPageSlug ?? "");
    setTargetPageType(primary.targetPageType ?? "");
    setError(null);
  }, [primary, isEditing]);

  const showSlug = primary.type === "wiki_update" || primary.type === "wiki_create";
  const showPageType = primary.type === "wiki_create";

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/initiatives/${d.id}/deliverable`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deliverable: {
            type: primary.type,
            title: title.trim(),
            description: description.trim(),
            rationale: rationale.trim(),
            ...(showSlug ? { targetPageSlug: targetPageSlug.trim() } : {}),
            ...(showPageType ? { targetPageType: targetPageType.trim() } : {}),
          },
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (isEditing) {
    return (
      <div className="space-y-4 max-w-2xl">
        <div className="flex items-center gap-2 flex-wrap">
          <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 3, background: "color-mix(in srgb, var(--accent) 14%, transparent)", color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            {t(`changeType.${primary.type}` as any)}
          </span>
        </div>

        <FormField label={t("deliverableEditTitle")}>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full outline-none"
            style={{
              padding: "10px 12px",
              background: "var(--elevated)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontSize: 14,
              color: "var(--foreground)",
            }}
          />
        </FormField>

        <FormField label={t("deliverableEditDescription")}>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={6}
            className="w-full outline-none resize-y"
            style={{
              padding: "10px 12px",
              background: "var(--elevated)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontSize: 13,
              lineHeight: 1.55,
              color: "var(--foreground)",
              fontFamily: "inherit",
              minHeight: 140,
            }}
          />
        </FormField>

        <FormField label={t("deliverableEditRationale")}>
          <textarea
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            rows={3}
            className="w-full outline-none resize-y"
            style={{
              padding: "10px 12px",
              background: "var(--elevated)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontSize: 13,
              lineHeight: 1.55,
              color: "var(--foreground)",
              fontFamily: "inherit",
              minHeight: 80,
            }}
          />
        </FormField>

        {showSlug && (
          <FormField label={t("deliverableEditTargetSlug")}>
            <input
              type="text"
              value={targetPageSlug}
              onChange={(e) => setTargetPageSlug(e.target.value)}
              className="w-full outline-none"
              style={{
                padding: "10px 12px",
                background: "var(--elevated)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                fontSize: 13,
                color: "var(--foreground)",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              }}
            />
          </FormField>
        )}

        {showPageType && (
          <FormField label={t("deliverableEditTargetPageType")}>
            <input
              type="text"
              value={targetPageType}
              onChange={(e) => setTargetPageType(e.target.value)}
              className="w-full outline-none"
              style={{
                padding: "10px 12px",
                background: "var(--elevated)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                fontSize: 13,
                color: "var(--foreground)",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              }}
            />
          </FormField>
        )}

        {error && (
          <div style={{ padding: "10px 12px", borderRadius: 6, background: "color-mix(in srgb, var(--danger) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--danger) 30%, transparent)", color: "var(--danger)", fontSize: 13 }}>
            {error}
          </div>
        )}

        <div className="flex items-center gap-2 pt-2">
          <button
            onClick={save}
            disabled={saving}
            className="rounded-md text-[13px] font-medium px-4 py-2 transition hover:opacity-90 disabled:opacity-60"
            style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
          >
            {saving ? tc("saving") : t("deliverableSave")}
          </button>
          <button
            onClick={onCancel}
            disabled={saving}
            className="rounded-md text-[13px] font-medium px-4 py-2 transition hover:bg-[var(--hover)]"
            style={{ background: "transparent", color: "var(--fg2)", border: "1px solid var(--border)" }}
          >
            {t("deliverableCancel")}
          </button>
        </div>
      </div>
    );
  }

  // Display mode
  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 3, background: "color-mix(in srgb, var(--accent) 14%, transparent)", color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {t(`changeType.${primary.type}` as any)}
        </span>
        <span style={{ fontSize: 16, fontWeight: 600, color: "var(--foreground)" }}>
          {primary.title}
        </span>
      </div>

      <p style={{ fontSize: 14, lineHeight: 1.65, color: "var(--fg2)", whiteSpace: "pre-wrap" }}>
        {primary.description}
      </p>

      <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--fg3)", fontStyle: "italic", borderLeft: "2px solid var(--border)", paddingLeft: 12 }}>
        {primary.rationale}
      </p>

      {primary.targetPageSlug && (
        <div className="flex items-center gap-2 flex-wrap pt-1">
          <a
            href={`/wiki/${primary.targetPageSlug}`}
            style={{ fontSize: 13, fontWeight: 500, color: "var(--accent)", textDecoration: "none" }}
            className="hover:opacity-80"
          >
            {t("viewTargetPage")}
          </a>
          {primary.targetPageType && (
            <span style={{ fontSize: 12, color: "var(--fg4)" }}>
              {t("pageTypeLabel", { pageType: primary.targetPageType })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--fg3)" }} className="mb-1.5">
        {label}
      </div>
      {children}
    </div>
  );
}

// ── Downstream Effect Tab ────────────────────────────────────────────────────

function DownstreamEffectTab({
  detail: d,
  effect,
}: {
  detail: InitiativeDetail;
  effect: DownstreamEffect;
}) {
  const t = useTranslations("initiatives");
  const title = d.resolvedTargetTitles[effect.targetPageSlug] ?? effect.targetPageSlug;

  return (
    <div className="max-w-2xl space-y-4">
      {/* Pending banner */}
      <div style={{
        padding: "12px 14px",
        background: "color-mix(in srgb, var(--info) 8%, transparent)",
        border: "1px solid color-mix(in srgb, var(--info) 25%, transparent)",
        borderRadius: 6,
      }}>
        <p style={{ fontSize: 13, lineHeight: 1.5, color: "var(--fg2)" }}>{t("downstreamPendingBanner")}</p>
      </div>

      <div>
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <span style={{ fontSize: 18, fontWeight: 600, color: "var(--foreground)" }}>
            {title}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span style={{
            fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 3,
            background: "rgba(255,255,255,0.06)", color: "var(--fg3)",
            textTransform: "uppercase", letterSpacing: "0.04em",
          }}>
            {effect.targetPageType}
          </span>
          <span style={{
            fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 3,
            background: "color-mix(in srgb, var(--accent) 14%, transparent)", color: "var(--accent)",
            textTransform: "uppercase", letterSpacing: "0.04em",
          }}>
            {t(`changeType.${effect.changeType}` as any)}
          </span>
        </div>
      </div>

      <p style={{ fontSize: 14, lineHeight: 1.65, color: "var(--fg2)", whiteSpace: "pre-wrap" }}>
        {effect.summary}
      </p>

      <div>
        <a
          href={`/wiki/${effect.targetPageSlug}`}
          style={{ fontSize: 13, fontWeight: 500, color: "var(--accent)", textDecoration: "none" }}
          className="hover:opacity-80"
        >
          {t("viewTargetPage")}
        </a>
      </div>
    </div>
  );
}

// ── Section (label + body) ───────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "var(--fg4)", textTransform: "uppercase" }} className="mb-2">
        {label}
      </div>
      {children}
    </div>
  );
}
