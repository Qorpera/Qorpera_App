"use client";

import { useEffect, useState, useCallback } from "react";
import { useLocale } from "next-intl";
import { formatRelativeTime } from "@/lib/format-helpers";

type Classification = "action_required" | "awareness" | "irrelevant" | "idea_candidate";

interface LogEntry {
  id: string;
  actorEntityId: string | null;
  actorName: string | null;
  sourceType: string;
  sourceId: string;
  classification: Classification;
  summary: string | null;
  reasoning: string | null;
  urgency: string | null;
  confidence: number | null;
  situationId: string | null;
  metadata: Record<string, unknown> | null;
  evaluatedAt: string;
}

interface Stats {
  total: number;
  action_required: number;
  awareness: number;
  irrelevant: number;
}

const CLASSIFICATION_STYLES: Record<Classification, { label: string; color: string; bg: string }> = {
  action_required: { label: "Action Required", color: "var(--ok)", bg: "color-mix(in srgb, var(--ok) 12%, transparent)" },
  awareness: { label: "Awareness", color: "var(--accent)", bg: "color-mix(in srgb, var(--accent) 12%, transparent)" },
  irrelevant: { label: "Irrelevant", color: "var(--fg3)", bg: "color-mix(in srgb, var(--fg3) 12%, transparent)" },
  idea_candidate: { label: "Idea", color: "var(--warn)", bg: "color-mix(in srgb, var(--warn) 12%, transparent)" },
};

const SOURCE_LABELS: Record<string, string> = {
  email: "Email",
  slack_message: "Slack",
  teams_message: "Teams",
};

export function EvaluationLogTab() {
  const locale = useLocale();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, action_required: 0, awareness: 0, irrelevant: 0 });
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [filter, setFilter] = useState<Classification | "">("");
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchLogs = useCallback(async (cursor?: string) => {
    const params = new URLSearchParams();
    if (filter) params.set("classification", filter);
    if (cursor) params.set("cursor", cursor);
    params.set("limit", "50");

    const res = await fetch(`/api/evaluation-log?${params}`);
    if (!res.ok) return null;
    return res.json();
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    fetchLogs()
      .then((data) => {
        if (data) {
          setItems(data.items);
          setStats(data.stats);
          setNextCursor(data.nextCursor);
        }
      })
      .finally(() => setLoading(false));
  }, [fetchLogs]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    const data = await fetchLogs(nextCursor);
    if (data) {
      setItems((prev) => [...prev, ...data.items]);
      setNextCursor(data.nextCursor);
    }
    setLoadingMore(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-6 w-6 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <StatPill label="Total" count={stats.total} color="var(--fg2)" />
        <StatPill label="Action Required" count={stats.action_required} color="var(--ok)" />
        <StatPill label="Awareness" count={stats.awareness} color="var(--accent)" />
        <StatPill label="Irrelevant" count={stats.irrelevant} color="var(--fg3)" />
      </div>

      <div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as Classification | "")}
          className="bg-surface border border-border rounded-md px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
        >
          <option value="">All classifications</option>
          <option value="action_required">Action Required</option>
          <option value="awareness">Awareness</option>
          <option value="irrelevant">Irrelevant</option>
        </select>
      </div>

      <div className="space-y-2">
        {items.length === 0 && (
          <p className="text-sm text-[var(--fg3)] py-8 text-center">No evaluation logs yet.</p>
        )}
        {items.map((entry) => {
          const style = CLASSIFICATION_STYLES[entry.classification] ?? { label: entry.classification, color: "var(--fg3)", bg: "transparent" };
          return (
            <div key={entry.id} className="wf-soft rounded-lg border border-border p-4 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="text-xs font-medium px-2 py-0.5 rounded-full"
                  style={{ color: style.color, backgroundColor: style.bg }}
                >
                  {style.label}
                </span>
                <span className="text-xs text-[var(--fg3)]">
                  {SOURCE_LABELS[entry.sourceType] ?? entry.sourceType}
                </span>
                <span className="text-xs text-[var(--fg2)]">
                  {entry.actorName ?? "Unknown"}
                </span>
                {entry.urgency && (
                  <span className="text-xs text-[var(--fg3)]">
                    {entry.urgency} urgency
                  </span>
                )}
                {entry.confidence != null && (
                  <span className="text-xs text-[var(--fg3)]">
                    {Math.round(entry.confidence * 100)}%
                  </span>
                )}
                <span className="text-xs text-[var(--fg3)] ml-auto">
                  {formatRelativeTime(entry.evaluatedAt, locale)}
                </span>
              </div>

              {entry.summary && (
                <p className="text-sm text-foreground">{entry.summary}</p>
              )}

              {entry.reasoning && (
                <p className="text-xs text-[var(--fg3)]">{entry.reasoning}</p>
              )}

              {entry.situationId && (
                <a
                  href={`/situations?id=${entry.situationId}`}
                  className="text-xs text-accent hover:underline"
                >
                  → Situation
                </a>
              )}
            </div>
          );
        })}
      </div>

      {nextCursor && (
        <div className="flex justify-center">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="text-sm text-accent hover:underline disabled:opacity-50"
          >
            {loadingMore ? "Loading..." : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}

function StatPill({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-border text-sm"
      style={{ backgroundColor: `color-mix(in srgb, ${color} 8%, transparent)` }}
    >
      <span className="font-medium" style={{ color }}>{count}</span>
      <span className="text-[var(--fg3)]">{label}</span>
    </div>
  );
}
