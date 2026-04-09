"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";

// ── Types ────────────────────────────────────────────────

interface Section {
  id: string;
  sectionIndex: number;
  title: string;
  titleHierarchy: string[];
  tokenCount: number;
  sectionType: string;
  status: string;
  pagesProduced: number;
  skipReason: string | null;
}

interface ProducedPage {
  slug: string;
  title: string;
  pageType: string;
  status: string;
  stagingStatus: string | null;
}

interface SourceDetail {
  id: string;
  title: string;
  authors: string | null;
  domain: string | null;
  domains: string[];
  sourceType: string;
  sourceAuthority: string;
  status: string;
  sectionCount: number | null;
  pagesProduced: number;
  publicationYear: number | null;
  isbn: string | null;
  version: string | null;
  notes: string | null;
  integrityStatus: string | null;
  integrityNotes: string | null;
  errorMessage: string | null;
  createdAt: string;
  sections: Section[];
  producedPages: ProducedPage[];
}

interface Progress {
  status: string;
  totalSections: number;
  pagesProduced: number;
  sections: { pending: number; synthesizing: number; complete: number; skipped: number; failed: number };
}

// ── Constants ────────────────────────────────────────────

const SECTION_STATUS: Record<string, { color: string; label: string }> = {
  pending: { color: "text-[var(--fg3)]", label: "Pending" },
  synthesizing: { color: "text-accent", label: "Synthesizing" },
  complete: { color: "text-ok", label: "Complete" },
  skipped: { color: "text-[var(--fg4)]", label: "Skipped" },
  failed: { color: "text-danger", label: "Failed" },
};

const STAGING_DOT: Record<string, string> = {
  staged: "bg-warn",
  approved: "bg-ok",
  rejected: "bg-danger",
};

// ── Component ────────────────────────────────────────────

