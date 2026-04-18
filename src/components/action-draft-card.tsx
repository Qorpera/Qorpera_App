"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type RefObject,
} from "react";
import {
  DeliverableEditor,
  type DeliverableEditorHandle,
  type DeliverableEditorStateChange,
} from "./deliverable-editor";
import { CalendarWeekPanel } from "./execution/previews/calendar-event-preview";

// ── Public types ────────────────────────────────────────────────────────────

export type ActionCategory =
  | "email"
  | "slack"
  | "teams"
  | "calendar"
  | "document"
  | "other";

export interface ActionDraft {
  stepOrder: number;
  capabilityName: string | null;
  executionMode: string;
  provider: string | null;
  params: Record<string, unknown>;
}

type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

interface Props {
  situationId: string;
  draft: ActionDraft;
  editable: boolean;
}

// ── Pending-save registry ───────────────────────────────────────────────────
// Modules that trigger execution (approve → send, complete step, etc.) should
// call `flushPendingDraftSaves()` before their network call so any debounced
// edits land on the wiki first. Cards self-register on mount.

const pendingDraftSaves = new Set<() => Promise<void>>();

export async function flushPendingDraftSaves(): Promise<void> {
  if (pendingDraftSaves.size === 0) return;
  const fns = [...pendingDraftSaves];
  await Promise.allSettled(fns.map((fn) => fn()));
}

// ── Category resolution ─────────────────────────────────────────────────────

// Keep in sync with src/components/execution/previews/get-preview-component.ts.
const EMAIL_CAPS = new Set([
  "send_email",
  "reply_to_thread",
  "reply_email",
  "create_draft",
  "send_with_attachment",
  "forward_email",
  "send_email_via_salesforce",
]);
const SLACK_CAPS = new Set([
  "send_channel_message",
  "reply_in_thread",
]);
const TEAMS_CAPS = new Set(["reply_to_teams_thread"]);
const CALENDAR_CAPS = new Set([
  "create_calendar_event",
  "update_calendar_event",
  "rsvp_event",
]);
const DOCUMENT_CAPS = new Set([
  "create_document",
  "append_to_document",
  "create_spreadsheet",
  "update_spreadsheet_cells",
  "append_rows",
  "create_sheet_tab",
  "create_worksheet",
  "create_presentation",
]);

export function categorizeAction(capabilityName: string | null): ActionCategory {
  if (!capabilityName) return "other";
  if (EMAIL_CAPS.has(capabilityName) || capabilityName.startsWith("email")) return "email";
  if (SLACK_CAPS.has(capabilityName) || capabilityName.startsWith("slack")) return "slack";
  if (TEAMS_CAPS.has(capabilityName) || capabilityName.startsWith("teams")) return "teams";
  if (CALENDAR_CAPS.has(capabilityName) || capabilityName.startsWith("calendar")) return "calendar";
  if (
    DOCUMENT_CAPS.has(capabilityName)
    || capabilityName.startsWith("document")
    || capabilityName.startsWith("spreadsheet")
    || capabilityName.startsWith("presentation")
  ) {
    return "document";
  }
  return "other";
}

const PREVIEW_TYPE_TO_CANONICAL_CAP: Record<string, string> = {
  email: "send_email",
  slack_message: "send_channel_message",
  calendar_event: "create_calendar_event",
  document: "create_document",
  spreadsheet: "create_spreadsheet",
  presentation: "create_presentation",
};

/**
 * Map an ExecutionStep-shaped object to the ActionDraft shape the card expects.
 * Falls back to `previewType` in params when the step carries no capability
 * slug (common for demo-seeded steps). Returns null when the step is not in a
 * category the card renders (human task, CRM update, ticket, etc.).
 */
