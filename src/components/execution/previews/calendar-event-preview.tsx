"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { formatDate } from "@/lib/format-helpers";
import { fetchApi } from "@/lib/fetch-api";
import type { PreviewProps } from "./get-preview-component";
import { CalendarWeekView } from "./calendar-week-view";
import type { CalendarEvent } from "./calendar-week-view";

function CalendarIcon({ size = 14, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M8 2v4M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" />
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

function formatTime(dateStr: string, locale: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

function durationMinutes(start: string, end: string): number {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
}

function toLocalDatetimeValue(iso: string): string {
  try {
    const d = new Date(iso);
    return d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0") + "T" +
      String(d.getHours()).padStart(2, "0") + ":" +
      String(d.getMinutes()).padStart(2, "0");
  } catch {
    return iso;
  }
}

function getMonday(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

/** Which day of the week (0=Mon..6=Sun) does the event fall on? */
function getDayOfWeek(dateStr: string): number {
  const d = new Date(dateStr);
  return (d.getDay() + 6) % 7; // Convert Sun=0 to Mon=0
}

const editInputStyle = {
  fontSize: 13,
  color: "var(--foreground)",
  background: "color-mix(in srgb, var(--accent) 8%, transparent)",
  border: "1px solid color-mix(in srgb, var(--accent) 25%, transparent)",
  borderRadius: 3,
  padding: "2px 6px",
} as const;

type EditableField = "title" | "startTime" | "endTime" | "location" | "attendees";

export function CalendarEventPreview({ step, isEditable, onParametersUpdate, locale, inPanel }: PreviewProps) {
  const t = useTranslations("execution.preview");
  const params = step.parameters ?? {};

  // Resolve flexible param keys
  const titleKey = params.summary !== undefined ? "summary" : "title";
  const title = (params.summary ?? params.title ?? "") as string;
  const startKey = params.startDateTime !== undefined ? "startDateTime" : "startTime";
  const startTime = (params.startDateTime ?? params.startTime ?? "") as string;
  const endKey = params.endDateTime !== undefined ? "endDateTime" : "endTime";
  const endTime = (params.endDateTime ?? params.endTime ?? "") as string;
  const attendeesKey = params.attendeeEmails !== undefined ? "attendeeEmails" : "attendees";
  const attendees = (params.attendeeEmails ?? params.attendees ?? []) as string[];
  const location = (params.location ?? "") as string;

  // ── Panel mode: week view ────────────────────────────────────────────────
  if (inPanel && startTime) {
    return (
      <CalendarWeekPanel
        weekOf={getMonday(startTime)}
        proposedEvent={{
          title,
          startTime,
          endTime: endTime || new Date(new Date(startTime).getTime() + 3600000).toISOString(),
          attendees,
          location,
        }}
        isEditable={isEditable}
        locale={locale}
        onProposedEventUpdate={(update) => {
          if (!onParametersUpdate) return;
          const next = { ...params };
          if (update.title !== undefined) next[titleKey] = update.title;
          if (update.startTime !== undefined) next[startKey] = update.startTime;
          if (update.endTime !== undefined) next[endKey] = update.endTime;
          if (update.attendees !== undefined) next[attendeesKey] = update.attendees;
          if (update.location !== undefined) next.location = update.location;
          onParametersUpdate(next);
        }}
      />
    );
  }

  // ── Compact inline mode ──────────────────────────────────────────────────
  return (
    <CompactCalendarCard
      title={title}
      titleKey={titleKey}
      startTime={startTime}
      startKey={startKey}
      endTime={endTime}
      endKey={endKey}
      attendees={attendees}
      attendeesKey={attendeesKey}
      location={location}
      params={params}
      isEditable={isEditable}
      onParametersUpdate={onParametersUpdate}
      locale={locale}
      t={t}
    />
  );
}

// ── Panel wrapper: fetches events then renders CalendarWeekView ─────────────

function CalendarWeekPanel({
  weekOf,
  proposedEvent,
  isEditable,
  locale,
  onProposedEventUpdate,
}: {
  weekOf: string;
  proposedEvent: { title: string; startTime: string; endTime: string; attendees: string[]; location?: string };
  isEditable: boolean;
  locale: string;
  onProposedEventUpdate?: (update: {
    title?: string; startTime?: string; endTime?: string; attendees?: string[]; location?: string;
  }) => void;
}) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);

    fetchApi(`/api/calendar-events?weekOf=${encodeURIComponent(weekOf)}`)
      .then((r) => {
        if (!r.ok) throw new Error("fetch failed");
        return r.json();
      })
      .then((data) => {
        if (!cancelled) {
          setEvents(data.events || []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [weekOf]);

  if (error) {
    return (
      <div style={{ padding: 16, fontSize: 12, color: "var(--fg3)" }}>
        Calendar data unavailable — showing event details only.
      </div>
    );
  }

  return (
    <div>
      {loading && (
        <SkeletonGrid />
      )}
      <div style={{ opacity: loading ? 0.4 : 1, transition: "opacity 0.2s" }}>
        <CalendarWeekView
          weekOf={weekOf}
          existingEvents={events}
          proposedEvent={proposedEvent}
          isEditable={isEditable}
          onProposedEventUpdate={onProposedEventUpdate}
          locale={locale}
        />
      </div>
    </div>
  );
}

// ── Skeleton loader ─────────────────────────────────────────────────────────

function SkeletonGrid() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "52px repeat(5, 1fr)", gap: 0, padding: 0 }}>
      <div style={{ height: 20 }} />
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} style={{
          height: 20,
          background: "color-mix(in srgb, var(--fg3) 8%, transparent)",
          borderRadius: 2,
          margin: "4px 2px",
        }} />
      ))}
    </div>
  );
}

