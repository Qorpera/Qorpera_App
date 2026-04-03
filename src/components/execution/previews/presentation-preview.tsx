"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import type { PreviewProps } from "./get-preview-component";
import { isActMode } from "./get-preview-component";
import { escapeHtml } from "./html-helpers";

function SlidesIcon({ size = 14, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect width="18" height="12" x="3" y="4" rx="2" /><path d="M8 20h8" /><path d="M12 16v4" />
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

function formatSlideContent(text: string): string {
  let html = escapeHtml(text);
  html = html.replace(/\n/g, "<br>");
  return html;
}

interface Slide {
  title?: string;
  content?: string;
  bullets?: string[];
}

const MAX_VISIBLE_SLIDES = 10;

export function PresentationPreview({ step, isEditable, onParametersUpdate, locale: _locale, inPanel }: PreviewProps) {
  const t = useTranslations("execution.preview");
  const params = step.parameters ?? {};

  const [editingTitle, setEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState("");
  const [editingSlide, setEditingSlide] = useState<{ index: number; field: "title" | "content" } | null>(null);
  const [slideEditValue, setSlideEditValue] = useState("");
  const [showAll, setShowAll] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const slideInputRef = useRef<HTMLInputElement>(null);
  const slideTextareaRef = useRef<HTMLTextAreaElement>(null);

  const title = (params.title ?? "") as string;
  const slides = (params.slides ?? []) as Slide[];

  const canEdit = isEditable && step.status === "pending";

  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus();
  }, [editingTitle]);

  useEffect(() => {
    if (editingSlide?.field === "title") slideInputRef.current?.focus();
    if (editingSlide?.field === "content") slideTextareaRef.current?.focus();
  }, [editingSlide]);

  function startTitleEdit() {
    if (!canEdit) return;
    setEditingTitle(true);
    setEditTitleValue(title);
  }

  function saveTitleEdit() {
    if (!onParametersUpdate) return;
    onParametersUpdate({ ...params, title: editTitleValue });
    setEditingTitle(false);
  }

  function startSlideEdit(index: number, field: "title" | "content") {
    if (!canEdit) return;
    const slide = slides[index];
    const value = field === "title"
      ? (slide?.title ?? "")
      : (slide?.content ?? slide?.bullets?.join("\n") ?? "");
    setEditingSlide({ index, field });
    setSlideEditValue(value);
  }

  function saveSlideEdit() {
    if (!editingSlide || !onParametersUpdate) return;
    const { index, field } = editingSlide;
    const newSlides = slides.map((s, i) => {
      if (i !== index) return s;
      return { ...s, [field]: slideEditValue };
    });
    onParametersUpdate({ ...params, slides: newSlides });
    setEditingSlide(null);
  }

  const visibleSlides = showAll ? slides : slides.slice(0, MAX_VISIBLE_SLIDES);
  const hiddenCount = slides.length - MAX_VISIBLE_SLIDES;
  const showAiDisclosure = isActMode(step);

  return (
    <div className={inPanel ? "" : "rounded-md overflow-hidden border border-border bg-surface"}>
      {!inPanel && (
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-elevated">
          <SlidesIcon size={14} className="text-accent flex-shrink-0" />
          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)" }}>{t("presentation")}</span>
        </div>
      )}

      <div className="px-4 py-3 space-y-2.5">
        {/* Title */}
        <div className="flex items-baseline gap-2 group">
          <span style={{ fontSize: 11, color: "var(--fg2)", fontWeight: 500, minWidth: 56 }}>{t("documentTitle")}</span>
          {editingTitle ? (
            <input
              ref={titleInputRef}
              value={editTitleValue}
              onChange={e => setEditTitleValue(e.target.value)}
              onBlur={saveTitleEdit}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); saveTitleEdit(); } }}
              className="flex-1 outline-none"
              style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground)", background: "color-mix(in srgb, var(--accent) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 25%, transparent)", borderRadius: 3, padding: "2px 6px" }}
            />
          ) : (
            <span
              className={canEdit ? "cursor-pointer hover:text-[#d0d0d0]" : ""}
              style={{ fontSize: 13, fontWeight: 500, color: "var(--muted)" }}
              onClick={startTitleEdit}
            >
              {title}
              {canEdit && (
                <PencilIcon size={11} className="inline ml-1.5 opacity-0 group-hover:opacity-50 transition-opacity" />
              )}
            </span>
          )}
        </div>

        {/* Divider */}
        <div style={{ borderTop: "1px solid var(--border)", margin: "8px 0" }} />

        {/* Slides */}
        <div className="space-y-2">
          {visibleSlides.map((slide, idx) => {
            const slideContent = slide.content ?? slide.bullets?.join("\n") ?? "";
            return (
              <div
                key={idx}
                className="rounded border border-border"
                style={{ padding: "10px 12px", position: "relative" }}
              >
                {/* Slide number badge */}
                <span
                  style={{
                    position: "absolute",
                    top: 6,
                    left: 8,
                    fontSize: 10,
                    fontWeight: 600,
                    color: "var(--fg2)",
                    background: "color-mix(in srgb, var(--accent) 10%, transparent)",
                    borderRadius: 3,
                    padding: "1px 5px",
                  }}
                >
                  {idx + 1}
                </span>

                <div style={{ marginLeft: 28 }}>
                  {/* Slide title */}
                  <div className="group">
                    {editingSlide?.index === idx && editingSlide?.field === "title" ? (
                      <input
                        ref={slideInputRef}
                        value={slideEditValue}
                        onChange={e => setSlideEditValue(e.target.value)}
                        onBlur={saveSlideEdit}
                        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); saveSlideEdit(); } }}
                        className="w-full outline-none"
                        style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground)", background: "color-mix(in srgb, var(--accent) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 25%, transparent)", borderRadius: 3, padding: "2px 6px" }}
                      />
                    ) : (
                      <span
                        className={canEdit ? "cursor-pointer hover:text-[#d0d0d0]" : ""}
                        style={{ fontSize: 13, fontWeight: 500, color: "var(--muted)" }}
                        onClick={() => startSlideEdit(idx, "title")}
                      >
                        {slide.title || `${t("presentationSlide")} ${idx + 1}`}
                        {canEdit && (
                          <PencilIcon size={11} className="inline ml-1.5 opacity-0 group-hover:opacity-50 transition-opacity" />
                        )}
                      </span>
                    )}
                  </div>

                  {/* Slide content */}
                  {(slideContent || canEdit) && (
                    <div className="group mt-1">
                      {editingSlide?.index === idx && editingSlide?.field === "content" ? (
                        <textarea
                          ref={slideTextareaRef}
                          value={slideEditValue}
                          onChange={e => setSlideEditValue(e.target.value)}
                          onBlur={saveSlideEdit}
                          rows={4}
                          className="w-full outline-none resize-y"
                          style={{ fontSize: 12, lineHeight: 1.55, color: "var(--foreground)", background: "color-mix(in srgb, var(--accent) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 25%, transparent)", borderRadius: 3, padding: "4px 6px", fontFamily: "inherit" }}
                        />
                      ) : (
                        <div
                          className={canEdit ? "cursor-pointer" : ""}
                          style={{ fontSize: 12, lineHeight: 1.55, color: "var(--fg2)" }}
                          onClick={() => startSlideEdit(idx, "content")}
                          dangerouslySetInnerHTML={{ __html: formatSlideContent(slideContent) }}
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Show more / collapse */}
        {hiddenCount > 0 && (
          <button
            onClick={() => setShowAll(!showAll)}
            style={{ fontSize: 12, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            {showAll
              ? t("presentationSlide") + " 1–" + slides.length
              : t("presentationMoreSlides", { count: hiddenCount })}
          </button>
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