export function stepToDraft(step: {
  sequenceOrder: number;
  executionMode: string;
  actionCapability?: { slug: string | null } | null;
  parameters?: Record<string, unknown> | null;
}): ActionDraft | null {
  const slug = step.actionCapability?.slug ?? null;
  const params = step.parameters ?? {};
  const previewType = typeof params.previewType === "string" ? (params.previewType as string) : null;

  const capabilityName = slug ?? (previewType ? PREVIEW_TYPE_TO_CANONICAL_CAP[previewType] ?? null : null);
  if (categorizeAction(capabilityName) === "other") return null;

  return {
    stepOrder: step.sequenceOrder,
    capabilityName,
    executionMode: step.executionMode,
    provider: typeof params._provider === "string" ? (params._provider as string) : null,
    params,
  };
}

// ── Autosave hook ───────────────────────────────────────────────────────────

interface UseDraftAutosaveArgs {
  situationId: string;
  stepOrder: number;
  initialParams: Record<string, unknown>;
  editable: boolean;
}

interface UseDraftAutosaveReturn {
  params: Record<string, unknown>;
  setField: (key: string, value: unknown) => void;
  setFields: (patch: Record<string, unknown>) => void;
  saveStatus: SaveStatus;
  forceSave: () => Promise<void>;
  editorRef: RefObject<DeliverableEditorHandle>;
  canUndo: boolean;
  canRedo: boolean;
  onEditorState: (s: DeliverableEditorStateChange) => void;
}

function useDraftAutosave({
  situationId,
  stepOrder,
  initialParams,
  editable,
}: UseDraftAutosaveArgs): UseDraftAutosaveReturn {
  const [params, setParamsState] = useState<Record<string, unknown>>(initialParams);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Synchronously-updated source of truth for the latest params. `useState` is
  // async, so reading `params` from a recently-queued update inside another
  // event handler would see stale data — anything that needs the freshest
  // value (forceSave, beforeunload, unmount flush, successive setField calls)
  // reads this ref instead.
  const latestParamsRef = useRef(initialParams);

  const lastSavedRef = useRef(JSON.stringify(initialParams));
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<DeliverableEditorHandle>(null);

  const persist = useCallback(
    async (next: Record<string, unknown>) => {
      const serialized = JSON.stringify(next);
      if (serialized === lastSavedRef.current) {
        setSaveStatus("saved");
        return;
      }
      setSaveStatus("saving");
      try {
        const res = await fetch(
          `/api/situations/${encodeURIComponent(situationId)}/steps/${stepOrder}/parameters`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ parameters: next }),
          },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        lastSavedRef.current = serialized;
        setSaveStatus("saved");
      } catch (err) {
        console.error("[action-draft-card] Autosave failed:", err);
        setSaveStatus("error");
      }
    },
    [situationId, stepOrder],
  );

  const scheduleSave = useCallback(
    (next: Record<string, unknown>) => {
      const serialized = JSON.stringify(next);
      if (serialized === lastSavedRef.current) {
        setSaveStatus("idle");
        return;
      }
      setSaveStatus("dirty");
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        void persist(next);
      }, 800);
    },
    [persist],
  );

  const setParams = useCallback(
    (next: Record<string, unknown>) => {
      latestParamsRef.current = next;
      setParamsState(next);
      scheduleSave(next);
    },
    [scheduleSave],
  );

  const setField = useCallback(
    (key: string, value: unknown) => {
      const next = { ...latestParamsRef.current, [key]: value };
      setParams(next);
    },
    [setParams],
  );

  const setFields = useCallback(
    (patch: Record<string, unknown>) => {
      const next = { ...latestParamsRef.current, ...patch };
      setParams(next);
    },
    [setParams],
  );

  const forceSave = useCallback(async () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    await persist(latestParamsRef.current);
  }, [persist]);

  // Cmd/Ctrl+S → force save
  useEffect(() => {
    if (!editable) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void forceSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editable, forceSave]);

  // Warn on reload if dirty
  useEffect(() => {
    if (!editable) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (JSON.stringify(latestParamsRef.current) !== lastSavedRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [editable]);

  // Unmount: cancel debounce, fire-and-forget flush if dirty
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      const serialized = JSON.stringify(latestParamsRef.current);
      if (serialized !== lastSavedRef.current) {
        fetch(
          `/api/situations/${encodeURIComponent(situationId)}/steps/${stepOrder}/parameters`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ parameters: latestParamsRef.current }),
            keepalive: true,
          },
        ).catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onEditorState = useCallback((s: DeliverableEditorStateChange) => {
    setCanUndo(s.canUndo);
    setCanRedo(s.canRedo);
  }, []);

  return {
    params,
    setField,
    setFields,
    saveStatus,
    forceSave,
    editorRef,
    canUndo,
    canRedo,
    onEditorState,
  };
}

