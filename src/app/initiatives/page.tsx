"use client";

import { useState, useEffect, useCallback, useMemo, useRef, type RefObject } from "react";
import { useSearchParams } from "next/navigation";
import { diffLines, type Change } from "diff";
import ReactMarkdown from "react-markdown";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { ContextualChat } from "@/components/contextual-chat";
import { DeliverableEditor, type DeliverableEditorHandle } from "@/components/deliverable-editor";
import { SidePanel, type SaveStatus } from "@/components/execution/side-panel";
import { useIsMobile } from "@/hooks/use-media-query";
import { useTranslations, useLocale } from "next-intl";
import { formatRelativeTime } from "@/lib/format-helpers";
import { parseInitiativePage } from "@/lib/initiative-page-parser";
import { WikiText } from "@/components/wiki-text";
import { DashboardCards, FailedCardPlaceholder } from "@/app/initiatives/components/DashboardCards";

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
  proposedContent?: string;
  proposedProperties?: Record<string, unknown> | null;
};

type DownstreamEffect = {
  targetPageSlug: string;
  targetPageType: string;
  changeType: "update" | "create" | "review";
  summary: string;
};

type ExecConcern = {
  source: "llm" | "programmatic";
  targetChangeId: string | null;
  description: string;
  severity: "warning" | "blocking";
  recommendation: string;
};

type DownstreamExecState = {
  changeId: string;
  effect: DownstreamEffect;
  status: "pending" | "generating" | "generated" | "applying" | "applied" | "failed";
  proposedContent: string | null;
  proposedProperties: Record<string, unknown> | null;
  concerns: ExecConcern[];
  model: string | null;
  costCents: number;
  error: string | null;
  appliedSlug: string | null;
};

type ExecutionState = {
  startedAt: string;
  totalCostCents: number;
  primary: { status: string; error: string | null; appliedSlug: string | null };
  downstream: DownstreamExecState[];
  crossConcerns: ExecConcern[];
  completedAt: string | null;
};

