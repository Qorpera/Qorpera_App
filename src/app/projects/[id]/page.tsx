"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { fetchApi } from "@/lib/fetch-api";

// ── Types ────────────────────────────────────────────────────────────────────

interface ProjectMember {
  id: string;
  userId: string;
  role: string;
  user: { id: string; name: string; email: string };
}

interface Deliverable {
  id: string;
  title: string;
  stage: string;
  confidenceLevel: string | null;
  riskCount: number;
  assignedToId: string | null;
  acceptedById: string | null;
  assignedTo: { id: string; name: string; email: string } | null;
  acceptedBy: { id: string; name: string; email: string } | null;
  acceptedAt: string | null;
  createdAt: string;
}

interface ProjectMessage {
  id: string;
  userId: string;
  content: string;
  createdAt: string;
  user: { id: string; name: string; email: string };
}

interface ProjectNotification {
  id: string;
  type: string;
  content: string;
  readBy: string[];
  createdAt: string;
}

interface ProjectConnector {
  id: string;
  label: string;
  provider: string;
  status: string;
  syncedItemCount: number;
}

interface ChildProject {
  id: string;
  name: string;
  status: string;
  description: string | null;
}

interface ProjectDetail {
  id: string;
  name: string;
  description: string | null;
  status: string;
  dueDate: string | null;
  createdAt: string;
  template: { id: string; name: string; category: string } | null;
  createdBy: { id: string; name: string; email: string };
  members: ProjectMember[];
  connectors: ProjectConnector[];
  notifications: ProjectNotification[];
  messages: ProjectMessage[];
  stageCounts: { intelligence: number; workboard: number; deliverable: number };
  daysLeft: number | null;
  parentProject: { id: string; name: string } | null;
  childProjects: ChildProject[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

function isRecent(dateStr: string, hours = 4): boolean {
  return Date.now() - new Date(dateStr).getTime() < hours * 3600000;
}

const AVATAR_COLORS = [
  "#6366f1", "#8b5cf6", "#a855f7", "#ec4899", "#f43f5e",
  "#f97316", "#eab308", "#22c55e", "#14b8a6", "#06b6d4",
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ── Confidence dot ───────────────────────────────────────────────────────────

function ConfidenceDot({ level }: { level: string | null }) {
  if (!level) {
    return (
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          border: "1.5px solid rgba(255,255,255,0.2)",
          flexShrink: 0,
        }}
      />
    );
  }
  const color =
    level === "high" ? "rgb(52,211,153)" : level === "medium" ? "rgb(250,204,21)" : "rgb(248,113,113)";
  return (
    <span
      style={{
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: color,
        flexShrink: 0,
      }}
    />
  );
}

// ── Dropdown wrapper ─────────────────────────────────────────────────────────

function Dropdown({
  open,
  onClose,
  anchorRef,
  width,
  children,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  width: number;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        ref.current &&
        !ref.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        top: "calc(100% + 6px)",
        right: 0,
        width,
        background: "#1a1a1a",
        border: "0.5px solid rgba(255,255,255,0.1)",
        borderRadius: 10,
        zIndex: 50,
        overflow: "hidden",
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      }}
    >
      {children}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [messages, setMessages] = useState<ProjectMessage[]>([]);
  const [notifications, setNotifications] = useState<ProjectNotification[]>([]);
  const [loading, setLoading] = useState(true);

  // Dropdowns
  const [openDropdown, setOpenDropdown] = useState<"data" | "notif" | null>(null);
  const dataBtnRef = useRef<HTMLButtonElement>(null);
  const notifBtnRef = useRef<HTMLButtonElement>(null);

  // Message input
  const [msgInput, setMsgInput] = useState("");
  const [msgSending, setMsgSending] = useState(false);

