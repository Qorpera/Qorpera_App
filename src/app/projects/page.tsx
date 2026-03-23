"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { ContextualChat } from "@/components/contextual-chat";
import { useUser } from "@/components/user-provider";
import { useIsMobile } from "@/hooks/use-media-query";
import { useTranslations, useLocale } from "next-intl";
import { formatRelativeTime } from "@/lib/format-helpers";

// ── Types ────────────────────────────────────────────────────────────────────

interface WorkStreamListItem {
  id: string;
  title: string;
  description: string | null;
  goalId: string | null;
  status: string;
  parentWorkStreamId: string | null;
  completedAt: string | null;
  createdAt: string;
  itemCount: number;
  childCount: number;
  completionPercentage: number;
}

interface WorkStreamDetail {
  id: string;
  title: string;
  description: string | null;
  goalId: string | null;
  ownerAiEntityId: string | null;
  status: string;
  parentWorkStreamId: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: WorkStreamItemDetail[];
  children: Array<{ id: string; title: string; status: string; completedAt: string | null }>;
  parentChain: Array<{ id: string; title: string }>;
}

interface WorkStreamItemDetail {
  workStreamItemId: string;
  itemType: "situation" | "initiative";
  itemId: string;
  addedAt: string;
  status: string;
  summary: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function statusBadgeVariant(status: string): "green" | "red" | "amber" | "default" {
  switch (status) {
    case "completed": return "green";
    case "paused": return "amber";
    default: return "default";
  }
}

function itemStatusColor(status: string): string {
  switch (status) {
    case "resolved":
    case "completed": return "var(--ok)";
    case "rejected":
    case "failed":
    case "dismissed": return "var(--danger)";
    case "proposed":
    case "detected": return "var(--warn)";
    case "executing":
    case "approved": return "var(--accent)";
    default: return "var(--fg3)";
  }
}

const ACTIVE_STATUSES = ["active"];

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const [workStreams, setWorkStreams] = useState<WorkStreamListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<WorkStreamDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [filter, setFilter] = useState<"active" | "all">("active");
  const { role } = useUser();
  const isMobile = useIsMobile();
  const isAdmin = role === "admin" || role === "superadmin";
  const t = useTranslations("projects");
  const tc = useTranslations("common");
  const locale = useLocale();

  // ── Fetch list ───────────────────────────────────────────────────────────

  const fetchWorkStreams = useCallback(async () => {
    try {
      const res = await fetch("/api/workstreams");
      if (res.ok) {
        const data = await res.json();
        setWorkStreams(data);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchWorkStreams(); }, [fetchWorkStreams]);

  // ── Fetch detail ─────────────────────────────────────────────────────────

  const fetchDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/workstreams/${id}`);
      if (res.ok) setDetail(await res.json());
    } catch {}
    setDetailLoading(false);
  }, []);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    let cancelled = false;
    setDetail(null);
    setDetailLoading(true);
    fetch(`/api/workstreams/${selectedId}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (!cancelled && data) setDetail(data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId]);

  // ── Derived ────────────────────────────────────────────────────────────

  const filteredWorkStreams = useMemo(() =>
    filter === "active"
      ? workStreams.filter(ws => ACTIVE_STATUSES.includes(ws.status))
      : workStreams,
    [workStreams, filter],
  );

  useEffect(() => {
    if (selectedId && !filteredWorkStreams.some(ws => ws.id === selectedId)) {
      setSelectedId(null);
    }
  }, [filteredWorkStreams, selectedId]);

  // ── Actions ────────────────────────────────────────────────────────────

  const removeItem = async (wsId: string, itemId: string) => {
    try {
      await fetch(`/api/workstreams/${wsId}/items/${itemId}`, { method: "DELETE" });
      await fetchWorkStreams();
      if (selectedId) fetchDetail(selectedId);
    } catch {}
  };

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <AppShell>
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── Left: project list ── */}
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
            {filteredWorkStreams.map(ws => {
              const sitCount = ws.itemCount;
              return (
                <button
                  key={ws.id}
                  onClick={() => setSelectedId(ws.id)}
                  className="w-full text-left px-4 py-2.5 transition"
                  style={{
                    borderBottom: "1px solid var(--border)",
                    borderLeft: selectedId === ws.id ? "2px solid var(--accent)" : "2px solid transparent",
                    background: selectedId === ws.id ? "var(--hover)" : "transparent",
                  }}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground)" }} className="truncate flex-1">
                      {ws.title}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--fg4)" }} className="flex-shrink-0">
                      {formatRelativeTime(ws.createdAt, locale)}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--fg4)" }} className="truncate">
                    {sitCount} item{sitCount !== 1 ? "s" : ""} &middot; {ws.completionPercentage}% &middot; {ws.status.charAt(0).toUpperCase() + ws.status.slice(1)}
                  </div>
                </button>
              );
            })}
            {!loading && filteredWorkStreams.length === 0 && (
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
            <ProjectDetail
              key={selectedId}
              detail={detail}
              detailLoading={detailLoading}
              isAdmin={isAdmin}
              removeItem={removeItem}
              onSelectWorkStream={setSelectedId}
              fetchWorkStreams={fetchWorkStreams}
              fetchDetail={fetchDetail}
            />
          ) : selectedId && detailLoading ? (
            <div className="flex justify-center py-16">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-muted" />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full" style={{ fontSize: 13, color: "var(--fg4)" }}>
              {t("selectProject")}
            </div>
          )}
        </div>
        )}

      </div>
    </AppShell>
  );
}

