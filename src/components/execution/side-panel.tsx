"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

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

function MaximizeIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

function MinimizeIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 14h6v6" /><path d="M20 10h-6V4" />
      <path d="M14 10l7-7" /><path d="M3 21l7-7" />
    </svg>
  );
}

function ChatIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function PanelRightCloseIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="3" rx="2" /><path d="M15 3v18" /><path d="m8 9 3 3-3 3" />
    </svg>
  );
}

function UndoIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-15-6.7L3 13" />
    </svg>
  );
}

function RedoIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 7v6h-6" /><path d="M3 17a9 9 0 0 1 15-6.7L21 13" />
    </svg>
  );
}

function CheckIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

function SaveStatusPill({ status, onSaveNow }: { status: SaveStatus; onSaveNow?: () => void }) {
  if (status === "saving") {
    return (
      <span
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          fontSize: 12, fontWeight: 500, padding: "5px 10px", borderRadius: 6,
          background: "transparent", color: "var(--fg3)",
          border: "1px solid var(--border)", flexShrink: 0,
        }}
      >
        <span
          className="animate-spin"
          style={{
            width: 10, height: 10, borderRadius: "50%",
            border: "1.5px solid var(--fg4)", borderTopColor: "var(--accent)",
          }}
        />
        Saving…
      </span>
    );
  }
  if (status === "saved") {
    return (
      <span
        style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          fontSize: 12, fontWeight: 500, padding: "5px 10px", borderRadius: 6,
          color: "var(--ok, #34d399)", background: "color-mix(in srgb, var(--ok, #34d399) 10%, transparent)",
          border: "1px solid color-mix(in srgb, var(--ok, #34d399) 25%, transparent)",
          flexShrink: 0,
        }}
      >
        <CheckIcon size={11} /> Saved
      </span>
    );
  }
  if (status === "error") {
    return (
      <button
        onClick={onSaveNow}
        style={{
          fontSize: 12, fontWeight: 500, padding: "5px 10px", borderRadius: 6,
          color: "var(--danger, #f87171)",
          background: "color-mix(in srgb, var(--danger, #f87171) 10%, transparent)",
          border: "1px solid color-mix(in srgb, var(--danger, #f87171) 30%, transparent)",
          cursor: onSaveNow ? "pointer" : "default", flexShrink: 0,
        }}
      >
        Retry save
      </button>
    );
  }
  // dirty
  return (
    <button
      onClick={onSaveNow}
      disabled={!onSaveNow}
      title="Save now (⌘S)"
      style={{
        fontSize: 12, fontWeight: 500, padding: "5px 10px", borderRadius: 6,
        color: "var(--accent)",
        background: "color-mix(in srgb, var(--accent) 10%, transparent)",
        border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)",
        cursor: onSaveNow ? "pointer" : "default", flexShrink: 0,
      }}
      className="hover:opacity-80 transition-opacity"
    >
      Save
    </button>
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
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  saveStatus?: SaveStatus;
  onSaveNow?: () => void;
  onWidthChange?: (percent: number) => void;
  onResizeStart?: () => void;
  onResizeEnd?: () => void;
  onApprove?: () => void;
  onApprovalComplete?: () => void;
  onDiscuss?: () => void;
  approveLabel?: string;
  isFullScreen?: boolean;
  onToggleFullScreen?: () => void;
  chatElement?: ReactNode;
  isChatVisible?: boolean;
  onToggleChatVisible?: () => void;
  // When set, the full-screen content/chat split becomes a percentage grid
  // (100-chatWidth : chatWidth) with a draggable boundary. When omitted, the
  // panel uses "1fr minmax(280px, 20%)" — no drag handle.
  chatWidth?: number;
  onChatWidthChange?: (width: number) => void;
}