  const closeDropdown = useCallback(() => setOpenDropdown(null), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [projRes, delRes, msgRes, notifRes] = await Promise.all([
          fetchApi(`/api/projects/${projectId}`),
          fetchApi(`/api/projects/${projectId}/deliverables`),
          fetchApi(`/api/projects/${projectId}/messages`),
          fetchApi(`/api/projects/${projectId}/notifications`),
        ]);

        if (!cancelled) {
          if (projRes.ok) setProject(await projRes.json());
          if (delRes.ok) {
            const d = await delRes.json();
            setDeliverables(d.deliverables ?? []);
          }
          if (msgRes.ok) {
            const m = await msgRes.json();
            setMessages(m.messages ?? []);
          }
          if (notifRes.ok) {
            const n = await notifRes.json();
            setNotifications(n.notifications ?? []);
          }
        }
      } catch {}
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // ── Send message ──
  const handleSendMessage = useCallback(async () => {
    const text = msgInput.trim();
    if (!text || msgSending) return;
    setMsgInput("");
    setMsgSending(true);
    try {
      const res = await fetchApi(`/api/projects/${projectId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      if (res.ok) {
        const msg = await res.json();
        setMessages((prev) => [msg, ...prev]);
      }
    } catch {}
    setMsgSending(false);
  }, [msgInput, msgSending, projectId]);

  // ── Mark notifications read ──
  const handleOpenNotifications = useCallback(() => {
    if (openDropdown === "notif") {
      setOpenDropdown(null);
      return;
    }
    const unreadIds = notifications
      .filter((n) => n.readBy.length === 0)
      .map((n) => n.id);
    if (unreadIds.length > 0) {
      fetchApi(`/api/projects/${projectId}/notifications/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationIds: unreadIds }),
      }).catch(() => {});
      setNotifications((prev) =>
        prev.map((n) =>
          unreadIds.includes(n.id) ? { ...n, readBy: ["read"] } : n,
        ),
      );
    }
    setOpenDropdown("notif");
  }, [openDropdown, notifications, projectId]);

  // ── New deliverable ──
  const handleNewDeliverable = useCallback(async () => {
    const title = window.prompt("Deliverable title:");
    if (!title?.trim()) return;
    try {
      const res = await fetchApi(`/api/projects/${projectId}/deliverables`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), stage: "workboard" }),
      });
      if (res.ok) {
        const created = await res.json();
        setDeliverables((prev) => [...prev, created]);
      }
    } catch {}
  }, [projectId]);

  // Derived
  const intelligenceItems = deliverables.filter((d) => d.stage === "intelligence");
  const workboardItems = deliverables.filter((d) => d.stage === "workboard");
  const deliverableItems = deliverables.filter((d) => d.stage === "deliverable");
  const readyCount = intelligenceItems.filter((d) => d.confidenceLevel).length;
  const acceptedCount = deliverableItems.filter((d) => d.acceptedById).length;
  const totalDeliverables = deliverables.length;
  const progress = totalDeliverables > 0 ? Math.round((acceptedCount / totalDeliverables) * 100) : 0;
  const hasUnread = notifications.some((n) => n.readBy.length === 0);

  const memberMap = new Map<string, ProjectMember>();
  if (project) {
    for (const m of project.members) memberMap.set(m.userId, m);
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex-shrink-0" style={{ padding: "10px 24px", borderBottom: "0.5px solid rgba(255,255,255,0.06)" }}>
            <div className="animate-pulse" style={{ width: 200, height: 14, borderRadius: 4, background: "rgba(255,255,255,0.06)" }} />
          </div>
          <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", position: "relative" }}>
            <div style={{ position: "absolute", left: "50%", top: 28, bottom: 28, width: 0.5, background: "rgba(255,255,255,0.06)" }} />
            <div style={{ position: "absolute", top: "50%", left: 36, right: 36, height: 0.5, background: "rgba(255,255,255,0.06)" }} />
            {[0,1,2,3].map((q) => (
              <div key={q} style={{ padding: 36, display: "flex", flexDirection: "column", gap: 12 }}>
                <div className="animate-pulse" style={{ width: 100, height: 10, borderRadius: 4, background: "rgba(255,255,255,0.05)", margin: "0 auto" }} />
                <div className="animate-pulse" style={{ width: "80%", height: 40, borderRadius: 8, background: "rgba(255,255,255,0.03)", marginTop: 8 }} />
                <div className="animate-pulse" style={{ width: "60%", height: 40, borderRadius: 8, background: "rgba(255,255,255,0.03)" }} />
              </div>
            ))}
          </div>
        </div>
      </AppShell>
    );
  }

  if (!project) {
    return (
      <AppShell>
        <div className="flex-1 flex items-center justify-center">
          <p style={{ fontSize: 14, color: "var(--fg4)" }}>Project not found</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* ── Top bar ── */}
        <div
          className="flex items-center gap-3 flex-shrink-0"
          style={{
            padding: "10px 24px",
            borderBottom: "0.5px solid rgba(255,255,255,0.06)",
          }}
        >
          {/* Left: back + name */}
          <button
            onClick={() => router.push("/projects")}
            className="flex items-center gap-1 transition-colors"
            style={{ fontSize: 12, color: "var(--fg3)", flexShrink: 0 }}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Projects
          </button>

          {project.parentProject && (
            <>
              <span style={{ fontSize: 12, color: "var(--fg4)" }}>/</span>
              <button
                onClick={() => router.push(`/projects/${project.parentProject!.id}`)}
                className="hover:text-[var(--foreground)] transition-colors"
                style={{ fontSize: 12, color: "var(--fg3)", flexShrink: 0, background: "none", border: "none", cursor: "pointer" }}
              >
                {project.parentProject.name}
              </button>
            </>
          )}

          <div
            style={{
              width: 1,
              height: 18,
              background: "rgba(255,255,255,0.06)",
              flexShrink: 0,
            }}
          />

          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 15,
                fontWeight: 500,
                color: "var(--foreground)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {project.name}
            </div>
            <div style={{ fontSize: 10, color: "var(--fg4)", marginTop: 1 }}>
              {project.template?.category?.toUpperCase() ?? "PROJECT"}
            </div>
          </div>

          <div style={{ flex: 1 }} />

          {/* Right: progress, avatars, data settings, notifications */}
          <div className="flex items-center gap-3" style={{ flexShrink: 0 }}>
            {/* Days remaining + progress */}
            {project.daysLeft != null && (
              <div className="flex items-center gap-2">
                <span
                  style={{
                    fontSize: 11,
                    color: project.daysLeft <= 5 ? "var(--warn)" : "var(--fg3)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {project.daysLeft}d remaining
                </span>
                <div
                  style={{
                    width: 48,
                    height: 3,
                    borderRadius: 2,
                    background: "rgba(255,255,255,0.08)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${progress}%`,
                      height: "100%",
                      borderRadius: 2,
                      background:
                        project.status === "completed"
                          ? "rgb(52,211,153)"
                          : "rgba(255,255,255,0.45)",
                    }}
                  />
                </div>
              </div>
            )}

            {/* Team avatars */}
            <div className="flex items-center" style={{ marginLeft: 4 }}>
              {project.members.slice(0, 5).map((m, i) => (
                <div
                  key={m.id}
                  title={m.user.name}
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    background: avatarColor(m.user.name),
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 9,
                    fontWeight: 600,
                    color: "#fff",
                    marginLeft: i > 0 ? -6 : 0,
                    border:
                      m.role === "owner" || m.role === "reviewer"
                        ? "2px solid rgba(255,255,255,0.5)"
                        : "2px solid rgba(255,255,255,0.15)",
                    zIndex: project.members.length - i,
                    position: "relative",
                  }}
                >
                  {initials(m.user.name)}
                </div>
              ))}
              {project.members.length > 5 && (
                <span style={{ fontSize: 10, color: "var(--fg4)", marginLeft: 4 }}>
                  +{project.members.length - 5}
                </span>
              )}
            </div>

            {/* Data settings */}
            <div style={{ position: "relative" }}>
              <button
                ref={dataBtnRef}
                onClick={() =>
                  setOpenDropdown((prev) => (prev === "data" ? null : "data"))
                }
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  padding: "4px 10px",
                  borderRadius: 5,
                  background: "rgba(255,255,255,0.05)",
                  border: "0.5px solid rgba(255,255,255,0.08)",
                  color: "var(--fg3)",
                  cursor: "pointer",
                }}
                className="hover:brightness-125 transition"
              >
                Data settings
              </button>
              <Dropdown
                open={openDropdown === "data"}
                onClose={closeDropdown}
                anchorRef={dataBtnRef}
                width={340}
              >
                <DataSettingsContent connectors={project.connectors} />
              </Dropdown>
            </div>

            {/* Notification bell */}
            <div style={{ position: "relative" }}>
              <button
                ref={notifBtnRef}
                onClick={handleOpenNotifications}
                style={{
                  position: "relative",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 4,
                  color: "var(--fg3)",
                  display: "flex",
                }}
                className="hover:text-[var(--foreground)] transition-colors"
              >
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                {hasUnread && (
                  <span
                    style={{
                      position: "absolute",
                      top: 2,
                      right: 2,
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "#ef4444",
                    }}
                  />
                )}
              </button>
              <Dropdown
                open={openDropdown === "notif"}
                onClose={closeDropdown}
                anchorRef={notifBtnRef}
                width={300}
              >
                <NotificationsContent notifications={notifications} />
              </Dropdown>
            </div>
          </div>
        </div>

        {/* ── Workstreams (child projects) ── */}
        {project.childProjects && project.childProjects.length > 0 && (
          <div
            style={{
              padding: "12px 24px",
              borderBottom: "0.5px solid rgba(255,255,255,0.06)",
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--fg4)", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 8 }}>
              Workstreams
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {project.childProjects.map((child) => {
                const s =
                  child.status === "completed" ? { bg: "rgba(52,211,153,0.1)", color: "rgb(52,211,153)" }
                  : child.status === "active" ? { bg: "rgba(99,102,241,0.1)", color: "rgb(129,140,248)" }
                  : { bg: "rgba(255,255,255,0.05)", color: "var(--fg3)" };
                return (
                  <button
                    key={child.id}
                    onClick={() => router.push(`/projects/${child.id}`)}
                    className="hover:brightness-125 transition"
                    style={{
                      padding: "6px 12px",
                      borderRadius: 6,
                      background: s.bg,
                      border: "0.5px solid rgba(255,255,255,0.06)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span style={{ fontSize: 12, color: s.color, fontWeight: 500 }}>{child.name}</span>
                    <span style={{ fontSize: 10, color: "var(--fg4)" }}>{child.status}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Quadrant grid ── */}
        <div
          style={{
            flex: 1,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gridTemplateRows: "1fr 1fr",
            position: "relative",
            minHeight: 0,
          }}
        >
          {/* Vertical divider */}
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: 28,
              bottom: 28,
              width: 0.5,
              background: "rgba(255,255,255,0.06)",
              pointerEvents: "none",
              zIndex: 1,
            }}
          />
          {/* Horizontal divider */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: 36,
              right: 36,
              height: 0.5,
              background: "rgba(255,255,255,0.06)",
              pointerEvents: "none",
              zIndex: 1,
            }}
          />

          {/* Top-left: Communication */}
          <div
            style={{
              padding: "16px 28px 28px 36px",
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              overflow: "hidden",
            }}
          >
            <QuadrantTitle label="COMMUNICATION" />
            <div style={{ flex: 1, overflowY: "auto", marginTop: 10 }}>
              {messages.length === 0 ? (
                <p style={{ fontSize: 12, color: "var(--fg4)", textAlign: "center", paddingTop: 24, lineHeight: 1.5 }}>
                  No messages yet.<br />Start a discussion with your team.
                </p>
              ) : (
                messages.map((msg) => (
                  <MessageRow key={msg.id} msg={msg} />
                ))
              )}
            </div>
            {/* Message input */}
            <div className="flex items-center gap-2" style={{ marginTop: 8, flexShrink: 0 }}>
              <input
                value={msgInput}
                onChange={(e) => setMsgInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                placeholder="Write a message..."
                style={{
                  flex: 1,
                  background: "rgba(255,255,255,0.04)",
                  border: "0.5px solid rgba(255,255,255,0.08)",
                  borderRadius: 6,
                  padding: "6px 10px",
                  fontSize: 12,
                  color: "var(--foreground)",
                  outline: "none",
                }}
              />
              <button
                onClick={handleSendMessage}
                disabled={!msgInput.trim() || msgSending}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 5,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: msgInput.trim() ? "var(--btn-primary-bg)" : "rgba(255,255,255,0.05)",
                  color: msgInput.trim() ? "var(--btn-primary-text)" : "var(--fg4)",
                  border: "none",
                  cursor: msgInput.trim() ? "pointer" : "default",
                  flexShrink: 0,
                  transition: "background 0.15s, color 0.15s",
                }}
              >
                <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
                </svg>
              </button>
            </div>
          </div>

          {/* Top-right: Intelligence */}
          <div
            style={{
              padding: "16px 36px 28px 28px",
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              overflow: "hidden",
            }}
          >
            <QuadrantTitle
              label="INTELLIGENCE"
              badge={readyCount > 0 ? `${readyCount} ready` : undefined}
            />
            <div style={{ flex: 1, overflowY: "auto", marginTop: 10 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))",
                  gap: 8,
                }}
              >
                {intelligenceItems.map((d) => (
                  <IntelligenceCard
                    key={d.id}
                    deliverable={d}
                    onClick={() =>
                      router.push(`/projects/${projectId}/deliverable/${d.id}`)
                    }
                  />
                ))}
              </div>
              {intelligenceItems.length === 0 && (
                <p style={{ fontSize: 12, color: "var(--fg4)", textAlign: "center", paddingTop: 24 }}>
                  All analyses are in review or complete
                </p>
              )}
            </div>
          </div>

          {/* Bottom-left: Workboard */}
          <div
            style={{
              padding: "28px 28px 16px 36px",
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              overflow: "hidden",
            }}
          >
            <div className="flex items-center justify-center gap-2">
              <QuadrantTitle
                label="WORKBOARD"
                badge={
                  workboardItems.length > 0
                    ? `${workboardItems.length} in review`
                    : undefined
                }
              />
              <button
                onClick={handleNewDeliverable}
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  padding: "2px 7px",
                  borderRadius: 4,
                  background: "rgba(255,255,255,0.05)",
                  border: "0.5px solid rgba(255,255,255,0.08)",
                  color: "var(--fg4)",
                  cursor: "pointer",
                }}
                className="hover:brightness-125 transition"
              >
                + New
              </button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", marginTop: 10 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))",
                  gap: 8,
                }}
              >
                {workboardItems.map((d) => (
                  <WorkboardCard
                    key={d.id}
                    deliverable={d}
                    members={memberMap}
                    onClick={() =>
                      router.push(`/projects/${projectId}/deliverable/${d.id}`)
                    }
                  />
                ))}
              </div>
              {workboardItems.length === 0 && (
                <p style={{ fontSize: 12, color: "var(--fg4)", textAlign: "center", paddingTop: 24 }}>
                  Pull items from Intelligence to begin review
                </p>
              )}
            </div>
          </div>

          {/* Bottom-right: Deliverables */}
          <div
            style={{
              padding: "28px 36px 16px 28px",
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              overflow: "hidden",
            }}
          >
            <QuadrantTitle
              label="DELIVERABLES"
              badge={
                acceptedCount > 0
                  ? `${acceptedCount} accepted`
                  : undefined
              }
            />
            <div style={{ flex: 1, overflowY: "auto", marginTop: 10 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))",
                  gap: 8,
                }}
              >
                {deliverableItems.map((d) => (
                  <DeliverableCard
                    key={d.id}
                    deliverable={d}
                    onClick={() =>
                      router.push(`/projects/${projectId}/deliverable/${d.id}`)
                    }
                  />
                ))}
              </div>
              {deliverableItems.length === 0 && (
                <p style={{ fontSize: 12, color: "var(--fg4)", textAlign: "center", paddingTop: 24 }}>
                  Accepted deliverables will appear here
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

// ── Quadrant title ───────────────────────────────────────────────────────────

function QuadrantTitle({ label, badge }: { label: string; badge?: string }) {
  return (
    <div className="flex items-center justify-center gap-2">
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.06em",
          color: "rgba(255,255,255,0.3)",
        }}
      >
        {label}
      </span>
      {badge && (
        <span
          style={{
            fontSize: 10,
            fontWeight: 500,
            padding: "1px 6px",
            borderRadius: 4,
            background: "rgba(255,255,255,0.06)",
            color: "rgba(255,255,255,0.4)",
          }}
        >
          {badge}
        </span>
      )}
    </div>
  );
}

