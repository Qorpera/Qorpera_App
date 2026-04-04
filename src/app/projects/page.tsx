"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { fetchApi } from "@/lib/fetch-api";

// ── Types ────────────────────────────────────────────────────────────────────

interface ProjectListItem {
  id: string;
  name: string;
  description: string | null;
  status: string;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  template: { id: string; name: string; category: string } | null;
  createdBy: { id: string; name: string; email: string };
  deliverableCount: number;
  completedCount: number;
  memberCount: number;
  daysLeft: number | null;
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
        minHeight: 120,
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
        <div
          className="animate-pulse"
          style={{ width: 80, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.05)" }}
        />
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
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

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px 60px" }}>

          {/* ── Header ── */}
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <div className="flex items-center justify-center gap-3 mb-2">
              <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--foreground)", letterSpacing: "-0.01em" }}>
                Projects
              </h1>
              <button
                onClick={() => {/* placeholder */}}
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

          {/* ── Grid ── */}
          {loading ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                gap: 14,
              }}
            >
              {Array.from({ length: 3 }).map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px" }}>
              <p style={{ fontSize: 14, color: "var(--fg4)", lineHeight: 1.6 }}>
                No projects yet. Create your first project to get started.
              </p>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                gap: 14,
              }}
            >
              {projects.map((p) => (
                <ProjectCard key={p.id} project={p} onClick={() => router.push(`/projects/${p.id}`)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

// ── Project Card ─────────────────────────────────────────────────────────────

function ProjectCard({ project: p, onClick }: { project: ProjectListItem; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  const isCompleted = p.status === "completed";
  const progress = p.deliverableCount > 0
    ? Math.round((p.completedCount / p.deliverableCount) * 100)
    : 0;

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.035)",
        border: hovered ? "0.5px solid rgba(255,255,255,0.14)" : "0.5px solid rgba(255,255,255,0.07)",
        borderRadius: 10,
        padding: "18px 20px",
        textAlign: "left",
        cursor: "pointer",
        transition: "background 0.15s, border-color 0.15s",
        display: "flex",
        flexDirection: "column",
        gap: 0,
        minHeight: 120,
      }}
    >
      {/* Top row: category + done badge */}
      <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--fg4)",
          }}
        >
          {p.template?.category ?? p.status}
        </span>
        {isCompleted && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: "2px 7px",
              borderRadius: 4,
              background: "rgba(52,211,153,0.12)",
              color: "rgb(52,211,153)",
              letterSpacing: "0.02em",
            }}
          >
            done
          </span>
        )}
      </div>

      {/* Project name */}
      <div
        style={{
          fontSize: 14,
          fontWeight: 500,
          color: "var(--foreground)",
          lineHeight: 1.4,
          marginBottom: "auto",
          paddingBottom: 16,
        }}
      >
        {p.name}
      </div>

      {/* Bottom row: members + progress */}
      <div className="flex items-center justify-between" style={{ gap: 12 }}>
        {/* Member count */}
        <span style={{ fontSize: 11, color: "var(--fg4)", flexShrink: 0, display: "flex", alignItems: "center", gap: 4 }}>
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          {p.memberCount}
        </span>

        {/* Progress bar + days */}
        <div className="flex items-center gap-2" style={{ flex: 1, justifyContent: "flex-end" }}>
          <div
            style={{
              width: 60,
              height: 3,
              borderRadius: 2,
              background: "rgba(255,255,255,0.08)",
              overflow: "hidden",
              flexShrink: 0,
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
          {p.daysLeft != null && !isCompleted && (
            <span style={{ fontSize: 10, color: p.daysLeft <= 5 ? "var(--warn)" : "var(--fg4)", flexShrink: 0 }}>
              {p.daysLeft}d left
            </span>
          )}
          {isCompleted && (
            <span style={{ fontSize: 10, color: "rgb(52,211,153)", flexShrink: 0 }}>
              100%
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