// ── Main card ───────────────────────────────────────────────────────────────

export function ActionDraftCard({
  situationId,
  draft,
  editable,
}: Props) {
  const category = useMemo(() => categorizeAction(draft.capabilityName), [draft.capabilityName]);

  const autosave = useDraftAutosave({
    situationId,
    stepOrder: draft.stepOrder,
    initialParams: draft.params,
    editable,
  });

  // Register with the module-level flush registry so approve paths can wait
  // for in-flight edits to land before firing execution.
  useEffect(() => {
    if (!editable) return;
    const fn = autosave.forceSave;
    pendingDraftSaves.add(fn);
    return () => {
      pendingDraftSaves.delete(fn);
    };
  }, [editable, autosave.forceSave]);

  const hasMarkdownBody = category === "email" || category === "slack" || category === "teams" || category === "document";

  return (
    <div
      style={{
        background: "var(--elevated)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        overflow: "hidden",
      }}
    >
      <DraftHeader
        providerLabel={providerLabel(draft.provider, category)}
        dotColor={providerDotColor(draft.provider, category)}
        saveStatus={autosave.saveStatus}
        editable={editable}
        showUndoRedo={hasMarkdownBody}
        canUndo={autosave.canUndo}
        canRedo={autosave.canRedo}
        onUndo={() => autosave.editorRef.current?.undo()}
        onRedo={() => autosave.editorRef.current?.redo()}
        onForceSave={() => void autosave.forceSave()}
      />
      <div style={{ padding: "14px 16px" }}>
        {category === "email" && (
          <EmailFields
            params={autosave.params}
            setField={autosave.setField}
            editable={editable}
            editorRef={autosave.editorRef}
            onEditorState={autosave.onEditorState}
          />
        )}
        {(category === "slack" || category === "teams") && (
          <MessageFields
            params={autosave.params}
            setField={autosave.setField}
            editable={editable}
            editorRef={autosave.editorRef}
            onEditorState={autosave.onEditorState}
            channelLabel={category === "slack" ? "Channel" : "Chat"}
          />
        )}
        {category === "calendar" && (
          <CalendarFields
            params={autosave.params}
            setField={autosave.setField}
            setFields={autosave.setFields}
            editable={editable}
          />
        )}
        {category === "document" && (
          <DocumentFields
            params={autosave.params}
            setField={autosave.setField}
            editable={editable}
            editorRef={autosave.editorRef}
            onEditorState={autosave.onEditorState}
          />
        )}
        {category === "other" && <OtherActionSummary params={autosave.params} />}
      </div>
    </div>
  );
}

// ── Header ──────────────────────────────────────────────────────────────────

interface HeaderProps {
  providerLabel: string;
  dotColor: string;
  saveStatus: SaveStatus;
  editable: boolean;
  showUndoRedo: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onForceSave: () => void;
}

