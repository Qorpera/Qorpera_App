"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { DOCUMENT_SLOT_TYPES, type SlotType } from "@/lib/document-slots";
import type { Department, InternalDoc, DocsData, ExtractionDiff } from "./types";

const SLOT_ICONS: Record<string, string> = {
  network: "M12 3v3m0 12v3m-6-9H3m18 0h-3m-2.25-5.25L17.25 5.25m-10.5 0L8.25 6.75m0 10.5l-1.5 1.5m10.5-1.5l1.5 1.5M12 9a3 3 0 100 6 3 3 0 000-6z",
  "clipboard-list": "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01",
};

const FILE_ACCEPT = ".txt,.csv,.pdf,.docx,.md,.xlsx,.xls,text/plain,text/csv,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel";

interface StepDocumentsProps {
  departments: Department[];
  onContinue: () => void;
  onBack: () => void;
}

export function StepDocuments({ departments, onContinue, onBack }: StepDocumentsProps) {
  const t = useTranslations("onboarding.documents");
  const tc = useTranslations("common");
  const realDepts = departments.filter(d => d.entityType?.slug === "department");
  const [docsPerDept, setDocsPerDept] = useState<Record<string, DocsData>>({});
  const [expandedDocDept, setExpandedDocDept] = useState<string | null>(null);
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const [uploadingContext, setUploadingContext] = useState(false);
  const [docError, setDocError] = useState("");
  const [extractingDoc, setExtractingDoc] = useState<string | null>(null);
  const [diffModal, setDiffModal] = useState<{
    deptId: string;
    docId: string;
    slotType: string;
    diff: ExtractionDiff;
  } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const slotFileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const contextFileInputRef = useRef<HTMLInputElement | null>(null);

  const loadDocs = useCallback(async (deptId: string) => {
    const res = await fetch(`/api/departments/${deptId}/documents`);
    if (res.ok) {
      const data: DocsData = await res.json();
      setDocsPerDept(prev => ({ ...prev, [deptId]: data }));
    }
  }, []);

  useEffect(() => {
    realDepts.forEach(d => loadDocs(d.id));
    if (realDepts.length > 0 && !expandedDocDept) {
      setExpandedDocDept(realDepts[0].id);
    }
    const poll = setInterval(() => {
      realDepts.forEach(d => loadDocs(d.id));
    }, 5000);
    return () => clearInterval(poll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function uploadFile(deptId: string, file: File, documentType: string) {
    const isSlot = documentType !== "context";
    if (isSlot) setUploadingSlot(documentType);
    else setUploadingContext(true);
    setDocError("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("documentType", documentType);

      let res: Response;
      try {
        res = await fetch(`/api/departments/${deptId}/documents/upload`, {
          method: "POST",
          body: formData,
        });
      } catch (fetchErr) {
        const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        setDocError(`Upload failed: ${msg}`);
        return;
      }

      if (!res.ok) {
        let errorMsg = `Upload failed (${res.status})`;
        try {
          const err = await res.json();
          errorMsg = err?.error || errorMsg;
        } catch {
          try { errorMsg = await res.text() || errorMsg; } catch { /* fallback */ }
        }
        setDocError(errorMsg);
        return;
      }

      const doc = await res.json();
      await loadDocs(deptId);

      if (isSlot) {
        setExtractingDoc(doc.id);
        try {
          const extRes = await fetch(`/api/departments/${deptId}/documents/${doc.id}/extract`, {
            method: "POST",
          });
          if (extRes.ok) {
            const extData = await extRes.json();
            if (extData.diff) {
              setDiffModal({ deptId, docId: doc.id, slotType: documentType, diff: extData.diff });
            }
          }
          await loadDocs(deptId);
        } finally {
          setExtractingDoc(null);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setDocError(`Upload error: ${msg}`);
    } finally {
      if (isSlot) setUploadingSlot(null);
      else setUploadingContext(false);
    }
  }

  async function handleDeleteDoc(deptId: string, docId: string) {
    try {
      const res = await fetch(`/api/departments/${deptId}/documents/${docId}`, { method: "DELETE" });
      if (res.ok) await loadDocs(deptId);
    } catch {
      setDocError("Failed to delete document");
    }
  }

  async function handleRetryDoc(deptId: string, docId: string) {
    try {
      await fetch(`/api/departments/${deptId}/documents/${docId}/reprocess`, { method: "POST" });
      await loadDocs(deptId);
    } catch {
      setDocError("Failed to retry processing");
    }
  }

  async function handleSlotFileChange(e: React.ChangeEvent<HTMLInputElement>, deptId: string, slotType: string) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    e.target.value = "";
    for (let i = 0; i < files.length; i++) {
      await uploadFile(deptId, files[i], slotType);
      if (i < files.length - 1) await new Promise(r => setTimeout(r, 200));
    }
  }

  async function handleContextFileChange(e: React.ChangeEvent<HTMLInputElement>, deptId: string) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    e.target.value = "";
    for (let i = 0; i < files.length; i++) {
      await uploadFile(deptId, files[i], "context");
      if (i < files.length - 1) await new Promise(r => setTimeout(r, 200));
    }
  }

  async function handleConfirmDiff() {
    if (!diffModal) return;
    setConfirming(true);
    try {
      await fetch(`/api/departments/${diffModal.deptId}/documents/${diffModal.docId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diff: diffModal.diff }),
      });
      await loadDocs(diffModal.deptId);
      setDiffModal(null);
    } finally {
      setConfirming(false);
    }
  }

  const allDocs = Object.values(docsPerDept).flatMap(d => {
    if (!d) return [];
    return [...Object.values(d.slots).flat(), ...d.contextDocs];
  });
  const totalDocs = allDocs.length;
  const processingDocs = allDocs.filter(d => d.embeddingStatus === "processing" || d.embeddingStatus === "pending");
  const errorDocs = allDocs.filter(d => d.embeddingStatus === "error");
  const completeDocs = allDocs.filter(d => d.embeddingStatus === "complete");

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <p className="text-xs text-white/30 uppercase tracking-wider">Step 4 of 6</p>
        <h1 className="text-2xl font-semibold text-white/90">{t("title")}</h1>
        <p className="text-sm text-white/45">
          Drop in documents to help the AI understand how each department works. <span className="text-white/30">(optional)</span>
        </p>
      </div>

      {totalDocs > 0 && (
        <div className={`rounded-lg px-4 py-2.5 text-xs flex items-center gap-2 ${
          errorDocs.length > 0
            ? "bg-red-500/10 border border-red-500/15 text-red-400"
            : processingDocs.length > 0
              ? "bg-amber-500/10 border border-amber-500/15 text-amber-400"
              : "bg-emerald-500/10 border border-emerald-500/15 text-emerald-400"
        }`}>
          {errorDocs.length > 0 ? (
            <>
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
              </svg>
              <span>Error processing: {errorDocs.map(d => d.fileName).join(", ")}</span>
            </>
          ) : processingDocs.length > 0 ? (
            <>
              <div className="w-3 h-3 rounded-full border-2 border-amber-400/40 border-t-amber-400 animate-spin shrink-0" />
              <span>Processing {processingDocs.length} {processingDocs.length === 1 ? "document" : "documents"}...</span>
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span>All {completeDocs.length} {completeDocs.length === 1 ? "document" : "documents"} processed successfully</span>
            </>
          )}
        </div>
      )}

      {docError && (
        <div className="rounded-lg px-4 py-2.5 text-xs bg-red-500/10 border border-red-500/15 text-red-400 flex items-center gap-2">
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
          </svg>
          <span className="flex-1">{docError}</span>
          <button onClick={() => setDocError("")} className="text-red-400/60 hover:text-red-400 ml-2">&times;</button>
        </div>
      )}

      <div className="space-y-4">
        {realDepts.map(dept => {
          const docs = docsPerDept[dept.id];
          const isExpanded = expandedDocDept === dept.id;

          return (
            <div key={dept.id} className="wf-soft overflow-hidden">
              <button
                onClick={() => setExpandedDocDept(isExpanded ? null : dept.id)}
                className="w-full flex items-center justify-between px-5 py-4 text-left"
              >
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-white/90">{dept.displayName}</h3>
                  {dept.description && (
                    <p className="text-xs text-white/40 mt-0.5">{dept.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 ml-3">
                  {docs && (
                    <span className="text-xs text-white/30">
                      {Object.values(docs.slots).flat().length + docs.contextDocs.length} docs
                    </span>
                  )}
                  <ChevronDown open={isExpanded} />
                </div>
              </button>

              {isExpanded && (
                <div className="px-5 pb-5 space-y-4 border-t border-white/[0.06] pt-3">
                  {/* Structural slots */}
                  <div className="grid grid-cols-2 gap-2">
                    {(Object.keys(DOCUMENT_SLOT_TYPES) as SlotType[]).map(slotType => {
                      const slotDef = DOCUMENT_SLOT_TYPES[slotType];
                      const slotDocs = docs?.slots[slotType] ?? [];
                      const isUploading = uploadingSlot === slotType;

                      return (
                        <div
                          key={slotType}
                          className={`relative rounded-lg border p-3 ${
                            slotDocs.length > 0 ? "border-white/[0.1] bg-white/[0.02]" : "border-dashed border-white/[0.08]"
                          } transition`}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <svg className={`w-3.5 h-3.5 ${slotDocs.length > 0 ? "text-purple-400" : "text-white/20"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d={SLOT_ICONS[slotDef.icon] || ""} />
                            </svg>
                            <span className="text-xs font-medium text-white/70">{slotDef.label}</span>
                            {slotDocs.length > 0 && (
                              <span className="text-[10px] text-white/30 ml-auto">{slotDocs.length} file{slotDocs.length !== 1 ? "s" : ""}</span>
                            )}
                          </div>

                          {slotDocs.length > 0 ? (
                            <div className="space-y-1.5">
                              {slotDocs.map(doc => {
                                const isExtracting = extractingDoc === doc.id;
                                const needsReview = doc.status === "extracted";
                                return (
                                  <div key={doc.id} className="space-y-1">
                                    <p className="text-[10px] text-white/40 truncate">{doc.fileName}</p>
                                    <div className="flex items-center gap-2">
                                      <EmbeddingBadge status={doc.embeddingStatus} />
                                      {isExtracting && (
                                        <span className="text-[10px] text-amber-400/70">Extracting...</span>
                                      )}
                                      {needsReview && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            fetch(`/api/departments/${dept.id}/documents/${doc.id}/extract`, { method: "POST" })
                                              .then(r => r.json())
                                              .then(data => {
                                                if (data.diff) {
                                                  setDiffModal({ deptId: dept.id, docId: doc.id, slotType, diff: data.diff });
                                                }
                                              });
                                          }}
                                          className="text-[10px] text-amber-400 hover:text-amber-300 font-medium"
                                        >
                                          Review Changes
                                        </button>
                                      )}
                                      {(doc.embeddingStatus === "error" || doc.embeddingStatus === "pending" || doc.embeddingStatus === "processing") && (
                                        <button
                                          onClick={(e) => { e.stopPropagation(); handleRetryDoc(dept.id, doc.id); }}
                                          className="text-[10px] text-purple-400 hover:text-purple-300 font-medium"
                                        >
                                          {t("retry")}
                                        </button>
                                      )}
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handleDeleteDoc(dept.id, doc.id); }}
                                        className="text-[10px] text-red-400/60 hover:text-red-400 font-medium"
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                              <input
                                ref={el => { slotFileInputRefs.current[`${dept.id}-${slotType}`] = el; }}
                                type="file"
                                multiple
                                accept={FILE_ACCEPT}
                                className="hidden"
                                onChange={e => handleSlotFileChange(e, dept.id, slotType)}
                              />
                              <button
                                onClick={(e) => { e.stopPropagation(); slotFileInputRefs.current[`${dept.id}-${slotType}`]?.click(); }}
                                className="text-[10px] text-purple-400 hover:text-purple-300 font-medium mt-1"
                              >
                                {isUploading ? "Uploading..." : "+ Add more"}
                              </button>
                            </div>
                          ) : (
                            <div
                              className="cursor-pointer hover:border-white/15 hover:bg-white/[0.02] transition rounded p-1"
                              onClick={() => {
                                if (!isUploading) slotFileInputRefs.current[`${dept.id}-${slotType}`]?.click();
                              }}
                            >
                              <input
                                ref={el => { slotFileInputRefs.current[`${dept.id}-${slotType}`] = el; }}
                                type="file"
                                multiple
                                accept={FILE_ACCEPT}
                                className="hidden"
                                onChange={e => handleSlotFileChange(e, dept.id, slotType)}
                              />
                              <span className="text-[10px] text-white/30">
                                {isUploading ? "Uploading..." : "Click to upload"}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Context docs */}
                  <div className="space-y-2">
                    <div className="text-xs text-white/30">Context Documents</div>
                    {docs?.contextDocs && docs.contextDocs.length > 0 && (
                      <div className="space-y-1">
                        {docs.contextDocs.map(cdoc => (
                          <div key={cdoc.id} className="flex items-center gap-2 text-sm">
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0" />
                            <span className="text-white/60 text-xs truncate flex-1">{cdoc.fileName}</span>
                            <EmbeddingBadge status={cdoc.embeddingStatus} />
                            {(cdoc.embeddingStatus === "error" || cdoc.embeddingStatus === "pending" || cdoc.embeddingStatus === "processing") && (
                              <button
                                onClick={() => handleRetryDoc(dept.id, cdoc.id)}
                                className="text-[10px] text-purple-400 hover:text-purple-300 font-medium shrink-0"
                              >
                                {t("retry")}
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteDoc(dept.id, cdoc.id)}
                              className="text-[10px] text-red-400/60 hover:text-red-400 font-medium shrink-0"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <input
                      ref={contextFileInputRef}
                      type="file"
                      accept={FILE_ACCEPT}
                      multiple
                      className="hidden"
                      onChange={e => handleContextFileChange(e, dept.id)}
                    />
                    <button
                      onClick={() => contextFileInputRef.current?.click()}
                      disabled={uploadingContext}
                      className="w-full py-2 rounded-lg border border-dashed border-white/[0.08] text-xs text-white/30 hover:text-white/50 hover:border-white/15 transition"
                    >
                      {uploadingContext ? "Uploading..." : "+ Add context documents (guides, playbooks, policies)"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-2">
        <button
          onClick={onBack}
          className="text-sm text-white/40 hover:text-white/60 transition"
        >
          &larr; {tc("back")}
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={onContinue}
            className="text-sm text-white/40 hover:text-white/60 transition"
          >
            {t("skipForNow")}
          </button>
          <Button variant="primary" size="md" onClick={onContinue}>
            {tc("continue")}
          </Button>
        </div>
      </div>

      {/* Extraction Diff Modal */}
      <Modal
        open={!!diffModal}
        onClose={() => setDiffModal(null)}
        title={diffModal ? `Review: ${DOCUMENT_SLOT_TYPES[diffModal.slotType as SlotType]?.label ?? diffModal.slotType} Changes` : "Review Changes"}
        wide
      >
        {diffModal && (
          <div className="space-y-4">
            <p className="text-sm text-white/60">{diffModal.diff.summary}</p>

            {diffModal.diff.people && diffModal.diff.people.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs text-white/30 uppercase tracking-wider">People</div>
                {diffModal.diff.people.map((p, i) => (
                  <label key={i} className="flex items-start gap-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={p.selected}
                      onChange={() => {
                        const updated = { ...diffModal.diff };
                        if (updated.people) {
                          updated.people = [...updated.people];
                          updated.people[i] = { ...updated.people[i], selected: !updated.people[i].selected };
                        }
                        setDiffModal({ ...diffModal, diff: updated });
                      }}
                      className="mt-0.5 accent-purple-500"
                    />
                    <div>
                      <span className={`text-sm ${
                        p.action === "create" ? "text-emerald-400" : p.action === "update" ? "text-amber-400" : "text-white/40"
                      }`}>
                        {p.action === "create" ? "+" : p.action === "update" ? "~" : "?"} {p.name}
                      </span>
                      {p.role && <span className="text-xs text-white/30 ml-2">{p.role}</span>}
                      {p.changes && Object.entries(p.changes).map(([key, val]) => (
                        <div key={key} className="text-[10px] text-white/25 ml-4">
                          {key}: {val.from} &rarr; {val.to}
                        </div>
                      ))}
                    </div>
                  </label>
                ))}
              </div>
            )}

            {diffModal.diff.properties && diffModal.diff.properties.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs text-white/30 uppercase tracking-wider">Properties</div>
                {diffModal.diff.properties.map((p, i) => (
                  <label key={i} className="flex items-start gap-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={p.selected}
                      onChange={() => {
                        const updated = { ...diffModal.diff };
                        if (updated.properties) {
                          updated.properties = [...updated.properties];
                          updated.properties[i] = { ...updated.properties[i], selected: !updated.properties[i].selected };
                        }
                        setDiffModal({ ...diffModal, diff: updated });
                      }}
                      className="mt-0.5 accent-purple-500"
                    />
                    <div>
                      <span className="text-sm text-white/80">{p.label}</span>
                      <span className="text-xs text-white/30 ml-2">on {p.targetEntityName}</span>
                      {p.oldValue && (
                        <div className="text-[10px] text-white/25 ml-4">
                          {p.oldValue} &rarr; {p.newValue}
                        </div>
                      )}
                      {!p.oldValue && (
                        <div className="text-[10px] text-emerald-400/60 ml-4">= {p.newValue}</div>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="default" size="sm" onClick={() => setDiffModal(null)}>
                Skip
              </Button>
              <Button variant="primary" size="sm" onClick={handleConfirmDiff} disabled={confirming}>
                {confirming ? "Applying..." : "Apply Selected Changes"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function ChevronDown({ open }: { open: boolean }) {
  return (
    <svg className={`w-4 h-4 text-white/30 transition ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function EmbeddingBadge({ status }: { status: string }) {
  const t = useTranslations("onboarding.documents");
  if (status === "complete" || status === "embedded") {
    return <span className="text-[10px] text-emerald-400/60">{t("embedded")}</span>;
  }
  if (status === "processing" || status === "pending") {
    return <span className="text-[10px] text-amber-400/60">{t("processing")}</span>;
  }
  if (status === "error") {
    return <span className="text-[10px] text-red-400/60">{t("error")}</span>;
  }
  return null;
}
