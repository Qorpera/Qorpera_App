"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { AppShell } from "@/components/app-shell";
import { ContextualChat } from "@/components/contextual-chat";
import { formatRelativeTime } from "@/lib/format-helpers";
import { useLocale } from "next-intl";
import { fetchApi } from "@/lib/fetch-api";
import { Badge } from "@/components/ui/badge";
import ReactMarkdown from "react-markdown";
import { replaceWikiLinksWithMarkdown, type WikiLinkLookup } from "@/lib/wiki-links";
import Link from "next/link";

// ── Types ────────────────────────────────────────────────────────────────────

interface SystemJobItem {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: string;
  schedule: string;
  scope: string;
  ownerPageSlug: string | null;
  ownerName: string | null;
  domainPageSlug: string | null;
  domainName: string | null;
  lastRun: string | null;
  nextRun: string | null;
  trustLevel: string | null;
  latestRun: {
    summary: string;
    status: string;
    needsReview: boolean;
  } | null;
}

interface JobDetail {
  id: string;
  slug: string;
  title: string;
  content: string;
  description: string;
  status: string;
  schedule: string;
  scope: string;
  ownerPageSlug: string | null;
  ownerName: string | null;
  domainPageSlug: string | null;
  domainName: string | null;
  lastRun: string | null;
  nextRun: string | null;
  trustLevel: string | null;
  autoApproveSteps: boolean | null;
  crossReferences: string[];
  createdAt: string;
  updatedAt: string;
  latestRun: {
    summary: string;
    status: string;
    needsReview: boolean;
  } | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function cronToHuman(cron: string): string {
  const parts = cron.split(" ");
  if (parts.length < 5) return cron;
  const [min, hour, dom, , dow] = parts;
  if (dom === "*" && dow === "*") {
    if (hour === "*") return `Every ${min === "0" ? "" : min + " "}minute${min === "0" ? "" : "s"}`;
    return `Daily at ${hour}:${min.padStart(2, "0")}`;
  }
  if (dow !== "*") {
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dayName = dayNames[parseInt(dow)] ?? `day ${dow}`;
    return `Weekly on ${dayName} at ${hour}:${min.padStart(2, "0")}`;
  }
  return cron;
}

const STATUS_DOT: Record<string, string> = {
  active: "var(--ok)",
  paused: "var(--fg4)",
  proposed: "var(--warn)",
  deactivated: "var(--danger)",
  disabled: "var(--danger)",
};

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SystemJobsPage() {
  const locale = useLocale();
  const [jobs, setJobs] = useState<SystemJobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetchApi("/api/system-jobs");
      if (res.ok) {
        const data = await res.json();
        setJobs(data.items ?? []);
      }
    } catch { /* network error */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  useEffect(() => {
    if (!expandedId) { setDetail(null); return; }
    let cancelled = false;
    setDetail(null);
    setDetailLoading(true);
    fetchApi(`/api/system-jobs/${expandedId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (!cancelled && data) setDetail(data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [expandedId]);

  const toggleExpand = (id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  return (
    <AppShell>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "auto" }}>

        {/* ── Chat bar: ~20% from top ── */}
        <div style={{ paddingTop: "min(12vh, 80px)", paddingBottom: 32 }}>
          <div style={{ maxWidth: 700, margin: "0 auto", padding: "0 20px" }}>
            <ContextualChat
              contextType="system_jobs"
              contextId="global"
              placeholder="Ask about system jobs, create new ones, or adjust schedules..."
            />
          </div>
        </div>

        {/* ── Divider ── */}
        <div style={{ maxWidth: 900, margin: "0 auto", width: "100%", padding: "0 20px" }}>
          <div style={{ borderTop: "1px solid var(--border)", marginBottom: 20 }} />
        </div>

        {/* ── Job grid ── */}
        <div style={{ maxWidth: 900, margin: "0 auto", width: "100%", padding: "0 20px 40px" }}>
          {loading && (
            <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
              <div style={{ width: 20, height: 20, border: "2px solid var(--border)", borderTopColor: "var(--fg4)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            </div>
          )}

          {!loading && jobs.length === 0 && (
            <div style={{ textAlign: "center", padding: "48px 0", color: "var(--fg4)", fontSize: 13 }}>
              No system jobs yet. Use the chat above to create one.
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
            {jobs.map(job => {
              const isExpanded = expandedId === job.id;
              return (
                <div key={job.id} style={{ gridColumn: isExpanded ? "1 / -1" : undefined }}>
                  {/* Card */}
                  <button
                    onClick={() => toggleExpand(job.id)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "14px 16px",
                      borderRadius: isExpanded ? "8px 8px 0 0" : 8,
                      background: isExpanded ? "var(--elevated)" : "var(--surface)",
                      border: `1px solid ${isExpanded ? "var(--accent)" : "var(--border)"}`,
                      borderBottom: isExpanded ? "none" : undefined,
                      cursor: "pointer",
                      transition: "border-color 150ms, background 150ms",
                    }}
                  >
                    {/* Title row */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: STATUS_DOT[job.status] ?? "var(--fg4)",
                        flexShrink: 0,
                      }} />
                      <span style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                        {job.title}
                      </span>
                      {job.latestRun?.needsReview && (
                        <Badge variant="amber">Awaiting review</Badge>
                      )}
                    </div>

                    {/* Domain + owner */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, paddingLeft: 16 }}>
                      {job.domainName && <span style={{ fontSize: 11, color: "var(--fg3)" }}>{job.domainName}</span>}
                      {job.ownerName && (
                        <>
                          {job.domainName && <span style={{ fontSize: 11, color: "var(--fg4)" }}>/</span>}
                          <span style={{ fontSize: 11, color: "var(--fg3)" }}>{job.ownerName}</span>
                        </>
                      )}
                    </div>

                    {/* Schedule + next trigger */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 16, marginBottom: 6 }}>
                      <span style={{ fontSize: 11, color: "var(--fg4)" }}>{cronToHuman(job.schedule)}</span>
                      {job.nextRun && (
                        <>
                          <span style={{ fontSize: 11, color: "var(--fg4)" }}>·</span>
                          <span style={{ fontSize: 11, color: "var(--fg4)" }}>
                            Next {formatRelativeTime(job.nextRun, locale)}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Last run summary */}
                    {job.latestRun?.summary && (
                      <p style={{
                        fontSize: 12,
                        lineHeight: 1.5,
                        color: "var(--fg2)",
                        paddingLeft: 16,
                        margin: 0,
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                      }}>
                        {job.latestRun.summary}
                      </p>
                    )}
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div style={{
                      padding: "16px 20px 20px",
                      background: "var(--elevated)",
                      border: "1px solid var(--accent)",
                      borderTop: "1px solid var(--border)",
                      borderRadius: "0 0 8px 8px",
                    }}>
                      {detailLoading && !detail && (
                        <div style={{ display: "flex", justifyContent: "center", padding: "20px 0" }}>
                          <div style={{ width: 16, height: 16, border: "2px solid var(--border)", borderTopColor: "var(--fg4)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                        </div>
                      )}

                      {detail && detail.id === expandedId && (
                        <JobDetailPanel detail={detail} />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </AppShell>
  );
}

// ── Detail panel ────────────────────────────────────────────────────────────

function JobDetailPanel({ detail }: { detail: JobDetail }) {
  // Convert [[slug]] wiki refs to markdown links so ReactMarkdown can render them.
  const processedContent = useMemo(() => {
    const lookup: WikiLinkLookup = {};
    for (const slug of detail.crossReferences) {
      lookup[slug] = { title: slug };
    }
    let text = detail.content;
    // Strip leading H1 matching the page title to avoid duplicate heading.
    const titleMatch = text.match(/^#{1,2}\s+(.+)\n/);
    if (titleMatch && titleMatch[1].trim().toLowerCase() === detail.title.trim().toLowerCase()) {
      text = text.slice(titleMatch[0].length);
    }
    return replaceWikiLinksWithMarkdown(text, lookup);
  }, [detail.content, detail.title, detail.crossReferences]);

  return (
    <div>
      {/* Metadata row — schedule, status, trust level, domain, owner */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 20, marginBottom: 20 }}>
        <MetaCell label="Schedule" value={cronToHuman(detail.schedule)} raw={detail.schedule} />
        <MetaCell label="Status">
          <Badge variant={detail.status === "active" ? "green" : detail.status === "paused" ? "default" : "red"}>
            {detail.status}
          </Badge>
        </MetaCell>
        {detail.trustLevel && <MetaCell label="Trust level" value={detail.trustLevel} />}
        {detail.domainName && <MetaCell label="Domain" value={detail.domainName} />}
        {detail.ownerName && <MetaCell label="Owner" value={detail.ownerName} />}
      </div>

      {/* Wiki content */}
      <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--foreground)" }}>
        <ReactMarkdown
          components={{
            p: ({ children }) => <p style={{ marginBottom: 12, color: "var(--fg2)" }}>{children}</p>,
            h1: ({ children }) => <h1 style={{ fontSize: 18, fontWeight: 600, marginTop: 20, marginBottom: 10, color: "var(--foreground)" }}>{children}</h1>,
            h2: ({ children }) => <h2 style={{ fontSize: 15, fontWeight: 600, marginTop: 18, marginBottom: 8, color: "var(--foreground)" }}>{children}</h2>,
            h3: ({ children }) => <h3 style={{ fontSize: 13, fontWeight: 600, marginTop: 14, marginBottom: 6, color: "var(--foreground)" }}>{children}</h3>,
            ul: ({ children }) => <ul style={{ paddingLeft: 20, marginBottom: 12 }}>{children}</ul>,
            ol: ({ children }) => <ol style={{ paddingLeft: 20, marginBottom: 12 }}>{children}</ol>,
            li: ({ children }) => <li style={{ marginBottom: 4, color: "var(--fg2)" }}>{children}</li>,
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
            a: ({ href, children }) => {
              if (href?.startsWith("wiki:")) {
                const slug = href.slice(5);
                return (
                  <Link
                    href={`/wiki?page=${encodeURIComponent(slug)}`}
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
    </div>
  );
}

function MetaCell({ label, value, raw, children }: { label: string; value?: string; raw?: string; children?: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "var(--fg4)", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      {children ?? <div style={{ fontSize: 13, color: "var(--foreground)" }}>{value}</div>}
      {raw && raw !== value && (
        <div style={{ fontSize: 11, color: "var(--fg4)", marginTop: 2 }}>
          <code style={{ background: "rgba(255,255,255,0.06)", padding: "1px 4px", borderRadius: 3 }}>{raw}</code>
        </div>
      )}
    </div>
  );
}