function DraftHeader({
  providerLabel,
  dotColor,
  saveStatus,
  editable,
  showUndoRedo,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onForceSave,
}: HeaderProps) {
  return (
    <div
      className="flex items-center justify-between"
      style={{
        padding: "6px 14px",
        background: "rgba(255,255,255,0.06)",
        borderBottom: "1px solid rgba(255,255,255,0.2)",
        minHeight: 32,
      }}
    >
      <div className="flex items-center gap-2">
        <span
          style={{ width: 8, height: 8, borderRadius: 4, background: dotColor }}
        />
        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--fg2)" }}>
          {providerLabel}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {editable && showUndoRedo && (
          <>
            <IconButton title="Undo" disabled={!canUndo} onClick={onUndo}>
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7v6h6" />
                <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
              </svg>
            </IconButton>
            <IconButton title="Redo" disabled={!canRedo} onClick={onRedo}>
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 7v6h-6" />
                <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
              </svg>
            </IconButton>
          </>
        )}
        <SaveStatusPill status={saveStatus} editable={editable} onClick={onForceSave} />
      </div>
    </div>
  );
}

function IconButton({
  title,
  disabled,
  onClick,
  children,
}: {
  title: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        background: "transparent",
        border: "1px solid var(--border)",
        borderRadius: 4,
        padding: "2px 6px",
        color: disabled ? "var(--fg4)" : "var(--fg2)",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.4 : 1,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      className={disabled ? "" : "hover:bg-hover transition"}
    >
      {children}
    </button>
  );
}

function SaveStatusPill({
  status,
  editable,
  onClick,
}: {
  status: SaveStatus;
  editable: boolean;
  onClick: () => void;
}) {
  if (!editable) {
    return (
      <span style={{ fontSize: 11, color: "var(--fg4)" }}>read-only</span>
    );
  }
  const label =
    status === "idle"
      ? ""
      : status === "dirty"
        ? "Editing…"
        : status === "saving"
          ? "Saving…"
          : status === "saved"
            ? "Saved"
            : "Save failed — retry";
  const color =
    status === "error"
      ? "var(--danger)"
      : status === "saved"
        ? "var(--ok)"
        : "var(--fg3)";
  const clickable = status === "error" || status === "dirty";
  if (!label) return <span style={{ fontSize: 11, color: "var(--fg4)" }}>Auto-saves</span>;
  return (
    <button
      type="button"
      onClick={clickable ? onClick : undefined}
      disabled={!clickable}
      style={{
        fontSize: 11,
        color,
        background: "transparent",
        border: "none",
        cursor: clickable ? "pointer" : "default",
        padding: 0,
      }}
    >
      {label}
    </button>
  );
}

// ── Shared field inputs ─────────────────────────────────────────────────────

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
      <span style={{ fontSize: 11, color: "var(--fg4)", width: 72, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

function InlineTextInput({
  value,
  onChange,
  editable,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  editable: boolean;
  placeholder?: string;
  type?: "text" | "datetime-local";
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => {
    setLocal(value);
  }, [value]);

  const commit = useCallback(
    (next: string) => {
      if (next !== value) onChange(next);
    },
    [value, onChange],
  );

  if (!editable) {
    return (
      <span style={{ fontSize: 13, color: "var(--fg2)" }}>
        {value || <span style={{ color: "var(--fg4)" }}>—</span>}
      </span>
    );
  }

  return (
    <input
      type={type}
      value={local}
      onChange={(e: ChangeEvent<HTMLInputElement>) => setLocal(e.target.value)}
      onBlur={() => commit(local)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.currentTarget as HTMLInputElement).blur();
        }
      }}
      placeholder={placeholder}
      style={{
        width: "100%",
        background: "transparent",
        border: "1px solid transparent",
        borderRadius: 3,
        padding: "3px 6px",
        fontSize: 13,
        color: "var(--foreground)",
        outline: "none",
      }}
      className="hover:border-[var(--border)] focus:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] transition-colors"
    />
  );
}