export default function SourceDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { toast } = useToast();

  const [source, setSource] = useState<SourceDetail | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [showRawText, setShowRawText] = useState(false);
  const [rawText, setRawText] = useState<string | null>(null);

  const fetchSource = useCallback(async () => {
    const res = await fetch(`/api/admin/library/sources/${id}`);
    if (res.ok) setSource(await res.json());
    setLoading(false);
  }, [id]);

  const fetchProgress = useCallback(async () => {
    const res = await fetch(`/api/admin/library/sources/${id}/progress`);
    if (res.ok) setProgress(await res.json());
  }, [id]);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(data => {
      if (data.role !== "superadmin") router.push("/map");
    }).catch(() => router.push("/login"));
    fetchSource();
    fetchProgress();
  }, [fetchSource, fetchProgress, router]);

  // Poll progress during processing
  useEffect(() => {
    if (!source || (source.status !== "extracting" && source.status !== "synthesizing")) return;
    const interval = setInterval(() => { fetchSource(); fetchProgress(); }, 5000);
    return () => clearInterval(interval);
  }, [source, fetchSource, fetchProgress]);

  const handleApprove = async (slug: string) => {
    const page = source?.producedPages.find(p => p.slug === slug);
    if (!page) return;
    // Find page ID — we need to fetch it since producedPages doesn't include id
    const stagedRes = await fetch(`/api/admin/library/staged?sourceId=${id}`);
    if (!stagedRes.ok) return;
    const stagedPages = await stagedRes.json();
    const match = stagedPages.find((p: { slug: string }) => p.slug === slug);
    if (!match) return;
    const res = await fetch(`/api/admin/library/staged/${match.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    });
    if (res.ok) {
      toast("Page approved", "success");
      fetchSource();
    }
  };

  const handleReject = async (slug: string) => {
    const stagedRes = await fetch(`/api/admin/library/staged?sourceId=${id}`);
    if (!stagedRes.ok) return;
    const stagedPages = await stagedRes.json();
    const match = stagedPages.find((p: { slug: string }) => p.slug === slug);
    if (!match) return;
    const res = await fetch(`/api/admin/library/staged/${match.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reject", reason: "manual_rejection" }),
    });
    if (res.ok) {
      toast("Page rejected", "info");
      fetchSource();
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${source?.title}" and all its sections?`)) return;
    const res = await fetch(`/api/admin/library/sources/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast("Source deleted", "info");
      router.push("/admin/library");
    }
  };

  if (loading) return <div className="min-h-screen bg-surface flex items-center justify-center text-[var(--fg3)]">Loading...</div>;
  if (!source) return <div className="min-h-screen bg-surface flex items-center justify-center text-danger">Source not found</div>;

  const isProcessing = source.status === "extracting" || source.status === "synthesizing";

  return (
    <div className="min-h-screen bg-surface">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Back link */}
        <button onClick={() => router.push("/admin/library")} className="text-sm text-[var(--fg3)] hover:text-[var(--fg2)] mb-4 block">
          {"\u2190"} Source Library
        </button>

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-[var(--fg1)]">{source.title}</h1>
            <div className="flex items-center gap-2 mt-1 text-sm text-[var(--fg3)]">
              {source.authors && <span>by {source.authors}</span>}
              {source.publicationYear && <span>({source.publicationYear})</span>}
              {source.isbn && <span className="text-[var(--fg4)]">ISBN: {source.isbn}</span>}
            </div>
            <div className="flex items-center gap-2 mt-2">
              {source.domains.map(d => <Badge key={d}>{d}</Badge>)}
              <Badge variant="purple">{source.sourceType.replace(/_/g, " ")}</Badge>
              <Badge variant={source.sourceAuthority === "foundational" ? "blue" : "amber"}>{source.sourceAuthority}</Badge>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleDelete} className="px-3 py-1.5 rounded-md text-sm text-danger border border-danger/20 hover:bg-danger/10 transition">
              Delete
            </button>
          </div>
        </div>

        {/* Processing progress */}
        {isProcessing && progress && (
          <div className="wf-soft p-4 mb-6">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-sm font-medium text-accent animate-pulse">{source.status === "extracting" ? "Extracting sections..." : "Synthesizing pages..."}</span>
              <span className="text-xs text-[var(--fg3)]">{progress.sections.complete} / {progress.totalSections} sections done</span>
            </div>
            <div className="w-full h-1.5 bg-hover rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all duration-500"
                style={{ width: `${progress.totalSections > 0 ? ((progress.sections.complete + progress.sections.skipped) / progress.totalSections) * 100 : 0}%` }}
              />
            </div>
            <div className="flex gap-4 mt-2 text-xs text-[var(--fg4)]">
              <span>{progress.sections.complete} complete</span>
              <span>{progress.sections.skipped} skipped</span>
              {progress.sections.failed > 0 && <span className="text-danger">{progress.sections.failed} failed</span>}
              <span>{progress.pagesProduced} pages produced</span>
            </div>
          </div>
        )}

        {source.errorMessage && (
          <div className="wf-soft p-4 mb-6 border-l-4 border-danger">
            <p className="text-sm text-danger">{source.errorMessage}</p>
          </div>
        )}

        {/* Sections panel */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-[var(--fg2)] uppercase tracking-wide mb-3">Sections ({source.sections.length})</h2>
          <div className="space-y-1">
            {source.sections.map(section => (
              <div key={section.id} className="wf-soft">
                <button
                  onClick={() => setExpandedSection(expandedSection === section.id ? null : section.id)}
                  className="w-full p-3 text-left flex items-center gap-3 hover:bg-hover transition"
                >
                  <span className="text-xs text-[var(--fg4)] w-6 text-right flex-shrink-0">{section.sectionIndex + 1}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-[var(--fg1)] truncate block">{section.title}</span>
                    {section.titleHierarchy.length > 1 && (
                      <span className="text-xs text-[var(--fg4)]">{section.titleHierarchy.slice(0, -1).join(" > ")}</span>
                    )}
                  </div>
                  <span className="text-xs text-[var(--fg4)] flex-shrink-0">{Math.round(section.tokenCount / 1000)}k tokens</span>
                  <Badge variant="default">{section.sectionType}</Badge>
                  <span className={`text-xs flex-shrink-0 ${SECTION_STATUS[section.status]?.color || ""}`}>
                    {SECTION_STATUS[section.status]?.label || section.status}
                  </span>
                  {section.pagesProduced > 0 && <span className="text-xs text-ok flex-shrink-0">{section.pagesProduced} pg</span>}
                  <span className="text-[var(--fg4)] text-xs">{expandedSection === section.id ? "\u25B2" : "\u25BC"}</span>
                </button>
                {expandedSection === section.id && (
                  <div className="px-3 pb-3">
                    {section.skipReason && <p className="text-xs text-[var(--fg4)] mb-2 italic">{section.skipReason}</p>}
                    <div className="max-h-60 overflow-y-auto p-3 bg-surface rounded border border-border text-xs font-mono text-[var(--fg2)] whitespace-pre-wrap">
                      {/* Content loaded on demand would be better, but for v1 the detail endpoint doesn't include section content */}
                      <span className="text-[var(--fg4)]">(Section content available in raw text view)</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Produced pages panel */}
        {source.producedPages.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-[var(--fg2)] uppercase tracking-wide">Produced Pages ({source.producedPages.length})</h2>
              {source.producedPages.some(p => p.stagingStatus === "staged") && (
                <button
                  onClick={() => router.push(`/admin/library/review?sourceId=${id}`)}
                  className="text-xs text-accent hover:underline"
                >
                  Review staged pages {"\u2192"}
                </button>
              )}
            </div>
            <div className="space-y-1">
              {source.producedPages.map(page => (
                <div key={page.slug} className={`wf-soft p-3 flex items-center gap-3 ${page.stagingStatus === "rejected" ? "opacity-50" : ""}`}>
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STAGING_DOT[page.stagingStatus ?? ""] || "bg-[var(--fg4)]"}`} />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-[var(--fg1)] truncate block">{page.title}</span>
                  </div>
                  <Badge variant="default">{page.pageType.replace(/_/g, " ")}</Badge>
                  <span className="text-xs text-[var(--fg3)]">{page.stagingStatus || page.status}</span>
                  {page.stagingStatus === "staged" && (
                    <div className="flex gap-1">
                      <button onClick={() => handleApprove(page.slug)} className="px-2 py-0.5 text-xs rounded bg-ok/10 text-ok hover:bg-ok/20 transition">Approve</button>
                      <button onClick={() => handleReject(page.slug)} className="px-2 py-0.5 text-xs rounded bg-danger/10 text-danger hover:bg-danger/20 transition">Reject</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Raw text viewer */}
        <div>
          <button
            onClick={() => { setShowRawText(!showRawText); if (!rawText) setRawText("Loading..."); }}
            className="text-sm text-[var(--fg3)] hover:text-[var(--fg2)] mb-2"
          >
            {showRawText ? "\u25BC" : "\u25B6"} Raw Text
          </button>
          {showRawText && (
            <div className="max-h-96 overflow-y-auto p-4 bg-surface rounded border border-border text-xs font-mono text-[var(--fg2)] whitespace-pre-wrap">
              {rawText === "Loading..." ? "Raw text not available in this view — check source directly." : rawText || "No raw text stored."}
            </div>
          )}
        </div>

        {/* Notes */}
        {source.notes && (
          <div className="mt-6 wf-soft p-4">
            <h3 className="text-xs font-semibold text-[var(--fg3)] uppercase mb-1">Notes</h3>
            <p className="text-sm text-[var(--fg2)]">{source.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
