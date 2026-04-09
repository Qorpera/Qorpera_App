"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

// ── Types ────────────────────────────────────────────────

interface StagedPage {
  id: string;
  slug: string;
  title: string;
  pageType: string;
  contentPreview: string;
  sourceReference: string | null;
  sourceDocumentId: string | null;
  sourceTitle: string | null;
  createdAt: string;
}

interface PageDetail {
  id: string;
  slug: string;
  title: string;
  pageType: string;
  content: string;
  contentTokens: number;
  crossReferences: string[];
  sourceAuthority: string | null;
  sourceReference: string | null;
  sourceDocumentId: string | null;
  sourceTitle: string | null;
  sourceAuthors: string | null;
  stagingStatus: string | null;
  createdAt: string;
  relatedPages: Array<{ slug: string; title: string; pageType: string }>;
}

const PAGE_TYPE_COLORS: Record<string, string> = {
  tacit_knowledge: "purple",
  benchmarks: "blue",
  red_flags: "red",
  decision_heuristics: "amber",
  regional_practice: "green",
  process_sequence: "blue",
  pattern_recognition: "purple",
  counter_intuitive: "amber",
};

const REJECT_REASONS = [
  { value: "model_knows_this", label: "Model already knows this" },
  { value: "too_generic", label: "Too generic" },
  { value: "duplicate", label: "Duplicate of existing page" },
  { value: "incorrect", label: "Incorrect information" },
  { value: "not_applicable", label: "Not applicable" },
  { value: "other", label: "Other" },
];

// ── Component ────────────────────────────────────────────

