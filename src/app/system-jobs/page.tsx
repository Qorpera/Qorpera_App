"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { AppShell } from "@/components/app-shell";
import { ContextualChat } from "@/components/contextual-chat";
import { formatRelativeTime } from "@/lib/format-helpers";
import { useLocale } from "next-intl";
import { fetchApi } from "@/lib/fetch-api";
import { Badge } from "@/components/ui/badge";

// ── Types ────────────────────────────────────────────────────────────────────

interface SystemJobItem {
  id: string;
  title: string;
  description: string;
  scope: string;
  domainEntityId: string;
  domainName: string;
  assigneeEntityId: string | null;
  assigneeName: string | null;
  cronExpression: string;
  status: string;
  importanceThreshold: number;
  lastTriggeredAt: string | null;
  nextTriggerAt: string | null;
  latestRun: {
    summary: string | null;
    importanceScore: number | null;
    status: string;
    createdAt: string;
  } | null;
}

interface RunItem {
  id: string;
  cycleNumber: number;
  status: string;
  summary: string | null;
  importanceScore: number | null;
  findings: unknown;
  proposedSituationCount: number;
  proposedInitiativeCount: number;
  durationMs: number | null;
  createdAt: string;
}

interface JobDetail {
  id: string;
  title: string;
  description: string;
  scope: string;
  domainEntityId: string;
  domainName: string;
  assigneeEntityId: string | null;
  assigneeName: string | null;
  cronExpression: string;
  status: string;
  importanceThreshold: number;
  lastTriggeredAt: string | null;
  nextTriggerAt: string | null;
  createdAt: string;
  runs: RunItem[];
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
};

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SystemJobsPage() {
  const locale = useLocale();
  const [jobs, setJobs] = useState<SystemJobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [filter, setFilter] = useState<"active" | "all">("active");

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

  // Fetch detail when a card is expanded
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

  const filtered = useMemo(() =>
    filter === "active" ? jobs.filter(j => j.status === "active") : jobs,
    [jobs, filter],
  );

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

        {/* ── Filter tabs ── */}
        <div style={{ maxWidth: 900, margin: "0 auto", width: "100%", padding: "0 20px" }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
            {(["active", "all"] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  padding: "4px 12px",
                  borderRadius: 999,
                  border: filter === f ? "1px solid var(--border)" : "1px solid transparent",
                  background: filter === f ? "var(--elevated)" : "transparent",
                  color: filter === f ? "var(--foreground)" : "var(--fg4)",
                  cursor: "pointer",
                }}
              >
                {f === "active" ? "Active" : "All"}
              </button>
            ))}
          </div>
        </div>

        {/* ── Job grid ── */}
        <div style={{ maxWidth: 900, margin: "0 auto", width: "100%", padding: "0 20px 40px" }}>
          {loading && (
            <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
              <div style={{ width: 20, height: 20, border: "2px solid var(--border)", borderTopColor: "var(--fg4)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: "48px 0", color: "var(--fg4)", fontSize: 13 }}>
              No system jobs yet. Use the chat above to create one.
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
            {filtered.map(job => {
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
                    </div>

                    {/* Domain + assignee */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, paddingLeft: 16 }}>
                      <span style={{ fontSize: 11, color: "var(--fg3)" }}>{job.domainName}</span>
                      {job.assigneeName && (
                        <>
                          <span style={{ fontSize: 11, color: "var(--fg4)" }}>/</span>
                          <span style={{ fontSize: 11, color: "var(--fg3)" }}>{job.assigneeName}</span>
                        </>
                      )}
                    </div>

                    {/* Schedule + next trigger */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 16, marginBottom: 6 }}>
                      <span style={{ fontSize: 11, color: "var(--fg4)" }}>{cronToHuman(job.cronExpression)}</span>
                      {job.nextTriggerAt && (
                        <>
                          <span style={{ fontSize: 11, color: "var(--fg4)" }}>·</span>
                          <span style={{ fontSize: 11, color: "var(--fg4)" }}>
                            Next {formatRelativeTime(job.nextTriggerAt, locale)}
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
                        <div>
                          {/* Description */}
                          <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--fg2)", margin: "0 0 16px" }}>
                            {detail.description}
                          </p>

                          {/* Metadata row */}
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 20, marginBottom: 20 }}>
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "var(--fg4)", textTransform: "uppercase", marginBottom: 4 }}>Schedule</div>
                              <div style={{ fontSize: 13, color: "var(--foreground)" }}>{cronToHuman(detail.cronExpression)}</div>
                              <div style={{ fontSize: 11, color: "var(--fg4)", marginTop: 2 }}>
                                <code style={{ background: "rgba(255,255,255,0.06)", padding: "1px 4px", borderRadius: 3 }}>{detail.cronExpression}</code>
                              </div>
                            </div>
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "var(--fg4)", textTransform: "uppercase", marginBottom: 4 }}>Importance threshold</div>
                              <div style={{ fontSize: 13, color: "var(--foreground)" }}>{(detail.importanceThreshold * 100).toFixed(0)}%</div>
                            </div>
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "var(--fg4)", textTransform: "uppercase", marginBottom: 4 }}>Domain</div>
                              <div style={{ fontSize: 13, color: "var(--foreground)" }}>{detail.domainName}</div>
                            </div>
                            {detail.assigneeName && (
                              <div>
                                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "var(--fg4)", textTransform: "uppercase", marginBottom: 4 }}>Assignee</div>
                                <div style={{ fontSize: 13, color: "var(--foreground)" }}>{detail.assigneeName}</div>
                              </div>
                            )}
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "var(--fg4)", textTransform: "uppercase", marginBottom: 4 }}>Status</div>
                              <Badge variant={detail.status === "active" ? "green" : detail.status === "paused" ? "default" : "red"}>
                                {detail.status}
                              </Badge>
                            </div>
                          </div>

                          {/* Run History */}
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "var(--fg4)", textTransform: "uppercase", marginBottom: 8 }}>
                              Run History ({detail.runs.length})
                            </div>
                            {detail.runs.length === 0 ? (
                              <p style={{ fontSize: 12, color: "var(--fg4)", margin: 0 }}>No runs yet. The job will execute at its next scheduled time.</p>
                            ) : (
                              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                {detail.runs.map(run => (
                                  <div
                                    key={run.id}
                                    style={{
                                      display: "flex",
                                      alignItems: "flex-start",
                                      gap: 10,
                                      padding: "8px 10px",
                                      borderRadius: 6,
                                      background: "var(--surface)",
                                      border: "1px solid var(--border)",
                                    }}
                                  >
                                    <span style={{ fontSize: 11, fontWeight: 600, color: "var(--fg3)", minWidth: 24 }}>#{run.cycleNumber}</span>
                                    <Badge variant={run.status === "completed" ? "green" : run.status === "failed" ? "red" : "default"}>
                                      {run.status}
                                    </Badge>
                                    {run.importanceScore != null && (
                                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                        <div style={{ width: 40, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                                          <div style={{ width: `${run.importanceScore * 100}%`, height: "100%", borderRadius: 2, background: run.importanceScore > 0.5 ? "var(--warn)" : "var(--fg3)" }} />
                                        </div>
                                        <span style={{ fontSize: 10, color: "var(--fg4)" }}>{(run.importanceScore * 100).toFixed(0)}%</span>
                                      </div>
                                    )}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      {run.summary && (
                                        <p style={{
                                          fontSize: 12,
                                          lineHeight: 1.4,
                                          color: "var(--fg2)",
                                          margin: 0,
                                          overflow: "hidden",
                                          display: "-webkit-box",
                                          WebkitLineClamp: 2,
                                          WebkitBoxOrient: "vertical",
                                        }}>
                                          {run.summary}
                                        </p>
                                      )}
                                      {(run.proposedSituationCount > 0 || run.proposedInitiativeCount > 0) && (
                                        <div style={{ display: "flex", gap: 10, marginTop: 2, fontSize: 11, color: "var(--fg3)" }}>
                                          {run.proposedSituationCount > 0 && <span>{run.proposedSituationCount} situation{run.proposedSituationCount !== 1 ? "s" : ""}</span>}
                                          {run.proposedInitiativeCount > 0 && <span>{run.proposedInitiativeCount} initiative{run.proposedInitiativeCount !== 1 ? "s" : ""}</span>}
                                        </div>
                                      )}
                                    </div>
                                    <span style={{ fontSize: 11, color: "var(--fg4)", flexShrink: 0, whiteSpace: "nowrap" }}>
                                      {formatRelativeTime(run.createdAt, locale)}
                                    </span>
                                    {run.durationMs != null && (
                                      <span style={{ fontSize: 10, color: "var(--fg4)", flexShrink: 0 }}>{(run.durationMs / 1000).toFixed(1)}s</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* Spin keyframes for loading indicators */}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </AppShell>
  );
}
