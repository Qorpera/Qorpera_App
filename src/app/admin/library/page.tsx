"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

// ── Types ────────────────────────────────────────────────

interface Source {
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
  integrityStatus: string | null;
  createdAt: string;
}

// ── Constants ────────────────────────────────────────────

const SOURCE_TYPE_ICONS: Record<string, string> = {
  book: "\u{1F4D5}",
  research: "\u{1F4C4}",
  standard: "\u{1F4CB}",
  empirical_aggregate: "\u{1F4CA}",
  expert_doc: "\u{1F4DD}",
  outcome_analysis: "\u{1F4CA}",
  regulation: "\u{2696}\u{FE0F}",
};

const STATUS_STYLES: Record<string, { color: string; label: string; pulse?: boolean }> = {
  uploaded: { color: "text-[var(--fg3)]", label: "Uploaded" },
  extracting: { color: "text-accent", label: "Extracting", pulse: true },
  synthesizing: { color: "text-accent", label: "Synthesizing", pulse: true },
  staged: { color: "text-warn", label: "Staged" },
  complete: { color: "text-ok", label: "Complete" },
};

const SOURCE_TYPES = ["all", "book", "research", "standard", "expert_doc", "empirical_aggregate", "regulation"];
const AUTHORITIES = ["all", "foundational", "empirical"];

// ── Component ────────────────────────────────────────────

