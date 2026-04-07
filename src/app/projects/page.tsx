"use client";

import { useState, useEffect, useMemo, Suspense, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
  isPortfolio: boolean;
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
    <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 4, background: s.bg, color: s.color, letterSpacing: "0.02em" }}>
      {status}
    </span>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div style={{ background: "rgba(255,255,255,0.035)", border: "0.5px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: 20, minHeight: 100 }}>
      <div className="animate-pulse" style={{ width: 32, height: 32, borderRadius: 6, background: "rgba(255,255,255,0.06)", marginBottom: 14 }} />
      <div className="animate-pulse" style={{ width: "60%", height: 12, borderRadius: 4, background: "rgba(255,255,255,0.08)", marginBottom: 8 }} />
      <div className="animate-pulse" style={{ width: "40%", height: 8, borderRadius: 4, background: "rgba(255,255,255,0.05)" }} />
    </div>
  );
}

// ── Inner page ──────────────────────────────────────────────────────────────

function ProjectsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const portfolioId = searchParams.get("portfolio");

  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [portfolioName, setPortfolioName] = useState<string | null>(null);

  // Portfolio creation modal
  const [showPortfolioModal, setShowPortfolioModal] = useState(false);
  const [portfolioFormName, setPortfolioFormName] = useState("");
  const [portfolioFormDesc, setPortfolioFormDesc] = useState("");
  const [portfolioFormError, setPortfolioFormError] = useState("");
  const [portfolioSaving, setPortfolioSaving] = useState(false);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<ProjectListItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetchApi(`/api/projects/${deleteTarget.id}`, { method: "DELETE" });
      if (res.ok) {
        setDeleteTarget(null);
        loadProjects();
      }
    } catch {}
    finally { setDeleting(false); }
  };

  const loadProjects = () => {
    setLoading(true);
    const url = portfolioId
      ? `/api/projects?parentProjectId=${portfolioId}`
      : "/api/projects";
    fetchApi(url)
      .then(res => res.ok ? res.json() : { projects: [] })
      .then(data => setProjects(data.projects ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!portfolioId) { setPortfolioName(null); return; }
    fetchApi(`/api/projects/${portfolioId}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data) setPortfolioName(data.name ?? data.project?.name ?? "Portfolio"); })
      .catch(() => {});
  }, [portfolioId]);

  useEffect(() => { loadProjects(); }, [portfolioId]);

  // Separate portfolios from standalone projects (top-level view only)
  const { portfolios, standaloneProjects } = useMemo(() => {
    if (portfolioId) return { portfolios: [], standaloneProjects: projects };
    const portfolios: ProjectListItem[] = [];
    const standaloneProjects: ProjectListItem[] = [];
    for (const p of projects) {
      if (p.isPortfolio || (p.childProjects && p.childProjects.length > 0)) {
        portfolios.push(p);
      } else {
        standaloneProjects.push(p);
      }
    }
    return { portfolios, standaloneProjects };
  }, [projects, portfolioId]);

  // Filter by search
  const filtered = useMemo(() => {
    if (!search.trim()) return { portfolios, standaloneProjects };
    const q = search.toLowerCase();
    return {
      portfolios: portfolios.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        p.childProjects?.some(c => c.name.toLowerCase().includes(q))
      ),
      standaloneProjects: standaloneProjects.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q)
      ),
    };
  }, [portfolios, standaloneProjects, search]);

  const handleCreatePortfolio = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!portfolioFormName.trim()) { setPortfolioFormError("Name is required"); return; }
    setPortfolioSaving(true);
    setPortfolioFormError("");
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: portfolioFormName.trim(),
          description: portfolioFormDesc.trim() || null,
          status: "active",
          isPortfolio: true,
        }),
      });
      if (res.ok) {
        setShowPortfolioModal(false);
        setPortfolioFormName("");
        setPortfolioFormDesc("");
        loadProjects();
      } else {
        const data = await res.json().catch(() => null);
        setPortfolioFormError(data?.error ?? "Failed to create portfolio");
      }
    } catch {
      setPortfolioFormError("Connection error");
    } finally {
      setPortfolioSaving(false);
    }
  };

  const totalItems = filtered.portfolios.length + filtered.standaloneProjects.length;
  const isInsidePortfolio = !!portfolioId;

  return (
    <div className="flex-1 overflow-y-auto">
      <div style={{ maxWidth: 630, margin: "0 auto", padding: "40px 24px 60px" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          {isInsidePortfolio && (
            <button
              onClick={() => router.push("/projects")}
              style={{ fontSize: 12, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", marginBottom: 8, display: "inline-flex", alignItems: "center", gap: 4 }}
            >
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
              Back to Projects
            </button>
          )}
          <div className="flex items-center justify-center gap-3 mb-2">
            <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--foreground)", letterSpacing: "-0.01em" }}>
              {isInsidePortfolio ? (portfolioName ?? "Portfolio") : "Projects"}
            </h1>
            <button
              onClick={() => {
                if (isInsidePortfolio) {
                  router.push(`/projects/new?parent=${portfolioId}`);
                } else {
                  router.push("/projects/new");
                }
              }}
              style={{ fontSize: 11, fontWeight: 500, padding: "4px 12px", borderRadius: 6, background: "rgba(255,255,255,0.06)", border: "0.5px solid rgba(255,255,255,0.1)", color: "var(--fg2)", cursor: "pointer" }}
              className="hover:brightness-125 transition"
            >
              + New Project
            </button>
            {!isInsidePortfolio && (
              <button
                onClick={() => { setShowPortfolioModal(true); setPortfolioFormName(""); setPortfolioFormDesc(""); setPortfolioFormError(""); }}
                style={{ fontSize: 11, fontWeight: 500, padding: "4px 12px", borderRadius: 6, background: "transparent", border: "0.5px dashed rgba(255,255,255,0.15)", color: "var(--fg3)", cursor: "pointer" }}
                className="hover:brightness-125 transition"
              >
                + New Portfolio
              </button>
            )}
          </div>
          <p style={{ fontSize: 13, color: "var(--fg3)" }}>
            {isInsidePortfolio ? `Projects in ${portfolioName ?? "this portfolio"}` : "Active engagements and completed work"}
          </p>
        </div>

        {/* Search */}
        {!loading && projects.length > 0 && (
          <input
            type="text"
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%", padding: "10px 14px", background: "rgba(255,255,255,0.04)", border: "0.5px solid var(--border)", borderRadius: 8, color: "var(--foreground)", fontSize: 13, marginBottom: 20, outline: "none" }}
          />
        )}

        {/* Grid */}
        {loading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
            {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        ) : totalItems === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <p style={{ fontSize: 14, color: "var(--fg4)", lineHeight: 1.6 }}>
              {search
                ? "No projects match your search."
                : isInsidePortfolio
                  ? "This portfolio is empty. Create a project to get started."
                  : "No projects yet. Create a project or portfolio to get started."}
            </p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
            {filtered.portfolios.map((p) => (
              <FolderCard key={p.id} project={p} onClick={() => router.push(`/projects?portfolio=${p.id}`)} onDelete={() => setDeleteTarget(p)} />
            ))}
            {filtered.standaloneProjects.map((p) => (
              <FileCard key={p.id} project={p} onClick={() => router.push(`/projects/${p.id}`)} onDelete={() => setDeleteTarget(p)} />
            ))}
          </div>
        )}
      </div>

      {/* Portfolio creation modal */}
      <Modal open={showPortfolioModal} onClose={() => setShowPortfolioModal(false)} title="New Portfolio">
        <form onSubmit={handleCreatePortfolio} className="space-y-4">
          <Input
            label="Portfolio name"
            value={portfolioFormName}
            onChange={(e) => setPortfolioFormName(e.target.value)}
            placeholder="e.g. Client Projects, Q2 Initiatives"
            autoFocus
          />
          <Input
            label="Description (optional)"
            value={portfolioFormDesc}
            onChange={(e) => setPortfolioFormDesc(e.target.value)}
            placeholder="What is this portfolio for?"
          />
          {portfolioFormError && <p className="text-sm text-danger">{portfolioFormError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="default" size="sm" onClick={() => setShowPortfolioModal(false)}>Cancel</Button>
            <Button type="submit" variant="primary" size="sm" disabled={portfolioSaving || !portfolioFormName.trim()}>
              {portfolioSaving ? "Creating..." : "Create Portfolio"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title={deleteTarget?.isPortfolio ? "Delete Portfolio" : "Delete Project"}>
        <div className="space-y-4">
          <p className="text-sm text-[var(--fg2)] leading-relaxed">
            {deleteTarget?.isPortfolio ? (
              <>Delete <strong className="text-foreground">{deleteTarget.name}</strong> and all {deleteTarget.childProjects?.length ?? 0} projects inside it? This will permanently remove all deliverables, messages, and wiki pages.</>
            ) : (
              <>Delete <strong className="text-foreground">{deleteTarget?.name}</strong>? This will permanently remove all deliverables, messages, and wiki pages associated with this project.</>
            )}
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="default" size="sm" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" size="sm" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── Page wrapper ────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  return (
    <AppShell>
      <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "var(--fg4)" }}>Loading...</div>}>
        <ProjectsPageInner />
      </Suspense>
    </AppShell>
  );
}

// ── Folder Card (Portfolio) ────────────────────────────────────────────────

function FolderCard({ project: p, onClick, onDelete }: { project: ProjectListItem; onClick: () => void; onDelete: () => void }) {
  const [hovered, setHovered] = useState(false);
  const childCount = p.childProjects?.length ?? p.childProjectCount ?? 0;
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        background: hovered ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.035)",
        border: hovered ? "0.5px solid rgba(255,255,255,0.14)" : "0.5px solid rgba(255,255,255,0.07)",
        borderRadius: 10, padding: "18px 16px", textAlign: "left", cursor: "pointer",
        transition: "background 0.15s, border-color 0.15s",
        display: "flex", flexDirection: "column", gap: 8, minHeight: 110,
      }}
      onClick={onClick}
    >
      {hovered && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          style={{ position: "absolute", top: 8, right: 8, width: 20, height: 20, borderRadius: 4, background: "rgba(255,255,255,0.08)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          className="hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)]"
        >
          <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="var(--fg3)" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      )}
      <svg width={28} height={28} viewBox="0 0 24 24" fill="none" style={{ opacity: 0.6 }}>
        <path d="M2 6a2 2 0 012-2h4l2 2h8a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" fill="var(--fg3)" fillOpacity={0.25} stroke="var(--fg3)" strokeWidth={1.2} />
      </svg>
      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%" }}>
        {p.name}
      </span>
      {p.description && (
        <span style={{ fontSize: 11, color: "var(--fg4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%" }}>
          {p.description}
        </span>
      )}
      <div className="flex items-center gap-2 mt-auto">
        <span style={{ fontSize: 11, color: "var(--fg4)" }}>
          {childCount} project{childCount !== 1 ? "s" : ""}
        </span>
        <StatusBadge status={p.status} />
      </div>
    </div>
  );
}

// ── File Card (Project) ────────────────────────────────────────────────────

function FileCard({ project: p, onClick, onDelete }: { project: ProjectListItem; onClick: () => void; onDelete: () => void }) {
  const [hovered, setHovered] = useState(false);
  const progress = p.deliverableCount > 0 ? Math.round((p.completedCount / p.deliverableCount) * 100) : 0;
  const isCompleted = p.status === "completed";

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        background: hovered ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.035)",
        border: hovered ? "0.5px solid rgba(255,255,255,0.14)" : "0.5px solid rgba(255,255,255,0.07)",
        borderRadius: 10, padding: "18px 16px", textAlign: "left", cursor: "pointer",
        transition: "background 0.15s, border-color 0.15s",
        display: "flex", flexDirection: "column", gap: 8, minHeight: 110,
      }}
    >
      {hovered && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          style={{ position: "absolute", top: 8, right: 8, width: 20, height: 20, borderRadius: 4, background: "rgba(255,255,255,0.08)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          className="hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)]"
        >
          <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="var(--fg3)" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      )}
      <svg width={24} height={28} viewBox="0 0 20 24" fill="none" style={{ opacity: 0.5 }}>
        <path d="M2 3a2 2 0 012-2h8l6 6v14a2 2 0 01-2 2H4a2 2 0 01-2-2V3z" fill="var(--fg4)" fillOpacity={0.15} stroke="var(--fg4)" strokeWidth={1.2} />
        <path d="M10 1v6h6" stroke="var(--fg4)" strokeWidth={1.2} strokeLinecap="round" />
      </svg>
      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%" }}>
        {p.name}
      </span>
      <div className="flex items-center gap-2 mt-auto">
        <StatusBadge status={p.status} />
        {p.deliverableCount > 0 && (
          <div className="flex items-center gap-1.5">
            <div style={{ width: 36, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
              <div style={{ width: `${progress}%`, height: "100%", borderRadius: 2, background: isCompleted ? "rgb(52,211,153)" : "rgba(255,255,255,0.5)" }} />
            </div>
            <span style={{ fontSize: 10, color: "var(--fg4)" }}>{progress}%</span>
          </div>
        )}
      </div>
    </div>
  );
}