function MarkdownBodyEditor({
  initialMarkdown,
  editable,
  onChange,
  editorRef,
  onEditorState,
}: {
  initialMarkdown: string;
  editable: boolean;
  onChange: (md: string) => void;
  editorRef: RefObject<DeliverableEditorHandle>;
  onEditorState: (s: DeliverableEditorStateChange) => void;
}) {
  return (
    <div
      style={{
        marginTop: 6,
        padding: "8px 10px",
        background: editable ? "rgba(255,255,255,0.02)" : "transparent",
        border: "1px solid var(--border)",
        borderRadius: 4,
        minHeight: 120,
      }}
    >
      <DeliverableEditor
        ref={editorRef}
        initialMarkdown={initialMarkdown}
        editable={editable}
        onChange={onChange}
        onStateChange={onEditorState}
      />
    </div>
  );
}

// ── Email fields ────────────────────────────────────────────────────────────

function EmailFields({
  params,
  setField,
  editable,
  editorRef,
  onEditorState,
}: {
  params: Record<string, unknown>;
  setField: (key: string, value: unknown) => void;
  editable: boolean;
  editorRef: RefObject<DeliverableEditorHandle>;
  onEditorState: (s: DeliverableEditorStateChange) => void;
}) {
  const to = asString(params.to);
  const cc = asString(params.cc);
  const subject = asString(params.subject);
  const body = asString(params.body);
  const attachments = asAttachments(params.attachments);
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        if (!editable) return;
        if (Array.from(e.dataTransfer.types).includes("Files")) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        setDragOver(false);
        if (!editable) return;
        if (e.dataTransfer.files.length === 0) return;
        e.preventDefault();
        const next = [
          ...attachments,
          ...Array.from(e.dataTransfer.files).map((f) => ({
            type: inferAttachmentType(f.name),
            title: f.name,
            size: formatBytes(f.size),
          })),
        ];
        setField("attachments", next);
      }}
      style={{
        position: "relative",
        outline: dragOver ? "2px dashed var(--accent)" : "none",
        outlineOffset: -2,
        borderRadius: 4,
      }}
    >
      <FieldRow label="To">
        <InlineTextInput value={to} onChange={(v) => setField("to", v)} editable={editable} placeholder="recipient@example.com" />
      </FieldRow>
      <FieldRow label="Cc">
        <InlineTextInput value={cc} onChange={(v) => setField("cc", v)} editable={editable} placeholder="cc@example.com" />
      </FieldRow>
      <FieldRow label="Subject">
        <InlineTextInput value={subject} onChange={(v) => setField("subject", v)} editable={editable} />
      </FieldRow>
      <div style={{ borderTop: "1px solid var(--border)", marginTop: 10, paddingTop: 10 }}>
        <MarkdownBodyEditor
          initialMarkdown={body}
          editable={editable}
          onChange={(md) => setField("body", md)}
          editorRef={editorRef}
          onEditorState={onEditorState}
        />
      </div>
      <AttachmentList
        attachments={attachments}
        editable={editable}
        onChange={(next) => setField("attachments", next)}
      />
    </div>
  );
}

// ── Slack / Teams fields ────────────────────────────────────────────────────

function MessageFields({
  params,
  setField,
  editable,
  editorRef,
  onEditorState,
  channelLabel,
}: {
  params: Record<string, unknown>;
  setField: (key: string, value: unknown) => void;
  editable: boolean;
  editorRef: RefObject<DeliverableEditorHandle>;
  onEditorState: (s: DeliverableEditorStateChange) => void;
  channelLabel: string;
}) {
  const channel = asString(params.channel);
  const message = asString(params.body) || asString(params.message);
  const messageKey = params.body !== undefined ? "body" : "message";

  return (
    <div>
      <FieldRow label={channelLabel}>
        <InlineTextInput value={channel} onChange={(v) => setField("channel", v)} editable={editable} placeholder="#channel" />
      </FieldRow>
      <div style={{ borderTop: "1px solid var(--border)", marginTop: 10, paddingTop: 10 }}>
        <MarkdownBodyEditor
          initialMarkdown={message}
          editable={editable}
          onChange={(md) => setField(messageKey, md)}
          editorRef={editorRef}
          onEditorState={onEditorState}
        />
      </div>
    </div>
  );
}