// ── Approve button with in-button micro-animation ──────────────────────────
// Total choreography: 0ms click → spinner fades in (150ms) & spins (550ms rotation) →
// 700ms morph to checkmark (draws in 150ms) → 850ms fade out (250ms) → 1100ms complete.
// At 1100ms the button invokes onAnimationComplete, which the page uses to
// commit the optimistic status flip and close the panel.
function ApproveButtonWithAnimation({
  label,
  onClick,
  onAnimationComplete,
}: {
  label: string;
  onClick: () => void;
  onAnimationComplete: () => void;
}) {
  const [phase, setPhase] = useState<"idle" | "spinning" | "check" | "fading">("idle");
  const completeRef = useRef(onAnimationComplete);
  completeRef.current = onAnimationComplete;

  useEffect(() => {
    if (phase === "idle") return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (phase === "spinning") {
      timers.push(setTimeout(() => setPhase("check"), 700));
    }
    if (phase === "check") {
      timers.push(setTimeout(() => setPhase("fading"), 150));
    }
    if (phase === "fading") {
      timers.push(setTimeout(() => completeRef.current(), 250));
    }
    return () => { timers.forEach(clearTimeout); };
  }, [phase]);

  const handleClick = () => {
    if (phase !== "idle") return;
    onClick();
    setPhase("spinning");
  };

  const disabled = phase !== "idle";

  return (
    <>
      <style jsx global>{`
        @keyframes approve-btn-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes approve-btn-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes approve-btn-check {
          to { stroke-dashoffset: 0; }
        }
      `}</style>
      <button
        onClick={handleClick}
        disabled={disabled}
        style={{
          position: "relative",
          fontSize: 11,
          fontWeight: 600,
          padding: "4px 12px",
          borderRadius: 4,
          background: "var(--btn-primary-bg)",
          color: "var(--btn-primary-text)",
          border: "none",
          cursor: disabled ? "default" : "pointer",
          flexShrink: 0,
          minWidth: 64,
          minHeight: 24,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          opacity: phase === "fading" ? 0 : 1,
          transition: "opacity 250ms ease",
        }}
        className={disabled ? "" : "hover:opacity-80 transition-opacity"}
      >
        <span
          style={{
            opacity: phase === "idle" ? 1 : 0,
            transition: "opacity 150ms ease",
            position: phase === "idle" ? "relative" : "absolute",
          }}
        >
          {label}
        </span>
        {phase === "spinning" && (
          <span
            style={{
              position: "absolute",
              display: "inline-block",
              width: 12,
              height: 12,
              borderRadius: "50%",
              border: "2px solid color-mix(in srgb, var(--btn-primary-text) 35%, transparent)",
              borderTopColor: "var(--btn-primary-text)",
              animationName: "approve-btn-spin, approve-btn-fade-in",
              animationDuration: "550ms, 150ms",
              animationIterationCount: "infinite, 1",
              animationTimingFunction: "linear, ease",
              animationFillMode: "none, forwards",
            }}
          />
        )}
        {(phase === "check" || phase === "fading") && (
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            style={{ position: "absolute" }}
          >
            {/* `forwards` keeps the checkmark fully drawn after the 150ms draw-in,
             *  so it stays visible through the subsequent 250ms fade-out phase. */}
            <path
              d="M 5 13 L 10 18 L 19 7"
              stroke="var(--btn-primary-text)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                strokeDasharray: 26,
                strokeDashoffset: 26,
                animation: "approve-btn-check 150ms ease forwards",
              }}
            />
          </svg>
        )}
      </button>
    </>
  );
}

// ── Drag handle ────────────────────────────────────────────────────────────
// Sits on the boundary between the content column and the chat column in the
// percentage-split variant. Mouse-drag only — keyboard a11y is out of scope.

