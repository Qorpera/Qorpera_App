"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";

// ── Icons ───────────────────────────────────────────────────────────────────

function CloseIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" /><path d="m6 6 12 12" />
    </svg>
  );
}

function ChevronRightIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface BreadcrumbEntry {
  label: string;
  icon: ReactNode;
  onClick: () => void;
}

interface SidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  typeBadge: string;
  typeIcon: ReactNode;
  breadcrumbs?: BreadcrumbEntry[];
  children: ReactNode;
  footer?: ReactNode;
  isEditing?: boolean;
  onToggleEdit?: () => void;
  onWidthChange?: (percent: number) => void;
  onApprove?: () => void;
  onDiscuss?: () => void;
}

// ── Component ───────────────────────────────────────────────────────────────

export function SidePanel({
  isOpen,
  onClose,
  title,
  typeBadge,
  typeIcon,
  breadcrumbs,
  children,
  footer,
  isEditing,
  onToggleEdit,
  onWidthChange,
  onApprove,
  onDiscuss,
}: SidePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  // ── Close on Escape key ──────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // ── Resize drag ──────────────────────────────────────────────────────────

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function onMouseMove(ev: MouseEvent) {
      if (!isDragging.current) return;
      const vw = window.innerWidth;
      const pct = ((vw - ev.clientX) / vw) * 100;
      const clamped = Math.max(35, Math.min(70, pct));
      onWidthChange?.(Math.round(clamped));
    }

    function onMouseUp() {
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [onWidthChange]);

  if (!isOpen) return null;

  return (
    <div
      ref={panelRef}
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        borderLeft: isEditing ? "2px solid var(--accent)" : "1px solid var(--border)",
        background: "var(--surface)",
        position: "relative",
        overflow: "hidden",
        minWidth: 0,
      }}
    >
      {/* Resize handle */}
      {onWidthChange && (
        <div
          onMouseDown={handleResizeMouseDown}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 6,
            cursor: "col-resize",
            zIndex: 10,
            background: "transparent",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "color-mix(in srgb, var(--accent) 30%, transparent)"; }}
          onMouseLeave={e => { if (!isDragging.current) e.currentTarget.style.background = "transparent"; }}
        />
      )}

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 16px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          flexShrink: 0,
        }}
      >
        {/* Type icon + label as title */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          {breadcrumbs && breadcrumbs.length > 0 ? (
            <>
              {breadcrumbs.map((crumb, idx) => (
                <span key={idx} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <button
                    onClick={crumb.onClick}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      background: "none", border: "none", cursor: "pointer", padding: 0,
                      color: "var(--accent)", fontSize: 13, fontWeight: 500,
                    }}
                    className="hover:opacity-70 transition-opacity"
                  >
                    <span style={{ display: "flex", alignItems: "center", color: "var(--fg3)" }}>{crumb.icon}</span>
                    {crumb.label}
                  </button>
                  <ChevronRightIcon size={10} />
                </span>
              ))}
              <span style={{ display: "flex", alignItems: "center", color: "var(--accent)" }}>{typeIcon}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>{typeBadge}</span>
            </>
          ) : (
            <>
              <span style={{ display: "flex", alignItems: "center", color: "var(--accent)", flexShrink: 0 }}>{typeIcon}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)", whiteSpace: "nowrap" }}>{typeBadge}</span>
            </>
          )}
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Action buttons */}
        {onApprove && (
          <button
            onClick={onApprove}
            style={{
              fontSize: 11, fontWeight: 600, padding: "4px 12px", borderRadius: 4,
              background: "var(--btn-primary-bg)", color: "var(--btn-primary-text)",
              border: "none", cursor: "pointer", flexShrink: 0,
            }}
            className="hover:opacity-80 transition-opacity"
          >
            Approve
          </button>
        )}
        {onDiscuss && (
          <button
            onClick={onDiscuss}
            style={{
              fontSize: 11, fontWeight: 500, padding: "4px 10px", borderRadius: 4,
              background: "transparent", color: "var(--fg2)",
              border: "1px solid var(--border)", cursor: "pointer", flexShrink: 0,
            }}
            className="hover:opacity-80 transition-opacity"
          >
            Discuss
          </button>
        )}

        {/* Edit toggle */}
        {onToggleEdit && (
          <button
            onClick={onToggleEdit}
            style={{
              fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 4,
              border: isEditing ? "1px solid var(--accent)" : "1px solid var(--border)",
              background: isEditing ? "color-mix(in srgb, var(--accent) 12%, transparent)" : "transparent",
              color: isEditing ? "var(--accent)" : "var(--fg3)",
              cursor: "pointer", flexShrink: 0,
            }}
            className="hover:opacity-80 transition-opacity"
          >
            {isEditing ? "Done" : "Edit"}
          </button>
        )}

        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: 28,
            borderRadius: 6,
            border: "none",
            background: "transparent",
            cursor: "pointer",
            color: "var(--fg3)",
            flexShrink: 0,
          }}
          className="hover:bg-[var(--step-hover)] transition-colors"
        >
          <CloseIcon size={14} />
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {children}
      </div>

      {/* Optional footer */}
      {footer && (
        <div style={{
          padding: "10px 16px",
          borderTop: "1px solid var(--border)",
          background: "var(--surface)",
          flexShrink: 0,
        }}>
          {footer}
        </div>
      )}
    </div>
  );
}
