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

/**
 * True iff [start, end) overlaps any non-all-day event in `events`. Open-end
 * interval semantics (touching boundaries don't collide), which matches how
 * calendar apps treat back-to-back meetings.
 */
function overlapsAnyEvent(start: Date, end: Date, events: CalendarEvent[]): boolean {
  const startMs = start.getTime();
  const endMs = end.getTime();
  for (const ev of events) {
    if (ev.isAllDay) continue;
    const evStartMs = new Date(ev.startTime).getTime();
    const evEndMs = ev.endTime
      ? new Date(ev.endTime).getTime()
      : evStartMs + 60 * 60_000;
    if (startMs < evEndMs && endMs > evStartMs) return true;
  }
  return false;
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
  const gridRef = useRef<HTMLDivElement>(null);

  // ── Drag-to-reschedule state ──
  interface DragState {
    startX: number;
    startY: number;
    origStart: Date;
    origEnd: Date;
    snappedDx: number; // px (snapped to day-column widths)
    snappedDy: number; // px (snapped to 15-min slots)
    isValid: boolean;
    dayWidth: number;
  }
  const [dragState, setDragState] = useState<DragState | null>(null);

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

  // Global mousemove/mouseup while dragging the proposed event.
  useEffect(() => {
    if (!dragState) return;
    const MINS_PER_STEP = 15;
    const PX_PER_MIN = HOUR_HEIGHT / 60;

    const compute = (clientX: number, clientY: number) => {
      const rawDx = clientX - dragState.startX;
      const rawDy = clientY - dragState.startY;
      const dayShift = Math.round(rawDx / dragState.dayWidth);
      const snappedDx = dayShift * dragState.dayWidth;
      const minShift = Math.round(rawDy / PX_PER_MIN / MINS_PER_STEP) * MINS_PER_STEP;
      const snappedDy = minShift * PX_PER_MIN;
      const nextStart = new Date(dragState.origStart.getTime() + dayShift * 86400000 + minShift * 60000);
      const nextEnd = new Date(dragState.origEnd.getTime() + dayShift * 86400000 + minShift * 60000);
      const isValid = !overlapsAnyEvent(nextStart, nextEnd, existingEvents);
      return { snappedDx, snappedDy, dayShift, minShift, nextStart, nextEnd, isValid };
    };

    const onMove = (e: MouseEvent) => {
      const r = compute(e.clientX, e.clientY);
      setDragState((prev) => prev && { ...prev, snappedDx: r.snappedDx, snappedDy: r.snappedDy, isValid: r.isValid });
    };

    const onUp = (e: MouseEvent) => {
      const r = compute(e.clientX, e.clientY);
      const rawDist = Math.hypot(e.clientX - dragState.startX, e.clientY - dragState.startY);
      setDragState(null);
      if (rawDist < 5) {
        // Treat tiny drags as a click → open the popup.
        setEditingProposed(true);
        return;
      }
      if (r.isValid && onProposedEventUpdate && (r.dayShift !== 0 || r.minShift !== 0)) {
        onProposedEventUpdate({
          startTime: r.nextStart.toISOString(),
          endTime: r.nextEnd.toISOString(),
        });
      }
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [dragState, existingEvents, onProposedEventUpdate]);

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
      <div ref={gridRef} style={{ display: "grid", gridTemplateColumns: `52px repeat(${visibleDays}, 1fr)`, position: "relative" }}>
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

                const isBeingDragged = pe.isProposed && dragState != null;
                const dragInvalid = isBeingDragged && dragState && !dragState.isValid;
                const dragTransform = isBeingDragged && dragState
                  ? `translate(${dragState.snappedDx}px, ${dragState.snappedDy}px)`
                  : undefined;

                return (
                  <div
                    key={pe.event.id}
                    title={pe.isProposed
                      ? `NEW: ${pe.event.title}\n${formatTimeShort(evStart, locale)} – ${formatTimeShort(evEnd, locale)}\n${(pe.event as ProposedEvent).attendees?.join(", ") || ""}`
                      : `${pe.event.title}\n${formatTimeShort(evStart, locale)} – ${formatTimeShort(evEnd, locale)}\n${(pe.event as CalendarEvent).attendees?.join(", ") || ""}`}
                    onMouseDown={pe.isProposed && isEditable ? (ev) => {
                      if (!gridRef.current) return;
                      // Day column width = (grid width − 52px time gutter) / visible day cols.
                      const dayWidth = (gridRef.current.clientWidth - 52) / visibleDays;
                      ev.preventDefault();
                      setDragState({
                        startX: ev.clientX,
                        startY: ev.clientY,
                        origStart: new Date(proposedEvent.startTime),
                        origEnd: new Date(proposedEvent.endTime),
                        snappedDx: 0,
                        snappedDy: 0,
                        isValid: true,
                        dayWidth,
                      });
                    } : undefined}
                    style={{
                      position: "absolute",
                      top: adjustedTop,
                      left: `calc(${leftPct}% + 2px)`,
                      width: `calc(${widthPct}% - 4px)`,
                      height: pe.heightPx,
                      borderRadius: 3,
                      padding: "2px 4px",
                      overflow: "hidden",
                      cursor: pe.isProposed && isEditable ? (isBeingDragged ? "grabbing" : "grab") : "default",
                      fontSize: 11,
                      lineHeight: "1.3",
                      userSelect: "none",
                      transform: dragTransform,
                      transition: isBeingDragged ? "none" : "transform 0.12s ease-out",
                      zIndex: isBeingDragged ? 20 : 2,
                      ...(pe.isProposed
                        ? {
                            background: dragInvalid
                              ? "color-mix(in srgb, var(--danger) 24%, transparent)"
                              : "color-mix(in srgb, #3b82f6 22%, transparent)",
                            borderLeft: dragInvalid
                              ? "3px solid var(--danger)"
                              : "3px solid #3b82f6",
                            boxShadow: dragInvalid
                              ? "0 1px 6px color-mix(in srgb, var(--danger) 40%, transparent)"
                              : "0 1px 4px color-mix(in srgb, #3b82f6 30%, transparent)",
                            opacity: dragInvalid ? 0.75 : 1,
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
              <DateTimeSplitInput
                value={editState.startTime}
                onChange={(v) => setEditState((s) => ({ ...s, startTime: v }))}
              />
            </label>
            <label style={{ fontSize: 11, color: "var(--fg2)" }}>
              End
              <DateTimeSplitInput
                value={editState.endTime}
                onChange={(v) => setEditState((s) => ({ ...s, endTime: v }))}
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

// ── Split datetime input: date picker + typed HH:MM ─────────────────────────

function splitLocalDatetime(v: string): { date: string; time: string } {
  const [d, t] = (v || "").split("T");
  return { date: d ?? "", time: (t ?? "").slice(0, 5) };
}

function joinLocalDatetime(date: string, time: string): string {
  // Both halves must be present. Returning "YYYY-MM-DDT" or "THH:MM" would
  // round-trip through `new Date(...).toISOString()` and throw
  // RangeError: Invalid time value on the popup's Save button.
  if (!date || !time) return "";
  return `${date}T${time}`;
}

/**
 * Mask a raw input to "HH:MM": accept up to 4 digits, inject the colon after
 * the hour. Returns the cleaned string. Does NOT enforce valid hour/minute
 * ranges — that's validated on blur.
 */
function maskHHMM(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return digits.slice(0, 2) + ":" + digits.slice(2);
}

function normalizeHHMM(v: string): string {
  const m = v.match(/^(\d{1,2}):?(\d{0,2})$/);
  if (!m) return "";
  const h = Math.min(23, parseInt(m[1] || "0", 10));
  const mm = Math.min(59, parseInt(m[2] || "0", 10));
  return String(h).padStart(2, "0") + ":" + String(mm).padStart(2, "0");
}

function DateTimeSplitInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { date, time } = splitLocalDatetime(value);
  const [localTime, setLocalTime] = useState(time);

  useEffect(() => {
    setLocalTime(time);
  }, [time]);

  const commitTime = (raw: string) => {
    const norm = normalizeHHMM(raw);
    setLocalTime(norm);
    if (norm) onChange(joinLocalDatetime(date, norm));
  };

  return (
    <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
      <input
        type="date"
        value={date}
        onChange={(e) => onChange(joinLocalDatetime(e.target.value, time))}
        style={{ ...popoverInputStyle, marginTop: 0, flex: 2 }}
      />
      <input
        type="text"
        inputMode="numeric"
        placeholder="HH:MM"
        value={localTime}
        onChange={(e) => setLocalTime(maskHHMM(e.target.value))}
        onBlur={(e) => commitTime(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
        style={{ ...popoverInputStyle, marginTop: 0, flex: 1, textAlign: "center", fontVariantNumeric: "tabular-nums" }}
        maxLength={5}
        aria-label="Time (HH:MM)"
      />
    </div>
  );
}