// ── Message row ──────────────────────────────────────────────────────────────

function MessageRow({ msg }: { msg: ProjectMessage }) {
  const [hovered, setHovered] = useState(false);
  const recent = isRecent(msg.createdAt);
  const subject = msg.content.split(/[.!?\n]/)[0] || msg.content;
  const preview =
    msg.content.length > subject.length
      ? msg.content.slice(subject.length).replace(/^[.!?\s]+/, "").slice(0, 80)
      : "";

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "10px 0",
        borderBottom: "0.5px solid rgba(255,255,255,0.025)",
        background: hovered ? "rgba(255,255,255,0.035)" : "transparent",
        transition: "background 0.1s",
        cursor: "default",
        borderRadius: hovered ? 4 : 0,
        margin: hovered ? "0 -6px" : 0,
        paddingLeft: hovered ? 6 : 0,
        paddingRight: hovered ? 6 : 0,
      }}
    >
      <div className="flex items-center gap-2 mb-0.5">
        <span
          style={{
            fontSize: 12,
            fontWeight: recent ? 600 : 400,
            color: recent ? "var(--foreground)" : "var(--fg2)",
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {subject}
        </span>
        <span style={{ fontSize: 10, color: "var(--fg4)", flexShrink: 0 }}>
          {timeAgo(msg.createdAt)}
        </span>
      </div>
      <div
        style={{
          fontSize: 11,
          color: "var(--fg4)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {msg.user.name}
        {preview && (
          <span style={{ color: "var(--fg4)", marginLeft: 4, opacity: 0.7 }}>
            — {preview}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Intelligence card ────────────────────────────────────────────────────────

function IntelligenceCard({
  deliverable: d,
  onClick,
}: {
  deliverable: Deliverable;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  let statusText: string;
  if (!d.confidenceLevel) {
    statusText = d.riskCount > 0 ? `${d.riskCount} risks found` : "Queued";
  } else {
    statusText =
      d.riskCount > 0 ? `${d.riskCount} risks found` : "Analysis complete";
  }

  // If no confidence and no risks, show "Analyzing..."
  if (!d.confidenceLevel && d.riskCount === 0) {
    statusText = "Analyzing...";
  }

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered
          ? "rgba(255,255,255,0.06)"
          : "rgba(255,255,255,0.035)",
        border: hovered
          ? "0.5px solid rgba(255,255,255,0.12)"
          : "0.5px solid rgba(255,255,255,0.07)",
        borderRadius: 8,
        padding: "12px 14px",
        textAlign: "left",
        cursor: "pointer",
        transition: "background 0.15s, border-color 0.15s",
      }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <ConfidenceDot level={d.confidenceLevel} />
        <span
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: "var(--foreground)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
          }}
        >
          {d.title}
        </span>
      </div>
      <div style={{ fontSize: 11, color: "var(--fg4)" }}>{statusText}</div>
    </button>
  );
}

// ── Workboard card ───────────────────────────────────────────────────────────

function WorkboardCard({
  deliverable: d,
  members,
  onClick,
}: {
  deliverable: Deliverable;
  members: Map<string, ProjectMember>;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const assignee = d.assignedToId ? members.get(d.assignedToId) : null;

  let statusText: string;
  if (d.riskCount > 0) statusText = "needs attention";
  else if (d.confidenceLevel === "high") statusText = "ready to accept";
  else statusText = "in review";

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered
          ? "rgba(255,255,255,0.06)"
          : "rgba(255,255,255,0.035)",
        border: hovered
          ? "0.5px solid rgba(255,255,255,0.12)"
          : "0.5px solid rgba(255,255,255,0.07)",
        borderRadius: 8,
        padding: "12px 14px",
        textAlign: "left",
        cursor: "pointer",
        transition: "background 0.15s, border-color 0.15s",
      }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        {assignee ? (
          <div
            title={assignee.user.name}
            style={{
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: avatarColor(assignee.user.name),
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 7,
              fontWeight: 700,
              color: "#fff",
              flexShrink: 0,
            }}
          >
            {initials(assignee.user.name)}
          </div>
        ) : (
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: "50%",
              border: "1.5px solid rgba(255,255,255,0.15)",
              flexShrink: 0,
            }}
          />
        )}
        <span
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: "var(--foreground)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
          }}
        >
          {d.title}
        </span>
      </div>
      <div style={{ fontSize: 11, color: "var(--fg4)" }}>{statusText}</div>
    </button>
  );
}

