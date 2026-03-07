"use client";

import { AppShell } from "@/components/app-shell";
import { useState, useEffect, useCallback, useRef } from "react";

// ── Types ───────────────────────────────────────────────────────────────────

type Doc = {
  id: string;
  fileName: string;
  mimeType: string;
  status: string;
  businessContext: string | null;
  createdAt: string;
};

type ExtractedEntity = {
  type: string;
  displayName: string;
  properties?: Record<string, string>;
  removed?: boolean;
  editingName?: string;
};

type ExtractedRelationship = {
  fromName: string;
  toName: string;
  type: string;
};

type Preview = {
  entities: ExtractedEntity[];
  relationships: ExtractedRelationship[];
  businessContext: string;
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function mimeIcon(mime: string) {
  if (mime === "application/pdf") return "PDF";
  if (mime.includes("wordprocessingml")) return "DOCX";
  if (mime === "text/csv") return "CSV";
  if (mime === "text/plain") return "TXT";
  if (mime.startsWith("image/")) return "IMG";
  return "FILE";
}

const STATUS_COLORS: Record<string, string> = {
  uploaded: "bg-white/10 text-white/50",
  processing: "bg-amber-500/20 text-amber-400",
  extracted: "bg-purple-500/20 text-purple-400",
  confirmed: "bg-emerald-500/20 text-emerald-400",
};

// ── Component ────────────────────────────────────────────────────────────────

export default function DocumentsPage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [confirmSummary, setConfirmSummary] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load documents
  const loadDocs = useCallback(async () => {
    const res = await fetch("/api/documents");
    if (res.ok) setDocs(await res.json());
  }, []);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  // Upload handler
  const handleUpload = useCallback(async (files: FileList | File[]) => {
    setUploading(true);
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/documents/upload", { method: "POST", body: form });
      if (res.ok) {
        const doc = await res.json();
        // Auto-trigger extraction
        setProcessing((prev) => new Set(prev).add(doc.id));
        fetch(`/api/documents/${doc.id}/extract`, { method: "POST" })
          .then(async (res) => {
            setProcessing((prev) => { const next = new Set(prev); next.delete(doc.id); return next; });
            if (!res.ok) {
              const err = await res.json().catch(() => ({ error: "Extraction failed" }));
              console.error(`[documents] Extraction failed for ${doc.id}:`, err.error);
            }
            await loadDocs();
          })
          .catch((err) => {
            setProcessing((prev) => { const next = new Set(prev); next.delete(doc.id); return next; });
            console.error(`[documents] Extraction request failed for ${doc.id}:`, err);
            loadDocs();
          });
      }
    }
    await loadDocs();
    setUploading(false);
  }, [loadDocs]);

  // Expand & load preview
  const handleExpand = useCallback(async (docId: string) => {
    if (expandedId === docId) {
      setExpandedId(null);
      setPreview(null);
      setConfirmSummary(null);
      return;
    }
    setExpandedId(docId);
    setPreview(null);
    setConfirmSummary(null);
    const doc = docs.find((d) => d.id === docId);
    if (doc && (doc.status === "extracted" || doc.status === "confirmed")) {
      const res = await fetch(`/api/documents/${docId}/preview`);
      if (res.ok) setPreview(await res.json());
    }
  }, [expandedId, docs]);

  // Re-extract
  const handleReExtract = useCallback(async (docId: string) => {
    setProcessing((prev) => new Set(prev).add(docId));
    setPreview(null);
    await fetch(`/api/documents/${docId}/extract`, { method: "POST" });
    setProcessing((prev) => { const next = new Set(prev); next.delete(docId); return next; });
    await loadDocs();
    const res = await fetch(`/api/documents/${docId}/preview`);
    if (res.ok) setPreview(await res.json());
  }, [loadDocs]);

  // Confirm
  const handleConfirm = useCallback(async (docId: string) => {
    if (!preview) return;
    setConfirming(true);
    const activeEntities = preview.entities.filter((e) => !e.removed);
    const activeNames = new Set(activeEntities.map((e) => e.displayName));
    const activeRels = preview.relationships.filter(
      (r) => activeNames.has(r.fromName) && activeNames.has(r.toName),
    );

    const res = await fetch(`/api/documents/${docId}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entities: activeEntities, relationships: activeRels }),
    });

    if (res.ok) {
      const result = await res.json();
      setConfirmSummary(`Created ${result.entitiesCreated} entities and ${result.relationshipsCreated} relationships.`);
      await loadDocs();
    }
    setConfirming(false);
  }, [preview, loadDocs]);

  // Delete
  const handleDelete = useCallback(async (docId: string) => {
    await fetch("/api/documents", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: docId }),
    });
    if (expandedId === docId) { setExpandedId(null); setPreview(null); }
    await loadDocs();
  }, [expandedId, loadDocs]);

  // Inline entity name editing
  const updateEntityName = (idx: number, newName: string) => {
    if (!preview) return;
    const updated = [...preview.entities];
    updated[idx] = { ...updated[idx], displayName: newName };
    setPreview({ ...preview, entities: updated });
  };

  const toggleEntityRemoved = (idx: number) => {
    if (!preview) return;
    const updated = [...preview.entities];
    updated[idx] = { ...updated[idx], removed: !updated[idx].removed };
    setPreview({ ...preview, entities: updated });
  };

  return (
    <AppShell>
      <div className="p-8 max-w-6xl mx-auto space-y-6">
        <h1 className="text-2xl font-semibold text-white/90">Documents</h1>

        {/* Upload drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files.length > 0) handleUpload(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 cursor-pointer transition ${
            dragging
              ? "border-purple-500/50 bg-purple-500/5"
              : "border-white/10 hover:border-white/20 bg-white/[0.02]"
          }`}
        >
          <svg className="w-10 h-10 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          <p className="text-sm text-white/50">
            {uploading ? "Uploading..." : "Drop PDF, DOCX, TXT, CSV, or images here, or click to browse"}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt,.csv,.png,.jpg,.jpeg,.webp"
            multiple
            onChange={(e) => { if (e.target.files?.length) handleUpload(e.target.files); }}
            className="hidden"
          />
        </div>

        {/* Document list */}
        {docs.length === 0 && !uploading && (
          <p className="text-sm text-white/30 text-center py-8">No documents uploaded yet.</p>
        )}

        <div className="space-y-2">
          {docs.map((doc) => {
            const isExpanded = expandedId === doc.id;
            const isProcessing = processing.has(doc.id) || doc.status === "processing";
            const docStatus = isProcessing ? "processing" : doc.status;

            return (
              <div key={doc.id} className="wf-soft rounded-xl overflow-hidden">
                {/* Row */}
                <button
                  onClick={() => handleExpand(doc.id)}
                  className="w-full flex items-center gap-4 px-5 py-3 text-left hover:bg-white/[0.02] transition"
                >
                  <span className="text-xs font-mono text-white/30 w-10 text-center flex-shrink-0">
                    {mimeIcon(doc.mimeType)}
                  </span>
                  <span className="text-sm text-white/80 flex-1 truncate">{doc.fileName}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_COLORS[docStatus] ?? STATUS_COLORS.uploaded}`}>
                    {docStatus}
                  </span>
                  <span className="text-[10px] text-white/20">{new Date(doc.createdAt).toLocaleDateString()}</span>
                  <svg className={`w-4 h-4 text-white/20 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-white/[0.06] px-5 py-4 space-y-4">
                    {isProcessing && (
                      <div className="flex items-center gap-2 text-amber-400 text-sm">
                        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="60" strokeDashoffset="20" />
                        </svg>
                        Extracting entities...
                      </div>
                    )}

                    {doc.status === "confirmed" && (
                      <div className="text-sm text-emerald-400/80">
                        {confirmSummary || "Entities confirmed and added to the knowledge graph."}
                      </div>
                    )}

                    {preview && doc.status === "extracted" && (
                      <>
                        {/* Entities */}
                        <div>
                          <h3 className="text-xs font-medium text-white/50 mb-2">
                            Entities ({preview.entities.filter((e) => !e.removed).length})
                          </h3>
                          <div className="space-y-1">
                            {preview.entities.map((ent, i) => (
                              <div
                                key={i}
                                className={`flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.02] ${ent.removed ? "opacity-30 line-through" : ""}`}
                              >
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 flex-shrink-0">
                                  {ent.type}
                                </span>
                                <EntityNameCell
                                  name={ent.displayName}
                                  onChange={(name) => updateEntityName(i, name)}
                                />
                                <span className="text-[10px] text-white/20 truncate flex-1">
                                  {ent.properties ? Object.entries(ent.properties).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(", ") : ""}
                                </span>
                                <button
                                  onClick={(e) => { e.stopPropagation(); toggleEntityRemoved(i); }}
                                  className="text-white/20 hover:text-red-400 transition-colors text-xs"
                                  title={ent.removed ? "Restore" : "Remove"}
                                >
                                  {ent.removed ? "+" : "\u00d7"}
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Relationships */}
                        {preview.relationships.length > 0 && (
                          <div>
                            <h3 className="text-xs font-medium text-white/50 mb-2">
                              Relationships ({preview.relationships.length})
                            </h3>
                            <div className="space-y-1">
                              {preview.relationships.map((rel, i) => (
                                <div key={i} className="text-xs text-white/40 px-3 py-1.5">
                                  {rel.fromName} <span className="text-white/20">→</span>{" "}
                                  <span className="text-purple-400/60">{rel.type}</span>{" "}
                                  <span className="text-white/20">→</span> {rel.toName}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Business context */}
                        {preview.businessContext && (
                          <div>
                            <h3 className="text-xs font-medium text-white/50 mb-1">Business Context</h3>
                            <p className="text-xs text-white/30 leading-relaxed">{preview.businessContext}</p>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-2 pt-2">
                          <button
                            onClick={() => handleConfirm(doc.id)}
                            disabled={confirming}
                            className="px-4 py-1.5 rounded-lg bg-purple-600 text-white text-xs font-medium hover:bg-purple-500 transition disabled:opacity-50"
                          >
                            {confirming ? "Confirming..." : "Confirm"}
                          </button>
                          <button
                            onClick={() => handleReExtract(doc.id)}
                            className="px-4 py-1.5 rounded-lg bg-white/[0.06] text-white/50 text-xs hover:bg-white/[0.1] transition"
                          >
                            Re-extract
                          </button>
                          <button
                            onClick={() => handleDelete(doc.id)}
                            className="px-4 py-1.5 rounded-lg text-red-400/60 text-xs hover:text-red-400 hover:bg-red-500/10 transition ml-auto"
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    )}

                    {!isProcessing && doc.status === "uploaded" && (
                      <div className="space-y-2">
                        <div className="text-xs text-white/30">Upload complete. Extraction will begin automatically.</div>
                        <button
                          onClick={() => handleReExtract(doc.id)}
                          className="px-4 py-1.5 rounded-lg bg-white/[0.06] text-white/50 text-xs hover:bg-white/[0.1] transition"
                        >
                          Retry extraction
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}

// ── Inline Name Editor ───────────────────────────────────────────────────────

function EntityNameCell({ name, onChange }: { name: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);

  useEffect(() => { setValue(name); }, [name]);

  if (!editing) {
    return (
      <span
        onClick={(e) => { e.stopPropagation(); setEditing(true); }}
        className="text-sm text-white/80 cursor-text hover:underline decoration-white/20 flex-shrink-0 min-w-[120px]"
      >
        {name}
      </span>
    );
  }

  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => { onChange(value); setEditing(false); }}
      onKeyDown={(e) => { if (e.key === "Enter") { onChange(value); setEditing(false); } }}
      onClick={(e) => e.stopPropagation()}
      className="text-sm text-white/90 bg-white/[0.06] border border-white/10 rounded px-2 py-0.5 outline-none focus:border-purple-500/50 flex-shrink-0 min-w-[120px]"
    />
  );
}
