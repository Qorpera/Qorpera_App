"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { formatDate } from "@/lib/format-helpers";
import type { PreviewProps } from "./get-preview-component";

function CalendarIcon({ size = 14, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M8 2v4M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" />
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

export function CalendarEventPreview({ step, locale }: PreviewProps) {
  const t = useTranslations("execution.preview");
  const params = step.parameters ?? {};
  const [showAll, setShowAll] = useState(false);

  const title = (params.title ?? "") as string;
  const startTime = (params.startTime ?? "") as string;
  const endTime = (params.endTime ?? "") as string;
  const attendees = (params.attendees ?? []) as string[];
  const location = (params.location ?? "") as string;

  const hasTimes = startTime && endTime;
  const mins = hasTimes ? durationMinutes(startTime, endTime) : 0;
  const shouldCollapse = attendees.length > 5;
  const visibleAttendees = showAll || !shouldCollapse ? attendees : attendees.slice(0, 4);
  const hiddenCount = attendees.length - 4;

  return (
    <div className="rounded-md overflow-hidden border border-border bg-surface">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-elevated">
        <CalendarIcon size={14} className="text-accent flex-shrink-0" />
        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--muted)" }}>{t("eventTitle")}</span>
      </div>

      <div className="px-4 py-3 space-y-2.5">
        {/* Title */}
        <p style={{ fontSize: 15, fontWeight: 600, color: "var(--foreground)" }}>{title}</p>

        {/* Date & Time */}
        {hasTimes && (
          <div className="flex items-baseline gap-2">
            <span style={{ fontSize: 11, color: "var(--fg2)", fontWeight: 500, minWidth: 80 }}>{t("dateTime")}</span>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>
              {formatDate(startTime, locale)} &middot; {formatTime(startTime, locale)} – {formatTime(endTime, locale)}
            </span>
          </div>
        )}

        {/* Duration */}
        {hasTimes && mins > 0 && (
          <div className="flex items-baseline gap-2">
            <span style={{ fontSize: 11, color: "var(--fg2)", fontWeight: 500, minWidth: 80 }}>{t("duration")}</span>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>
              {mins >= 60
                ? (mins % 60 > 0
                  ? `${t("hours", { count: Math.floor(mins / 60) })} ${t("minutes", { count: mins % 60 })}`
                  : t("hours", { count: Math.floor(mins / 60) }))
                : t("minutes", { count: mins })}
            </span>
          </div>
        )}

        {/* Attendees */}
        {attendees.length > 0 && (
          <div className="flex items-baseline gap-2">
            <span style={{ fontSize: 11, color: "var(--fg2)", fontWeight: 500, minWidth: 80 }}>{t("attendees")}</span>
            <div>
              <span style={{ fontSize: 13, color: "var(--muted)" }}>
                {visibleAttendees.join(", ")}
              </span>
              {!showAll && shouldCollapse && (
                <button
                  onClick={() => setShowAll(true)}
                  className="ml-1.5 hover:text-accent transition-colors"
                  style={{ fontSize: 12, color: "var(--accent)" }}
                >
                  {t("moreAttendees", { count: hiddenCount })}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Location */}
        {location && (
          <div className="flex items-baseline gap-2">
            <span style={{ fontSize: 11, color: "var(--fg2)", fontWeight: 500, minWidth: 80 }}>{t("location")}</span>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>{location}</span>
          </div>
        )}
      </div>
    </div>
  );
}