type ExecutionSummary = {
  completedAt: string | null;
  totalCostCents: number;
  pagesModified: string[];
  skippedDownstream: string[];
  failedDownstream: string[];
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
  primaryTargetCurrentContent: string | null;
  primaryTargetCurrentProperties: Record<string, unknown> | null;
  downstreamEffects: DownstreamEffect[] | null;
  downstreamCurrentContents: Record<string, { content: string; properties: Record<string, unknown> | null }>;
  executionState: ExecutionState | null;
  executionSummary: ExecutionSummary | null;
  resolvedTargetTitles: Record<string, string>;
  crossReferences?: Record<string, { title: string; slug?: string; pageType?: string }>;
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
  const searchParams = useSearchParams();
  const [initiatives, setInitiatives] = useState<InitiativeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<InitiativeDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [filter, setFilter] = useState<"active" | "all">("active");

  // Panel state
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelActiveTab, setPanelActiveTab] = useState<string>("overview");
  const [panelChatVisible, setPanelChatVisible] = useState(true);
  const sidebarWasCollapsed = useRef(false);

  // Auto-collapse main nav sidebar when an initiative is entered, restore on exit
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
      setPanelOpen(false);
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

  const runExecutionAction = useCallback(async (action: "retry" | "skip_downstream" | "abandon") => {
    if (!selectedId) return;
    try {
      const res = await fetch(`/api/initiatives/${selectedId}/execution-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `${action} failed`);
      }
      await fetchInitiatives();
      await fetchDetail(selectedId);
    } catch (err) {
      console.error(`Execution action ${action} failed:`, err);
    }
  }, [selectedId, fetchInitiatives, fetchDetail]);

  const openInitiative = useCallback((id: string) => {
    setSelectedId(id);
    setPanelActiveTab("overview");
    setPanelOpen(true);
  }, []);

  useEffect(() => {
    const urlId = searchParams?.get("id");
    if (urlId && urlId !== selectedId) {
      openInitiative(urlId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: mount-only URL→state sync, not bidirectional
  }, [searchParams]);

  const closePanel = useCallback(() => {
    setPanelOpen(false);
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
                  onClick={() => openInitiative(item.id)}
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

        {/* ── Right: empty-state column + panel ── */}
        {(!isMobile || selectedId) && (
        <div className="flex-1 min-h-0 overflow-hidden" style={{
          display: "grid",
          gridTemplateColumns: panelOpen ? "0fr 1fr" : "1fr",
          transition: "grid-template-columns 0.25s ease-in-out",
        }}>
          {/* Empty state column (visible when panel is closed) */}
          <div className="flex flex-col min-h-0 overflow-hidden" style={{
            opacity: panelOpen ? 0 : 1,
            transition: "opacity 0.2s ease",
          }}>
            {isMobile && selectedId && (
              <button onClick={() => setSelectedId(null)} className="flex items-center gap-1.5 px-4 py-3 text-sm text-[var(--fg2)] hover:text-[var(--fg2)] min-h-[44px]">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                Back
              </button>
            )}
            <div className="flex items-center justify-center h-full" style={{ fontSize: 13, color: "var(--fg4)" }}>
              {t("selectInitiative")}
            </div>
          </div>

          {/* Panel */}
          {selectedId && detail && panelOpen && (
            <InitiativePanel
              detail={detail}
              isOpen={panelOpen}
              onClose={closePanel}
              activeTab={panelActiveTab}
              setActiveTab={setPanelActiveTab}
              isChatVisible={panelChatVisible}
              setIsChatVisible={setPanelChatVisible}
              runExecutionAction={runExecutionAction}
              patchInitiative={patchInitiative}
            />
          )}
        </div>
        )}

      </div>
    </AppShell>
  );
}

// ── Changeset Container ──────────────────────────────────────────────────────

function ChangesetContainer({
  detail: d,
  onSelectChange,
}: {
  detail: InitiativeDetail;
  onSelectChange: (tab: string) => void;
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
      onClick={() => onSelectChange("overview")}
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
            onClick={(e) => { e.stopPropagation(); onSelectChange(row.tab); }}
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
  isChatVisible,
  setIsChatVisible,
  runExecutionAction,
  patchInitiative,
}: {
  detail: InitiativeDetail;
  isOpen: boolean;
  onClose: () => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isChatVisible: boolean;
  setIsChatVisible: (v: boolean) => void;
  runExecutionAction: (action: "retry" | "skip_downstream" | "abandon") => Promise<void>;
  patchInitiative: (id: string, body: Record<string, unknown>) => Promise<void>;
}) {
  const t = useTranslations("initiatives");

  // Chat/content split percentage. Stateless per open — InitiativePanel
  // unmounts when the panel closes (see page.tsx conditional render), so each
  // open starts fresh at 35. Drag mutations persist within a single session.
  const [chatWidth, setChatWidth] = useState(35);

  // Deliverable editor controls — lifted here so the SidePanel header can
  // render undo/redo + save status for the content rendered inside the primary tab.
  const editorRef = useRef<DeliverableEditorHandle>(null);
  const [editorState, setEditorState] = useState({ canUndo: false, canRedo: false });
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const forceSaveRef = useRef<() => void>(() => {});

  const downstream = d.downstreamEffects ?? [];
  const canEditPrimary = d.status === "proposed" && activeTab === "primary";

  const { dashboard } = useMemo(() => parseInitiativePage(d.content), [d.content]);
  const hasDashboardForDetails =
    dashboard.cards.length > 0 && dashboard.fallback !== "prose_only";

  const tabTitle = useMemo(() => {
    if (activeTab === "overview") return t("tabOverview");
    if (activeTab === "details") return t("tabDetails");
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
    if (activeTab === "details") return t("tabOverviewBadge");
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
      onUndo={canEditPrimary ? () => editorRef.current?.undo() : undefined}
      onRedo={canEditPrimary ? () => editorRef.current?.redo() : undefined}
      canUndo={canEditPrimary && editorState.canUndo}
      canRedo={canEditPrimary && editorState.canRedo}
      saveStatus={canEditPrimary ? saveStatus : undefined}
      onSaveNow={canEditPrimary ? () => forceSaveRef.current() : undefined}
      onDiscuss={() => setIsChatVisible(true)}
      isFullScreen={true}
      isChatVisible={isChatVisible}
      onToggleChatVisible={() => setIsChatVisible(!isChatVisible)}
      chatWidth={chatWidth}
      onChatWidthChange={setChatWidth}
      chatElement={
        <ContextualChat
          contextType="initiative"
          contextId={d.id}
          placeholder={t("discuss")}
          hints={[t("hintRoi"), t("hintDependencies")]}
        />
      }
    >
      {/* ── Tab bar ── */}
      <div className="flex items-center gap-1 px-4 py-2 border-b overflow-x-auto"
           style={{ borderColor: "var(--border)" }}>
        <TabButton active={activeTab === "overview"} onClick={() => setActiveTab("overview")}>
          ○ {t("tabOverview")}
        </TabButton>
        {hasDashboardForDetails && (
          <TabButton active={activeTab === "details"} onClick={() => setActiveTab("details")}>
            ☰ {t("tabDetails")}
          </TabButton>
        )}
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
            onClick={() => setActiveTab(`downstream-${idx}`)}
          >
            ↪ {d.resolvedTargetTitles[de.targetPageSlug] ?? de.targetPageSlug}
          </TabButton>
        ))}
      </div>

      {/* ── Tab content ── */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {activeTab === "overview" && <OverviewTab detail={d} onSelectChange={setActiveTab} runExecutionAction={runExecutionAction} patchInitiative={patchInitiative} />}
        {activeTab === "details" && <DetailsTab detail={d} />}
        {activeTab === "primary" && d.primaryDeliverable && (
          <PrimaryDeliverableTab
            detail={d}
            editable={canEditPrimary}
            editorRef={editorRef}
            onEditorStateChange={setEditorState}
            onSaveStatusChange={setSaveStatus}
            onForceSaveRegister={(fn) => { forceSaveRef.current = fn; }}
          />
        )}
        {activeTab.startsWith("downstream-") && (() => {
          const idx = Number(activeTab.replace("downstream-", ""));
          const de = downstream[idx];
          if (!de) return null;
          return <DownstreamEffectTab detail={d} effect={de} index={idx} />;
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

// ── Overview Header ──────────────────────────────────────────────────────────

function OverviewHeader({ detail: d }: { detail: InitiativeDetail }) {
  const t = useTranslations("initiatives");
  const locale = useLocale();
  const typeConfig = PROPOSAL_TYPE_CONFIG[d.proposalType] ?? PROPOSAL_TYPE_CONFIG.general;

  const statusLabel = (() => {
    try { return t(`status.${d.status}` as any); } catch { return d.status; }
  })();

  const titleText = d.primaryDeliverable?.title || d.triggerSummary || "Untitled initiative";
  const showTriggerSubtitle = !!d.primaryDeliverable?.title && !!d.triggerSummary
    && d.primaryDeliverable.title !== d.triggerSummary;

  return (
    <div style={{ marginBottom: 20 }}>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <Badge variant={statusBadgeVariant(d.status)}>{statusLabel}</Badge>
        <span style={{
          fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 3,
          background: `color-mix(in srgb, ${typeConfig.color} 12%, transparent)`,
          color: typeConfig.color, textTransform: "uppercase", letterSpacing: "0.04em",
        }}>
          {typeConfig.label}
        </span>
        <span style={{ fontSize: 12, color: "var(--fg3)" }}>{d.ownerName ?? "AI"}</span>
        <span style={{ fontSize: 12, color: "var(--fg4)" }}>{formatRelativeTime(d.createdAt, locale)}</span>
      </div>

      <h1 style={{ fontSize: 18, fontWeight: 600, color: "var(--foreground)", lineHeight: 1.3 }}>
        {titleText}
      </h1>

      {showTriggerSubtitle && (
        <div style={{ fontSize: 11, color: "var(--fg3)", marginTop: 4 }}>
          {t("trigger")}: {d.triggerSummary}
        </div>
      )}
    </div>
  );
}

// ── Overview Metadata Footer ─────────────────────────────────────────────────

function OverviewMetaFooter({ detail: d }: { detail: InitiativeDetail }) {
  const t = useTranslations("initiatives");
  const locale = useLocale();

  const metaPills: Array<{ label: string; value: string }> = [];
  if (d.severity) metaPills.push({ label: "Severity", value: d.severity });
  if (d.priority) metaPills.push({ label: "Priority", value: d.priority });
  if (d.expectedImpact) metaPills.push({ label: "Impact", value: d.expectedImpact });
  if (d.effortEstimate) metaPills.push({ label: "Effort", value: d.effortEstimate });

  if (metaPills.length === 0 && !d.synthesizedByModel) return null;

  return (
    <div className="pt-3 space-y-2" style={{ borderTop: "1px solid var(--border)", marginTop: 20 }}>
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
  );
}

// ── Overview Action Bar (sticky, proposed only) ──────────────────────────────

function OverviewActionBar({
  detail: d,
  patchInitiative,
}: {
  detail: InitiativeDetail;
  patchInitiative: (id: string, body: Record<string, unknown>) => Promise<void>;
}) {
  const t = useTranslations("initiatives");
  const tc = useTranslations("common");

  if (d.status !== "proposed") return null;

  return (
    <div style={{
      position: "sticky",
      bottom: 0,
      marginTop: 16,
      marginLeft: -20,
      marginRight: -20,
      padding: "12px 20px",
      background: "color-mix(in srgb, var(--surface) 92%, transparent)",
      backdropFilter: "blur(6px)",
      borderTop: "1px solid var(--border)",
    }}>
      <div className="flex items-center gap-2">
        <button
          className="rounded-full text-[13px] font-semibold px-4 py-2 transition-colors"
          style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
          onClick={() => patchInitiative(d.id, { action: "accept" })}
        >
          {t("accept")}
        </button>
        <button
          className="rounded-full text-[13px] font-medium px-4 py-2 transition-colors"
          style={{ background: "var(--elevated)", border: "1px solid var(--border)", color: "var(--fg2)" }}
          onClick={() => patchInitiative(d.id, { action: "reject" })}
        >
          {tc("reject")}
        </button>
      </div>
      <div style={{ fontSize: 11, color: "var(--fg3)", marginTop: 8, lineHeight: 1.5 }}>
        {t("acceptHelpCopy")}
      </div>
    </div>
  );
}

// ── Banner Row (dismissed / concerns_raised / implemented) ───────────────────

function BannerRow({
  detail: d,
  runExecutionAction,
}: {
  detail: InitiativeDetail;
  runExecutionAction: (action: "retry" | "skip_downstream" | "abandon") => Promise<void>;
}) {
  const t = useTranslations("initiatives");

  if (d.status === "dismissed" && d.dismissalReason) {
    return (
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
    );
  }

  if (d.status === "concerns_raised") {
    return (
      <ExecutionConcernsBanner
        detail={d}
        onAction={runExecutionAction}
        onDiscuss={() => {
          const chatInput = document.getElementById("initiative-chat-input") as HTMLTextAreaElement | null;
          chatInput?.focus();
        }}
      />
    );
  }

  if (d.status === "implemented") {
    return <ExecutionSummaryBlock detail={d} />;
  }

  return null;
}

// ── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({
  detail: d,
  onSelectChange,
  runExecutionAction,
  patchInitiative,
}: {
  detail: InitiativeDetail;
  onSelectChange: (tab: string) => void;
  runExecutionAction: (action: "retry" | "skip_downstream" | "abandon") => Promise<void>;
  patchInitiative: (id: string, body: Record<string, unknown>) => Promise<void>;
}) {
  const t = useTranslations("initiatives");
  const { sections, dashboard, evidenceItems } = useMemo(() => parseInitiativePage(d.content), [d.content]);
  const hasDashboard =
    dashboard.cards.length > 0 && dashboard.fallback !== "prose_only";

  // Prose-only branch: Proposal leads, then Investigation → Impact Assessment → Alternatives → Timeline.
  const blocks: Array<{ label: string; body: string }> = [];
  if (sections.proposal) blocks.push({ label: t("proposal"), body: sections.proposal });
  if (sections.investigation) blocks.push({ label: t("investigation"), body: sections.investigation });
  if (sections.impactAssessment) blocks.push({ label: t("impactAssessment"), body: sections.impactAssessment });
  if (sections.alternativesConsidered) blocks.push({ label: t("alternativesConsidered"), body: sections.alternativesConsidered });
  if (sections.timeline) blocks.push({ label: t("timeline"), body: sections.timeline });

  const allConcerns: ExecConcern[] = d.executionState
    ? [
        ...d.executionState.crossConcerns,
        ...d.executionState.downstream.flatMap((dd) => dd.concerns),
      ]
    : [];

  const body = (() => {
    if (hasDashboard) {
      return (
        <div className="space-y-5">
          <DashboardCards cards={dashboard.cards} />

          {dashboard.failedCards.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 12 }}>
              {dashboard.failedCards.map((fc, i) => (
                <div key={i} style={{ gridColumn: "span 6" }}>
                  <FailedCardPlaceholder failed={fc} />
                </div>
              ))}
            </div>
          )}

          {d.primaryDeliverable && (
            <ChangesetContainer detail={d} onSelectChange={onSelectChange} />
          )}

          {sections.investigation && (
            <Section label={t("investigation")}>
              <WikiText
                text={sections.investigation}
                crossReferences={d.crossReferences}
                asParagraphs
                style={{ fontSize: 13, lineHeight: 1.65, color: "var(--fg2)" }}
              />
            </Section>
          )}

          {sections.alternativesConsidered && (
            <Section label={t("alternativesConsidered")}>
              <WikiText
                text={sections.alternativesConsidered}
                crossReferences={d.crossReferences}
                asParagraphs
                style={{ fontSize: 13, lineHeight: 1.65, color: "var(--fg2)" }}
              />
            </Section>
          )}
        </div>
      );
    }

    if (blocks.length === 0 && allConcerns.length === 0 && evidenceItems.length === 0 && !d.primaryDeliverable) {
      return (
        <div className="flex items-center justify-center py-12" style={{ fontSize: 13, color: "var(--fg4)" }}>
          No overview content available.
        </div>
      );
    }

    return (
      <div className="space-y-5">
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
                  <span style={{ fontSize: 13, color: "var(--fg2)", lineHeight: 1.5 }}>
                    <WikiText text={e.claim} crossReferences={d.crossReferences} />
                  </span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {blocks.map((b, i) => (
          <Section key={i} label={b.label}>
            <WikiText
              text={b.body}
              crossReferences={d.crossReferences}
              asParagraphs
              style={{ fontSize: 13, lineHeight: 1.65, color: "var(--fg2)" }}
            />
          </Section>
        ))}

        {allConcerns.length > 0 && <ConcernsList concerns={allConcerns} detail={d} />}

        {d.primaryDeliverable && (
          <ChangesetContainer detail={d} onSelectChange={onSelectChange} />
        )}
      </div>
    );
  })();

  return (
    <div className="flex flex-col min-h-full">
      <OverviewHeader detail={d} />
      <BannerRow detail={d} runExecutionAction={runExecutionAction} />

      <div className="flex-1">
        {body}
      </div>

      <OverviewMetaFooter detail={d} />
      <OverviewActionBar detail={d} patchInitiative={patchInitiative} />
    </div>
  );
}

// ── Details Tab ──────────────────────────────────────────────────────────────

function DetailsTab({ detail: d }: { detail: InitiativeDetail }) {
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
        No detail content available.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {blocks.map((b, i) => (
        <Section key={i} label={b.label}>
          <WikiText
            text={b.body}
            crossReferences={d.crossReferences}
            asParagraphs
            style={{ fontSize: 13, lineHeight: 1.65, color: "var(--fg2)" }}
          />
        </Section>
      ))}
    </div>
  );
}

// ── Execution Concerns Banner ────────────────────────────────────────────────

function ExecutionConcernsBanner({
  detail: d,
  onAction,
  onDiscuss,
}: {
  detail: InitiativeDetail;
  onAction: (action: "retry" | "skip_downstream" | "abandon") => Promise<void>;
  onDiscuss: () => void;
}) {
  const t = useTranslations("initiatives");
  const [submitting, setSubmitting] = useState<string | null>(null);
  const state = d.executionState;
  if (!state) return null;

  const allConcerns: ExecConcern[] = [
    ...state.crossConcerns,
    ...state.downstream.flatMap((dd) => dd.concerns),
  ];
  const blocking = allConcerns.filter((c) => c.severity === "blocking").length;
  const warnings = allConcerns.filter((c) => c.severity === "warning").length;
  const failed = state.downstream.filter((dd) => dd.status === "failed").length;

  const run = async (action: "retry" | "skip_downstream" | "abandon") => {
    if (submitting) return;
    setSubmitting(action);
    try {
      await onAction(action);
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div style={{
      padding: "14px 16px",
      background: "color-mix(in srgb, var(--warn) 10%, transparent)",
      border: "1px solid var(--warn)",
      borderRadius: 6,
    }}>
      <div className="flex items-start gap-3 mb-3">
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--warn)" }}>
          {t("concernsRaisedTitle")}
        </div>
      </div>

      <div style={{ fontSize: 12, color: "var(--fg2)", marginBottom: 12, lineHeight: 1.55 }}>
        {t("concernsRaisedBody", { blocking, warnings, failed })}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => run("retry")}
          disabled={!!submitting}
          className="rounded-full text-[12px] font-medium px-3 py-1.5"
          style={{ background: "var(--accent)", color: "var(--accent-ink)", opacity: submitting ? 0.5 : 1 }}
        >
          {submitting === "retry" ? t("submittingGeneric") : t("actionRetry")}
        </button>
        <button
          onClick={() => run("skip_downstream")}
          disabled={!!submitting}
          className="rounded-full text-[12px] font-medium px-3 py-1.5"
          style={{ background: "var(--elevated)", color: "var(--fg2)", opacity: submitting ? 0.5 : 1 }}
        >
          {submitting === "skip_downstream" ? t("submittingGeneric") : t("actionSkipDownstream")}
        </button>
        <button
          onClick={() => run("abandon")}
          disabled={!!submitting}
          className="wf-btn-danger rounded-full text-[12px] font-medium px-3 py-1.5"
        >
          {submitting === "abandon" ? t("submittingGeneric") : t("actionAbandon")}
        </button>
        <button
          onClick={onDiscuss}
          className="rounded-full text-[12px] font-medium px-3 py-1.5"
          style={{ background: "transparent", color: "var(--fg3)", border: "1px solid var(--border)" }}
        >
          {t("actionDiscuss")}
        </button>
      </div>
    </div>
  );
}

// ── Execution Summary Block (implemented) ────────────────────────────────────

function ExecutionSummaryBlock({ detail: d }: { detail: InitiativeDetail }) {
  const t = useTranslations("initiatives");
  const summary = d.executionSummary;
  if (!summary) return null;

  return (
    <div style={{
      padding: "12px 14px",
      background: "color-mix(in srgb, var(--ok) 8%, transparent)",
      border: "1px solid color-mix(in srgb, var(--ok) 40%, var(--border))",
      borderRadius: 6,
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ok)", marginBottom: 8 }}>
        {t("implementedTitle")}
      </div>
      <div style={{ fontSize: 12, color: "var(--fg2)", lineHeight: 1.55, marginBottom: 8 }}>
        {t("implementedBody", {
          modified: summary.pagesModified.length,
          skipped: summary.skippedDownstream.length,
          failed: summary.failedDownstream.length,
          cost: (summary.totalCostCents / 100).toFixed(2),
        })}
      </div>
      {summary.pagesModified.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {summary.pagesModified.map((slug) => (
            <a
              key={slug}
              href={`/wiki/${slug}`}
              style={{
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: 4,
                background: "var(--hover)",
                color: "var(--accent)",
                textDecoration: "none",
              }}
            >
              {d.resolvedTargetTitles[slug] ?? slug}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Concerns List + Card (used by Overview tab + downstream tabs) ────────────

function ConcernsList({ concerns, detail }: { concerns: ExecConcern[]; detail: InitiativeDetail }) {
  const t = useTranslations("initiatives");
  const blocking = concerns.filter((c) => c.severity === "blocking");
  const warnings = concerns.filter((c) => c.severity === "warning");

  return (
    <div>
      <Section label={t("concerns")}>
        <div>
          {blocking.map((c, i) => (
            <ConcernCard key={`b-${i}`} concern={c} detail={detail} severity="blocking" />
          ))}
          {warnings.map((c, i) => (
            <ConcernCard key={`w-${i}`} concern={c} detail={detail} severity="warning" />
          ))}
        </div>
      </Section>
    </div>
  );
}

function ConcernCard({
  concern: c,
  detail: d,
  severity,
}: {
  concern: ExecConcern;
  detail: InitiativeDetail;
  severity: "warning" | "blocking";
}) {
  const t = useTranslations("initiatives");
  const bg = severity === "blocking"
    ? "color-mix(in srgb, var(--danger) 10%, transparent)"
    : "color-mix(in srgb, var(--warn) 10%, transparent)";
  const borderColor = severity === "blocking" ? "var(--danger)" : "var(--warn)";
  const pillColor = severity === "blocking" ? "var(--danger)" : "var(--warn)";

  let targetLabel: string | null = null;
  if (c.targetChangeId === "primary") targetLabel = t("primaryDeliverable");
  else if (c.targetChangeId?.startsWith("downstream-")) {
    const idx = Number(c.targetChangeId.replace("downstream-", ""));
    const effect = (d.executionState?.downstream ?? [])[idx]?.effect;
    if (effect) {
      targetLabel = d.resolvedTargetTitles[effect.targetPageSlug] ?? effect.targetPageSlug;
    }
  }

  return (
    <div className="mb-2" style={{ padding: "10px 12px", background: bg, border: `1px solid ${borderColor}`, borderRadius: 6 }}>
      <div className="flex items-center gap-2 mb-1">
        <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 3, background: pillColor, color: "var(--accent-ink)", textTransform: "uppercase" }}>
          {severity}
        </span>
        {targetLabel && (
          <span style={{ fontSize: 11, color: "var(--fg3)" }}>
            {targetLabel}
          </span>
        )}
        <span style={{ fontSize: 10, color: "var(--fg4)" }}>
          {c.source === "llm" ? t("concernSourceLlm") : t("concernSourceProgrammatic")}
        </span>
      </div>
      <div style={{ fontSize: 12, color: "var(--fg2)", lineHeight: 1.5, marginBottom: 4 }}>
        {c.description}
      </div>
      {c.recommendation && (
        <div style={{ fontSize: 11, color: "var(--fg3)", fontStyle: "italic" }}>
          → {c.recommendation}
        </div>
      )}
    </div>
  );
}

// ── Downstream status badge ──────────────────────────────────────────────────

function DownstreamStatusBadge({ status }: { status: string }) {
  const t = useTranslations("initiatives");
  const colors: Record<string, { bg: string; fg: string }> = {
    pending: { bg: "var(--elevated)", fg: "var(--fg3)" },
    generating: { bg: "var(--hover)", fg: "var(--fg2)" },
    generated: { bg: "color-mix(in srgb, var(--accent) 15%, transparent)", fg: "var(--accent)" },
    applying: { bg: "color-mix(in srgb, var(--accent) 15%, transparent)", fg: "var(--accent)" },
    applied: { bg: "color-mix(in srgb, var(--ok) 15%, transparent)", fg: "var(--ok)" },
    failed: { bg: "color-mix(in srgb, var(--danger) 15%, transparent)", fg: "var(--danger)" },
  };
  const c = colors[status] ?? colors.pending;
  return (
    <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3, background: c.bg, color: c.fg, textTransform: "uppercase" }}>
      {t(`downstreamStatus.${status}` as never)}
    </span>
  );
}

// ── Diff View ────────────────────────────────────────────────────────────────

function WikiUpdateDiffView({
  current,
  proposed,
}: {
  current: string | null;
  proposed: string;
}) {
  const changes = useMemo(() => diffLines(current ?? "", proposed), [current, proposed]);

  return (
    <div
      style={{
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 12,
        lineHeight: 1.6,
        background: "var(--bg)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        overflow: "hidden",
      }}
    >
      {changes.map((part: Change, i) => {
        const isAdd = part.added;
        const isRemove = part.removed;
        const bg = isAdd
          ? "color-mix(in srgb, var(--ok) 18%, transparent)"
          : isRemove
          ? "color-mix(in srgb, var(--danger) 14%, transparent)"
          : "transparent";
        const color = isAdd ? "var(--ok)" : isRemove ? "var(--danger)" : "var(--fg2)";
        const prefix = isAdd ? "+ " : isRemove ? "- " : "  ";
        const lines = part.value
          .split("\n")
          .filter((l, idx, arr) => !(idx === arr.length - 1 && l === ""));
        return (
          <div key={i}>
            {lines.map((line, j) => (
              <div
                key={j}
                style={{
                  background: bg,
                  color,
                  padding: "0 12px",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  textDecoration: isRemove ? "line-through" : "none",
                  opacity: isRemove ? 0.75 : 1,
                }}
              >
                {prefix}
                {line}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ── Wiki-style page container shared by deliverable + downstream tabs ──────
// Mirrors the chrome /wiki/[slug] uses: outer 1080px frame, elevated surface
// with a light border, and an inner 760px reading column.

function DeliverablePageContainer({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: 1080, width: "100%", margin: "0 auto" }}>
      <div
        style={{
          background: "var(--elevated)",
          border: "1.5px solid var(--border)",
          padding: "24px 48px 48px",
        }}
      >
        <div style={{ maxWidth: 760, margin: "0 auto" }}>{children}</div>
      </div>
    </div>
  );
}

// Markdown renderer matching the wiki page's component overrides so a
// deliverable preview reads the same as a published wiki page would.

function DeliverableMarkdown({ text }: { text: string }) {
  return (
    <div style={{ fontSize: 14, lineHeight: 1.7, color: "var(--foreground)" }}>
      <ReactMarkdown
        components={{
          p: ({ children }) => <p style={{ marginBottom: 12 }}>{children}</p>,
          h1: ({ children }) => (
            <h1 style={{ fontSize: 20, fontWeight: 600, marginTop: 24, marginBottom: 12, color: "var(--foreground)" }}>{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 style={{ fontSize: 16, fontWeight: 600, marginTop: 20, marginBottom: 10, color: "var(--foreground)" }}>{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 style={{ fontSize: 14, fontWeight: 600, marginTop: 16, marginBottom: 8, color: "var(--foreground)" }}>{children}</h3>
          ),
          ul: ({ children }) => <ul style={{ paddingLeft: 20, marginBottom: 12 }}>{children}</ul>,
          ol: ({ children }) => <ol style={{ paddingLeft: 20, marginBottom: 12 }}>{children}</ol>,
          li: ({ children }) => <li style={{ marginBottom: 4, color: "var(--fg2)" }}>{children}</li>,
          strong: ({ children }) => (
            <strong style={{ fontWeight: 600, color: "var(--foreground)" }}>{children}</strong>
          ),
          em: ({ children }) => <em style={{ color: "var(--fg2)" }}>{children}</em>,
          hr: () => <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "16px 0" }} />,
          code: ({ children }) => (
            <code style={{ padding: "2px 5px", borderRadius: 3, background: "rgba(255,255,255,0.06)", fontSize: 12, fontFamily: "monospace" }}>
              {children}
            </code>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

// ── Primary Deliverable Tab ──────────────────────────────────────────────────

function PrimaryDeliverableTab({
  detail: d,
  editable,
  editorRef,
  onEditorStateChange,
  onSaveStatusChange,
  onForceSaveRegister,
}: {
  detail: InitiativeDetail;
  editable: boolean;
  editorRef: RefObject<DeliverableEditorHandle>;
  onEditorStateChange: (state: { canUndo: boolean; canRedo: boolean }) => void;
  onSaveStatusChange: (status: SaveStatus) => void;
  onForceSaveRegister: (fn: () => void) => void;
}) {
  const t = useTranslations("initiatives");
  const primary = d.primaryDeliverable!;

  // ── Autosave state ──
  // `lastSavedRef` tracks what's currently persisted; compare against the
  // editor's live markdown to compute dirty vs clean.
  const lastSavedRef = useRef(primary.proposedContent ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initiativeId = d.id;

  const buildBody = useCallback((content: string) => ({
    deliverable: {
      type: primary.type,
      title: primary.title,
      description: primary.description,
      rationale: primary.rationale,
      ...(primary.targetPageSlug ? { targetPageSlug: primary.targetPageSlug } : {}),
      ...(primary.targetPageType ? { targetPageType: primary.targetPageType } : {}),
      proposedContent: content,
    },
  }), [primary.type, primary.title, primary.description, primary.rationale, primary.targetPageSlug, primary.targetPageType]);

  const persist = useCallback(async (content: string) => {
    if (content === lastSavedRef.current) {
      onSaveStatusChange("saved");
      return;
    }
    onSaveStatusChange("saving");
    try {
      const res = await fetch(`/api/initiatives/${initiativeId}/deliverable`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody(content)),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      lastSavedRef.current = content;
      onSaveStatusChange("saved");
    } catch (err) {
      console.error("Autosave failed", err);
      onSaveStatusChange("error");
    }
  }, [initiativeId, buildBody, onSaveStatusChange]);

  const forceSave = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const md = editorRef.current?.getMarkdown() ?? lastSavedRef.current;
    void persist(md);
  }, [editorRef, persist]);

  useEffect(() => {
    onForceSaveRegister(forceSave);
  }, [forceSave, onForceSaveRegister]);

  const handleChange = useCallback((md: string) => {
    if (md === lastSavedRef.current) {
      onSaveStatusChange("idle");
      return;
    }
    onSaveStatusChange("dirty");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      void persist(md);
    }, 800);
  }, [persist, onSaveStatusChange]);

  // ⌘/Ctrl+S → force save
  useEffect(() => {
    if (!editable) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        forceSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editable, forceSave]);

  // Warn on reload if unsaved
  useEffect(() => {
    if (!editable) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const live = editorRef.current?.getMarkdown();
      if (live !== undefined && live !== lastSavedRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [editable, editorRef]);

  // On unmount: cancel pending debounce; fire-and-forget flush if dirty.
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      const md = editorRef.current?.getMarkdown();
      if (md !== undefined && md !== lastSavedRef.current) {
        fetch(`/api/initiatives/${initiativeId}/deliverable`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildBody(md)),
          keepalive: true,
        }).catch(() => {});
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Render ── header + divider + editor body, inside the shared page container.

  const headerEl = (
    <header>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: "var(--foreground)", margin: 0, lineHeight: "24px" }}>
          {primary.title}
        </h1>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            padding: "2px 6px",
            borderRadius: 3,
            background: "color-mix(in srgb, var(--accent) 14%, transparent)",
            color: "var(--accent)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          {t(`changeType.${primary.type}` as never)}
        </span>
        {primary.targetPageSlug && (
          <span style={{ fontSize: 11, color: "var(--fg3)" }}>
            {"→ "}
            <a
              href={`/wiki/${primary.targetPageSlug}`}
              style={{ color: "var(--link)", textDecoration: "underline" }}
              className="hover:opacity-80"
            >
              {primary.targetPageSlug}
            </a>
            {primary.targetPageType ? ` (${primary.targetPageType})` : ""}
          </span>
        )}
      </div>
      {primary.description && (
        <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--fg2)", marginTop: 12 }}>
          {primary.description}
        </p>
      )}
      {primary.rationale && (
        <p
          style={{
            fontSize: 13,
            lineHeight: 1.6,
            color: "var(--fg3)",
            fontStyle: "italic",
            borderLeft: "2px solid var(--border)",
            paddingLeft: 12,
            marginTop: 12,
          }}
        >
          {primary.rationale}
        </p>
      )}
    </header>
  );

  const divider = (
    <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "20px 0" }} />
  );

  const bodyEl = (() => {
    if (!primary.proposedContent) {
      return (
        <div
          style={{
            padding: 16,
            background: "color-mix(in srgb, var(--warn) 10%, transparent)",
            border: "1px solid color-mix(in srgb, var(--warn) 30%, transparent)",
            borderRadius: 6,
            fontSize: 13,
            color: "var(--warn)",
          }}
        >
          {t("contentGenerationFailed")}
        </div>
      );
    }
    // Read-only wiki_update previews stay as the diff view for context; once
    // editable, switch to the editor on the proposed content itself.
    if (primary.type === "wiki_update" && !editable) {
      return (
        <WikiUpdateDiffView
          current={d.primaryTargetCurrentContent}
          proposed={primary.proposedContent}
        />
      );
    }
    if (primary.type === "wiki_update" || primary.type === "wiki_create" || primary.type === "document") {
      return (
        <DeliverableEditor
          ref={editorRef}
          initialMarkdown={primary.proposedContent}
          editable={editable}
          onChange={handleChange}
          onStateChange={onEditorStateChange}
        />
      );
    }
    // settings_change — markdown description (editable) + properties table (read-only)
    return (
      <div>
        <DeliverableEditor
          ref={editorRef}
          initialMarkdown={primary.proposedContent}
          editable={editable}
          onChange={handleChange}
          onStateChange={onEditorStateChange}
        />
        {primary.proposedProperties && Object.keys(primary.proposedProperties).length > 0 && (
          <table style={{ fontSize: 12, width: "100%", borderCollapse: "collapse", marginTop: 16 }}>
            <thead>
              <tr>
                <th
                  style={{
                    textAlign: "left",
                    padding: "6px 8px",
                    borderBottom: "1px solid var(--border)",
                    color: "var(--fg3)",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    fontSize: 10,
                    letterSpacing: "0.04em",
                  }}
                >
                  Setting
                </th>
                <th
                  style={{
                    textAlign: "left",
                    padding: "6px 8px",
                    borderBottom: "1px solid var(--border)",
                    color: "var(--fg3)",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    fontSize: 10,
                    letterSpacing: "0.04em",
                  }}
                >
                  Value
                </th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(primary.proposedProperties).map(([k, v]) => (
                <tr key={k}>
                  <td
                    style={{
                      padding: "6px 8px",
                      borderBottom: "1px solid var(--border)",
                      color: "var(--fg2)",
                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    }}
                  >
                    {k}
                  </td>
                  <td
                    style={{
                      padding: "6px 8px",
                      borderBottom: "1px solid var(--border)",
                      color: "var(--fg2)",
                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    }}
                  >
                    {JSON.stringify(v)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  })();

  return (
    <DeliverablePageContainer>
      {headerEl}
      {divider}
      {bodyEl}
    </DeliverablePageContainer>
  );
}

// ── Downstream Effect Tab ────────────────────────────────────────────────────

function DownstreamEffectTab({
  detail: d,
  effect,
  index,
}: {
  detail: InitiativeDetail;
  effect: DownstreamEffect;
  index: number;
}) {
  const t = useTranslations("initiatives");
  const state = d.executionState?.downstream?.[index];
  const title = d.resolvedTargetTitles[effect.targetPageSlug] ?? effect.targetPageSlug;
  const currentContent = effect.changeType === "update"
    ? (d.downstreamCurrentContents?.[effect.targetPageSlug]?.content ?? null)
    : null;

  const headerEl = (
    <header>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: "var(--foreground)", margin: 0, lineHeight: "24px" }}>
          {title}
        </h1>
        {state && <DownstreamStatusBadge status={state.status} />}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
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
          {t(`changeType.${effect.changeType}` as never)}
        </span>
      </div>
      <p style={{ fontSize: 13, color: "var(--fg2)", lineHeight: 1.5, marginTop: 12 }}>
        {effect.summary}
      </p>
    </header>
  );

  const divider = (
    <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "20px 0" }} />
  );

  const infoBanner = (msg: string) => (
    <div style={{
      padding: 14,
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: 6,
      fontSize: 13,
      color: "var(--fg3)",
    }}>
      {msg}
    </div>
  );

  const bodyEl = (() => {
    if (!state) {
      return infoBanner(
        d.status === "proposed"
          ? t("downstreamPendingBanner")
          : t("downstreamAwaitingExecution"),
      );
    }
    if (state.status === "failed") {
      return (
        <div style={{
          padding: 14,
          background: "color-mix(in srgb, var(--danger) 10%, transparent)",
          border: "1px solid var(--danger)",
          borderRadius: 6,
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--danger)", marginBottom: 6 }}>
            {t("downstreamFailed")}
          </div>
          {state.error && (
            <div style={{ fontSize: 12, color: "var(--fg2)", fontFamily: "ui-monospace, monospace", whiteSpace: "pre-wrap" }}>
              {state.error}
            </div>
          )}
        </div>
      );
    }
    if (state.status === "pending" || state.status === "generating" || state.status === "applying") {
      return infoBanner(t(`downstreamStatus.${state.status}` as never));
    }
    if (!state.proposedContent) {
      return infoBanner(t("downstreamNoContent"));
    }
    return (
      <>
        {state.concerns.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            {state.concerns.map((c, i) => (
              <ConcernCard key={i} concern={c} detail={d} severity={c.severity} />
            ))}
          </div>
        )}
        {effect.changeType === "update" ? (
          <WikiUpdateDiffView current={currentContent} proposed={state.proposedContent} />
        ) : (
          <DeliverableMarkdown text={state.proposedContent} />
        )}
        <div style={{ marginTop: 16 }}>
          <a
            href={`/wiki/${effect.targetPageSlug}`}
            style={{ fontSize: 13, fontWeight: 500, color: "var(--accent)", textDecoration: "none" }}
            className="hover:opacity-80"
          >
            {t("viewTargetPage")}
          </a>
        </div>
      </>
    );
  })();

  return (
    <DeliverablePageContainer>
      {headerEl}
      {divider}
      {bodyEl}
    </DeliverablePageContainer>
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
