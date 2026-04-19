"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useLocale } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { useIsMobile } from "@/hooks/use-media-query";
import { formatRelativeTime } from "@/lib/format-helpers";
import ReactMarkdown from "react-markdown";
import Link from "next/link";
import { replaceWikiLinksWithMarkdown, type WikiLinkLookup } from "@/lib/wiki-links";
import { buildWikiUrl } from "./wiki-url";

// ── Types ────────────────────────────────────────────────

interface WikiPageSummary {
  id: string;
  slug: string;
  title: string;
  pageType: string;
  status: string;
  confidence: number;
  sourceCount: number;
  contentTokens: number;
  reasoningUseCount: number;
  outcomeApproved: number;
  outcomeRejected: number;
  version: number;
  lastSynthesizedAt: string;
  synthesisPath: string;
  verifiedAt: string | null;
  citedByPages: number;
  subjectEntityName?: string;
}

interface WikiPageFull {
  id: string;
  slug: string;
  title: string;
  pageType: string;
  status: string;
  confidence: number;
  content: string;
  sourceCount: number;
  contentTokens: number;
  crossReferences: string[];
  sources: unknown[];
  reasoningUseCount: number;
  outcomeApproved: number;
  outcomeRejected: number;
  version: number;
  lastSynthesizedAt: string;
  synthesisPath: string;
  synthesizedByModel: string;
  verifiedAt: string | null;
  verifiedByModel: string | null;
  verificationLog: VerificationLog | null;
  quarantineReason: string | null;
  citedByPages: number;
}

interface VerificationLog {
  passed: boolean;
  checksRun: number;
  checksPassed: number;
  failures: Array<{
    checkType: string;
    claim: string;
    citedSource: string;
    issue: string;
    severity: string;
  }>;
  confidence: number;
  recommendation: string;
}

interface SourceDetail {
  id: string;
  type: string;
  citation: string;
  claimCount: number;
  preview: string;
  sourceType?: string;
  date?: string;
}

interface CrossRef {
  slug: string;
  title: string;
  pageType: string;
}

interface WikiStats {
  total: number;
  verified: number;
  stale: number;
  draft: number;
  quarantined: number;
  avgConfidence: number;
}

// ── Constants ────────────────────────────────────────────

const PAGE_TYPE_META: Record<string, { label: string; icon: string }> = {
  entity_profile: { label: "Entity profiles", icon: "U" },
  domain_overview: { label: "Domains", icon: "D" },
  financial_pattern: { label: "Financial", icon: "F" },
  communication_pattern: { label: "Communication", icon: "C" },
  process_description: { label: "Processes", icon: "P" },
  topic_synthesis: { label: "Topics", icon: "T" },
  relationship_map: { label: "Relationships", icon: "R" },
  contradiction_log: { label: "Contradictions", icon: "!" },
  system_job: { label: "System jobs", icon: "J" },
  project_portfolio: { label: "Project portfolios", icon: "F" },
  project: { label: "Projects", icon: "P" },
  project_deliverable: { label: "Deliverables", icon: "D" },
  idea: { label: "Ideas", icon: "I" },
  situation_instance: { label: "Situations", icon: "S" },
};

const STATUS_COLOR: Record<string, string> = {
  verified: "var(--ok)",
  stale: "var(--warn)",
  draft: "var(--fg3)",
  quarantined: "var(--danger)",
};

const STATUS_BADGE: Record<string, "green" | "amber" | "default" | "red"> = {
  verified: "green",
  stale: "amber",
  draft: "default",
  quarantined: "red",
};

// ── Main Page ────────────────────────────────────────────