// ── Project Detail ───────────────────────────────────────────────────────────

function ProjectDetail({
  detail: d,
  detailLoading,
  isAdmin,
  removeItem,
  onSelectWorkStream,
  fetchWorkStreams,
  fetchDetail,
}: {
  detail: WorkStreamDetail;
  detailLoading: boolean;
  isAdmin: boolean;
  removeItem: (wsId: string, itemId: string) => Promise<void>;
  onSelectWorkStream: (id: string) => void;
  fetchWorkStreams: () => Promise<void>;
  fetchDetail: (id: string) => Promise<void>;
}) {
  const t = useTranslations("projects");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [addingItem, setAddingItem] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ id: string; type: string; label: string }>>([]);
  const [searching, setSearching] = useState(false);

  // Search for situations/initiatives to add
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const [sitRes, iniRes] = await Promise.all([
          fetch(`/api/situations?status=detected,proposed,reasoning,auto_executing,executing,resolved&limit=10`),
          fetch(`/api/initiatives?limit=10`),
        ]);
        const results: Array<{ id: string; type: string; label: string }> = [];
        const existingIds = new Set(d.items.map(i => i.itemId));
        const q = searchQuery.toLowerCase();

        if (sitRes.ok) {
          const sitData = await sitRes.json();
          for (const s of sitData.items ?? []) {
            if (existingIds.has(s.id)) continue;
            const label = `${s.triggerEntityName ?? "Unknown"} — ${s.situationType?.name ?? ""}`;
            if (label.toLowerCase().includes(q)) {
              results.push({ id: s.id, type: "situation", label });
            }
          }
        }
        if (iniRes.ok) {
          const iniData = await iniRes.json();
          for (const i of iniData.items ?? []) {
            if (existingIds.has(i.id)) continue;
            const label = i.rationale?.split(/[.!?\n]/)[0] ?? "Untitled initiative";
            if (label.toLowerCase().includes(q)) {
              results.push({ id: i.id, type: "initiative", label });
            }
          }
        }
        setSearchResults(results.slice(0, 8));
      } catch {}
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, d.items]);

  const addItem = async (itemType: string, itemId: string) => {
    try {
      await fetch(`/api/workstreams/${d.id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemType, itemId }),
      });
      setSearchQuery("");
      setSearchResults([]);
      setAddingItem(false);
      await fetchWorkStreams();
      fetchDetail(d.id);
    } catch {}
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
        {/* ── Breadcrumb ── */}
        {d.parentChain.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap" style={{ fontSize: 12 }}>
            {d.parentChain.map((p, i) => (
              <span key={p.id} className="flex items-center gap-1">
                <button
                  onClick={() => onSelectWorkStream(p.id)}
                  className="hover:underline transition-colors"
                  style={{ color: "var(--fg3)" }}
                >
                  {p.title}
                </button>
                {i < d.parentChain.length - 1 && <span style={{ color: "var(--fg4)" }}>/</span>}
              </span>
            ))}
            <span style={{ color: "var(--fg4)" }}>/</span>
            <span style={{ color: "var(--fg2)" }}>{d.title}</span>
          </div>
        )}

        {/* ── Header ── */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant={statusBadgeVariant(d.status)}>
              {d.status.charAt(0).toUpperCase() + d.status.slice(1)}
            </Badge>
            <span style={{ fontSize: 12, color: "var(--fg4)" }}>{formatRelativeTime(d.createdAt, locale)}</span>
          </div>
          <h1 className="font-heading" style={{ fontSize: 18, fontWeight: 600, color: "var(--foreground)" }}>
            {d.title}
          </h1>
        </div>

        {/* Description */}
        {d.description && (
          <div style={{ padding: "14px 16px", background: "var(--surface)", border: "1px solid var(--elevated)", borderRadius: 4 }}>
            <p style={{ fontSize: 13, lineHeight: 1.65, color: "var(--fg2)", whiteSpace: "pre-wrap" }}>{d.description}</p>
          </div>
        )}

        {detailLoading && (
          <div className="flex justify-center py-8">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-muted" />
          </div>
        )}

        {/* ── Items ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "var(--fg4)", textTransform: "uppercase" as const }}>
              {t("items")} &middot; {d.items.length}
            </div>
            {isAdmin && !addingItem && (
              <button
                onClick={() => setAddingItem(true)}
                className="text-[11px] font-medium px-2.5 py-1 rounded-full transition"
                style={{ background: "var(--accent-light)", border: "1px solid var(--accent-light)", color: "var(--accent)" }}
              >
                {t("addItem")}
              </button>
            )}
          </div>

          {/* Add item search */}
          {addingItem && (
            <div className="mb-3 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder={t("searchPlaceholder")}
                  autoFocus
                  className="flex-1 outline-none"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, padding: "6px 10px", fontSize: 12, color: "var(--foreground)" }}
                />
                <button
                  onClick={() => { setAddingItem(false); setSearchQuery(""); setSearchResults([]); }}
                  className="text-[11px] px-2 py-1 transition"
                  style={{ color: "var(--fg3)" }}
                >
                  {tc("cancel")}
                </button>
              </div>
              {searching && (
                <div className="flex justify-center py-2">
                  <div className="h-3 w-3 animate-spin rounded-full border border-border border-t-muted" />
                </div>
              )}
              {searchResults.length > 0 && (
                <div style={{ background: "var(--surface)", border: "1px solid var(--elevated)", borderRadius: 4, overflow: "hidden" }}>
                  {searchResults.map(r => (
                    <button
                      key={r.id}
                      onClick={() => addItem(r.type, r.id)}
                      className="w-full text-left px-3 py-2 transition hover:bg-hover"
                      style={{ borderBottom: "1px solid var(--border)" }}
                    >
                      <div className="flex items-center gap-2">
                        <span style={{
                          fontSize: 9,
                          fontWeight: 600,
                          padding: "1px 4px",
                          borderRadius: 2,
                          background: r.type === "situation" ? "color-mix(in srgb, var(--warn) 12%, transparent)" : "var(--accent-light)",
                          color: r.type === "situation" ? "var(--warn)" : "var(--accent)",
                          textTransform: "uppercase",
                        }}>
                          {r.type === "situation" ? "SIT" : "INI"}
                        </span>
                        <span style={{ fontSize: 12, color: "var(--fg2)" }} className="truncate">{r.label}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {searchQuery.trim() && !searching && searchResults.length === 0 && (
                <p style={{ fontSize: 12, color: "var(--fg4)" }}>{tc("noResults")}</p>
              )}
            </div>
          )}

          {/* Items list */}
          {d.items.length > 0 ? (
            <div style={{ background: "var(--surface)", border: "1px solid var(--elevated)", borderRadius: 4, overflow: "hidden" }}>
              {d.items.map((item, i) => (
                <div
                  key={item.workStreamItemId}
                  className="flex items-center gap-3 px-4 py-2.5"
                  style={{ borderBottom: i < d.items.length - 1 ? "1px solid var(--border)" : "none" }}
                >
                  <span style={{
                    fontSize: 9,
                    fontWeight: 600,
                    padding: "1px 4px",
                    borderRadius: 2,
                    background: item.itemType === "situation" ? "color-mix(in srgb, var(--warn) 12%, transparent)" : "var(--accent-light)",
                    color: item.itemType === "situation" ? "var(--warn)" : "var(--accent)",
                    textTransform: "uppercase",
                    flexShrink: 0,
                  }}>
                    {item.itemType === "situation" ? "SIT" : "INI"}
                  </span>
                  <span className="flex-shrink-0" style={{ width: 6, height: 6, borderRadius: "50%", background: itemStatusColor(item.status) }} />
                  <a
                    href={item.itemType === "situation" ? "/situations" : "/initiatives"}
                    className="flex-1 min-w-0 truncate hover:underline transition-colors"
                    style={{ fontSize: 13, color: "var(--fg2)" }}
                  >
                    {item.summary}
                  </a>
                  <span style={{ fontSize: 11, color: "var(--fg4)", flexShrink: 0 }}>
                    {item.status}
                  </span>
                  {isAdmin && (
                    <button
                      onClick={() => removeItem(d.id, item.workStreamItemId)}
                      className="flex-shrink-0 transition hover:text-danger"
                      style={{ fontSize: 11, color: "var(--fg4)" }}
                    >
                      {tc("remove")}
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 13, color: "var(--fg4)" }}>{t("noItems")}</p>
          )}
        </div>

        {/* ── Sub-projects ── */}
        {d.children.length > 0 && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "var(--fg4)", textTransform: "uppercase" as const }} className="mb-2">
              {t("subProjects")} &middot; {d.children.length}
            </div>
            <div style={{ background: "var(--surface)", border: "1px solid var(--elevated)", borderRadius: 4, overflow: "hidden" }}>
              {d.children.map((child, i) => (
                <button
                  key={child.id}
                  onClick={() => onSelectWorkStream(child.id)}
                  className="w-full text-left px-4 py-2.5 transition hover:bg-hover"
                  style={{ borderBottom: i < d.children.length - 1 ? "1px solid var(--border)" : "none" }}
                >
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: 13, fontWeight: 500, color: "var(--fg2)" }}>{child.title}</span>
                    <Badge variant={statusBadgeVariant(child.status)}>
                      {child.status}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Contextual chat ── */}
      <ContextualChat
        contextType="workstream"
        contextId={d.id}
        placeholder={t("discuss")}
        hints={[t("hintBlocking"), t("hintStatus")]}
      />
    </div>
  );
}