export default function ReviewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sourceIdParam = searchParams.get("sourceId");
  const { toast } = useToast();

  const [pages, setPages] = useState<StagedPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPage, setSelectedPage] = useState<PageDetail | null>(null);
  const [editContent, setEditContent] = useState<string | null>(null);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("model_knows_this");
  const [rejectNote, setRejectNote] = useState("");
  const [reviewedCount, setReviewedCount] = useState(0);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);

  const fetchPages = useCallback(async () => {
    const params = new URLSearchParams();
    if (sourceIdParam) params.set("sourceId", sourceIdParam);
    params.set("limit", "100");
    const res = await fetch(`/api/admin/library/staged?${params}`);
    if (res.ok) setPages(await res.json());
    setLoading(false);
  }, [sourceIdParam]);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(data => {
      if (data.role !== "superadmin") router.push("/map");
    }).catch(() => router.push("/login"));
    fetchPages();
  }, [fetchPages, router]);

  const loadDetail = async (pageId: string) => {
    const res = await fetch(`/api/admin/library/staged/${pageId}`);
    if (res.ok) {
      const detail = await res.json();
      setSelectedPage(detail);
      setEditContent(null);
    }
  };

  const handleApprove = async (pageId: string) => {
    const res = await fetch(`/api/admin/library/staged/${pageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    });
    if (res.ok) {
      toast("Page approved", "success");
      setPages(prev => prev.filter(p => p.id !== pageId));
      setReviewedCount(c => c + 1);
      if (selectedPage?.id === pageId) setSelectedPage(null);
    }
  };

  const handleReject = async (pageId: string) => {
    const res = await fetch(`/api/admin/library/staged/${pageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reject", reason: rejectReason, reviewNote: rejectNote || undefined }),
    });
    if (res.ok) {
      toast("Page rejected", "info");
      setPages(prev => prev.filter(p => p.id !== pageId));
      setReviewedCount(c => c + 1);
      setShowReject(false);
      setRejectNote("");
      if (selectedPage?.id === pageId) setSelectedPage(null);
    }
  };

  const handleSaveEdit = async () => {
    if (!selectedPage || editContent === null) return;
    const res = await fetch(`/api/admin/library/staged/${selectedPage.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "edit", content: editContent }),
    });
    if (res.ok) {
      toast("Content updated", "success");
      setSelectedPage({ ...selectedPage, content: editContent });
      setEditContent(null);
    }
  };

  const handleBulkApprove = async () => {
    if (!sourceIdParam) return;
    const res = await fetch("/api/admin/library/staged/bulk-approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceId: sourceIdParam }),
    });
    if (res.ok) {
      const data = await res.json();
      toast(`Approved ${data.approved} pages`, "success");
      setShowBulkConfirm(false);
      fetchPages();
    }
  };

  const sourceTitle = pages[0]?.sourceTitle;

  return (
    <div className="min-h-screen bg-surface">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <button onClick={() => router.push("/admin/library")} className="text-sm text-[var(--fg3)] hover:text-[var(--fg2)] mb-4 block">
          {"\u2190"} Source Library
        </button>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-[var(--fg1)]">Review Staged Pages</h1>
            {sourceIdParam && sourceTitle && (
              <p className="text-sm text-[var(--fg3)] mt-1">From: {sourceTitle}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {reviewedCount > 0 && (
              <span className="text-sm text-[var(--fg3)]">{reviewedCount} reviewed this session</span>
            )}
            {sourceIdParam && pages.length > 0 && (
              <button
                onClick={() => setShowBulkConfirm(true)}
                className="px-3 py-1.5 rounded-md text-sm font-medium bg-ok/10 text-ok hover:bg-ok/20 transition"
              >
                Approve All ({pages.length})
              </button>
            )}
          </div>
        </div>

        {/* Count bar */}
        {pages.length > 0 && (
          <div className="mb-4 flex items-center gap-2">
            <span className="text-sm text-[var(--fg3)]">{pages.length} page{pages.length !== 1 ? "s" : ""} awaiting review</span>
            <div className="flex-1 h-1 bg-hover rounded-full overflow-hidden">
              <div className="h-full bg-ok rounded-full transition-all" style={{ width: `${reviewedCount / (reviewedCount + pages.length) * 100}%` }} />
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="wf-soft p-5 h-24 animate-pulse" />)}
          </div>
        ) : pages.length === 0 ? (
          <div className="wf-soft p-12 text-center">
            <p className="text-[var(--fg3)]">{reviewedCount > 0 ? "All pages reviewed!" : "No pages awaiting review."}</p>
            <button onClick={() => router.push("/admin/library")} className="mt-4 text-sm text-accent hover:underline">
              Back to Library
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Page list */}
            <div className="space-y-2">
              {pages.map(page => (
                <button
                  key={page.id}
                  onClick={() => loadDetail(page.id)}
                  className={`wf-soft p-4 w-full text-left hover:bg-hover transition ${selectedPage?.id === page.id ? "ring-1 ring-accent" : ""}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-[var(--fg1)] truncate">{page.title}</span>
                    <Badge variant={(PAGE_TYPE_COLORS[page.pageType] as "purple" | "blue" | "red" | "amber" | "green") || "default"}>
                      {page.pageType.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  {page.sourceReference && (
                    <p className="text-xs text-[var(--fg4)] mb-1">{page.sourceReference}</p>
                  )}
                  <p className="text-xs text-[var(--fg3)] line-clamp-2">{page.contentPreview}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleApprove(page.id); }}
                      className="px-2 py-0.5 text-xs rounded bg-ok/10 text-ok hover:bg-ok/20 transition"
                    >
                      Approve
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setSelectedPage({ id: page.id } as PageDetail); setShowReject(true); }}
                      className="px-2 py-0.5 text-xs rounded bg-danger/10 text-danger hover:bg-danger/20 transition"
                    >
                      Reject
                    </button>
                  </div>
                </button>
              ))}
            </div>

            {/* Detail panel */}
            {selectedPage && selectedPage.content && (
              <div className="wf-soft p-5 sticky top-6 max-h-[calc(100vh-8rem)] overflow-y-auto">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-semibold text-[var(--fg1)]">{selectedPage.title}</h2>
                  <button onClick={() => setSelectedPage(null)} className="text-[var(--fg4)] hover:text-[var(--fg2)]">{"\u2715"}</button>
                </div>

                <div className="flex items-center gap-2 mb-3">
                  <Badge variant={(PAGE_TYPE_COLORS[selectedPage.pageType] as "purple" | "blue" | "red" | "amber" | "green") || "default"}>
                    {selectedPage.pageType.replace(/_/g, " ")}
                  </Badge>
                  {selectedPage.sourceAuthority && <Badge variant="blue">{selectedPage.sourceAuthority}</Badge>}
                  <span className="text-xs text-[var(--fg4)]">{selectedPage.contentTokens} tokens</span>
                </div>

                {selectedPage.sourceReference && (
                  <p className="text-xs text-[var(--fg3)] mb-3">
                    Source: {selectedPage.sourceReference}
                    {selectedPage.sourceDocumentId && (
                      <button onClick={() => router.push(`/admin/library/${selectedPage.sourceDocumentId}`)} className="ml-2 text-accent hover:underline">
                        View source {"\u2192"}
                      </button>
                    )}
                  </p>
                )}

                {/* Cross-references */}
                {selectedPage.crossReferences.length > 0 && (
                  <div className="mb-3">
                    <span className="text-xs text-[var(--fg4)]">Cross-references: </span>
                    {selectedPage.crossReferences.map(ref => {
                      const exists = selectedPage.relatedPages.some(p => p.slug === ref);
                      return (
                        <span key={ref} className={`inline-block text-xs mr-1 px-1.5 py-0.5 rounded ${exists ? "bg-ok/10 text-ok" : "bg-hover text-[var(--fg3)]"}`}>
                          [[{ref}]] {exists ? "\u2713" : "new"}
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Content */}
                {editContent !== null ? (
                  <div className="space-y-2">
                    <textarea
                      value={editContent}
                      onChange={e => setEditContent(e.target.value)}
                      className="w-full h-80 p-3 rounded-md text-sm bg-surface border border-border text-[var(--fg1)] font-mono resize-y"
                    />
                    <div className="flex gap-2">
                      <button onClick={handleSaveEdit} className="px-3 py-1.5 rounded-md text-sm bg-accent text-white">Save</button>
                      <button onClick={() => setEditContent(null)} className="px-3 py-1.5 rounded-md text-sm text-[var(--fg3)]">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="prose prose-sm max-w-none text-[var(--fg2)] mb-4">
                    <ReactMarkdown>{selectedPage.content}</ReactMarkdown>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border">
                  <button onClick={() => handleApprove(selectedPage.id)}
                    className="px-4 py-1.5 rounded-md text-sm font-medium bg-ok text-white hover:bg-ok/90 transition">
                    Approve
                  </button>
                  <button onClick={() => setEditContent(selectedPage.content)}
                    className="px-4 py-1.5 rounded-md text-sm font-medium border border-border text-[var(--fg2)] hover:bg-hover transition">
                    Edit
                  </button>
                  <button onClick={() => setShowReject(true)}
                    className="px-4 py-1.5 rounded-md text-sm font-medium text-danger border border-danger/20 hover:bg-danger/10 transition">
                    Reject
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Reject modal */}
      <Modal open={showReject} onClose={() => setShowReject(false)} title="Reject Page">
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-[var(--fg3)] mb-1">Reason</label>
            <select value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              className="w-full px-3 py-1.5 rounded-md text-sm bg-surface border border-border text-[var(--fg2)]">
              {REJECT_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--fg3)] mb-1">Note (optional)</label>
            <textarea value={rejectNote} onChange={e => setRejectNote(e.target.value)} rows={3}
              className="w-full px-3 py-1.5 rounded-md text-sm bg-surface border border-border text-[var(--fg1)] resize-none" />
          </div>
          <button
            onClick={() => selectedPage && handleReject(selectedPage.id)}
            className="w-full py-2 rounded-md text-sm font-medium bg-danger text-white"
          >
            Reject Page
          </button>
        </div>
      </Modal>

      {/* Bulk approve confirmation */}
      <Modal open={showBulkConfirm} onClose={() => setShowBulkConfirm(false)} title="Bulk Approve">
        <p className="text-sm text-[var(--fg2)] mb-4">
          Approve all {pages.length} staged pages from <strong>{sourceTitle || "this source"}</strong>?
        </p>
        <div className="flex gap-2">
          <button onClick={handleBulkApprove} className="flex-1 py-2 rounded-md text-sm font-medium bg-ok text-white">
            Approve All
          </button>
          <button onClick={() => setShowBulkConfirm(false)} className="flex-1 py-2 rounded-md text-sm font-medium border border-border text-[var(--fg2)]">
            Cancel
          </button>
        </div>
      </Modal>
    </div>
  );
}