// ── Deliverable card ─────────────────────────────────────────────────────────

function DeliverableCard({
  deliverable: d,
  onClick,
}: {
  deliverable: Deliverable;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  const acceptedName = d.acceptedBy?.name ?? "Unknown";
  const acceptedDate = d.acceptedAt ? timeAgo(d.acceptedAt) : "";

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered
          ? "rgba(255,255,255,0.06)"
          : "rgba(255,255,255,0.035)",
        border: hovered
          ? "0.5px solid rgba(255,255,255,0.12)"
          : "0.5px solid rgba(255,255,255,0.07)",
        borderRadius: 8,
        padding: "12px 14px",
        textAlign: "left",
        cursor: "pointer",
        transition: "background 0.15s, border-color 0.15s",
      }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <svg
          width={14}
          height={14}
          viewBox="0 0 24 24"
          fill="none"
          stroke="rgb(52,211,153)"
          strokeWidth={2.5}
          style={{ flexShrink: 0 }}
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
        <span
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: "var(--foreground)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
          }}
        >
          {d.title}
        </span>
      </div>
      <div style={{ fontSize: 11, color: "var(--fg4)" }}>
        Accepted by {acceptedName}
        {acceptedDate && ` · ${acceptedDate}`}
      </div>
    </button>
  );
}

