"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import type { PreviewProps } from "./get-preview-component";
import { isActMode } from "./get-preview-component";
import { escapeHtml } from "./html-helpers";

function DocIcon({ size = 14, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" x2="8" y1="13" y2="13" />
      <line x1="16" x2="8" y1="17" y2="17" />
      <line x1="10" x2="8" y1="9" y2="9" />
    </svg>
  );
}

function PencilIcon({ size = 11, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}

function formatDocContent(text: string, panel = false): string {
  let html = escapeHtml(text);

  // Pipe tables — process before line breaks
  html = html.replace(/^(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)+)/gm, (_match, headerRow: string, _sep: string, bodyRows: string) => {
    const headers = headerRow.split("|").filter(Boolean).map((h: string) => h.trim());
    const rows = bodyRows.trim().split("\n").map((r: string) => r.split("|").filter(Boolean).map((c: string) => c.trim()));
    const thStyle = panel
      ? 'padding:8px 10px;text-align:left;font-weight:500;border:0.5px solid var(--border);background:rgba(255,255,255,0.04);color:var(--fg2)'
      : 'padding:6px 8px;text-align:left;font-weight:500;border:1px solid var(--border);background:var(--elevated);font-size:12px';
    const tdStyle = panel
      ? 'padding:8px 10px;border:0.5px solid var(--border)'
      : 'padding:6px 8px;border:1px solid var(--border);font-size:12px';
    const tableStyle = panel ? 'width:100%;border-collapse:collapse;font-size:13px;margin:12px 0' : 'width:100%;border-collapse:collapse;margin:8px 0';
    let table = `<table style="${tableStyle}"><thead><tr>`;
    for (const h of headers) table += `<th style="${thStyle}">${h}</th>`;
    table += '</tr></thead><tbody>';
    for (const row of rows) {
      table += '<tr>';
      for (const cell of row) table += `<td style="${tdStyle}">${cell}</td>`;
      table += '</tr>';
    }
    table += '</tbody></table>';
    return table;
  });

  // Headers
  if (panel) {
    html = html.replace(/^### (.+)$/gm, '<div style="font-size:15px;font-weight:600;margin:12px 0 4px;color:var(--foreground)">$1</div>');
    html = html.replace(/^## (.+)$/gm, '<div style="font-size:17px;font-weight:600;margin:16px 0 6px;color:var(--foreground)">$1</div>');
    html = html.replace(/^# (.+)$/gm, '<div style="font-size:20px;font-weight:600;margin:20px 0 8px;color:var(--foreground)">$1</div>');
  } else {
    html = html.replace(/^### (.+)$/gm, '<div style="font-size:14px;font-weight:600;margin:12px 0 4px;color:var(--foreground)">$1</div>');
    html = html.replace(/^## (.+)$/gm, '<div style="font-size:15px;font-weight:600;margin:14px 0 6px;color:var(--foreground)">$1</div>');
    html = html.replace(/^# (.+)$/gm, '<div style="font-size:16px;font-weight:600;margin:16px 0 8px;color:var(--foreground)">$1</div>');
  }

  // Bold and italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
  html = html.replace(/(?<!\w)\*([^*]+?)\*(?!\w)/g, '<em>$1</em>');

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code style="font-size:13px;background:rgba(255,255,255,0.06);border-radius:4px;padding:2px 6px;font-family:monospace">$1</code>');

  // Checklists: - [ ] and - [x]
  html = html.replace(/^- \[x\] (.+)$/gm,
    '<div style="display:flex;align-items:flex-start;gap:6px;margin:3px 0"><span style="color:var(--ok);font-size:14px;line-height:1.4">\u2611</span><span style="text-decoration:line-through;color:var(--fg3)">$1</span></div>');
  html = html.replace(/^- \[ \] (.+)$/gm,
    '<div style="display:flex;align-items:flex-start;gap:6px;margin:3px 0"><span style="color:var(--fg3);font-size:14px;line-height:1.4">\u2610</span><span style="color:var(--fg2)">$1</span></div>');

  // Bullet lists: - item
  html = html.replace(/^- (.+)$/gm,
    '<div style="display:flex;align-items:flex-start;gap:6px;margin:2px 0;padding-left:4px"><span style="color:var(--fg3)">\u2022</span><span>$1</span></div>');

  // Numbered lists: 1. item
  html = html.replace(/^(\d+)\. (.+)$/gm,
    '<div style="display:flex;align-items:flex-start;gap:6px;margin:2px 0;padding-left:4px"><span style="color:var(--fg3);min-width:16px">$1.</span><span>$2</span></div>');

  // Horizontal rules
  html = html.replace(/^---$/gm, `<hr style="border:none;border-top:0.5px solid var(--border);margin:${panel ? '16px' : '12px'} 0">`);

  // Line breaks (convert remaining newlines)
  html = html.replace(/\n/g, "<br>");

  // Clean up: remove <br> after block elements
  html = html.replace(/<\/div><br>/g, '</div>');
  html = html.replace(/<\/table><br>/g, '</table>');
  html = html.replace(/<hr[^>]*><br>/g, `<hr style="border:none;border-top:0.5px solid var(--border);margin:${panel ? '16px' : '12px'} 0">`);

  return html;
}

export function DocumentPreview({ step, isEditable, onParametersUpdate, locale: _locale, inPanel }: PreviewProps) {
  const t = useTranslations("execution.preview");
  const params = step.parameters ?? {};

  const [editingField, setEditingField] = useState<"title" | "content" | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const title = (params.title ?? params.name ?? "") as string;
  const content = (params.content ?? params.body ?? params.text ?? "") as string;
  const folder = (params.folderId ?? params.parentFolderId ?? "") as string;

  const canEdit = isEditable && (inPanel || step.status === "pending");

  useEffect(() => {
    if (editingField === "title") inputRef.current?.focus();
    if (editingField === "content") textareaRef.current?.focus();
  }, [editingField]);

  function startEdit(field: "title" | "content") {
    if (!canEdit) return;
    setEditingField(field);
    setEditValue(field === "title" ? title : content);
  }

  function saveEdit() {
    if (!editingField || !onParametersUpdate) return;
    onParametersUpdate({ ...params, [editingField]: editValue });
    setEditingField(null);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (editingField === "title" && e.key === "Enter") {
      e.preventDefault();
      saveEdit();
    }
  }

  const showAiDisclosure = isActMode(step);
  const isPending = step.status === "pending";
  const hasContent = !!(title || content);

  if (inPanel && !hasContent) {
    // Fallback: document has not been generated yet — preview what will be created
    return (
      <div style={{ padding: 16 }}>
        <div style={{ border: "0.5px solid var(--border)", borderRadius: 8, overflow: "hidden", background: "var(--surface)" }}>
          <div style={{ padding: "16px 20px", borderBottom: "0.5px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
            <DocIcon size={16} className="text-accent flex-shrink-0" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 600, color: "var(--foreground)", lineHeight: 1.3 }}>
                {step.title}
              </div>
              {isPending && (
                <div style={{ fontSize: 11, color: "var(--fg3)", marginTop: 4 }}>
                  {t("document")} — to be generated
                </div>
              )}
            </div>
          </div>
          {step.description && (
            <div style={{ padding: "16px 20px" }}>
              <div style={{ fontSize: 14, lineHeight: 1.65, color: "var(--fg2)" }}>
                {step.description}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (inPanel) {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ border: "0.5px solid var(--border)", borderRadius: 8, overflow: "hidden", background: "var(--surface)" }}>
          {/* Title */}
          <div style={{ padding: "16px 20px", borderBottom: "0.5px solid var(--border)" }}>
            {editingField === "title" ? (
              <input
                ref={inputRef}
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={saveEdit}
                onKeyDown={handleKeyDown}
                className="w-full outline-none"
                style={{ fontSize: 17, fontWeight: 600, color: "var(--foreground)", background: "color-mix(in srgb, var(--accent) 5%, transparent)", border: "0.5px solid var(--border-strong)", borderRadius: 4, padding: "4px 8px" }}
              />
            ) : (
              <div
                className={canEdit ? "cursor-pointer group" : ""}
                style={{ fontSize: 17, fontWeight: 600, color: "var(--foreground)", lineHeight: 1.3 }}
                onClick={() => startEdit("title")}
              >
                {title}
                {canEdit && <PencilIcon size={11} className="inline ml-2 opacity-0 group-hover:opacity-50 transition-opacity" />}
              </div>
            )}
          </div>

          {/* Content */}
          <div style={{ padding: "16px 20px" }}>
            {editingField === "content" ? (
              <textarea
                ref={textareaRef}
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={saveEdit}
                rows={16}
                className="w-full outline-none resize-y"
                style={{ fontSize: 14, lineHeight: 1.65, color: "var(--foreground)", background: "color-mix(in srgb, var(--accent) 4%, transparent)", border: "0.5px solid var(--border-strong)", borderRadius: 4, padding: "10px 12px", fontFamily: "inherit", minHeight: 200 }}
              />
            ) : (
              <div
                className={canEdit ? "cursor-pointer" : ""}
                style={{ fontSize: 14, lineHeight: 1.65, color: "var(--fg2)" }}
                onClick={() => startEdit("content")}
                dangerouslySetInnerHTML={{ __html: formatDocContent(content, true) }}
              />
            )}
          </div>

          {/* AI Disclosure footer */}
          {showAiDisclosure && (
            <div style={{ padding: "10px 20px", borderTop: "0.5px solid var(--border)" }}>
              <p style={{ fontSize: 11, color: "var(--fg3)", fontStyle: "italic" }}>
                {t("aiDisclosure")}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md overflow-hidden border border-border bg-surface">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-elevated">
        <DocIcon size={14} className="text-accent flex-shrink-0" />
        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)" }}>{t("document")}</span>
      </div>

      <div className="px-4 py-3 space-y-2.5">
        <>
          {/* Standard: labeled fields */}
            <div className="flex items-baseline gap-2 group">
              <span style={{ fontSize: 11, color: "var(--fg2)", fontWeight: 500, minWidth: 56 }}>{t("documentTitle")}</span>
              {editingField === "title" ? (
                <input
                  ref={inputRef}
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onBlur={saveEdit}
                  onKeyDown={handleKeyDown}
                  className="flex-1 outline-none"
                  style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground)", background: "color-mix(in srgb, var(--accent) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 25%, transparent)", borderRadius: 3, padding: "2px 6px" }}
                />
              ) : (
                <span
                  className={canEdit ? "cursor-pointer hover:text-[#d0d0d0]" : ""}
                  style={{ fontSize: 13, fontWeight: 500, color: "var(--muted)" }}
                  onClick={() => startEdit("title")}
                >
                  {title}
                  {canEdit && (
                    <PencilIcon size={11} className="inline ml-1.5 opacity-0 group-hover:opacity-50 transition-opacity" />
                  )}
                </span>
              )}
            </div>

            <div style={{ borderTop: "1px solid var(--border)", margin: "8px 0" }} />

            <div className="group">
              <div className="flex items-center gap-1 mb-1">
                <span style={{ fontSize: 11, color: "var(--fg2)", fontWeight: 500 }}>{t("documentContent")}</span>
                {canEdit && editingField !== "content" && (
                  <PencilIcon size={11} className="opacity-0 group-hover:opacity-50 transition-opacity" />
                )}
              </div>
              {editingField === "content" ? (
                <textarea
                  ref={textareaRef}
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onBlur={saveEdit}
                  rows={12}
                  className="w-full outline-none resize-y"
                  style={{ fontSize: 13, lineHeight: 1.65, color: "var(--foreground)", background: "color-mix(in srgb, var(--accent) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 25%, transparent)", borderRadius: 3, padding: "6px 8px", fontFamily: "inherit" }}
                />
              ) : (
                <div
                  className={canEdit ? "cursor-pointer" : ""}
                  style={{ fontSize: 13, lineHeight: 1.65, color: "var(--muted)" }}
                  onClick={() => startEdit("content")}
                  dangerouslySetInnerHTML={{ __html: formatDocContent(content) }}
                />
              )}
            </div>
        </>

        {/* Folder label */}
        {folder && (
          <div className="flex items-baseline gap-2">
            <span style={{ fontSize: 11, color: "var(--fg2)", fontWeight: 500, minWidth: 56 }}>{t("documentFolder")}</span>
            <span style={{ fontSize: 12, color: "var(--fg2)" }}>{folder}</span>
          </div>
        )}

        {/* AI Disclosure footer */}
        {showAiDisclosure && (
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8, marginTop: 8 }}>
            <p style={{ fontSize: 11, color: "var(--fg2)", fontStyle: "italic" }}>
              {t("aiDisclosure")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
