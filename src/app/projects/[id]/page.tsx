"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { fetchApi } from "@/lib/fetch-api";

// ── Types ────────────────────────────────────────────────────────────────────

interface DeliverableSummary {
  id: string;
  slug: string;
  title: string;
  stage: string;
  status: string;
  confidenceLevel: string | null;
  riskCount: number;
  assignedToSlug: string | null;
  assignedToName: string | null;
  acceptedBySlug: string | null;
  acceptedByName: string | null;
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

interface ChildProjectSummary {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: string;
  priority: string | null;
  ownerSlug: string | null;
  ownerName: string | null;
  deliverableCount: number;
}

interface DeliverableBuckets {
  intelligence: DeliverableSummary[];
  workboard: DeliverableSummary[];
  deliverable: DeliverableSummary[];
}

interface ProjectDetail {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  content: string;
  pageType: string;
  isPortfolio: boolean;
  status: string;
  priority: string | null;
  ownerSlug: string | null;
  ownerName: string | null;
  domainSlug: string | null;
  domainName: string | null;
  parentProjectSlug: string | null;
  parentProjectName: string | null;
  spawnedFromSlug: string | null;
  spawnedFromName: string | null;
  startDate: string | null;
  targetDate: string | null;
  completedDate: string | null;
  createdAt: string;
  updatedAt: string;
  childProjects: ChildProjectSummary[];
  deliverables: DeliverableBuckets;
  members: [];
  connectors: ProjectConnector[];
  messages: ProjectMessage[];
  notifications: ProjectNotification[];
  stageCounts: { intelligence: number; workboard: number; deliverable: number };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function daysRemaining(targetDate: string | null): number | null {
  if (!targetDate) return null;
  const ms = new Date(targetDate).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86400000));
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
  const projectSlug = params.id as string;

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [messages, setMessages] = useState<ProjectMessage[]>([]);
  const [notifications, setNotifications] = useState<ProjectNotification[]>([]);
  const [loading, setLoading] = useState(true);

  // Dropdowns
  const [openDropdown, setOpenDropdown] = useState<"data" | "notif" | null>(null);
  const dataBtnRef = useRef<HTMLButtonElement>(null);
  const notifBtnRef = useRef<HTMLButtonElement>(null);

  const closeDropdown = useCallback(() => setOpenDropdown(null), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [projRes, msgRes, notifRes] = await Promise.all([
          fetchApi(`/api/projects/${encodeURIComponent(projectSlug)}`),
          fetchApi(`/api/projects/${encodeURIComponent(projectSlug)}/messages`),
          fetchApi(`/api/projects/${encodeURIComponent(projectSlug)}/notifications`),
        ]);

        if (!cancelled) {
          if (projRes.ok) setProject(await projRes.json());
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
  }, [projectSlug]);

  const handleOpenNotifications = useCallback(() => {
    setOpenDropdown((prev) => (prev === "notif" ? null : "notif"));
  }, []);