// ── Calendar fields ─────────────────────────────────────────────────────────
//
// The scheduling UX (title, times, attendees, location, drag-to-move on a
// week grid, overlap rejection) is the CalendarWeekPanel's popup — we reuse
// it wholesale. Free-text "description" / "notes" stays below the grid for
// content that doesn't belong on an event block.

function CalendarFields({
  params,
  setField,
  setFields,
  editable,
}: {
  params: Record<string, unknown>;
  setField: (key: string, value: unknown) => void;
  setFields: (patch: Record<string, unknown>) => void;
  editable: boolean;
}) {
  // Resolve the preferred keys so we write back to whatever the seed uses.
  const titleKey = params.summary !== undefined ? "summary" : "title";
  const startKey = params.startDateTime !== undefined ? "startDateTime" : (params.startTime !== undefined ? "startTime" : "start");
  const endKey = params.endDateTime !== undefined ? "endDateTime" : (params.endTime !== undefined ? "endTime" : "end");
  const attendeesKey = params.attendeeEmails !== undefined ? "attendeeEmails" : "attendees";

  const title = asString(params[titleKey]);
  const start = asString(params[startKey]);
  const end = asString(params[endKey]);
  const attendees = asAttendeeList(params[attendeesKey]);
  const location = asString(params.location);
  const description = asString(params.description);

  // Fallback end for the week view when the seed didn't provide one.
  const fallbackEnd = start && !end
    ? new Date(new Date(start).getTime() + 3600_000).toISOString()
    : end;

  // If the start date is malformed or missing, degrade to a simple field list
  // — the CalendarWeekPanel needs a valid ISO string to place the week.
  const startValid = start && !Number.isNaN(new Date(start).getTime());

  // Stable week key (YYYY-MM-DD of the Monday). Without this, every autosave
  // that rewrites `start` (drag, time edit, etc.) changes the `weekOf` prop
  // and re-fires the CalendarWeekPanel fetch even when the week hasn't moved.
  const weekKey = useMemo(() => {
    if (!startValid) return "";
    const d = new Date(start);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  }, [start, startValid]);

  return (
    <div>
      {startValid ? (
        <div style={{ marginBottom: 10 }}>
          <CalendarWeekPanel
            weekOf={weekKey}
            proposedEvent={{
              title,
              startTime: start,
              endTime: fallbackEnd,
              attendees,
              location: location || undefined,
            }}
            isEditable={editable}
            locale={typeof navigator !== "undefined" ? navigator.language : "en"}
            onProposedEventUpdate={(update) => {
              const patch: Record<string, unknown> = {};
              if (update.title !== undefined) patch[titleKey] = update.title;
              if (update.startTime !== undefined) patch[startKey] = update.startTime;
              if (update.endTime !== undefined) patch[endKey] = update.endTime;
              if (update.attendees !== undefined) patch[attendeesKey] = update.attendees;
              if (update.location !== undefined) patch.location = update.location;
              setFields(patch);
            }}
          />
        </div>
      ) : (
        <>
          <FieldRow label="Title">
            <InlineTextInput value={title} onChange={(v) => setField(titleKey, v)} editable={editable} />
          </FieldRow>
          <FieldRow label="Attendees">
            <InlineTextInput
              value={attendees.join(", ")}
              onChange={(v) => setField(attendeesKey, parseAttendees(v))}
              editable={editable}
              placeholder="alice@x.com, bob@y.com"
            />
          </FieldRow>
          <FieldRow label="Location">
            <InlineTextInput value={location} onChange={(v) => setField("location", v)} editable={editable} />
          </FieldRow>
        </>
      )}
      <FieldRow label="Notes">
        <InlineTextInput value={description} onChange={(v) => setField("description", v)} editable={editable} placeholder="Agenda or context…" />
      </FieldRow>
    </div>
  );
}