// ── Compact inline card (original layout with mini week bar) ────────────────

function CompactCalendarCard({
  title, titleKey, startTime, startKey, endTime, endKey,
  attendees, attendeesKey, location, params,
  isEditable, onParametersUpdate, locale, t,
}: {
  title: string; titleKey: string;
  startTime: string; startKey: string;
  endTime: string; endKey: string;
  attendees: string[]; attendeesKey: string;
  location: string;
  params: Record<string, unknown>;
  isEditable: boolean;
  onParametersUpdate?: (params: Record<string, unknown>) => void;
  locale: string;
  t: ReturnType<typeof useTranslations>;
}) {
  const [showAll, setShowAll] = useState(false);
  const [editingField, setEditingField] = useState<EditableField | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const hasTimes = startTime && endTime;
  const mins = hasTimes ? durationMinutes(startTime, endTime) : 0;
  const shouldCollapse = attendees.length > 5;
  const visibleAttendees = showAll || !shouldCollapse ? attendees : attendees.slice(0, 4);
  const hiddenCount = attendees.length - 4;

  useEffect(() => {
    if (editingField === "attendees") textareaRef.current?.focus();
    else inputRef.current?.focus();
  }, [editingField]);

  function startEdit(field: EditableField) {
    if (!isEditable) return;
    setEditingField(field);
    if (field === "attendees") {
      setEditValue(attendees.join(", "));
    } else if (field === "startTime") {
      setEditValue(startTime ? toLocalDatetimeValue(startTime) : "");
    } else if (field === "endTime") {
      setEditValue(endTime ? toLocalDatetimeValue(endTime) : "");
    } else if (field === "title") {
      setEditValue(title);
    } else {
      setEditValue(location);
    }
  }

  function saveEdit() {
    if (!editingField || !onParametersUpdate) return;
    if (editingField === "attendees") {
      const emails = editValue.split(/[,;\n]/).map(e => e.trim()).filter(Boolean);
      onParametersUpdate({ ...params, [attendeesKey]: emails });
    } else if (editingField === "startTime") {
      onParametersUpdate({ ...params, [startKey]: editValue ? new Date(editValue).toISOString() : "" });
    } else if (editingField === "endTime") {
      onParametersUpdate({ ...params, [endKey]: editValue ? new Date(editValue).toISOString() : "" });
    } else if (editingField === "title") {
      onParametersUpdate({ ...params, [titleKey]: editValue });
    } else {
      onParametersUpdate({ ...params, location: editValue });
    }
    setEditingField(null);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && editingField !== "attendees") {
      e.preventDefault();
      saveEdit();
    } else if (e.key === "Escape") {
      setEditingField(null);
    }
  }

  function renderField(label: string, field: EditableField, displayContent: React.ReactNode, inputType: "text" | "datetime-local" | "textarea" = "text") {
    const isEditing = editingField === field;

    return (
      <div className="flex items-baseline gap-2 group">
        <span style={{ fontSize: 11, color: "var(--fg2)", fontWeight: 500, minWidth: 80 }}>{label}</span>
        {isEditing ? (
          inputType === "textarea" ? (
            <textarea
              ref={textareaRef}
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onBlur={saveEdit}
              onKeyDown={handleKeyDown}
              rows={3}
              style={{ ...editInputStyle, width: "100%", resize: "vertical" }}
            />
          ) : (
            <input
              ref={inputRef}
              type={inputType}
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onBlur={saveEdit}
              onKeyDown={handleKeyDown}
              style={{ ...editInputStyle, width: inputType === "datetime-local" ? "auto" : "100%" }}
            />
          )
        ) : (
          <span
            className={isEditable ? "cursor-pointer" : ""}
            style={{ fontSize: 13, color: "var(--muted)" }}
            onClick={() => startEdit(field)}
          >
            {displayContent}
            {isEditable && (
              <PencilIcon size={11} className="inline ml-1.5 opacity-0 group-hover:opacity-50 transition-opacity" />
            )}
          </span>
        )}
      </div>
    );
  }

  // Mini week bar for inline card
  const eventDayIndex = startTime ? getDayOfWeek(startTime) : -1;

  return (
    <div className="rounded-md overflow-hidden border border-border bg-surface">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-elevated">
        <CalendarIcon size={14} className="text-accent flex-shrink-0" />
        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)" }}>{t("eventTitle")}</span>
        {/* Mini week bar */}
        {startTime && (
          <div className="ml-auto flex items-center gap-0.5">
            {["M", "T", "W", "T", "F", "S", "S"].map((label, i) => (
              <div
                key={i}
                title={["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i]}
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 2,
                  fontSize: 8,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: i === eventDayIndex
                    ? "var(--accent)"
                    : "color-mix(in srgb, var(--fg3) 12%, transparent)",
                  color: i === eventDayIndex ? "white" : "var(--fg3)",
                }}
              >
                {label}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="px-4 py-3 space-y-2.5">
        {/* Title */}
        {editingField === "title" ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={saveEdit}
            onKeyDown={handleKeyDown}
            style={{ ...editInputStyle, width: "100%", fontSize: 15, fontWeight: 600 }}
          />
        ) : (
          <p
            className={`group ${isEditable ? "cursor-pointer" : ""}`}
            style={{ fontSize: 15, fontWeight: 600, color: "var(--foreground)" }}
            onClick={() => startEdit("title")}
          >
            {title}
            {isEditable && (
              <PencilIcon size={11} className="inline ml-1.5 opacity-0 group-hover:opacity-50 transition-opacity" />
            )}
          </p>
        )}

        {/* Date & Time */}
        {hasTimes && (
          <>
            {renderField(t("dateTime"), "startTime",
              <>{formatDate(startTime, locale)} &middot; {formatTime(startTime, locale)}</>,
              "datetime-local",
            )}
            {renderField(t("duration") ?? "End", "endTime",
              <>{formatTime(endTime, locale)}</>,
              "datetime-local",
            )}
          </>
        )}

        {/* Duration display */}
        {hasTimes && mins > 0 && !editingField && (
          <div className="flex items-baseline gap-2">
            <span style={{ fontSize: 11, color: "var(--fg2)", fontWeight: 500, minWidth: 80 }}>&nbsp;</span>
            <span style={{ fontSize: 12, color: "var(--fg3)" }}>
              {mins >= 60
                ? (mins % 60 > 0
                  ? `${t("hours", { count: Math.floor(mins / 60) })} ${t("minutes", { count: mins % 60 })}`
                  : t("hours", { count: Math.floor(mins / 60) }))
                : t("minutes", { count: mins })}
            </span>
          </div>
        )}

        {/* Attendees */}
        {(attendees.length > 0 || isEditable) && (
          editingField === "attendees" ? (
            <div className="flex items-baseline gap-2">
              <span style={{ fontSize: 11, color: "var(--fg2)", fontWeight: 500, minWidth: 80 }}>{t("attendees")}</span>
              <textarea
                ref={textareaRef}
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={saveEdit}
                onKeyDown={handleKeyDown}
                rows={3}
                style={{ ...editInputStyle, width: "100%", resize: "vertical" }}
              />
            </div>
          ) : (
            <div className="flex items-baseline gap-2 group">
              <span style={{ fontSize: 11, color: "var(--fg2)", fontWeight: 500, minWidth: 80 }}>{t("attendees")}</span>
              <div
                className={isEditable ? "cursor-pointer" : ""}
                onClick={() => startEdit("attendees")}
              >
                <span style={{ fontSize: 13, color: "var(--muted)" }}>
                  {visibleAttendees.join(", ")}
                </span>
                {!showAll && shouldCollapse && (
                  <button
                    onClick={e => { e.stopPropagation(); setShowAll(true); }}
                    className="ml-1.5 hover:text-accent transition-colors"
                    style={{ fontSize: 12, color: "var(--accent)" }}
                  >
                    {t("moreAttendees", { count: hiddenCount })}
                  </button>
                )}
                {isEditable && (
                  <PencilIcon size={11} className="inline ml-1.5 opacity-0 group-hover:opacity-50 transition-opacity" />
                )}
              </div>
            </div>
          )
        )}

        {/* Location */}
        {(location || isEditable) && renderField(t("location"), "location", location || "—")}
      </div>
    </div>
  );
}