export function WikiPageClient({ activeSlug }: { activeSlug: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const locale = useLocale();
  const isMobile = useIsMobile();

  // URL state (filters live in the query string; activeSlug comes from the route)
  const activeType = searchParams.get("type") ?? "";
  const searchQuery = searchParams.get("q") ?? "";
  const activeScope = searchParams.get("scope") ?? "operator";
  const domainFilter = searchParams.get("domain") ?? "";

  // Data
  const [pages, setPages] = useState<WikiPageSummary[]>([]);
  const [byType, setByType] = useState<Record<string, number>>({});
  const [stats, setStats] = useState<WikiStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Selected page
  const [activePage, setActivePage] = useState<WikiPageFull | null>(null);
  const [sourceDetails, setSourceDetails] = useState<SourceDetail[]>([]);
  const [referencedBy, setReferencedBy] = useState<CrossRef[]>([]);
  const [pageLoading, setPageLoading] = useState(false);

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);

  // Inspector (collapsed by default)
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [highlightedSource, setHighlightedSource] = useState<string | null>(null);
  const [expandedSource, setExpandedSource] = useState<string | null>(null);
  const [verLogOpen, setVerLogOpen] = useState(false);
  const sourceRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Domain filter label
  const [domainName, setDomainName] = useState<string | null>(null);
  useEffect(() => {
    if (!domainFilter) { setDomainName(null); return; }
    fetch(`/api/domains/${domainFilter}`).then(r => r.ok ? r.json() : null).then(d => {
      if (d) setDomainName(d.displayName);
    }).catch(() => {});
  }, [domainFilter]);

  // Search debounce
  const [searchInput, setSearchInput] = useState(searchQuery);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ingest modal (superadmin only)
  const [ingestOpen, setIngestOpen] = useState(false);
  const [ingestTitle, setIngestTitle] = useState("");
  const [ingestContent, setIngestContent] = useState("");
  const [ingestFocus, setIngestFocus] = useState("");
  const [ingesting, setIngesting] = useState(false);

  // ── URL helpers ──

  const setParam = useCallback(
    (key: string, value: string) => {
      router.replace(buildWikiUrl(pathname, searchParams, key, value), { scroll: false });
    },
    [searchParams, pathname, router],
  );

  // ── Fetch page list ──

  const fetchList = useCallback(async () => {
    const p = new URLSearchParams();
    if (activeType) p.set("pageType", activeType);
    if (searchQuery) p.set("q", searchQuery);
    if (activeScope === "system") p.set("scope", "system");
    if (domainFilter) p.set("domain", domainFilter);
    try {
      const res = await fetch(`/api/wiki?${p.toString()}`);
      const data = await res.json();
      setPages(data.pages ?? []);
      setByType(data.byType ?? {});
      setStats(data.stats ?? null);
    } catch (err) {
      console.error("Failed to load wiki pages:", err);
    } finally {
      setLoading(false);
    }
  }, [activeType, searchQuery, activeScope, domainFilter]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  // ── Fetch selected page ──

  useEffect(() => {
    if (!activeSlug) {
      setActivePage(null);
      setSourceDetails([]);
      setReferencedBy([]);
      return;
    }
    setPageLoading(true);
    setEditing(false);
    fetch(`/api/wiki/${encodeURIComponent(activeSlug)}`)
      .then((r) => r.json())
      .then((data) => {
        setActivePage(data.page ?? null);
        setSourceDetails(data.sourceDetails ?? []);
        setReferencedBy(data.referencedBy ?? []);
      })
      .catch(console.error)
      .finally(() => setPageLoading(false));
  }, [activeSlug]);

  // ── Search debounce ──

  const handleSearch = useCallback(
    (value: string) => {
      setSearchInput(value);
      if (searchTimer.current) clearTimeout(searchTimer.current);
      searchTimer.current = setTimeout(() => setParam("q", value), 300);
    },
    [setParam],
  );

  // ── Save edit ──

  const handleSave = async () => {
    if (!activePage) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/wiki/${encodeURIComponent(activePage.slug)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent }),
      });
      if (res.ok) {
        const updated = await res.json();
        setActivePage((prev) => (prev ? { ...prev, ...updated } : null));
        setEditing(false);
        fetchList();
      }
    } catch (err) {
      console.error("Save failed:", err);
    } finally {
      setSaving(false);
    }
  };

  // ── Ingest research ──

  const handleIngest = async () => {
    if (!ingestTitle.trim() || !ingestContent.trim() || ingesting) return;
    setIngesting(true);
    try {
      const res = await fetch("/api/admin/research-ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: ingestTitle.trim(),
          content: ingestContent.trim(),
          focusArea: ingestFocus || undefined,
        }),
      });
      if (res.ok) {
        setIngestOpen(false);
        setIngestTitle("");
        setIngestContent("");
        setIngestFocus("");
      }
    } catch (err) {
      console.error("Ingest failed:", err);
    } finally {
      setIngesting(false);
    }
  };

  // ── Citation click handler ──

  const handleCitationClick = useCallback((sourceId: string) => {
    setHighlightedSource(sourceId);
    setInspectorOpen(true);
    setTimeout(() => {
      sourceRefs.current[sourceId]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  }, []);

  // ── Filtered pages (from server, already filtered by type/search) ──

  const filteredPages = pages;

  // ── Render ──

  if (loading) {
    return (
      <AppShell>
        <div style={{ padding: 32, color: "var(--fg3)" }}>Loading wiki...</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {/* Scope toggle removed — system intelligence accessible only via superadmin room */}

      {/* Domain filter banner */}
      {domainFilter && domainName && (
        <div style={{
          padding: "6px 16px",
          background: "rgba(139,92,246,0.06)",
          borderBottom: "1px solid rgba(139,92,246,0.15)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
          color: "var(--fg2)",
        }}>
          <span>Filtered to domain: <strong style={{ color: "var(--foreground)" }}>{domainName}</strong></span>
          <button
            onClick={() => setParam("domain", "")}
            style={{ fontSize: 11, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", fontWeight: 500 }}
          >
            Show all
          </button>
        </div>
      )}

      <div
        style={{
          display: "flex",
          height: "calc(100vh - 56px)",
          overflow: "hidden",
        }}
      >
        {/* ── Main Content ── */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {isMobile && (
            <MobileFilters
              byType={byType}
              activeType={activeType}
              searchInput={searchInput}
              onTypeChange={(t) => setParam("type", t)}
              onSearch={handleSearch}
            />
          )}

          {isMobile && !activeSlug && (
            <MobilePageList
              pages={filteredPages}
              activeSlug={activeSlug}
              onSelectPage={(slug) => setParam("page", slug)}
            />
          )}

          {pageLoading ? (
            <div style={{ padding: 32, color: "var(--fg3)" }}>Loading page...</div>
          ) : activeSlug && activePage ? (
            <>
              {/* Search bar above page — centered, with dropdown */}
              <div style={{ maxWidth: 1080, width: "100%", margin: "0 auto", padding: "16px 24px 20px", display: "flex", justifyContent: "center" }}>
                <WikiSearchBar
                  value={searchInput}
                  onChange={(v) => { setSearchInput(v); handleSearch(v); }}
                  pages={pages}
                  onSelectPage={(slug) => { setSearchInput(""); setParam("page", slug); }}
                />
              </div>
              <ContentPane
                page={activePage}
                editing={editing}
                editContent={editContent}
                saving={saving}
                locale={locale}
                pageIndex={pages}
                onStartEdit={() => {
                  setEditContent(activePage.content);
                  setEditing(true);
                }}
                onCancelEdit={() => setEditing(false)}
                onSave={handleSave}
                onEditChange={setEditContent}
                onCitationClick={handleCitationClick}
                onToggleInspector={() => setInspectorOpen((o) => !o)}
                inspectorOpen={inspectorOpen}
                onNavigate={(slug) => setParam("page", slug)}
              />
            </>
          ) : !isMobile ? (
            /* ── Page Index View ── */
            <div style={{ maxWidth: 800, margin: "0 auto", padding: "24px 24px 48px" }}>
              {/* Search */}
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
                <input
                  type="text"
                  placeholder="Search wiki pages..."
                  value={searchInput}
                  onChange={(e) => handleSearch(e.target.value)}
                  style={{
                    width: "100%",
                    maxWidth: 560,
                    padding: "12px 16px",
                    background: "rgba(255,255,255,0.04)",
                    border: "0.5px solid var(--border)",
                    borderRadius: 10,
                    color: "var(--foreground)",
                    fontSize: 14,
                    outline: "none",
                  }}
                />
              </div>

              {/* Type filter pills */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 20, justifyContent: "center" }}>
                <button
                  onClick={() => setParam("type", "")}
                  style={{
                    padding: "5px 12px",
                    borderRadius: 20,
                    border: "0.5px solid " + (!activeType ? "var(--foreground)" : "var(--border)"),
                    background: !activeType ? "rgba(255,255,255,0.08)" : "transparent",
                    color: !activeType ? "var(--foreground)" : "var(--fg3)",
                    fontSize: 12,
                    cursor: "pointer",
                    fontWeight: !activeType ? 600 : 400,
                  }}
                >
                  All {stats ? stats.total : ""}
                </button>
                {Object.entries(PAGE_TYPE_META).map(([type, meta]) => {
                  const count = byType[type] ?? 0;
                  if (!count) return null;
                  return (
                    <button
                      key={type}
                      onClick={() => setParam("type", type === activeType ? "" : type)}
                      style={{
                        padding: "5px 12px",
                        borderRadius: 20,
                        border: "0.5px solid " + (activeType === type ? "var(--foreground)" : "var(--border)"),
                        background: activeType === type ? "rgba(255,255,255,0.08)" : "transparent",
                        color: activeType === type ? "var(--foreground)" : "var(--fg3)",
                        fontSize: 12,
                        cursor: "pointer",
                        fontWeight: activeType === type ? 600 : 400,
                      }}
                    >
                      {meta.label} {count}
                    </button>
                  );
                })}
              </div>

              {/* Page cards */}
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {filteredPages.map((p) => (
                  <button
                    key={p.slug}
                    onClick={() => setParam("page", p.slug)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      width: "100%",
                      padding: "12px 16px",
                      borderRadius: 8,
                      border: "none",
                      background: "transparent",
                      color: "var(--foreground)",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    {/* Status dot */}
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: STATUS_COLOR[p.status] ?? "var(--fg3)",
                        flexShrink: 0,
                      }}
                    />
                    {/* Title + meta */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, lineHeight: "18px" }}>
                        {p.title}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--fg3)", marginTop: 2, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <span>{(p.confidence * 100).toFixed(0)}%</span>
                        <span>{PAGE_TYPE_META[p.pageType]?.label ?? p.pageType}</span>
                        <span>{p.sourceCount} sources</span>
                        <span>{formatRelativeTime(p.lastSynthesizedAt, locale)}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {/* Footer stats */}
              {stats && (
                <div style={{ textAlign: "center", marginTop: 24, fontSize: 12, color: "var(--fg4)" }}>
                  {stats.total} pages · {stats.verified} verified · {(stats.avgConfidence * 100).toFixed(0)}% avg confidence
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* ── Inspector ── */}
        {activePage && !isMobile && !inspectorOpen && (
          <div
            onClick={() => setInspectorOpen(true)}
            style={{
              width: 36,
              flexShrink: 0,
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "center",
              paddingTop: 14,
              cursor: "pointer",
              borderLeft: "1px solid var(--border)",
              background: "var(--sidebar)",
            }}
          >
            <span style={{ fontSize: 10, color: "var(--fg3)", writingMode: "vertical-rl", textOrientation: "mixed" }}>
              Metadata
            </span>
          </div>
        )}
        {activePage && inspectorOpen && !isMobile && (
          <div style={{ position: "relative", flexShrink: 0 }}>
            <button
              onClick={() => setInspectorOpen(false)}
              style={{
                position: "absolute",
                top: 12,
                left: -12,
                width: 24,
                height: 24,
                borderRadius: "50%",
                background: "var(--sidebar)",
                border: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                zIndex: 1,
                color: "var(--fg3)",
                fontSize: 12,
              }}
            >
              →
            </button>
            <InspectorPanel
              page={activePage}
              sourceDetails={sourceDetails}
              referencedBy={referencedBy}
              highlightedSource={highlightedSource}
              expandedSource={expandedSource}
              verLogOpen={verLogOpen}
              sourceRefs={sourceRefs}
              locale={locale}
              onExpandSource={(id) =>
                setExpandedSource((prev) => (prev === id ? null : id))
              }
              onToggleVerLog={() => setVerLogOpen((o) => !o)}
              onNavigate={(slug) => setParam("page", slug)}
            />
          </div>
        )}
      </div>

      {/* ── Ingest Research Modal ── */}
      {ingestOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.6)",
          }}
          onClick={() => setIngestOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 560,
              maxHeight: "80vh",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--foreground)", margin: 0 }}>
                Ingest research document
              </h2>
              <p style={{ fontSize: 12, color: "var(--fg3)", marginTop: 4 }}>
                Paste markdown content to synthesize into system wiki pages.
              </p>
            </div>

            <div style={{ padding: "14px 20px", overflow: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--fg2)", display: "block", marginBottom: 4 }}>Title</label>
                <input
                  value={ingestTitle}
                  onChange={(e) => setIngestTitle(e.target.value)}
                  placeholder="Research paper title..."
                  style={{
                    width: "100%",
                    padding: "7px 10px",
                    borderRadius: 4,
                    border: "1px solid var(--border)",
                    background: "var(--background)",
                    color: "var(--foreground)",
                    fontSize: 13,
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--fg2)", display: "block", marginBottom: 4 }}>Focus area</label>
                <select
                  value={ingestFocus}
                  onChange={(e) => setIngestFocus(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "7px 10px",
                    borderRadius: 4,
                    border: "1px solid var(--border)",
                    background: "var(--background)",
                    color: "var(--foreground)",
                    fontSize: 13,
                  }}
                >
                  <option value="">General</option>
                  <option value="due_diligence">Due diligence</option>
                  <option value="financial_analysis">Financial analysis</option>
                  <option value="operational_assessment">Operational assessment</option>
                  <option value="legal_compliance">Legal compliance</option>
                </select>
              </div>

              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--fg2)", display: "block", marginBottom: 4 }}>Content (markdown)</label>
                <textarea
                  value={ingestContent}
                  onChange={(e) => setIngestContent(e.target.value)}
                  placeholder="Paste research document content here..."
                  style={{
                    width: "100%",
                    minHeight: 200,
                    padding: "8px 10px",
                    borderRadius: 4,
                    border: "1px solid var(--border)",
                    background: "var(--background)",
                    color: "var(--foreground)",
                    fontSize: 12,
                    fontFamily: "monospace",
                    resize: "vertical",
                  }}
                />
              </div>
            </div>

            <div style={{ padding: "10px 20px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                onClick={() => setIngestOpen(false)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 4,
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--fg2)",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleIngest}
                disabled={!ingestTitle.trim() || !ingestContent.trim() || ingesting}
                style={{
                  padding: "6px 14px",
                  borderRadius: 4,
                  border: "none",
                  background: ingesting ? "rgba(139,92,246,0.3)" : "rgb(139,92,246)",
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: ingesting ? "wait" : "pointer",
                  opacity: !ingestTitle.trim() || !ingestContent.trim() ? 0.4 : 1,
                }}
              >
                {ingesting ? "Synthesizing..." : "Synthesize"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

// ── Mobile Filters ───────────────────────────────────────

function MobileFilters({
  byType,
  activeType,
  searchInput,
  onTypeChange,
  onSearch,
}: {
  byType: Record<string, number>;
  activeType: string;
  searchInput: string;
  onTypeChange: (t: string) => void;
  onSearch: (q: string) => void;
}) {
  return (
    <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <input
        type="text"
        value={searchInput}
        onChange={(e) => onSearch(e.target.value)}
        placeholder="Search..."
        style={{
          flex: 1,
          minWidth: 120,
          padding: "6px 8px",
          borderRadius: 4,
          border: "1px solid var(--border)",
          background: "var(--surface)",
          color: "var(--foreground)",
          fontSize: 12,
        }}
      />
      <select
        value={activeType}
        onChange={(e) => onTypeChange(e.target.value)}
        style={{
          padding: "6px 8px",
          borderRadius: 4,
          border: "1px solid var(--border)",
          background: "var(--surface)",
          color: "var(--foreground)",
          fontSize: 12,
        }}
      >
        <option value="">All types</option>
        {Object.entries(PAGE_TYPE_META).map(([type, meta]) =>
          byType[type] ? (
            <option key={type} value={type}>
              {meta.label} ({byType[type]})
            </option>
          ) : null,
        )}
      </select>
    </div>
  );
}

// ── Mobile Page List ─────────────────────────────────────

function MobilePageList({
  pages,
  activeSlug,
  onSelectPage,
}: {
  pages: WikiPageSummary[];
  activeSlug: string;
  onSelectPage: (slug: string) => void;
}) {
  return (
    <div style={{ padding: "8px 14px" }}>
      {pages.map((p) => (
        <button
          key={p.slug}
          onClick={() => onSelectPage(p.slug)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
            padding: "8px 0",
            border: "none",
            borderBottom: "1px solid var(--border)",
            background: activeSlug === p.slug ? "var(--hover)" : "transparent",
            color: "var(--foreground)",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: STATUS_COLOR[p.status], flexShrink: 0 }} />
          <span style={{ fontSize: 13, flex: 1 }}>{p.title}</span>
          <span style={{ fontSize: 11, color: "var(--fg3)" }}>{(p.confidence * 100).toFixed(0)}%</span>
        </button>
      ))}
    </div>
  );
}

// ── Content Pane ─────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function insertCrossLinks(text: string, pageIndex: WikiPageSummary[], currentSlug: string): string {
  // Build match terms from entity names and stripped titles
  const matchTerms: { term: string; slug: string }[] = [];

  for (const p of pageIndex) {
    if (p.slug === currentSlug) continue;

    // Source 1: entity displayName (preferred — e.g. "Lars Jensen")
    if (p.subjectEntityName && p.subjectEntityName.length > 3) {
      matchTerms.push({ term: p.subjectEntityName, slug: p.slug });
    }

    // Source 2: stripped title — remove suffix after " - " or " — "
    const stripped = p.title.replace(/\s*[-—]\s+.*$/, "").trim();
    if (stripped.length > 3 && stripped !== p.subjectEntityName) {
      matchTerms.push({ term: stripped, slug: p.slug });
    }
  }

  // Sort longest first to avoid partial matches
  matchTerms.sort((a, b) => b.term.length - a.term.length);

  let result = text;
  const linked = new Set<string>();

  for (const { term, slug } of matchTerms) {
    if (linked.has(slug)) continue;
    // Only link first occurrence, whole word, case-insensitive
    // Skip matches inside markdown links, headings, or citation markers
    const regex = new RegExp(`(?<![#\\[\\(])\\b(${escapeRegex(term)})\\b(?![\\]\\)])`, "i");
    if (regex.test(result)) {
      result = result.replace(regex, `[$1](/wiki/${slug})`);
      linked.add(slug);
    }
  }
  return result;
}

// ── Wiki Search Bar with dropdown ────────────────────────

function WikiSearchBar({
  value,
  onChange,
  pages,
  onSelectPage,
}: {
  value: string;
  onChange: (v: string) => void;
  pages: WikiPageSummary[];
  onSelectPage: (slug: string) => void;
}) {
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!focused) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setFocused(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [focused]);

  const q = value.toLowerCase().trim();
  const suggestions = q.length >= 2
    ? pages.filter(p => p.title.toLowerCase().includes(q)).slice(0, 8)
    : [];

  const showDropdown = focused && suggestions.length > 0;

  return (
    <div ref={ref} style={{ position: "relative", width: "100%", maxWidth: 520 }}>
      <input
        type="text"
        placeholder="Search wiki..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        style={{
          width: "100%",
          padding: "9px 14px",
          background: "rgba(255,255,255,0.05)",
          border: "0.5px solid var(--border)",
          borderRadius: showDropdown ? "6px 6px 0 0" : 6,
          color: "var(--foreground)",
          fontSize: 13,
          outline: "none",
          textAlign: "center",
        }}
      />
      {showDropdown && (
        <div style={{
          position: "absolute",
          top: "100%",
          left: 0,
          right: 0,
          background: "var(--elevated)",
          border: "0.5px solid var(--border)",
          borderTop: "none",
          borderRadius: "0 0 6px 6px",
          zIndex: 20,
          maxHeight: 280,
          overflow: "auto",
          boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
        }}>
          {suggestions.map(p => (
            <button
              key={p.slug}
              onMouseDown={(e) => { e.preventDefault(); onSelectPage(p.slug); setFocused(false); }}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 14px",
                background: "none",
                border: "none",
                borderBottom: "0.5px solid rgba(255,255,255,0.04)",
                cursor: "pointer",
                textAlign: "left",
              }}
              className="hover:bg-hover transition-colors"
            >
              <span style={{ fontSize: 12, color: "var(--foreground)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {p.title}
              </span>
              <span style={{ fontSize: 10, color: "var(--fg4)", flexShrink: 0 }}>
                {p.pageType.replace(/_/g, " ")}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ContentPane({
  page,
  editing,
  editContent,
  saving,
  locale,
  pageIndex,
  onStartEdit,
  onCancelEdit,
  onSave,
  onEditChange,
  onCitationClick,
  onToggleInspector,
  inspectorOpen,
  onNavigate,
}: {
  page: WikiPageFull;
  editing: boolean;
  editContent: string;
  saving: boolean;
  locale: string;
  pageIndex: WikiPageSummary[];
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onEditChange: (v: string) => void;
  onCitationClick: (id: string) => void;
  onToggleInspector: () => void;
  inspectorOpen: boolean;
  onNavigate: (slug: string) => void;
}) {
  // Process content: strip duplicate title, replace citations, insert cross-links
  const processedContent = useMemo(() => {
    let text = page.content;
    // Strip leading heading if it matches the page title (avoids duplicate)
    const titleMatch = text.match(/^#{1,2}\s+(.+)\n/);
    if (titleMatch) {
      const headingText = titleMatch[1].trim().replace(/\s*\(.*\)\s*$/, "").trim();
      const pageTitle = page.title.replace(/\s*\(.*\)\s*$/, "").trim();
      if (headingText.toLowerCase() === pageTitle.toLowerCase() || pageTitle.toLowerCase().startsWith(headingText.toLowerCase())) {
        text = text.slice(titleMatch[0].length);
      }
    }
    text = text.replace(/\[src:([a-zA-Z0-9_-]+)\]/g, "{{CITE:$1}}");
    // Turn [[slug]] / [page:slug] markers into Markdown wiki links so they
    // render as clickable cross-page navigation via the `a` component below.
    const lookup: WikiLinkLookup = {};
    for (const p of pageIndex) {
      lookup[p.slug] = { title: p.title };
    }
    text = replaceWikiLinksWithMarkdown(text, lookup);
    text = insertCrossLinks(text, pageIndex, page.slug);
    return text;
  }, [page.content, page.title, pageIndex, page.slug]);

  const [quarantineOpen, setQuarantineOpen] = useState(false);

  return (
    <div style={{ maxWidth: 1080, width: "100%", margin: "0 auto" }}>
      {/* Page surface */}
      <div style={{
        background: "var(--elevated)",
        border: "1.5px solid var(--border)",
        minHeight: "calc(100vh - 200px)",
        padding: "24px 48px 48px",
      }}>
      {/* Back to Wiki — top left */}
      <button
        onClick={() => onNavigate("")}
        style={{
          fontSize: 12,
          color: "var(--fg3)",
          background: "none",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 4,
          marginBottom: 16,
          padding: 0,
        }}
        className="hover:text-foreground transition-colors"
      >
        ← Back to Wiki
      </button>
      {/* Header */}
      <div style={{ marginBottom: 20, maxWidth: 760, margin: "0 auto 20px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: "var(--foreground)", margin: 0, lineHeight: "24px" }}>
            {page.title}
          </h1>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button
              onClick={onToggleInspector}
              title={inspectorOpen ? "Hide inspector" : "Show inspector"}
              style={{
                padding: "4px 8px",
                borderRadius: 4,
                border: "1px solid var(--border)",
                background: inspectorOpen ? "var(--hover)" : "transparent",
                color: "var(--fg2)",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              i
            </button>
            {!editing && (
              <button
                onClick={onStartEdit}
                title="Edit page"
                style={{
                  padding: "4px 8px",
                  borderRadius: 4,
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--fg2)",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                Edit
              </button>
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          {page.status === "quarantined" && page.quarantineReason ? (
            <button
              onClick={() => setQuarantineOpen(!quarantineOpen)}
              style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: 0, background: "none", border: "none", cursor: "pointer" }}
            >
              <Badge variant="red">{page.status}</Badge>
              <svg width={8} height={8} viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth={2.5} style={{ transform: quarantineOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>
                <path d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ) : (
            <Badge variant={STATUS_BADGE[page.status] ?? "default"}>{page.status}</Badge>
          )}
          <span style={{ fontSize: 11, color: "var(--fg3)" }}>
            {PAGE_TYPE_META[page.pageType]?.label ?? page.pageType}
          </span>
          <span style={{ fontSize: 11, color: "var(--fg3)" }}>
            v{page.version} · {formatRelativeTime(page.lastSynthesizedAt, locale)}
          </span>
        </div>
      </div>

      {/* Quarantine details — expanded */}
      {quarantineOpen && page.quarantineReason && (
        <div style={{
          marginBottom: 16, maxWidth: 760, margin: "0 auto 16px",
          padding: "10px 14px",
          border: "1px solid color-mix(in srgb, var(--danger) 30%, transparent)",
          background: "color-mix(in srgb, var(--danger) 8%, transparent)",
          fontSize: 12,
          color: "var(--danger)",
          lineHeight: "18px",
        }}>
          {page.quarantineReason}
        </div>
      )}

      {/* Edit mode */}
      {editing ? (
        <div>
          <div
            style={{
              padding: "8px 12px",
              marginBottom: 10,
              borderRadius: 4,
              background: "color-mix(in srgb, var(--warn) 8%, transparent)",
              border: "1px solid color-mix(in srgb, var(--warn) 20%, transparent)",
              fontSize: 11,
              color: "var(--warn)",
              lineHeight: "16px",
            }}
          >
            Your edit will be reviewed for accuracy before being applied. The system preserves verified edits unless new contradicting evidence arrives.
          </div>
          <textarea
            value={editContent}
            onChange={(e) => onEditChange(e.target.value)}
            style={{
              width: "100%",
              minHeight: 400,
              padding: 12,
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--foreground)",
              fontSize: 13,
              lineHeight: "20px",
              fontFamily: "monospace",
              resize: "vertical",
            }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button
              onClick={onSave}
              disabled={saving}
              style={{
                padding: "6px 16px",
                borderRadius: 4,
                border: "none",
                background: "rgb(34, 197, 94)",
                color: "#000",
                fontSize: 12,
                fontWeight: 600,
                cursor: saving ? "default" : "pointer",
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? "Submitting..." : "Submit for Review"}
            </button>
            <button
              onClick={onCancelEdit}
              style={{
                padding: "6px 16px",
                borderRadius: 4,
                border: "1px solid var(--border)",
                background: "transparent",
                color: "var(--fg2)",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        /* View mode — markdown */
        <div className="wiki-content" style={{
          fontSize: 14, lineHeight: 1.7, color: "var(--foreground)", maxWidth: 760, margin: "0 auto",
        }}>
          <ReactMarkdown
            components={{
              p: ({ children }) => {
                return <p style={{ marginBottom: 12 }}>{processCitations(children, onCitationClick)}</p>;
              },
              h1: ({ children }) => <h1 style={{ fontSize: 20, fontWeight: 600, marginTop: 24, marginBottom: 12, color: "var(--foreground)" }}>{children}</h1>,
              h2: ({ children }) => <h2 style={{ fontSize: 16, fontWeight: 600, marginTop: 20, marginBottom: 10, color: "var(--foreground)" }}>{children}</h2>,
              h3: ({ children }) => <h3 style={{ fontSize: 14, fontWeight: 600, marginTop: 16, marginBottom: 8, color: "var(--foreground)" }}>{children}</h3>,
              ul: ({ children }) => <ul style={{ paddingLeft: 20, marginBottom: 12 }}>{children}</ul>,
              ol: ({ children }) => <ol style={{ paddingLeft: 20, marginBottom: 12 }}>{children}</ol>,
              li: ({ children }) => <li style={{ marginBottom: 4, color: "var(--fg2)" }}>{processCitations(children, onCitationClick)}</li>,
              strong: ({ children }) => <strong style={{ fontWeight: 600, color: "var(--foreground)" }}>{children}</strong>,
              em: ({ children }) => <em style={{ color: "var(--fg2)" }}>{children}</em>,
              hr: () => <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "16px 0" }} />,
              code: ({ children }) => (
                <code style={{ padding: "2px 5px", borderRadius: 3, background: "rgba(255,255,255,0.06)", fontSize: 12, fontFamily: "monospace" }}>
                  {children}
                </code>
              ),
              blockquote: ({ children }) => (
                <blockquote style={{ borderLeft: "2px solid var(--border)", paddingLeft: 14, color: "var(--fg3)", margin: "12px 0" }}>
                  {children}
                </blockquote>
              ),
              table: ({ children }) => (
                <table style={{ width: "100%", borderCollapse: "collapse", margin: "12px 0", fontSize: 12 }}>
                  {children}
                </table>
              ),
              th: ({ children }) => (
                <th style={{ textAlign: "left", padding: "6px 10px", borderBottom: "1px solid var(--border)", color: "var(--fg3)", fontWeight: 600 }}>
                  {children}
                </th>
              ),
              td: ({ children }) => (
                <td style={{ padding: "6px 10px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  {processCitations(children, onCitationClick)}
                </td>
              ),
              a: ({ href, children }) => {
                if (href?.startsWith("/wiki/")) {
                  return (
                    <Link
                      href={href}
                      prefetch={false}
                      className="wiki-link"
                      style={{ color: "var(--accent)", textDecoration: "underline", textDecorationStyle: "dotted" }}
                    >
                      {children}
                    </Link>
                  );
                }
                return <a href={href} style={{ color: "var(--accent)" }}>{children}</a>;
              },
            }}
          >
            {processedContent}
          </ReactMarkdown>
        </div>
      )}
      </div>{/* end page surface */}
    </div>
  );
}

// ── Citation Processing ──────────────────────────────────

function processCitations(
  children: React.ReactNode,
  onCitationClick: (id: string) => void,
): React.ReactNode {
  if (!children) return children;

  if (typeof children === "string") {
    const parts = children.split(/({{CITE:[a-zA-Z0-9_-]+}})/g);
    if (parts.length === 1) return children;
    return parts.map((part, i) => {
      const match = part.match(/{{CITE:([a-zA-Z0-9_-]+)}}/);
      if (match) {
        return (
          <button
            key={i}
            onClick={() => onCitationClick(match[1])}
            style={{
              display: "inline",
              fontSize: 9,
              fontWeight: 600,
              padding: "0px 3px",
              borderRadius: 3,
              background: "color-mix(in srgb, var(--accent) 12%, transparent)",
              color: "var(--accent)",
              border: "none",
              cursor: "pointer",
              verticalAlign: "super",
              lineHeight: 1,
            }}
          >
            src
          </button>
        );
      }
      return part;
    });
  }

  if (Array.isArray(children)) {
    return children.map((child, i) => (
      <span key={i}>{processCitations(child, onCitationClick)}</span>
    ));
  }

  return children;
}


// ── Inspector Panel ──────────────────────────────────────

function InspectorPanel({
  page,
  sourceDetails,
  referencedBy,
  highlightedSource,
  expandedSource,
  verLogOpen,
  sourceRefs,
  locale,
  onExpandSource,
  onToggleVerLog,
  onNavigate,
}: {
  page: WikiPageFull;
  sourceDetails: SourceDetail[];
  referencedBy: CrossRef[];
  highlightedSource: string | null;
  expandedSource: string | null;
  verLogOpen: boolean;
  sourceRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  locale: string;
  onExpandSource: (id: string) => void;
  onToggleVerLog: () => void;
  onNavigate: (slug: string) => void;
}) {
  const verLog = page.verificationLog as VerificationLog | null;

  return (
    <div
      style={{
        width: 300,
        flexShrink: 0,
        overflow: "auto",
        background: "var(--sidebar)",
        fontSize: 12,
      }}
    >
      {/* Metadata */}
      <div style={{ padding: "14px 14px 10px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ fontSize: 11, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
          Metadata
        </div>

        <MetaRow label="Status">
          <Badge variant={STATUS_BADGE[page.status] ?? "default"}>{page.status}</Badge>
        </MetaRow>

        <MetaRow label="Confidence">
          <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
            <div style={{ flex: 1, height: 4, borderRadius: 2, background: "var(--border)", overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${page.confidence * 100}%`,
                  borderRadius: 2,
                  background:
                    page.confidence > 0.7
                      ? "var(--ok)"
                      : page.confidence > 0.4
                        ? "var(--warn)"
                        : "var(--danger)",
                }}
              />
            </div>
            <span style={{ color: "var(--fg2)", fontSize: 11 }}>{(page.confidence * 100).toFixed(0)}%</span>
          </div>
        </MetaRow>

        <MetaRow label="Sources">
          <span style={{ color: "var(--fg2)" }}>{page.sourceCount}</span>
        </MetaRow>

        <MetaRow label="Reasoning use">
          <span style={{ color: "var(--fg2)" }}>
            {page.reasoningUseCount}x
            {(page.outcomeApproved > 0 || page.outcomeRejected > 0) && (
              <span style={{ marginLeft: 4 }}>
                <span style={{ color: "var(--ok)" }}>{page.outcomeApproved}</span>
                /
                <span style={{ color: "var(--danger)" }}>{page.outcomeRejected}</span>
              </span>
            )}
          </span>
        </MetaRow>

        <MetaRow label="Synthesis">
          <span style={{ color: "var(--fg2)" }}>
            {page.synthesisPath} · {page.synthesizedByModel.split("-").slice(0, 2).join("-")}
          </span>
        </MetaRow>

        <MetaRow label="Version">
          <span style={{ color: "var(--fg2)" }}>
            v{page.version}
            {page.verifiedAt && (
              <span style={{ marginLeft: 4 }}>
                · verified {formatRelativeTime(page.verifiedAt, locale)}
              </span>
            )}
          </span>
        </MetaRow>
      </div>

      {/* Sources */}
      {sourceDetails.length > 0 && (
        <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ fontSize: 11, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
            Sources ({sourceDetails.length})
          </div>
          {sourceDetails.map((src) => (
            <div
              key={src.id}
              ref={(el) => { sourceRefs.current[src.id] = el; }}
              onClick={() => onExpandSource(src.id)}
              style={{
                padding: "6px 8px",
                marginBottom: 4,
                borderRadius: 4,
                cursor: "pointer",
                border:
                  highlightedSource === src.id
                    ? "1px solid var(--accent)"
                    : "1px solid transparent",
                background:
                  highlightedSource === src.id
                    ? "color-mix(in srgb, var(--accent) 8%, transparent)"
                    : "transparent",
                transition: "background 0.15s, border-color 0.15s",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                <span style={{ fontSize: 10, color: "var(--accent)", fontWeight: 600, textTransform: "uppercase" }}>
                  {src.sourceType ?? src.type}
                </span>
                {src.claimCount > 1 && (
                  <span style={{ fontSize: 9, color: "var(--fg3)" }}>{src.claimCount} claims</span>
                )}
                {src.date && (
                  <span style={{ fontSize: 9, color: "var(--fg3)", marginLeft: "auto" }}>
                    {new Date(src.date).toLocaleDateString()}
                  </span>
                )}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--fg3)",
                  lineHeight: "15px",
                  overflow: "hidden",
                  display: "-webkit-box",
                  WebkitLineClamp: expandedSource === src.id ? 999 : 2,
                  WebkitBoxOrient: "vertical",
                }}
              >
                {src.preview}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Cross-references */}
      {(referencedBy.length > 0 || (page.crossReferences?.length ?? 0) > 0) && (
        <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ fontSize: 11, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
            Cross-references
          </div>
          {referencedBy.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, color: "var(--fg3)", marginBottom: 4 }}>Referenced by</div>
              {referencedBy.map((ref) => (
                <button
                  key={ref.slug}
                  onClick={() => onNavigate(ref.slug)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "3px 0",
                    border: "none",
                    background: "none",
                    color: "var(--accent)",
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  {ref.title}
                </button>
              ))}
            </div>
          )}
          {page.crossReferences?.length > 0 && (
            <div>
              <div style={{ fontSize: 10, color: "var(--fg3)", marginBottom: 4 }}>References</div>
              {page.crossReferences.map((slug) => (
                <button
                  key={slug}
                  onClick={() => onNavigate(slug)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "3px 0",
                    border: "none",
                    background: "none",
                    color: "var(--accent)",
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  {slug}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Verification log */}
      {verLog && (
        <div style={{ padding: "10px 14px" }}>
          <button
            onClick={onToggleVerLog}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
              border: "none",
              background: "none",
              color: "var(--fg3)",
              fontSize: 11,
              cursor: "pointer",
              padding: 0,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Verification log
            <span style={{ fontSize: 10 }}>{verLogOpen ? "\u25B2" : "\u25BC"}</span>
          </button>
          {verLogOpen && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, color: "var(--fg2)", marginBottom: 6 }}>
                {verLog.checksRun} checks, {verLog.checksPassed} passed
                {verLog.recommendation !== "verify" && (
                  <span style={{ color: "var(--warn)", marginLeft: 4 }}>
                    rec: {verLog.recommendation}
                  </span>
                )}
              </div>
              {verLog.failures?.map((f, i) => (
                <div
                  key={i}
                  style={{
                    padding: "4px 6px",
                    marginBottom: 3,
                    borderRadius: 3,
                    background:
                      f.severity === "critical"
                        ? "color-mix(in srgb, var(--danger) 8%, transparent)"
                        : "var(--surface)",
                    fontSize: 10,
                    lineHeight: "14px",
                    color: f.severity === "critical" ? "var(--danger)" : "var(--fg3)",
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{f.checkType}</span>
                  {f.claim && <span>: {f.claim}</span>}
                  {f.issue && (
                    <div style={{ color: "var(--fg3)", marginTop: 2 }}>{f.issue}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Meta Row Helper ──────────────────────────────────────

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
      <span style={{ fontSize: 11, color: "var(--fg3)", width: 80, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}