// ── Document fields ─────────────────────────────────────────────────────────

function DocumentFields({
  params,
  setField,
  editable,
  editorRef,
  onEditorState,
}: {
  params: Record<string, unknown>;
  setField: (key: string, value: unknown) => void;
  editable: boolean;
  editorRef: RefObject<DeliverableEditorHandle>;
  onEditorState: (s: DeliverableEditorStateChange) => void;
}) {
  const title = asString(params.title) || asString(params.name);
  const titleKey = params.title !== undefined || params.name === undefined ? "title" : "name";
  const content = asString(params.content) || asString(params.body);
  const contentKey = params.body !== undefined && params.content === undefined ? "body" : "content";

  return (
    <div>
      <FieldRow label="Title">
        <InlineTextInput value={title} onChange={(v) => setField(titleKey, v)} editable={editable} />
      </FieldRow>
      <div style={{ borderTop: "1px solid var(--border)", marginTop: 10, paddingTop: 10 }}>
        <MarkdownBodyEditor
          initialMarkdown={content}
          editable={editable}
          onChange={(md) => setField(contentKey, md)}
          editorRef={editorRef}
          onEditorState={onEditorState}
        />
      </div>
    </div>
  );
}

// ── Other / unknown actions ─────────────────────────────────────────────────

function OtherActionSummary({ params }: { params: Record<string, unknown> }) {
  const entries = Object.entries(params).filter(([k]) => !k.startsWith("_"));
  if (entries.length === 0) {
    return <p style={{ fontSize: 12, color: "var(--fg4)" }}>No parameters.</p>;
  }
  return (
    <div style={{ fontSize: 12, color: "var(--fg3)" }}>
      {entries.map(([k, v]) => (
        <div key={k} style={{ marginBottom: 4 }}>
          <span style={{ color: "var(--fg4)" }}>{k}:</span> {formatUnknown(v)}
        </div>
      ))}
    </div>
  );
}

// ── Attachment list ─────────────────────────────────────────────────────────

interface AttachmentRecord {
  type?: string;
  title?: string;
  size?: string;
  [k: string]: unknown;
}

function AttachmentList({
  attachments,
  editable,
  onChange,
}: {
  attachments: AttachmentRecord[];
  editable: boolean;
  onChange: (next: AttachmentRecord[]) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;
      // Metadata-only: no upload pipeline for situation attachments yet, so
      // only filename + size land on the wiki. Replace with real upload when
      // the endpoint exists.
      const added: AttachmentRecord[] = list.map((f) => ({
        type: inferAttachmentType(f.name),
        title: f.name,
        size: formatBytes(f.size),
      }));
      onChange([...attachments, ...added]);
    },
    [attachments, onChange],
  );

  const pickFiles = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Empty + not editable → render nothing.
  if (attachments.length === 0 && !editable) return null;

  return (
    <div style={{ borderTop: "1px solid var(--border)", marginTop: 10, paddingTop: 10 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--fg2)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {attachments.length === 0
            ? "Attachments"
            : attachments.length === 1
              ? "1 Attachment"
              : `${attachments.length} Attachments`}
        </div>
        {editable && (
          <button
            type="button"
            onClick={pickFiles}
            style={{
              fontSize: 11,
              padding: "3px 10px",
              borderRadius: 4,
              border: "1px solid var(--border)",
              background: "transparent",
              color: "var(--fg2)",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
            className="hover:bg-hover transition"
          >
            <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
            Add
          </button>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: "none" }}
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files);
          e.target.value = ""; // allow re-adding same file
        }}
      />
      {attachments.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {attachments.map((att, idx) => (
            <AttachmentRow
              key={idx}
              attachment={att}
              editable={editable}
              onChangeTitle={(title) => {
                const next = attachments.slice();
                next[idx] = { ...att, title };
                onChange(next);
              }}
              onRemove={() => {
                const next = attachments.slice();
                next.splice(idx, 1);
                onChange(next);
              }}
            />
          ))}
        </div>
      )}
      {editable && attachments.length === 0 && (
        <p style={{ fontSize: 11, color: "var(--fg4)", marginTop: 2 }}>
          Drop files here or click Add.
        </p>
      )}
    </div>
  );
}

