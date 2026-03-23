"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import type { PreviewProps } from "./get-preview-component";
import { isActMode } from "./get-preview-component";
import { escapeHtml } from "./html-helpers";

function MailIcon({ size = 14, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
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

function linkify(text: string): string {
  return escapeHtml(text).replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer" class="underline text-accent hover:text-accent">$1</a>',
  );
}

export function EmailPreview({ step, isEditable, onParametersUpdate, locale: _locale }: PreviewProps) {
  const t = useTranslations("execution.preview");
  const params = step.parameters ?? {};

  const [editingField, setEditingField] = useState<"subject" | "body" | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const recipient = (params.to ?? params.recipient ?? "") as string;
  const subject = (params.subject ?? "") as string;
  const body = (params.body ?? "") as string;
  const from = (params.from ?? "") as string;

  useEffect(() => {
    if (editingField === "subject") inputRef.current?.focus();
    if (editingField === "body") textareaRef.current?.focus();
  }, [editingField]);

  function startEdit(field: "subject" | "body") {
    if (!isEditable) return;
    setEditingField(field);
    setEditValue(field === "subject" ? subject : body);
  }

  function saveEdit() {
    if (!editingField || !onParametersUpdate) return;
    onParametersUpdate({ ...params, [editingField]: editValue });
    setEditingField(null);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (editingField === "subject" && e.key === "Enter") {
      e.preventDefault();
      saveEdit();
    }
  }

  const showAiDisclosure = isActMode(step);

  return (
    <div className="rounded-md overflow-hidden border border-border bg-surface">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-elevated">
        <MailIcon size={14} className="text-accent flex-shrink-0" />
        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)" }}>Email</span>
      </div>

      <div className="px-4 py-3 space-y-2.5">
        {/* From */}
        {from && (
          <div className="flex items-baseline gap-2">
            <span style={{ fontSize: 11, color: "var(--fg2)", fontWeight: 500, minWidth: 56 }}>{t("from")}</span>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>{from}</span>
          </div>
        )}

        {/* To */}
        <div className="flex items-baseline gap-2">
          <span style={{ fontSize: 11, color: "var(--fg2)", fontWeight: 500, minWidth: 56 }}>{t("to")}</span>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>{recipient}</span>
        </div>

        {/* Subject */}
        <div className="flex items-baseline gap-2 group">
          <span style={{ fontSize: 11, color: "var(--fg2)", fontWeight: 500, minWidth: 56 }}>{t("subject")}</span>
          {editingField === "subject" ? (
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
              className={isEditable ? "cursor-pointer hover:text-[#d0d0d0]" : ""}
              style={{ fontSize: 13, fontWeight: 500, color: "var(--muted)" }}
              onClick={() => startEdit("subject")}
            >
              {subject}
              {isEditable && (
                <PencilIcon size={11} className="inline ml-1.5 opacity-0 group-hover:opacity-50 transition-opacity" />
              )}
            </span>
          )}
        </div>

        {/* Divider */}
        <div style={{ borderTop: "1px solid var(--border)", margin: "8px 0" }} />

        {/* Body */}
        <div className="group">
          <div className="flex items-center gap-1 mb-1">
            <span style={{ fontSize: 11, color: "var(--fg2)", fontWeight: 500 }}>{t("body")}</span>
            {isEditable && editingField !== "body" && (
              <PencilIcon size={11} className="opacity-0 group-hover:opacity-50 transition-opacity" />
            )}
          </div>
          {editingField === "body" ? (
            <textarea
              ref={textareaRef}
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onBlur={saveEdit}
              rows={6}
              className="w-full outline-none resize-y"
              style={{ fontSize: 13, lineHeight: 1.65, color: "var(--foreground)", background: "color-mix(in srgb, var(--accent) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 25%, transparent)", borderRadius: 3, padding: "6px 8px", fontFamily: "inherit" }}
            />
          ) : (
            <div
              className={isEditable ? "cursor-pointer" : ""}
              style={{ fontSize: 13, lineHeight: 1.65, color: "var(--muted)" }}
              onClick={() => startEdit("body")}
              dangerouslySetInnerHTML={{ __html: linkify(body).replace(/\n/g, "<br>") }}
            />
          )}
        </div>

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
