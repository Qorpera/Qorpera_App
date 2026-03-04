"use client";

import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Proposal {
  id: string;
  actionType: string;
  description: string;
  entityId: string | null;
  entityTypeSlug: string | null;
  sourceAgent: string | null;
  inputData: string | null;
  status: string;
  reviewedBy: string | null;
  reviewNote: string | null;
  createdAt: string;
  expiresAt: string | null;
  entity: {
    id: string;
    displayName: string;
    entityType: { name: string; slug: string };
  } | null;
}

type TabStatus = "PENDING" | "APPROVED" | "REJECTED";

const TAB_OPTIONS: { value: TabStatus; label: string }[] = [
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
];

const actionBadgeVariant: Record<string, "purple" | "blue" | "amber" | "red" | "default"> = {
  create: "purple",
  update: "blue",
  delete: "red",
  read: "default",
};

function formatRelative(dateStr: string): string {
  const d = new Date(dateStr);
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ApprovalsPage() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [total, setTotal] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabStatus>("PENDING");
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const fetchProposals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/proposals?status=${activeTab}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setProposals(data.proposals);
      setTotal(data.total);
      setPendingCount(data.pendingCount);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load proposals",
      );
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchProposals();
  }, [fetchProposals]);

  const handleReview = async (
    proposalId: string,
    decision: "APPROVED" | "REJECTED",
  ) => {
    setReviewingId(proposalId);
    try {
      const res = await fetch(`/api/proposals/${proposalId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      fetchProposals();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Review failed");
    } finally {
      setReviewingId(null);
    }
  };

  return (
    <AppShell pendingApprovals={pendingCount}>
      <div className="p-8 max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-white/90">Approvals</h1>
            {pendingCount > 0 && (
              <Badge variant="amber">{pendingCount} pending</Badge>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 bg-white/[0.03] rounded-lg p-1 w-fit">
          {TAB_OPTIONS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
                activeTab === tab.value
                  ? "bg-purple-500/15 text-purple-300"
                  : "text-white/40 hover:text-white/60"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-purple-400" />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="text-sm text-red-400 text-center py-4">{error}</div>
        )}

        {/* Empty state */}
        {!loading && !error && proposals.length === 0 && (
          <div className="wf-soft p-10 text-center">
            <p className="text-sm text-white/40">
              {activeTab === "PENDING"
                ? "No pending approvals. All clear."
                : `No ${activeTab.toLowerCase()} proposals.`}
            </p>
          </div>
        )}

        {/* Proposal list */}
        {!loading && !error && proposals.length > 0 && (
          <div className="space-y-2">
            {proposals.map((proposal) => (
              <div
                key={proposal.id}
                className="wf-soft px-5 py-4 space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-white/80">
                      {proposal.description || `${proposal.actionType} action`}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Badge
                        variant={
                          actionBadgeVariant[proposal.actionType] ?? "default"
                        }
                      >
                        {proposal.actionType}
                      </Badge>
                      {proposal.entity && (
                        <span className="text-xs text-white/40">
                          {proposal.entity.entityType.name}:{" "}
                          {proposal.entity.displayName}
                        </span>
                      )}
                      {proposal.entityTypeSlug && !proposal.entity && (
                        <span className="text-xs text-white/40">
                          {proposal.entityTypeSlug}
                        </span>
                      )}
                      {proposal.sourceAgent && (
                        <span className="text-xs text-white/30">
                          from {proposal.sourceAgent}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-white/30 shrink-0 ml-4">
                    {formatRelative(proposal.createdAt)}
                  </span>
                </div>

                {/* Action buttons for pending */}
                {proposal.status === "PENDING" && (
                  <div className="flex gap-2 pt-1">
                    <Button
                      variant="success"
                      size="sm"
                      onClick={() => handleReview(proposal.id, "APPROVED")}
                      disabled={reviewingId === proposal.id}
                    >
                      {reviewingId === proposal.id ? "..." : "Approve"}
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleReview(proposal.id, "REJECTED")}
                      disabled={reviewingId === proposal.id}
                    >
                      Reject
                    </Button>
                  </div>
                )}

                {/* Review note for reviewed proposals */}
                {proposal.reviewNote && (
                  <div className="text-xs text-white/30 italic">
                    Note: {proposal.reviewNote}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