function AttachmentRow({
  attachment,
  editable,
  onChangeTitle,
  onRemove,
}: {
  attachment: AttachmentRecord;
  editable: boolean;
  onChangeTitle: (title: string) => void;
  onRemove: () => void;
}) {
  const typeIcon = attachment.type === "spreadsheet" ? "grid" : "doc";
  return (
    <div
      className="flex items-center gap-2"
      style={{
        padding: "6px 10px",
        border: "1px solid var(--border)",
        borderRadius: 4,
        background: "var(--elevated)",
      }}
    >
      {typeIcon === "grid" ? (
        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--fg3)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
          <rect width="18" height="18" x="3" y="3" rx="2" />
          <path d="M3 9h18" />
          <path d="M3 15h18" />
          <path d="M9 3v18" />
          <path d="M15 3v18" />
        </svg>
      ) : (
        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--fg3)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <InlineTextInput
          value={attachment.title ?? ""}
          onChange={onChangeTitle}
          editable={editable}
          placeholder="Untitled attachment"
        />
      </div>
      {attachment.size && (
        <span style={{ fontSize: 10, color: "var(--fg4)", flexShrink: 0 }}>
          {attachment.size}
        </span>
      )}
      {editable && (
        <button
          type="button"
          title="Remove attachment"
          aria-label="Remove attachment"
          onClick={onRemove}
          style={{
            background: "transparent",
            border: "none",
            padding: 2,
            cursor: "pointer",
            color: "var(--fg4)",
            display: "inline-flex",
          }}
          className="hover:text-[var(--danger)] transition-colors"
        >
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asAttachments(v: unknown): AttachmentRecord[] {
  if (!Array.isArray(v)) return [];
  return v.filter((item): item is AttachmentRecord => typeof item === "object" && item !== null);
}

function inferAttachmentType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (["xlsx", "xls", "csv", "ods", "numbers"].includes(ext)) return "spreadsheet";
  if (["ppt", "pptx", "key"].includes(ext)) return "presentation";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  return "document";
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function asAttendeeList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item === "string" && item.trim()) out.push(item.trim());
    else if (typeof item === "object" && item !== null) {
      const obj = item as Record<string, unknown>;
      const email = typeof obj.email === "string" ? obj.email : null;
      if (email) out.push(email);
    }
  }
  return out;
}

function parseAttendees(input: string): string[] {
  return input
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function providerLabel(provider: string | null, category: ActionCategory): string {
  if (provider) {
    const p = provider.toLowerCase();
    if (p === "google" || p === "gmail") return "Gmail";
    if (p === "slack") return "Slack";
    if (p === "microsoft" || p === "outlook") return "Outlook";
    if (p === "teams") return "Teams";
    return provider;
  }
  switch (category) {
    case "email": return "Email";
    case "slack": return "Slack";
    case "teams": return "Teams";
    case "calendar": return "Calendar event";
    case "document": return "Document";
    default: return "Action";
  }
}

function providerDotColor(provider: string | null, category: ActionCategory): string {
  const p = provider?.toLowerCase();
  if (p === "google" || p === "gmail") return "var(--danger)";
  if (p === "slack") return "var(--accent)";
  if (p === "microsoft" || p === "outlook" || p === "teams") return "var(--info)";
  if (category === "calendar") return "var(--warn)";
  if (category === "document") return "var(--ok)";
  return "var(--fg3)";
}

function formatUnknown(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return "[unserializable]";
  }
}