// ── Data settings dropdown content ───────────────────────────────────────────

function DataSettingsContent({ connectors }: { connectors: ProjectConnector[] }) {
  const totalItems = connectors.reduce((sum, c) => sum + c.syncedItemCount, 0);

  return (
    <div>
      <div
        style={{
          padding: "12px 16px 8px",
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.06em",
          color: "rgba(255,255,255,0.3)",
          textTransform: "uppercase",
        }}
      >
        DATA SOURCES
      </div>
      {connectors.map((c) => (
        <div
          key={c.id}
          className="flex items-center gap-2"
          style={{
            padding: "8px 16px",
            borderTop: "0.5px solid rgba(255,255,255,0.05)",
          }}
        >
          <span
            style={{
              fontSize: 12,
              color: "var(--foreground)",
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {c.label}
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 500,
              padding: "1px 6px",
              borderRadius: 3,
              background:
                c.status === "synced"
                  ? "rgba(52,211,153,0.12)"
                  : c.status === "syncing"
                    ? "rgba(250,204,21,0.12)"
                    : "rgba(255,255,255,0.06)",
              color:
                c.status === "synced"
                  ? "rgb(52,211,153)"
                  : c.status === "syncing"
                    ? "rgb(250,204,21)"
                    : "var(--fg4)",
            }}
          >
            {c.status}
          </span>
          <span style={{ fontSize: 10, color: "var(--fg4)" }}>
            {c.syncedItemCount > 0 ? `${c.syncedItemCount} items` : ""}
          </span>
        </div>
      ))}
      {connectors.length === 0 && (
        <div style={{ padding: "12px 16px", fontSize: 12, color: "var(--fg4)" }}>
          No connectors configured
        </div>
      )}
      <div
        style={{
          padding: "8px 16px",
          borderTop: "0.5px solid rgba(255,255,255,0.05)",
          fontSize: 11,
          color: "var(--fg4)",
        }}
      >
        {totalItems > 0 ? `${totalItems} synced items total` : ""}
      </div>
      <div
        style={{
          padding: "10px 16px",
          borderTop: "0.5px solid rgba(255,255,255,0.05)",
        }}
      >
        <button
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: "var(--fg2)",
            background: "rgba(255,255,255,0.05)",
            border: "0.5px solid rgba(255,255,255,0.08)",
            borderRadius: 5,
            padding: "5px 10px",
            cursor: "pointer",
            width: "100%",
          }}
          className="hover:brightness-125 transition"
        >
          + Add connector or upload files
        </button>
      </div>
    </div>
  );
}

// ── Notifications dropdown content ───────────────────────────────────────────

function NotificationsContent({
  notifications,
}: {
  notifications: ProjectNotification[];
}) {
  return (
    <div>
      <div
        style={{
          padding: "12px 16px 8px",
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.06em",
          color: "rgba(255,255,255,0.3)",
          textTransform: "uppercase",
        }}
      >
        NOTIFICATIONS
      </div>
      {notifications.length === 0 && (
        <div style={{ padding: "12px 16px", fontSize: 12, color: "var(--fg4)" }}>
          No notifications
        </div>
      )}
      {notifications.map((n) => (
        <div
          key={n.id}
          style={{
            padding: "8px 16px",
            borderTop: "0.5px solid rgba(255,255,255,0.05)",
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: n.readBy.length === 0 ? "var(--foreground)" : "var(--fg3)",
              fontWeight: n.readBy.length === 0 ? 500 : 400,
              lineHeight: 1.4,
            }}
          >
            {n.content}
          </div>
          <div style={{ fontSize: 10, color: "var(--fg4)", marginTop: 2 }}>
            {timeAgo(n.createdAt)}
          </div>
        </div>
      ))}
    </div>
  );
}