export default function LibraryPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [stagedCount, setStagedCount] = useState(0);
  const [showUpload, setShowUpload] = useState(false);

  // Filters
  const [typeFilter, setTypeFilter] = useState("all");
  const [authorityFilter, setAuthorityFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"date" | "title" | "pages">("date");

  const fetchSources = useCallback(async () => {
    const params = new URLSearchParams();
    if (typeFilter !== "all") params.set("sourceType", typeFilter);
    if (authorityFilter !== "all") params.set("sourceAuthority", authorityFilter);
    const qs = params.toString();
    const [srcRes, stagedRes] = await Promise.all([
      fetch(`/api/admin/library/sources${qs ? `?${qs}` : ""}`),
      fetch("/api/admin/library/staged?limit=1"),
    ]);
    if (srcRes.ok) setSources(await srcRes.json());
    if (stagedRes.ok) {
      const staged = await stagedRes.json();
      setStagedCount(Array.isArray(staged) ? staged.length : 0);
    }
    setLoading(false);
  }, [typeFilter, authorityFilter]);

  useEffect(() => {
    // Auth check
    fetch("/api/auth/me").then(r => r.json()).then(data => {
      if (data.role !== "superadmin") router.push("/map");
    }).catch(() => router.push("/login"));
    fetchSources();
  }, [fetchSources, router]);

  // Polling for processing sources
  useEffect(() => {
    const hasProcessing = sources.some(s => s.status === "extracting" || s.status === "synthesizing");
    if (!hasProcessing) return;
    const interval = setInterval(fetchSources, 10000);
    return () => clearInterval(interval);
  }, [sources, fetchSources]);

  const sorted = [...sources].sort((a, b) => {
    if (sortBy === "title") return a.title.localeCompare(b.title);
    if (sortBy === "pages") return b.pagesProduced - a.pagesProduced;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const totalSections = sources.reduce((n, s) => n + (s.sectionCount ?? 0), 0);
  const totalPages = sources.reduce((n, s) => n + s.pagesProduced, 0);
  const integrityIssues = sources.filter(s => s.integrityStatus && s.integrityStatus !== "healthy").length;

  return (
    <div className="min-h-screen bg-surface">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-[var(--fg1)]">Source Library</h1>
            <p className="text-sm text-[var(--fg3)] mt-1">Reference material for the system intelligence wiki</p>
          </div>
          <div className="flex items-center gap-3">
            {stagedCount > 0 && (
              <button
                onClick={() => router.push("/admin/library/review")}
                className="px-3 py-1.5 rounded-md text-sm font-medium bg-[color-mix(in_srgb,var(--warn)_12%,transparent)] text-warn hover:bg-[color-mix(in_srgb,var(--warn)_18%,transparent)] transition"
              >
                {stagedCount} page{stagedCount !== 1 ? "s" : ""} awaiting review
              </button>
            )}
            <button
              onClick={() => setShowUpload(true)}
              className="px-4 py-1.5 rounded-md text-sm font-medium bg-accent text-white hover:bg-accent/90 transition"
            >
              Upload Source
            </button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: "Sources", value: sources.length },
            { label: "Sections", value: totalSections },
            { label: "Wiki Pages", value: totalPages },
            { label: "Integrity Issues", value: integrityIssues, warn: integrityIssues > 0 },
          ].map(s => (
            <div key={s.label} className="wf-soft p-4">
              <div className={`text-2xl font-semibold ${s.warn ? "text-warn" : "text-[var(--fg1)]"}`}>{s.value}</div>
              <div className="text-xs text-[var(--fg3)]">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="px-3 py-1.5 rounded-md text-sm bg-surface border border-border text-[var(--fg2)]"
          >
            {SOURCE_TYPES.map(t => <option key={t} value={t}>{t === "all" ? "All Types" : t.replace(/_/g, " ")}</option>)}
          </select>
          <select
            value={authorityFilter}
            onChange={e => setAuthorityFilter(e.target.value)}
            className="px-3 py-1.5 rounded-md text-sm bg-surface border border-border text-[var(--fg2)]"
          >
            {AUTHORITIES.map(a => <option key={a} value={a}>{a === "all" ? "All Authority" : a}</option>)}
          </select>
          <div className="flex-1" />
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as "date" | "title" | "pages")}
            className="px-3 py-1.5 rounded-md text-sm bg-surface border border-border text-[var(--fg2)]"
          >
            <option value="date">Newest first</option>
            <option value="title">Title A-Z</option>
            <option value="pages">Most pages</option>
          </select>
        </div>

        {/* Source list */}
        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="wf-soft p-5 h-20 animate-pulse" />)}
          </div>
        ) : sorted.length === 0 ? (
          <div className="wf-soft p-12 text-center">
            <p className="text-[var(--fg3)] mb-4">No sources yet. Upload a book or paste research to get started.</p>
            <button onClick={() => setShowUpload(true)} className="px-4 py-2 rounded-md text-sm font-medium bg-accent text-white">
              Upload Source
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {sorted.map(source => (
              <button
                key={source.id}
                onClick={() => router.push(`/admin/library/${source.id}`)}
                className="wf-soft p-4 w-full text-left flex items-center gap-4 hover:bg-hover transition group"
              >
                <span className="text-xl flex-shrink-0">{SOURCE_TYPE_ICONS[source.sourceType] || "\u{1F4C4}"}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[var(--fg1)] truncate">{source.title}</span>
                    {source.authors && <span className="text-sm text-[var(--fg3)] truncate">by {source.authors}</span>}
                    {source.publicationYear && <span className="text-xs text-[var(--fg4)]">({source.publicationYear})</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {source.domains.map(d => <Badge key={d} variant="default">{d}</Badge>)}
                    <Badge variant="purple">{source.sourceType.replace(/_/g, " ")}</Badge>
                    <Badge variant={source.sourceAuthority === "foundational" ? "blue" : "amber"}>{source.sourceAuthority}</Badge>
                  </div>
                </div>
                <div className="flex items-center gap-6 text-sm text-[var(--fg3)] flex-shrink-0">
                  <div className="text-right">
                    <div>{source.sectionCount ?? 0} sections</div>
                    <div>{source.pagesProduced} pages</div>
                  </div>
                  <div className="w-24 text-right">
                    <span className={`${STATUS_STYLES[source.status]?.color || "text-[var(--fg3)]"} ${STATUS_STYLES[source.status]?.pulse ? "animate-pulse" : ""}`}>
                      {STATUS_STYLES[source.status]?.label || source.status}
                    </span>
                  </div>
                  {source.integrityStatus === "healthy" && <span className="text-ok" title="Healthy">{"\u2713"}</span>}
                  {source.integrityStatus && source.integrityStatus !== "healthy" && <span className="text-warn" title={source.integrityStatus}>{"\u26A0"}</span>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Upload Modal */}
      <UploadModal open={showUpload} onClose={() => setShowUpload(false)} onSuccess={(id) => {
        setShowUpload(false);
        toast("Source uploaded — processing started", "success");
        router.push(`/admin/library/${id}`);
      }} />
    </div>
  );
}

// ── Upload Modal ─────────────────────────────────────────

function UploadModal({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: (id: string) => void }) {
  const [tab, setTab] = useState<"file" | "text">("file");
  const [submitting, setSubmitting] = useState(false);

  // File tab state
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [authors, setAuthors] = useState("");
  const [domain, setDomain] = useState("");
  const [sourceType, setSourceType] = useState("book");
  const [pubYear, setPubYear] = useState("");
  const [isbn, setIsbn] = useState("");
  const [notes, setNotes] = useState("");

  // Text tab state
  const [textTitle, setTextTitle] = useState("");
  const [textAuthors, setTextAuthors] = useState("");
  const [textDomain, setTextDomain] = useState("");
  const [textSourceType, setTextSourceType] = useState("research");
  const [markdown, setMarkdown] = useState("");
  const [textNotes, setTextNotes] = useState("");

  const handleFileSubmit = async () => {
    if (!file || !title) return;
    setSubmitting(true);
    const form = new FormData();
    form.append("file", file);
    form.append("title", title);
    if (authors) form.append("authors", authors);
    if (domain) form.append("domain", domain);
    form.append("sourceType", sourceType);
    if (pubYear) form.append("publicationYear", pubYear);
    if (isbn) form.append("isbn", isbn);
    if (notes) form.append("notes", notes);
    const res = await fetch("/api/admin/library/upload", { method: "POST", body: form });
    setSubmitting(false);
    if (res.ok) {
      const data = await res.json();
      onSuccess(data.sourceId);
    }
  };

  const handleTextSubmit = async () => {
    if (!textTitle || markdown.length < 100) return;
    setSubmitting(true);
    const res = await fetch("/api/admin/library/ingest-text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: textTitle,
        authors: textAuthors || undefined,
        domain: textDomain || undefined,
        sourceType: textSourceType,
        rawMarkdown: markdown,
        notes: textNotes || undefined,
      }),
    });
    setSubmitting(false);
    if (res.ok) {
      const data = await res.json();
      onSuccess(data.sourceId);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Source" wide>
      {/* Tab selector */}
      <div className="flex gap-2 mb-4">
        {(["file", "text"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${tab === t ? "bg-accent-light text-accent" : "text-[var(--fg3)] hover:text-[var(--fg2)]"}`}
          >
            {t === "file" ? "Upload File" : "Paste Text"}
          </button>
        ))}
      </div>

      {tab === "file" ? (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-[var(--fg3)] mb-1">File (PDF, DOCX, TXT, MD)</label>
            <input type="file" accept=".pdf,.docx,.txt,.md" onChange={e => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-[var(--fg2)]" />
          </div>
          <div>
            <label className="block text-xs text-[var(--fg3)] mb-1">Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Financial Shenanigans"
              className="w-full px-3 py-1.5 rounded-md text-sm bg-surface border border-border text-[var(--fg1)]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[var(--fg3)] mb-1">Authors</label>
              <input value={authors} onChange={e => setAuthors(e.target.value)} placeholder="Howard Schilit"
                className="w-full px-3 py-1.5 rounded-md text-sm bg-surface border border-border text-[var(--fg1)]" />
            </div>
            <div>
              <label className="block text-xs text-[var(--fg3)] mb-1">Domain</label>
              <input value={domain} onChange={e => setDomain(e.target.value)} placeholder="DD Financial"
                className="w-full px-3 py-1.5 rounded-md text-sm bg-surface border border-border text-[var(--fg1)]" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-[var(--fg3)] mb-1">Source Type</label>
              <select value={sourceType} onChange={e => setSourceType(e.target.value)}
                className="w-full px-3 py-1.5 rounded-md text-sm bg-surface border border-border text-[var(--fg2)]">
                {["book", "research", "standard", "expert_doc", "regulation"].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--fg3)] mb-1">Year</label>
              <input value={pubYear} onChange={e => setPubYear(e.target.value)} placeholder="2024" type="number"
                className="w-full px-3 py-1.5 rounded-md text-sm bg-surface border border-border text-[var(--fg1)]" />
            </div>
            <div>
              <label className="block text-xs text-[var(--fg3)] mb-1">ISBN</label>
              <input value={isbn} onChange={e => setIsbn(e.target.value)} placeholder="978-..."
                className="w-full px-3 py-1.5 rounded-md text-sm bg-surface border border-border text-[var(--fg1)]" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-[var(--fg3)] mb-1">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Optional notes"
              className="w-full px-3 py-1.5 rounded-md text-sm bg-surface border border-border text-[var(--fg1)] resize-none" />
          </div>
          <button onClick={handleFileSubmit} disabled={!file || !title || submitting}
            className="w-full py-2 rounded-md text-sm font-medium bg-accent text-white disabled:opacity-40 transition">
            {submitting ? "Uploading..." : "Upload & Process"}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-[var(--fg3)] mb-1">Title *</label>
            <input value={textTitle} onChange={e => setTextTitle(e.target.value)}
              className="w-full px-3 py-1.5 rounded-md text-sm bg-surface border border-border text-[var(--fg1)]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[var(--fg3)] mb-1">Authors</label>
              <input value={textAuthors} onChange={e => setTextAuthors(e.target.value)}
                className="w-full px-3 py-1.5 rounded-md text-sm bg-surface border border-border text-[var(--fg1)]" />
            </div>
            <div>
              <label className="block text-xs text-[var(--fg3)] mb-1">Domain</label>
              <input value={textDomain} onChange={e => setTextDomain(e.target.value)}
                className="w-full px-3 py-1.5 rounded-md text-sm bg-surface border border-border text-[var(--fg1)]" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-[var(--fg3)] mb-1">Source Type</label>
            <select value={textSourceType} onChange={e => setTextSourceType(e.target.value)}
              className="w-full px-3 py-1.5 rounded-md text-sm bg-surface border border-border text-[var(--fg2)]">
              {["research", "expert_doc", "standard", "empirical_aggregate"].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--fg3)] mb-1">Content (Markdown, min 100 chars) *</label>
            <textarea value={markdown} onChange={e => setMarkdown(e.target.value)} rows={10}
              className="w-full px-3 py-1.5 rounded-md text-sm bg-surface border border-border text-[var(--fg1)] font-mono resize-y" />
          </div>
          <div>
            <label className="block text-xs text-[var(--fg3)] mb-1">Notes</label>
            <textarea value={textNotes} onChange={e => setTextNotes(e.target.value)} rows={2}
              className="w-full px-3 py-1.5 rounded-md text-sm bg-surface border border-border text-[var(--fg1)] resize-none" />
          </div>
          <button onClick={handleTextSubmit} disabled={!textTitle || markdown.length < 100 || submitting}
            className="w-full py-2 rounded-md text-sm font-medium bg-accent text-white disabled:opacity-40 transition">
            {submitting ? "Processing..." : "Ingest & Process"}
          </button>
        </div>
      )}
    </Modal>
  );
}
