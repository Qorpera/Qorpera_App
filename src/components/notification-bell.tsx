"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { formatRelativeTime } from "@/lib/format-helpers";
import { useIsMobile } from "@/hooks/use-media-query";

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  read: boolean;
  sourceType: string | null;
  sourceId: string | null;
  createdAt: string;
}

export function NotificationBell() {
  const t = useTranslations("notifications");
  const locale = useLocale();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?unreadOnly=false&limit=20");
      if (res.ok) {
        const data = await res.json();
        setItems(data.items);
        setUnreadCount(data.unreadCount);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleMarkAllRead = async () => {
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: true }),
      });
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {}
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg text-[var(--fg2)] hover:text-foreground hover:bg-hover transition-colors"
      >
        {/* Bell icon */}
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-accent text-foreground text-[10px] font-bold px-1">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className={
          isMobile
            ? "fixed inset-0 z-50 bg-elevated overflow-y-auto"
            : "absolute right-0 top-full mt-2 w-80 max-h-96 overflow-y-auto rounded-xl border border-border bg-elevated shadow-2xl z-50"
        }>
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            {isMobile && (
              <button
                onClick={() => setOpen(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[var(--fg2)] hover:text-foreground -ml-2"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </button>
            )}
            <span className="text-sm font-medium text-[var(--fg2)]">{t("title")}</span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-accent hover:text-accent transition-colors"
              >
                {t("markAllRead")}
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-xs text-[var(--fg3)]">{t("empty")}</p>
            </div>
          ) : (
            <div>
              {items.map((n) => (
                <div
                  key={n.id}
                  className={`px-4 py-3 border-b border-border last:border-b-0 ${
                    n.read ? "opacity-50" : ""
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!n.read && (
                      <div className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 flex-shrink-0" />
                    )}
                    <div className={!n.read ? "" : "pl-3.5"}>
                      <p className="text-xs font-medium text-foreground">{n.title}</p>
                      <p className="text-xs text-[var(--fg2)] mt-0.5">{n.body}</p>
                      <p className="text-[10px] text-[var(--fg3)] mt-1">{formatRelativeTime(n.createdAt, locale)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
