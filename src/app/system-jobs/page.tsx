"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { ContextualChat } from "@/components/contextual-chat";
import { useIsMobile } from "@/hooks/use-media-query";
import { formatRelativeTime } from "@/lib/format-helpers";
import { useLocale } from "next-intl";

// ── Types ────────────────────────────────────────────────────────────────────

interface SystemJobItem {
  id: string;
  title: string;
  description: string;
  scope: string;
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
  analysisNarrative: string | null;
  selfAmendments: unknown;
}

interface JobDetail {
  id: string;
  title: string;
  description: string;
  scope: string;
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
  if (dow !== "*") return `Weekly on day ${dow} at ${hour}:${min.padStart(2, "0")}`;
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
  const isMobile = useIsMobile();
  const [jobs, setJobs] = useState<SystemJobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [filter, setFilter] = useState<"active" | "all">("active");

  // Editing state
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editThreshold, setEditThreshold] = useState(0.3);
  const [saving, setSaving] = useState(false);

  // Run expansion
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/system-jobs");
      if (res.ok) {
        const data = await res.json();
        setJobs(data.items ?? []);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    let cancelled = false;
    setDetail(null);
    setDetailLoading(true);
    fetch(`/api/system-jobs/${selectedId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!cancelled && data) {
          setDetail(data);
          setEditTitle(data.title);
          setEditDesc(data.description);
          setEditThreshold(data.importanceThreshold);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId]);

  const filtered = useMemo(() =>
    filter === "active" ? jobs.filter(j => j.status === "active") : jobs,
    [jobs, filter],
  );

  const patchJob = async (updates: Record<string, unknown>) => {
    if (!selectedId || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/system-jobs/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        fetchJobs();
        const data = await res.json();
        setDetail(prev => prev ? { ...prev, ...data } : prev);
      }
    } catch {}
    setSaving(false);
  };

  const toggleStatus = () => {
    if (!detail) return;
    patchJob({ status: detail.status === "active" ? "paused" : "active" });
  };

  return (
    <AppShell>
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── Left: job list ── */}
        {(!isMobile || !selectedId) && (
        <div className={`${isMobile ? "w-full" : "w-[300px]"} flex-shrink-0 flex flex-col overflow-hidden`} style={{ borderRight: isMobile ? "none" : "1px solid var(--border)" }}>
          <div className="px-4 py-3 flex-shrink-0 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--foreground)" }}>System Jobs</div>
              <div style={{ fontSize: 11, color: "var(--fg3)" }} className="mt-0.5">
                Scheduled intelligence tasks
              </div>
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
                {f === "active" ? "Active" : "All"}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading && (
              <div className="flex justify-center py-10">
                <div className="h-4 w-4 animate-spin rounded-full border border-border border-t-muted" />
              </div>
            )}
            {filtered.map(job => (
              <button
                key={job.id}
                onClick={() => setSelectedId(job.id)}
                className="w-full text-left px-4 py-2.5 transition"
                style={{
                  borderBottom: "1px solid var(--border)",
                  borderLeft: selectedId === job.id ? "2px solid var(--accent)" : "2px solid transparent",
                  background: selectedId === job.id ? "var(--hover)" : "transparent",
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: STATUS_DOT[job.status] ?? "var(--fg4)", flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground)" }} className="truncate flex-1">
                    {job.title}
                  </span>
                </div>
                <div className="flex items-center gap-2 pl-[15px]" style={{ fontSize: 11, color: "var(--fg4)" }}>
                  <span>{cronToHuman(job.cronExpression)}</span>
                  {job.latestRun?.importanceScore != null && (
                    <>
                      <span>·</span>
                      <div style={{ width: 30, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                        <div style={{ width: `${job.latestRun.importanceScore * 100}%`, height: "100%", borderRadius: 2, background: job.latestRun.importanceScore > 0.5 ? "var(--warn)" : "var(--fg3)" }} />
                      </div>
                    </>
                  )}
                  {job.nextTriggerAt && (
                    <>
                      <span>·</span>
                      <span>Next: {formatRelativeTime(job.nextTriggerAt, locale)}</span>
                    </>
                  )}
                </div>
              </button>
            ))}
            {!loading && filtered.length === 0 && (
              <div className="px-4 py-8 text-center" style={{ fontSize: 13, color: "var(--fg4)" }}>
                No system jobs yet. Use the copilot to create one.
              </div>
            )}
          </div>
        </div>
        )}

        {/* ── Right: detail pane ── */}
        {(!isMobile || selectedId) && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {isMobile && (
            <button onClick={() => setSelectedId(null)} className="flex items-center gap-1.5 px-4 py-3 text-sm text-[var(--fg2)]">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
              Back
            </button>
          )}
          {selectedId && detail ? (
            <>
              <div className="flex-1 overflow-y-auto">
                <div className="px-6 py-5 space-y-5">
                  {/* Header */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant={detail.status === "active" ? "green" : detail.status === "paused" ? "default" : "red"}>
                        {detail.status}
                      </Badge>
                      <span style={{ fontSize: 12, color: "var(--fg3)" }}>{detail.scope}</span>
                      <button
                        onClick={toggleStatus}
                        style={{ fontSize: 11, fontWeight: 500, padding: "2px 10px", borderRadius: 4, border: "1px solid var(--border)", background: "transparent", color: "var(--fg2)", cursor: "pointer", marginLeft: "auto" }}
                      >
                        {detail.status === "active" ? "Pause" : "Resume"}
                      </button>
                    </div>
                    <input
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      onBlur={() => { if (editTitle !== detail.title) patchJob({ title: editTitle }); }}
                      style={{ fontSize: 18, fontWeight: 600, color: "var(--foreground)", background: "transparent", border: "none", outline: "none", width: "100%", padding: 0 }}
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "var(--fg4)", textTransform: "uppercase", marginBottom: 6 }}>Description</div>
                    <textarea
                      value={editDesc}
                      onChange={e => setEditDesc(e.target.value)}
                      onBlur={() => { if (editDesc !== detail.description) patchJob({ description: editDesc }); }}
                      rows={4}
                      style={{ width: "100%", fontSize: 13, lineHeight: 1.6, color: "var(--fg2)", background: "var(--surface)", border: "1px solid var(--elevated)", borderRadius: 6, padding: "10px 14px", resize: "vertical", outline: "none", fontFamily: "inherit" }}
                    />
                  </div>

                  {/* Schedule + Threshold */}
                  <div className="flex gap-6">
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "var(--fg4)", textTransform: "uppercase", marginBottom: 4 }}>Schedule</div>
                      <div style={{ fontSize: 13, color: "var(--foreground)" }}>{cronToHuman(detail.cronExpression)}</div>
                      <div style={{ fontSize: 11, color: "var(--fg4)", marginTop: 2 }}><code style={{ background: "rgba(255,255,255,0.06)", padding: "1px 4px", borderRadius: 3 }}>{detail.cronExpression}</code></div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "var(--fg4)", textTransform: "uppercase", marginBottom: 4 }}>Importance threshold</div>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={editThreshold}
                          onChange={e => setEditThreshold(parseFloat(e.target.value))}
                          onMouseUp={() => { if (editThreshold !== detail.importanceThreshold) patchJob({ importanceThreshold: editThreshold }); }}
                          style={{ width: 100 }}
                        />
                        <span style={{ fontSize: 12, color: "var(--fg2)", width: 32 }}>{(editThreshold * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Run History */}
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "var(--fg4)", textTransform: "uppercase", marginBottom: 8 }}>
                      Run History ({detail.runs.length})
                    </div>
                    {detail.runs.length === 0 ? (
                      <p style={{ fontSize: 12, color: "var(--fg4)" }}>No runs yet. The job will execute at its next scheduled time.</p>
                    ) : (
                      <div className="space-y-1">
                        {detail.runs.map(run => {
                          const isExpanded = expandedRun === run.id;
                          const findings = Array.isArray(run.findings) ? run.findings as Array<{ title: string; category: string; description: string }> : [];
                          return (
                            <div key={run.id}>
                              <button
                                onClick={() => setExpandedRun(isExpanded ? null : run.id)}
                                className="w-full text-left transition"
                                style={{
                                  padding: "8px 12px",
                                  borderRadius: 6,
                                  background: isExpanded ? "var(--surface)" : "transparent",
                                  border: isExpanded ? "1px solid var(--elevated)" : "1px solid transparent",
                                  opacity: run.status === "compressed" ? 0.6 : 1,
                                }}
                              >
                                <div className="flex items-center gap-2">
                                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--fg3)", width: 24 }}>#{run.cycleNumber}</span>
                                  <Badge variant={run.status === "completed" ? "green" : run.status === "failed" ? "red" : "default"}>
                                    {run.status}
                                  </Badge>
                                  {run.importanceScore != null && (
                                    <div style={{ width: 40, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                                      <div style={{ width: `${run.importanceScore * 100}%`, height: "100%", borderRadius: 2, background: run.importanceScore > 0.5 ? "var(--warn)" : "var(--fg3)" }} />
                                    </div>
                                  )}
                                  <span style={{ fontSize: 11, color: "var(--fg4)", marginLeft: "auto" }}>
                                    {formatRelativeTime(run.createdAt, locale)}
                                  </span>
                                  {run.durationMs != null && (
                                    <span style={{ fontSize: 10, color: "var(--fg4)" }}>{(run.durationMs / 1000).toFixed(1)}s</span>
                                  )}
                                </div>
                                {run.summary && (
                                  <p style={{ fontSize: 12, color: "var(--fg2)", marginTop: 4, lineHeight: 1.4 }} className={isExpanded ? "" : "line-clamp-2"}>
                                    {run.summary}
                                  </p>
                                )}
                                {(run.proposedSituationCount > 0 || run.proposedInitiativeCount > 0) && (
                                  <div className="flex gap-3 mt-1" style={{ fontSize: 11, color: "var(--fg3)" }}>
                                    {run.proposedSituationCount > 0 && <span>{run.proposedSituationCount} situation{run.proposedSituationCount !== 1 ? "s" : ""}</span>}
                                    {run.proposedInitiativeCount > 0 && <span>{run.proposedInitiativeCount} initiative{run.proposedInitiativeCount !== 1 ? "s" : ""}</span>}
                                  </div>
                                )}
                              </button>
                              {isExpanded && (
                                <div style={{ padding: "8px 12px 12px 36px" }} className="space-y-3">
                                  {run.analysisNarrative && (
                                    <div>
                                      <div style={{ fontSize: 10, fontWeight: 600, color: "var(--fg4)", textTransform: "uppercase", marginBottom: 4 }}>Analysis</div>
                                      <p style={{ fontSize: 12, color: "var(--fg2)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{run.analysisNarrative}</p>
                                    </div>
                                  )}
                                  {findings.length > 0 && (
                                    <div>
                                      <div style={{ fontSize: 10, fontWeight: 600, color: "var(--fg4)", textTransform: "uppercase", marginBottom: 4 }}>Findings ({findings.length})</div>
                                      {findings.map((f, i) => (
                                        <div key={i} style={{ fontSize: 12, marginBottom: 4 }}>
                                          <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 5px", borderRadius: 3, background: "rgba(255,255,255,0.06)", color: "var(--fg3)", textTransform: "uppercase", marginRight: 6 }}>{f.category}</span>
                                          <span style={{ color: "var(--foreground)", fontWeight: 500 }}>{f.title}</span>
                                          {f.description && <p style={{ color: "var(--fg3)", marginTop: 2, marginLeft: 0 }}>{f.description}</p>}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <ContextualChat
                contextType="system_job"
                contextId={detail.id}
                placeholder="Ask about this job or request changes..."
                hints={["What did the last run find?", "Change schedule to weekly"]}
              />
            </>
          ) : selectedId && detailLoading ? (
            <div className="flex justify-center py-16">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-muted" />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3" style={{ color: "var(--fg4)" }}>
              <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ opacity: 0.3 }}>
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <p style={{ fontSize: 13 }}>Select a job or create one via the copilot</p>
            </div>
          )}
        </div>
        )}

      </div>
    </AppShell>
  );
}