  const hasUnread = notifications.some((n) => n.readBy.length === 0);
  const daysLeft = daysRemaining(project?.targetDate ?? null);

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
            {[0, 1, 2, 3].map((q) => (
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

  const intelligenceItems = project.deliverables.intelligence;
  const workboardItems = project.deliverables.workboard;
  const deliverableItems = project.deliverables.deliverable;
  const readyCount = intelligenceItems.filter((d) => d.confidenceLevel).length;
  const acceptedCount = deliverableItems.filter((d) => d.acceptedBySlug).length;
  const totalDeliverables =
    intelligenceItems.length + workboardItems.length + deliverableItems.length;
  const progress = totalDeliverables > 0 ? Math.round((acceptedCount / totalDeliverables) * 100) : 0;

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

          {project.parentProjectSlug && (
            <>
              <span style={{ fontSize: 12, color: "var(--fg4)" }}>/</span>
              <button
                onClick={() => router.push(`/projects?portfolio=${encodeURIComponent(project.parentProjectSlug!)}`)}
                className="hover:text-[var(--foreground)] transition-colors"
                style={{ fontSize: 12, color: "var(--fg3)", flexShrink: 0, background: "none", border: "none", cursor: "pointer" }}
              >
                {project.parentProjectName ?? project.parentProjectSlug}
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
              {project.isPortfolio ? "PORTFOLIO" : "PROJECT"}
            </div>
          </div>

          <div style={{ flex: 1 }} />

          {/* Right: progress, data settings, notifications */}
          <div className="flex items-center gap-3" style={{ flexShrink: 0 }}>
            {/* Days remaining + progress (only for non-portfolio) */}
            {!project.isPortfolio && daysLeft != null && (
              <div className="flex items-center gap-2">
                <span
                  style={{
                    fontSize: 11,
                    color: daysLeft <= 5 ? "var(--warn)" : "var(--fg3)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {daysLeft}d remaining
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

        {/* ── Body: portfolio view vs. quadrant view ── */}
        {project.isPortfolio ? (
          <PortfolioChildrenGrid
            childProjects={project.childProjects}
            onOpen={(slug) => router.push(`/projects/${encodeURIComponent(slug)}`)}
          />
        ) : (
          <QuadrantView
            projectSlug={projectSlug}
            messages={messages}
            intelligenceItems={intelligenceItems}
            workboardItems={workboardItems}
            deliverableItems={deliverableItems}
            readyCount={readyCount}
            acceptedCount={acceptedCount}
            router={router}
          />
        )}
      </div>
    </AppShell>
  );
}

// ── Portfolio view: child-projects grid ──────────────────────────────────────

function PortfolioChildrenGrid({
  childProjects,
  onOpen,
}: {
  childProjects: ChildProjectSummary[];
  onOpen: (slug: string) => void;
}) {
  return (
    <div style={{ padding: "32px 40px", flex: 1, overflowY: "auto" }}>
      <h2
        style={{
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.06em",
          color: "var(--fg4)",
          textTransform: "uppercase",
          marginBottom: 14,
        }}
      >
        Child Projects
      </h2>
      {childProjects.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--fg4)" }}>
          This portfolio has no child projects yet.
        </p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: 14,
          }}
        >
          {childProjects.map((cp) => (
            <PortfolioChildCard key={cp.slug} child={cp} onClick={() => onOpen(cp.slug)} />
          ))}
        </div>
      )}
    </div>
  );
}

function PortfolioChildCard({
  child: cp,
  onClick,
}: {
  child: ChildProjectSummary;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.035)",
        border: hovered ? "0.5px solid rgba(255,255,255,0.14)" : "0.5px solid rgba(255,255,255,0.07)",
        borderRadius: 10,
        padding: "16px 18px",
        textAlign: "left",
        cursor: "pointer",
        transition: "background 0.15s, border-color 0.15s",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        minHeight: 130,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground)" }}>
        {cp.name}
      </div>
      {cp.description && (
        <div
          style={{
            fontSize: 11,
            color: "var(--fg4)",
            lineHeight: 1.55,
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {cp.description}
        </div>
      )}
      <div className="flex items-center gap-2 mt-auto">
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            padding: "2px 7px",
            borderRadius: 4,
            background: "rgba(255,255,255,0.06)",
            color: "var(--fg3)",
            letterSpacing: "0.02em",
          }}
        >
          {cp.status}
        </span>
        {cp.deliverableCount > 0 && (
          <span style={{ fontSize: 10, color: "var(--fg4)" }}>
            {cp.deliverableCount} deliverable{cp.deliverableCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>
    </button>
  );
}

// ── Quadrant view ────────────────────────────────────────────────────────────

function QuadrantView({
  projectSlug,
  messages,
  intelligenceItems,
  workboardItems,
  deliverableItems,
  readyCount,
  acceptedCount,
  router,
}: {
  projectSlug: string;
  messages: ProjectMessage[];
  intelligenceItems: DeliverableSummary[];
  workboardItems: DeliverableSummary[];
  deliverableItems: DeliverableSummary[];
  readyCount: number;
  acceptedCount: number;
  router: ReturnType<typeof useRouter>;
}) {
  const openDeliverable = useCallback(
    (d: DeliverableSummary) => {
      router.push(
        `/projects/${encodeURIComponent(projectSlug)}/deliverable/${encodeURIComponent(d.slug)}`,
      );
    },
    [projectSlug, router],
  );

  return (
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

      {/* Top-left: Communication (read-only, wiki-first) */}
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
              No messages yet.
            </p>
          ) : (
            messages.map((msg) => <MessageRow key={msg.id} msg={msg} />)
          )}
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
              <IntelligenceCard key={d.slug} deliverable={d} onClick={() => openDeliverable(d)} />
            ))}
          </div>
          {intelligenceItems.length === 0 && (
            <p style={{ fontSize: 12, color: "var(--fg4)", textAlign: "center", paddingTop: 24 }}>
              No intelligence deliverables yet.
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
        <QuadrantTitle
          label="WORKBOARD"
          badge={workboardItems.length > 0 ? `${workboardItems.length} in review` : undefined}
        />
        <div style={{ flex: 1, overflowY: "auto", marginTop: 10 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))",
              gap: 8,
            }}
          >
            {workboardItems.map((d) => (
              <WorkboardCard key={d.slug} deliverable={d} onClick={() => openDeliverable(d)} />
            ))}
          </div>
          {workboardItems.length === 0 && (
            <p style={{ fontSize: 12, color: "var(--fg4)", textAlign: "center", paddingTop: 24 }}>
              No items in review.
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
          badge={acceptedCount > 0 ? `${acceptedCount} accepted` : undefined}
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
              <DeliverableCard key={d.slug} deliverable={d} onClick={() => openDeliverable(d)} />
            ))}
          </div>
          {deliverableItems.length === 0 && (
            <p style={{ fontSize: 12, color: "var(--fg4)", textAlign: "center", paddingTop: 24 }}>
              Accepted deliverables will appear here.
            </p>
          )}
        </div>
      </div>
    </div>
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
            fontWeight: 400,
            color: "var(--fg2)",
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
  deliverable: DeliverableSummary;
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
  onClick,
}: {
  deliverable: DeliverableSummary;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

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
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: d.assignedToSlug ? "rgba(255,255,255,0.3)" : "transparent",
            border: d.assignedToSlug ? "none" : "1.5px solid rgba(255,255,255,0.15)",
            flexShrink: 0,
          }}
        />
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
        {d.assignedToName ? `${d.assignedToName} · ${statusText}` : statusText}
      </div>
    </button>
  );
}

// ── Deliverable card ─────────────────────────────────────────────────────────

function DeliverableCard({
  deliverable: d,
  onClick,
}: {
  deliverable: DeliverableSummary;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  const acceptedName = d.acceptedByName ?? "Unknown";
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
        {d.acceptedBySlug
          ? `Accepted by ${acceptedName}${acceptedDate ? ` · ${acceptedDate}` : ""}`
          : "Accepted"}
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
      {totalItems > 0 && (
        <div
          style={{
            padding: "8px 16px",
            borderTop: "0.5px solid rgba(255,255,255,0.05)",
            fontSize: 11,
            color: "var(--fg4)",
          }}
        >
          {totalItems} synced items total
        </div>
      )}
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
