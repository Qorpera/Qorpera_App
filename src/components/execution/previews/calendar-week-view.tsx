"use client";

import { useState, useRef, useEffect, useMemo } from "react";

// ── Types ───────────────────────────────────────────────────────────────────

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string | null;
  durationMinutes: number | null;
  attendees: string[];
  location?: string;
  isAllDay: boolean;
}

interface ProposedEvent {
  title: string;
  startTime: string;
  endTime: string;
  attendees: string[];
  location?: string;
}

export interface CalendarWeekViewProps {
  weekOf: string;
  existingEvents: CalendarEvent[];
  proposedEvent: ProposedEvent;
  isEditable: boolean;
  onProposedEventUpdate?: (update: Partial<ProposedEvent>) => void;
  locale: string;
}

// ── Constants ───────────────────────────────────────────────────────────────

const HOUR_HEIGHT = 48;
const DEFAULT_START_HOUR = 7;
const DEFAULT_END_HOUR = 19;
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ── Helpers ─────────────────────────────────────────────────────────────────

function getMonday(dateStr: string): Date {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isToday(d: Date): boolean {
  return isSameDay(d, new Date());
}

function isWeekend(dayIndex: number): boolean {
  return dayIndex >= 5;
}

function timeToMinutes(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function formatHour(hour: number): string {
  return String(hour).padStart(2, "0") + ":00";
}

function formatTimeShort(date: Date, locale: string): string {
  return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

interface PositionedEvent {
  event: CalendarEvent | (ProposedEvent & { id: string });
  dayIndex: number;
  topPx: number;
  heightPx: number;
  isProposed: boolean;
  column: number;
  totalColumns: number;
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

// ── Component ───────────────────────────────────────────────────────────────

export function CalendarWeekView({
  weekOf,
  existingEvents,
  proposedEvent,
  isEditable,
  onProposedEventUpdate,
  locale,
}: CalendarWeekViewProps) {
  const [editingProposed, setEditingProposed] = useState(false);
  const [editState, setEditState] = useState({
    title: proposedEvent.title,
    startTime: toLocalDatetimeValue(proposedEvent.startTime),
    endTime: toLocalDatetimeValue(proposedEvent.endTime),
    attendees: proposedEvent.attendees.join(", "),
    location: proposedEvent.location || "",
  });
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setEditState({
      title: proposedEvent.title,
      startTime: toLocalDatetimeValue(proposedEvent.startTime),
      endTime: toLocalDatetimeValue(proposedEvent.endTime),
      attendees: proposedEvent.attendees.join(", "),
      location: proposedEvent.location || "",
    });
  }, [proposedEvent.title, proposedEvent.startTime, proposedEvent.endTime, proposedEvent.attendees, proposedEvent.location]);

  // Close popover on outside click
  useEffect(() => {
    if (!editingProposed) return;
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setEditingProposed(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [editingProposed]);

  const monday = useMemo(() => getMonday(weekOf), [weekOf]);
  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [monday]);

  // Position events on the grid
  const positioned = useMemo(() => {
    const allEvents: PositionedEvent[] = [];

    function addEvent(ev: CalendarEvent | (ProposedEvent & { id: string }), proposed: boolean) {
      const start = new Date(ev.startTime);
      const endStr = ev.endTime || (("durationMinutes" in ev && ev.durationMinutes)
        ? new Date(start.getTime() + (ev as CalendarEvent).durationMinutes! * 60_000).toISOString()
        : new Date(start.getTime() + 60 * 60_000).toISOString());
      const end = new Date(endStr);

      const dayIndex = days.findIndex((d) => isSameDay(d, start));
      if (dayIndex < 0) return;

      const startMin = timeToMinutes(start);
      const endMin = timeToMinutes(end);
      const durationMin = Math.max(endMin - startMin, 30);

      const topPx = ((startMin - DEFAULT_START_HOUR * 60) / 60) * HOUR_HEIGHT;
      const heightPx = Math.max((durationMin / 60) * HOUR_HEIGHT, 24);

      allEvents.push({
        event: ev,
        dayIndex,
        topPx,
        heightPx,
        isProposed: proposed,
        column: 0,
        totalColumns: 1,
      });
    }

    for (const ev of existingEvents) {
      if (!ev.isAllDay) addEvent(ev, false);
    }
    addEvent({ ...proposedEvent, id: "__proposed__" }, true);

    // Resolve overlaps per day
    for (let d = 0; d < 7; d++) {
      const dayEvents = allEvents.filter((e) => e.dayIndex === d);
      dayEvents.sort((a, b) => a.topPx - b.topPx);

      const groups: PositionedEvent[][] = [];
      let currentGroup: PositionedEvent[] = [];

      for (const ev of dayEvents) {
        if (currentGroup.length === 0) {
          currentGroup.push(ev);
          continue;
        }
        const last = currentGroup[currentGroup.length - 1];
        if (ev.topPx < last.topPx + last.heightPx) {
          currentGroup.push(ev);
        } else {
          groups.push(currentGroup);
          currentGroup = [ev];
        }
      }
      if (currentGroup.length > 0) groups.push(currentGroup);

      for (const group of groups) {
        for (let i = 0; i < group.length; i++) {
          group[i].column = i;
          group[i].totalColumns = group.length;
        }
      }
    }

    return allEvents;
  }, [existingEvents, proposedEvent, days]);

  // Determine visible hour range
  const { startHour, endHour } = useMemo(() => {
    let minH = DEFAULT_START_HOUR;
    let maxH = DEFAULT_END_HOUR;
    for (const pe of positioned) {
      const startMin = (pe.topPx / HOUR_HEIGHT) * 60 + DEFAULT_START_HOUR * 60;
      const endMin = startMin + (pe.heightPx / HOUR_HEIGHT) * 60;
      minH = Math.min(minH, Math.floor(startMin / 60));
      maxH = Math.max(maxH, Math.ceil(endMin / 60));
    }
    return { startHour: Math.max(0, minH), endHour: Math.min(24, maxH) };
  }, [positioned]);

  const totalHours = endHour - startHour;
  const gridHeight = totalHours * HOUR_HEIGHT;

  // Check if weekends have events
  const hasWeekendEvents = positioned.some((e) => e.dayIndex >= 5);
  const visibleDays = hasWeekendEvents ? 7 : 5;

  function saveEdit() {
    if (!onProposedEventUpdate) return;
    onProposedEventUpdate({
      title: editState.title,
      startTime: editState.startTime ? new Date(editState.startTime).toISOString() : undefined,
      endTime: editState.endTime ? new Date(editState.endTime).toISOString() : undefined,
      attendees: editState.attendees.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean),
      location: editState.location || undefined,
    });
    setEditingProposed(false);
  }

  return (
    <div style={{ fontSize: 12, color: "var(--foreground)", position: "relative" }}>
      {/* Header row */}
      <div style={{ display: "grid", gridTemplateColumns: `52px repeat(${visibleDays}, 1fr)`, borderBottom: "1px solid var(--border)" }}>
        <div style={{ padding: "6px 4px", fontSize: 10, color: "var(--fg3)" }} />
        {days.slice(0, visibleDays).map((d, i) => (
          <div
            key={i}
            style={{
              padding: "6px 4px",
              textAlign: "center",
              fontWeight: 500,
              fontSize: 11,
              color: isToday(d) ? "var(--accent)" : "var(--fg2)",
              background: isToday(d)
                ? "color-mix(in srgb, var(--accent) 6%, transparent)"
                : isWeekend(i) ? "color-mix(in srgb, var(--fg3) 4%, transparent)" : undefined,
            }}
          >
            {DAY_LABELS[i]} {d.getDate()}
          </div>
        ))}
      </div>

      {/* Grid body */}
      <div style={{ display: "grid", gridTemplateColumns: `52px repeat(${visibleDays}, 1fr)`, position: "relative" }}>
        {/* Time labels */}
        <div style={{ position: "relative", height: gridHeight }}>
          {Array.from({ length: totalHours }, (_, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                top: i * HOUR_HEIGHT,
                right: 4,
                fontSize: 10,
                color: "var(--fg3)",
                lineHeight: "1",
                transform: "translateY(-5px)",
              }}
            >
              {formatHour(startHour + i)}
            </div>
          ))}
        </div>

        {/* Day columns */}
        {days.slice(0, visibleDays).map((d, dayIdx) => (
          <div
            key={dayIdx}
            style={{
              position: "relative",
              height: gridHeight,
              borderLeft: "1px solid var(--border)",
              background: isToday(d)
                ? "color-mix(in srgb, var(--accent) 4%, transparent)"
                : isWeekend(dayIdx) ? "color-mix(in srgb, var(--fg3) 3%, transparent)" : undefined,
            }}
          >
            {/* Hour grid lines */}
            {Array.from({ length: totalHours }, (_, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  top: i * HOUR_HEIGHT,
                  left: 0,
                  right: 0,
                  borderTop: "1px solid color-mix(in srgb, var(--border) 50%, transparent)",
                }}
              />
            ))}

            {/* Event blocks */}
            {positioned
              .filter((pe) => pe.dayIndex === dayIdx)
              .map((pe) => {
                const adjustedTop = pe.topPx - (startHour - DEFAULT_START_HOUR) * HOUR_HEIGHT;
                const widthPct = 100 / pe.totalColumns;
                const leftPct = pe.column * widthPct;
                const evStart = new Date(pe.event.startTime);
                const evEndStr = pe.event.endTime || new Date(evStart.getTime() + 3600000).toISOString();
                const evEnd = new Date(evEndStr);

                return (
                  <div
                    key={pe.event.id}
                    title={pe.isProposed
                      ? `NEW: ${pe.event.title}\n${formatTimeShort(evStart, locale)} – ${formatTimeShort(evEnd, locale)}\n${(pe.event as ProposedEvent).attendees?.join(", ") || ""}`
                      : `${pe.event.title}\n${formatTimeShort(evStart, locale)} – ${formatTimeShort(evEnd, locale)}\n${(pe.event as CalendarEvent).attendees?.join(", ") || ""}`}
                    onClick={pe.isProposed && isEditable ? () => setEditingProposed(true) : undefined}
                    style={{
                      position: "absolute",
                      top: adjustedTop,
                      left: `calc(${leftPct}% + 2px)`,
                      width: `calc(${widthPct}% - 4px)`,
                      height: pe.heightPx,
                      borderRadius: 3,
                      padding: "2px 4px",
                      overflow: "hidden",
                      cursor: pe.isProposed && isEditable ? "pointer" : "default",
                      fontSize: 11,
                      lineHeight: "1.3",
                      ...(pe.isProposed
                        ? {
                            background: "color-mix(in srgb, #3b82f6 22%, transparent)",
                            borderLeft: "3px solid #3b82f6",
                            boxShadow: "0 1px 4px color-mix(in srgb, #3b82f6 30%, transparent)",
                          }
                        : {
                            background: "color-mix(in srgb, var(--fg3) 15%, transparent)",
                            borderLeft: "3px solid var(--fg3)",
                          }),
                    }}
                  >
                    {pe.isProposed && (
                      <span style={{
                        position: "absolute",
                        top: 2,
                        right: 3,
                        fontSize: 8,
                        fontWeight: 700,
                        color: "#3b82f6",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                      }}>
                        NEW
                      </span>
                    )}
                    <div style={{
                      color: pe.isProposed ? "#3b82f6" : "var(--foreground)",
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      paddingRight: pe.isProposed ? 28 : 0,
                    }}>
                      {pe.event.title}
                    </div>
                    {pe.heightPx > 30 && (
                      <div style={{ color: "var(--fg3)", fontSize: 10 }}>
                        {formatTimeShort(evStart, locale)} – {formatTimeShort(evEnd, locale)}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        ))}
      </div>

      {/* Edit popover */}
      {editingProposed && isEditable && (
        <div
          ref={popoverRef}
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: 16,
            boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
            zIndex: 50,
            width: 280,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: "var(--foreground)" }}>
            Edit proposed event
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ fontSize: 11, color: "var(--fg2)" }}>
              Title
              <input
                value={editState.title}
                onChange={(e) => setEditState((s) => ({ ...s, title: e.target.value }))}
                style={popoverInputStyle}
              />
            </label>
            <label style={{ fontSize: 11, color: "var(--fg2)" }}>
              Start
              <input
                type="datetime-local"
                value={editState.startTime}
                onChange={(e) => setEditState((s) => ({ ...s, startTime: e.target.value }))}
                style={popoverInputStyle}
              />
            </label>
            <label style={{ fontSize: 11, color: "var(--fg2)" }}>
              End
              <input
                type="datetime-local"
                value={editState.endTime}
                onChange={(e) => setEditState((s) => ({ ...s, endTime: e.target.value }))}
                style={popoverInputStyle}
              />
            </label>
            <label style={{ fontSize: 11, color: "var(--fg2)" }}>
              Attendees
              <textarea
                value={editState.attendees}
                onChange={(e) => setEditState((s) => ({ ...s, attendees: e.target.value }))}
                rows={2}
                style={{ ...popoverInputStyle, resize: "vertical" }}
              />
            </label>
            <label style={{ fontSize: 11, color: "var(--fg2)" }}>
              Location
              <input
                value={editState.location}
                onChange={(e) => setEditState((s) => ({ ...s, location: e.target.value }))}
                style={popoverInputStyle}
              />
            </label>
            <div style={{ display: "flex", gap: 8, marginTop: 4, justifyContent: "flex-end" }}>
              <button
                onClick={() => setEditingProposed(false)}
                style={{
                  fontSize: 12,
                  padding: "4px 12px",
                  borderRadius: 4,
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--fg2)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                style={{
                  fontSize: 12,
                  padding: "4px 12px",
                  borderRadius: 4,
                  border: "none",
                  background: "var(--accent)",
                  color: "white",
                  cursor: "pointer",
                  fontWeight: 500,
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const popoverInputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 2,
  fontSize: 13,
  padding: "4px 8px",
  borderRadius: 4,
  border: "1px solid var(--border)",
  background: "color-mix(in srgb, var(--accent) 5%, transparent)",
  color: "var(--foreground)",
  outline: "none",
};
