"use client";

import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/app-shell";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface AuditEntry {
  id: string;
  action: string;
  actorType: string;
  actorId: string | null;
  entityId: string | null;
  entityTypeSlug: string | null;
  outcome: string;
  createdAt: string;
  policyRuleId: string | null;
  proposalId: string | null;
}

const ACTION_OPTIONS = [
  { value: "", label: "All actions" },
  { value: "create", label: "Create" },
  { value: "update", label: "Update" },
  { value: "delete", label: "Delete" },
  { value: "read", label: "Read" },
  { value: "proposal_approved", label: "Proposal Approved" },
  { value: "proposal_rejected", label: "Proposal Rejected" },
];

const OUTCOME_OPTIONS = [
  { value: "", label: "All outcomes" },
  { value: "success", label: "Success" },
  { value: "denied", label: "Denied" },
  { value: "error", label: "Error" },
  { value: "proposal_created", label: "Proposal Created" },
];

const outcomeBadgeVariant: Record<string, "green" | "red" | "amber" | "default"> = {
  success: "green",
  denied: "red",
  error: "red",
  proposal_created: "amber",
};

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState("");
  const [offset, setOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  const LIMIT = 50;

  const fetchEntries = useCallback(
    async (append = false) => {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const params = new URLSearchParams();
        if (actionFilter) params.set("action", actionFilter);
        if (outcomeFilter) params.set("outcome", outcomeFilter);
        params.set("limit", String(LIMIT));
        params.set("offset", String(append ? offset : 0));

        const res = await fetch(`/api/audit?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (append) {
          setEntries((prev) => [...prev, ...data.entries]);
        } else {
          setEntries(data.entries);
        }
        setTotal(data.total);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load audit log",
        );
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [actionFilter, outcomeFilter, offset],
  );

  // Reset offset when filters change
  useEffect(() => {
    setOffset(0);
  }, [actionFilter, outcomeFilter]);

  useEffect(() => {
    fetchEntries(offset > 0);
  }, [fetchEntries, offset]);

  const handleLoadMore = () => {
    setOffset((prev) => prev + LIMIT);
  };

  const hasMore = entries.length < total;

  return (
    <AppShell>
      <div className="p-8 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-white/90">Audit Log</h1>
            {!loading && (
              <Badge variant="default">{total.toLocaleString()} entries</Badge>
            )}
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex items-end gap-4">
          <div className="w-48">
            <Select
              label="Action"
              options={ACTION_OPTIONS}
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
            />
          </div>
          <div className="w-48">
            <Select
              label="Outcome"
              options={OUTCOME_OPTIONS}
              value={outcomeFilter}
              onChange={(e) => setOutcomeFilter(e.target.value)}
            />
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-purple-400" />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="text-sm text-red-400 text-center py-8">{error}</div>
        )}

        {/* Empty state */}
        {!loading && !error && entries.length === 0 && (
          <div className="wf-soft p-10 text-center">
            <p className="text-sm text-white/40">
              No audit entries match your filters.
            </p>
          </div>
        )}

        {/* Table */}
        {!loading && !error && entries.length > 0 && (
          <div className="wf-soft overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left px-5 py-3 text-white/40 font-medium text-xs uppercase tracking-wider">
                    Timestamp
                  </th>
                  <th className="text-left px-5 py-3 text-white/40 font-medium text-xs uppercase tracking-wider">
                    Action
                  </th>
                  <th className="text-left px-5 py-3 text-white/40 font-medium text-xs uppercase tracking-wider">
                    Actor
                  </th>
                  <th className="text-left px-5 py-3 text-white/40 font-medium text-xs uppercase tracking-wider">
                    Entity
                  </th>
                  <th className="text-left px-5 py-3 text-white/40 font-medium text-xs uppercase tracking-wider">
                    Outcome
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className="hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="px-5 py-3 text-white/50 whitespace-nowrap">
                      {formatDateTime(entry.createdAt)}
                    </td>
                    <td className="px-5 py-3 text-white/70">
                      {entry.action}
                    </td>
                    <td className="px-5 py-3 text-white/50">
                      <span className="text-xs">{entry.actorType}</span>
                    </td>
                    <td className="px-5 py-3 text-white/50">
                      {entry.entityTypeSlug && (
                        <span className="text-xs">{entry.entityTypeSlug}</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <Badge
                        variant={
                          outcomeBadgeVariant[entry.outcome] ?? "default"
                        }
                      >
                        {entry.outcome}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Load more */}
        {!loading && hasMore && (
          <div className="flex justify-center pt-2">
            <Button
              variant="ghost"
              onClick={handleLoadMore}
              disabled={loadingMore}
            >
              {loadingMore ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-purple-400" />
              ) : (
                "Load more"
              )}
            </Button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
