"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { fetchApi } from "@/lib/fetch-api";

// ── Types ────────────────────────────────────────────────────────────────────

interface ChildProject {
  id: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: string;
  _count: { deliverables: number };
}

interface ProjectListItem {
  id: string;
  name: string;
  description: string | null;
  status: string;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  parentProjectId: string | null;
  template: { id: string; name: string; category: string } | null;
  createdBy: { id: string; name: string; email: string };
  deliverableCount: number;
  completedCount: number;
  memberCount: number;
  daysLeft: number | null;
  childProjectCount: number;
  childProjects: ChildProject[];
}

// ── Status badge ────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  active: { bg: "rgba(52,211,153,0.12)", color: "rgb(52,211,153)" },
  completed: { bg: "rgba(52,211,153,0.12)", color: "rgb(52,211,153)" },
  draft: { bg: "rgba(255,255,255,0.06)", color: "var(--fg4)" },
  paused: { bg: "rgba(245,158,11,0.12)", color: "var(--warn)" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.draft;
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        padding: "2px 7px",
        borderRadius: 4,
        background: s.bg,
        color: s.color,
        letterSpacing: "0.02em",
      }}
    >
      {status}
    </span>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.035)",
        border: "0.5px solid rgba(255,255,255,0.07)",
        borderRadius: 10,
        padding: "18px 20px",
        minHeight: 80,
      }}
    >
      <div
        className="animate-pulse"
        style={{ width: 60, height: 8, borderRadius: 4, background: "rgba(255,255,255,0.06)", marginBottom: 14 }}
      />
      <div
        className="animate-pulse"
        style={{ width: "70%", height: 12, borderRadius: 4, background: "rgba(255,255,255,0.08)", marginBottom: 24 }}
      />
      <div className="flex items-center justify-between">
        <div
          className="animate-pulse"
          style={{ width: 40, height: 8, borderRadius: 4, background: "rgba(255,255,255,0.05)" }}
        />
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchApi("/api/projects");
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setProjects(data.projects ?? []);
        }
      } catch {}
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Filter projects by search across names, descriptions, and child project names
  const filtered = useMemo(() => {
    if (!search.trim()) return projects;
    const q = search.toLowerCase();
    return projects.filter((p) => {
      if (p.name.toLowerCase().includes(q)) return true;
      if (p.description?.toLowerCase().includes(q)) return true;
      if (p.childProjects?.some((c) => c.name.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [projects, search]);

  // Auto-expand folders whose children match search
  const effectiveExpanded = useMemo(() => {
    if (!search.trim()) return expandedIds;
    const q = search.toLowerCase();
    const auto = new Set(expandedIds);
    for (const p of filtered) {
      if (p.childProjects?.some((c) => c.name.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q))) {
        auto.add(p.id);
      }
    }
    return auto;
  }, [filtered, expandedIds, search]);

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px 60px" }}>

          {/* ── Header ── */}
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div className="flex items-center justify-center gap-3 mb-2">
              <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--foreground)", letterSpacing: "-0.01em" }}>
                Projects
              </h1>
              <button
                onClick={() => router.push("/projects/new")}
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  padding: "4px 12px",
                  borderRadius: 6,
                  background: "rgba(255,255,255,0.06)",
                  border: "0.5px solid rgba(255,255,255,0.1)",
                  color: "var(--fg2)",
                  cursor: "pointer",
                }}
                className="hover:brightness-125 transition"
              >
                + New project
              </button>
            </div>
            <p style={{ fontSize: 13, color: "var(--fg3)" }}>
              Active engagements and completed work
            </p>
          </div>

          {/* ── Search ── */}
          {!loading && projects.length > 0 && (
            <input
              type="text"
              placeholder="Search projects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 14px",
                background: "rgba(255,255,255,0.04)",
                border: "0.5px solid var(--border)",
                borderRadius: 8,
                color: "var(--foreground)",
                fontSize: 13,
                marginBottom: 16,
                outline: "none",
              }}
            />
          )}

          {/* ── List ── */}
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px" }}>
              <p style={{ fontSize: 14, color: "var(--fg4)", lineHeight: 1.6 }}>
                {search
                  ? "No projects match your search."
                  : "No projects yet. Projects are created when you approve initiative proposals."}
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filtered.map((p) => (
                <FolderCard
                  key={p.id}
                  project={p}
                  expanded={effectiveExpanded.has(p.id)}
                  onToggle={() => toggleExpand(p.id)}
                  onNavigate={(id) => router.push(`/projects/${id}`)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

// ── Folder Card ─────────────────────────────────────────────────────────────

function FolderCard({
  project: p,
  expanded,
  onToggle,
  onNavigate,
}: {
  project: ProjectListItem;
  expanded: boolean;
  onToggle: () => void;
  onNavigate: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const hasChildren = p.childProjects && p.childProjects.length > 0;
  const isCompleted = p.status === "completed";
  const progress = p.deliverableCount > 0
    ? Math.round((p.completedCount / p.deliverableCount) * 100)
    : 0;

  const handleClick = () => {
    if (hasChildren) {
      onToggle();
    } else {
      onNavigate(p.id);
    }
  };

  return (
    <div>
      <button
        onClick={handleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: "100%",
          background: hovered ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.035)",
          border: hovered ? "0.5px solid rgba(255,255,255,0.14)" : "0.5px solid rgba(255,255,255,0.07)",
          borderRadius: expanded && hasChildren ? "10px 10px 0 0" : 10,
          padding: "14px 18px",
          textAlign: "left",
          cursor: "pointer",
          transition: "background 0.15s, border-color 0.15s",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        {/* Folder/doc icon */}
        <span style={{ fontSize: 16, flexShrink: 0, opacity: 0.7 }}>
          {hasChildren ? (expanded ? "📂" : "📁") : "📄"}
        </span>

        {/* Name + description */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="flex items-center gap-2">
            <span
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: "var(--foreground)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {p.name}
            </span>
            <StatusBadge status={p.status} />
          </div>
          {p.description && (
            <p
              style={{
                fontSize: 12,
                color: "var(--fg4)",
                marginTop: 3,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {p.description}
            </p>
          )}
        </div>

        {/* Right side: child count or progress */}
        <div className="flex items-center gap-3" style={{ flexShrink: 0 }}>
          {hasChildren && (
            <span style={{ fontSize: 11, color: "var(--fg4)" }}>
              {p.childProjects.length} workstream{p.childProjects.length !== 1 ? "s" : ""}
            </span>
          )}
          {!hasChildren && (
            <>
              <span style={{ fontSize: 11, color: "var(--fg4)" }}>
                {p.deliverableCount} deliverable{p.deliverableCount !== 1 ? "s" : ""}
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
                    background: isCompleted ? "rgb(52,211,153)" : "rgba(255,255,255,0.5)",
                    transition: "width 0.3s",
                  }}
                />
              </div>
            </>
          )}
          {hasChildren && (
            <svg
              width={12}
              height={12}
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--fg4)"
              strokeWidth={2}
              strokeLinecap="round"
              style={{
                transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.15s",
              }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          )}
        </div>
      </button>

      {/* Expanded children */}
      {expanded && hasChildren && (
        <div
          style={{
            background: "rgba(255,255,255,0.02)",
            border: "0.5px solid rgba(255,255,255,0.07)",
            borderTop: "none",
            borderRadius: "0 0 10px 10px",
            overflow: "hidden",
          }}
        >
          {p.childProjects.map((child, i) => (
            <ChildRow
              key={child.id}
              child={child}
              isLast={i === p.childProjects.length - 1}
              onClick={() => onNavigate(child.id)}
            />
          ))}
          <button
            onClick={(e) => { e.stopPropagation(); onNavigate(p.id); }}
            style={{
              width: "100%",
              padding: "8px 18px",
              fontSize: 11,
              color: "var(--accent)",
              background: "none",
              border: "none",
              borderTop: "0.5px solid rgba(255,255,255,0.05)",
              cursor: "pointer",
              textAlign: "left",
              fontWeight: 500,
            }}
            className="hover:bg-white/[0.03] transition-colors"
          >
            View portfolio →
          </button>
        </div>
      )}
    </div>
  );
}

// ── Child Row ───────────────────────────────────────────────────────────────

function ChildRow({
  child,
  isLast,
  onClick,
}: {
  child: ChildProject;
  isLast: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 18px 10px 44px",
        background: hovered ? "rgba(255,255,255,0.04)" : "transparent",
        border: "none",
        borderBottom: isLast ? "none" : "0.5px solid rgba(255,255,255,0.04)",
        cursor: "pointer",
        textAlign: "left",
        transition: "background 0.12s",
      }}
    >
      <span style={{ fontSize: 12, opacity: 0.5, flexShrink: 0 }}>📄</span>
      <span
        style={{
          fontSize: 13,
          color: "var(--foreground)",
          flex: 1,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {child.name}
      </span>
      <StatusBadge status={child.status} />
      <span style={{ fontSize: 11, color: "var(--fg4)", flexShrink: 0 }}>
        {child._count.deliverables} deliverable{child._count.deliverables !== 1 ? "s" : ""}
      </span>
    </button>
  );
}