function PanelDragHandle({
  onDrag,
  currentChatWidth,
}: {
  onDrag: (newChatWidth: number) => void;
  currentChatWidth: number;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLElement | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    containerRef.current = (e.currentTarget as HTMLElement).closest(
      "[data-panel-frame]",
    ) as HTMLElement | null;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;
      const totalWidth = rect.width;
      const chatWidthRaw = ((totalWidth - relativeX) / totalWidth) * 100;
      const chatWidthClamped = Math.max(20, Math.min(75, chatWidthRaw));
      onDrag(Math.round(chatWidthClamped));
    };
    const onUp = () => {
      setIsDragging(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isDragging, onDrag]);

  return (
    <div
      onMouseDown={handleMouseDown}
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        right: `${currentChatWidth}%`,
        width: 4,
        cursor: "col-resize",
        zIndex: 10,
        transform: "translateX(2px)",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 1,
          width: 1,
          background: isDragging ? "var(--accent)" : "var(--border-strong)",
        }}
      />
      <div
        onMouseEnter={(e) => {
          if (!isDragging)
            (e.currentTarget.previousSibling as HTMLElement).style.background =
              "color-mix(in srgb, var(--accent) 40%, transparent)";
        }}
        onMouseLeave={(e) => {
          if (!isDragging)
            (e.currentTarget.previousSibling as HTMLElement).style.background =
              "var(--border-strong)";
        }}
        style={{ position: "absolute", inset: 0 }}
      />
    </div>
  );
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
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  saveStatus,
  onSaveNow,
  onWidthChange,
  onResizeStart,
  onResizeEnd,
  onApprove,
  onApprovalComplete,
  onDiscuss,
  approveLabel,
  isFullScreen,
  onToggleFullScreen,
  chatElement,
  isChatVisible,
  onToggleChatVisible,
  chatWidth,
  onChatWidthChange,
}: SidePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  // ── Escape key: exit full-screen first, then close ────────────────────

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (isFullScreen && onToggleFullScreen) {
          onToggleFullScreen();
        } else {
          onClose();
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isFullScreen, onToggleFullScreen, onClose]);

  // ── Resize drag ──────────────────────────────────────────────────────────

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    onResizeStart?.();

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
      onResizeEnd?.();
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [onWidthChange, onResizeStart, onResizeEnd]);

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
      {/* Resize handle (hidden in full-screen) */}
      {onWidthChange && !isFullScreen && (
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
          <ApproveButtonWithAnimation
            label={approveLabel ?? "Accept"}
            onClick={() => { onApprove(); }}
            onAnimationComplete={() => { onApprovalComplete?.(); }}
          />
        )}
        {onDiscuss && !isFullScreen && (
          <button
            onClick={onDiscuss}
            style={{
              fontSize: 13, fontWeight: 500, padding: "6px 14px", borderRadius: 6,
              background: "transparent", color: "var(--foreground)",
              border: "1px solid var(--border-strong)", cursor: "pointer", flexShrink: 0,
              display: "inline-flex", alignItems: "center", gap: 6,
            }}
            className="hover:bg-[var(--hover)] transition-colors"
          >
            <ChatIcon size={13} />
            Discuss
          </button>
        )}

        {/* Undo / Redo (shown when editor is wired) */}
        {onUndo && (
          <button
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (⌘Z)"
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 30, height: 30, borderRadius: 6,
              background: "transparent", border: "1px solid var(--border-strong)",
              color: canUndo ? "var(--foreground)" : "var(--fg4)",
              cursor: canUndo ? "pointer" : "not-allowed", flexShrink: 0,
              opacity: canUndo ? 1 : 0.45,
            }}
            className="hover:bg-[var(--hover)] transition-colors"
          >
            <UndoIcon size={14} />
          </button>
        )}
        {onRedo && (
          <button
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (⌘⇧Z)"
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 30, height: 30, borderRadius: 6,
              background: "transparent", border: "1px solid var(--border-strong)",
              color: canRedo ? "var(--foreground)" : "var(--fg4)",
              cursor: canRedo ? "pointer" : "not-allowed", flexShrink: 0,
              opacity: canRedo ? 1 : 0.45,
            }}
            className="hover:bg-[var(--hover)] transition-colors"
          >
            <RedoIcon size={14} />
          </button>
        )}

        {/* Save status pill */}
        {saveStatus && saveStatus !== "idle" && (
          <SaveStatusPill status={saveStatus} onSaveNow={onSaveNow} />
        )}

        {/* Edit toggle */}
        {onToggleEdit && (
          <button
            onClick={onToggleEdit}
            style={{
              fontSize: 13, fontWeight: 500, padding: "6px 14px", borderRadius: 6,
              border: isEditing ? "1px solid var(--accent)" : "1px solid var(--border-strong)",
              background: isEditing ? "color-mix(in srgb, var(--accent) 12%, transparent)" : "transparent",
              color: isEditing ? "var(--accent)" : "var(--foreground)",
              cursor: "pointer", flexShrink: 0,
            }}
            className="hover:bg-[var(--hover)] transition-colors"
          >
            {isEditing ? "Done" : "Edit"}
          </button>
        )}

        {/* Full-screen toggle */}
        {onToggleFullScreen && (
          <button
            onClick={onToggleFullScreen}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 28, height: 28, borderRadius: 6,
              border: "none", background: "transparent",
              cursor: "pointer", color: "var(--fg3)", flexShrink: 0,
            }}
            className="hover:bg-[var(--step-hover)] transition-colors"
            title={isFullScreen ? "Exit full screen" : "Full screen"}
          >
            {isFullScreen ? <MinimizeIcon size={14} /> : <MaximizeIcon size={14} />}
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

      {/* Content area — normal or full-screen with chat sidebar */}
      {isFullScreen && chatElement ? (() => {
        const baseGridTemplate = chatWidth !== undefined
          ? `${100 - chatWidth}% ${chatWidth}%`
          : "1fr minmax(280px, 20%)";
        const gridTemplate = isChatVisible ? baseGridTemplate : "1fr 0";
        const showDragHandle =
          chatWidth !== undefined && !!isChatVisible && !!onChatWidthChange;
        return (
          <div
            data-panel-frame
            style={{
              flex: 1,
              display: "grid",
              gridTemplateColumns: gridTemplate,
              minHeight: 0,
              position: "relative",
              transition:
                chatWidth === undefined ? "grid-template-columns 0.2s ease" : undefined,
            }}
          >
            {/* Preview content */}
            <div style={{ overflow: "auto", minHeight: 0, minWidth: 0 }}>
              {children}
            </div>

            {/* Drag handle — only in percentage-split mode with chat visible */}
            {showDragHandle && chatWidth !== undefined && onChatWidthChange && (
              <PanelDragHandle
                currentChatWidth={chatWidth}
                onDrag={onChatWidthChange}
              />
            )}

            {/* Chat sidebar */}
            <div style={{
              minWidth: 0,
              overflow: "hidden",
              borderLeft: isChatVisible ? "1px solid var(--border)" : "none",
              display: "flex",
              flexDirection: "column",
            }}>
              {isChatVisible && (
                <>
                  <div style={{
                    padding: "8px 12px",
                    borderBottom: "1px solid var(--border)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexShrink: 0,
                  }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: "var(--fg2)" }}>Discussion</span>
                    {onToggleChatVisible && (
                      <button
                        onClick={onToggleChatVisible}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "center",
                          width: 24, height: 24, borderRadius: 4,
                          border: "none", background: "transparent",
                          cursor: "pointer", color: "var(--fg3)",
                        }}
                        className="hover:bg-[var(--step-hover)] transition-colors"
                        title="Hide chat"
                      >
                        <PanelRightCloseIcon size={14} />
                      </button>
                    )}
                  </div>
                  <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
                    {chatElement}
                  </div>
                </>
              )}
            </div>

            {/* Show chat button when hidden */}
            {!isChatVisible && onToggleChatVisible && (
              <button
                onClick={onToggleChatVisible}
                style={{
                  position: "absolute", right: 12, bottom: 12,
                  padding: "8px 16px", borderRadius: 8,
                  background: "var(--surface)", border: "1px solid var(--border)",
                  color: "var(--fg2)", fontSize: 12, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 6,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                }}
                className="hover:bg-[var(--hover)] transition-colors"
              >
                <ChatIcon size={14} />
                Show chat
              </button>
            )}
          </div>
        );
      })() : (
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          {children}
        </div>
      )}

      {/* Optional footer */}
      {footer && (
        <div style={{
          padding: "12px 24px",
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
