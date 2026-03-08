"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { fetchApi } from "@/lib/fetch-api";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Department {
  id: string;
  displayName: string;
  description: string | null;
  mapX: number | null;
  mapY: number | null;
  memberCount: number;
  documentCount: number;
  filledSlots: string[];
  entityType: { slug: string };
  isHQ: boolean;
}

const SLOT_ICONS: Record<string, { label: string; path: string }> = {
  "org-chart": {
    label: "Org Chart",
    path: "M12 3v3m0 12v3m-6-9H3m18 0h-3m-2.25-5.25L17.25 5.25m-10.5 0L8.25 6.75m0 10.5l-1.5 1.5m10.5-1.5l1.5 1.5M12 9a3 3 0 100 6 3 3 0 000-6z",
  },
  budget: {
    label: "Budget",
    path: "M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 110-6h1.5M3 12v6.75A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V12M3 12V5.25A2.25 2.25 0 015.25 3h13.5A2.25 2.25 0 0121 5.25V12M3 12h18M15 12a3 3 0 100 6 3 3 0 000-6z",
  },
  compensation: {
    label: "Compensation",
    path: "M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z",
  },
  "team-roster": {
    label: "Team Roster",
    path: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01",
  },
};

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const CARD_W = 200;
const HQ_W = 240;
const CARD_H = 90;
const HQ_H = 72;
const CLICK_THRESHOLD = 5;
const POLL_MS = 30_000;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2;
const ZOOM_SENSITIVITY = 0.001;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function defaultPosition(index: number, total: number) {
  const radius = 250 + Math.floor(index / 8) * 160;
  const angle = (index / Math.max(total, 1)) * 2 * Math.PI - Math.PI / 2;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function MapPage() {
  const router = useRouter();

  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);

  /* ---- add / edit modal ---- */
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Department | null>(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  /* ---- context menu ---- */
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; dept: Department } | null>(null);

  /* ---- node positions (world-space, HQ at origin) ---- */
  const positionsRef = useRef<Record<string, { x: number; y: number }>>({});
  const [, forceRender] = useState(0);

  /* ---- card drag ---- */
  const dragRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);
  const justDraggedRef = useRef(false);
  const [dragId, setDragId] = useState<string | null>(null);

  /* ---- canvas pan & zoom ---- */
  const containerRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ startX: number; startY: number; origPanX: number; origPanY: number } | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [panning, setPanning] = useState(false);

  /* ---- delete state ---- */
  const [deleteTarget, setDeleteTarget] = useState<Department | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);

  /* ---------------------------------------------------------------- */
  /*  Data fetching                                                    */
  /* ---------------------------------------------------------------- */

  const loadDepartments = useCallback(async () => {
    try {
      const res = await fetchApi("/api/departments");
      if (!res.ok) return;
      const data: Array<Omit<Department, "isHQ"> & { entityType: { slug: string } }> = await res.json();
      const mapped = data.map((d, i) => {
        const isHQ = d.entityType.slug === "organization";
        const pos = d.mapX != null && d.mapY != null
          ? { x: d.mapX, y: d.mapY }
          : isHQ
            ? { x: 0, y: 0 }
            : defaultPosition(i, data.filter((dd) => dd.entityType.slug !== "organization").length);
        positionsRef.current[d.id] = pos;
        return { ...d, isHQ } as Department;
      });
      setDepartments(mapped);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDepartments();
    const iv = setInterval(loadDepartments, POLL_MS);
    return () => clearInterval(iv);
  }, [loadDepartments]);

  /* ---------------------------------------------------------------- */
  /*  Card drag handlers                                               */
  /* ---------------------------------------------------------------- */

  const onCardMouseDown = useCallback((e: React.MouseEvent, dept: Department) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const pos = positionsRef.current[dept.id] ?? { x: 0, y: 0 };
    dragRef.current = {
      id: dept.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.x,
      origY: pos.y,
      moved: false,
    };
    setDragId(dept.id);
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = (e.clientX - d.startX) / zoom;
      const dy = (e.clientY - d.startY) / zoom;
      if (Math.abs(e.clientX - d.startX) > CLICK_THRESHOLD || Math.abs(e.clientY - d.startY) > CLICK_THRESHOLD) {
        d.moved = true;
      }
      positionsRef.current[d.id] = { x: d.origX + dx, y: d.origY + dy };
      forceRender((n) => n + 1);
    };

    const onUp = () => {
      const d = dragRef.current;
      if (!d) return;
      justDraggedRef.current = d.moved;
      dragRef.current = null;
      setDragId(null);
      if (d.moved) {
        const pos = positionsRef.current[d.id];
        fetchApi(`/api/departments/${d.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mapX: pos.x, mapY: pos.y }),
        });
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [zoom]);

  /* ---------------------------------------------------------------- */
  /*  Canvas pan (drag background)                                     */
  /* ---------------------------------------------------------------- */

  const onCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (dragRef.current || e.button !== 0) return;
    e.preventDefault();
    panRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origPanX: pan.x,
      origPanY: pan.y,
    };
    setPanning(true);
  }, [pan]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const p = panRef.current;
      if (!p) return;
      setPan({
        x: p.origPanX + (e.clientX - p.startX),
        y: p.origPanY + (e.clientY - p.startY),
      });
    };
    const onUp = () => {
      if (!panRef.current) return;
      panRef.current = null;
      setPanning(false);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Zoom (scroll wheel)                                              */
  /* ---------------------------------------------------------------- */

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    // Mouse position relative to container
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const delta = -e.deltaY * ZOOM_SENSITIVITY;
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * (1 + delta)));
    const scale = newZoom / zoom;

    // Adjust pan so zoom centers on mouse position
    setPan((prev) => ({
      x: mx - scale * (mx - prev.x),
      y: my - scale * (my - prev.y),
    }));
    setZoom(newZoom);
  }, [zoom]);

  /* ---------------------------------------------------------------- */
  /*  Context menu                                                     */
  /* ---------------------------------------------------------------- */

  const onCardContext = useCallback((e: React.MouseEvent, dept: Department) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, dept });
  }, []);

  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener("click", close);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [ctxMenu]);

  /* ---------------------------------------------------------------- */
  /*  Center view on mount                                             */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    setPan({ x: rect.width / 2, y: rect.height / 2 });
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Add / Edit                                                       */
  /* ---------------------------------------------------------------- */

  function openAdd() {
    setEditTarget(null);
    setFormName("");
    setFormDesc("");
    setFormError("");
    setModalOpen(true);
  }

  function openEdit(dept: Department) {
    setEditTarget(dept);
    setFormName(dept.displayName);
    setFormDesc(dept.description ?? "");
    setFormError("");
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim()) { setFormError("Name is required"); return; }
    if (!formDesc.trim()) { setFormError("Description is required"); return; }
    setSaving(true);
    setFormError("");

    try {
      if (editTarget) {
        const res = await fetchApi(`/api/departments/${editTarget.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: formName.trim(), description: formDesc.trim() }),
        });
        if (!res.ok) { setFormError("Failed to update"); return; }
        const updated = await res.json();
        setDepartments((prev) =>
          prev.map((d) =>
            d.id === editTarget.id
              ? { ...d, displayName: updated.displayName, description: updated.description }
              : d,
          ),
        );
      } else {
        const nonHQDepts = departments.filter((d) => !d.isHQ);
        const pos = defaultPosition(nonHQDepts.length, nonHQDepts.length + 1);
        const res = await fetchApi("/api/departments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formName.trim(),
            description: formDesc.trim(),
            mapX: pos.x,
            mapY: pos.y,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          setFormError(err?.error ?? "Failed to create");
          return;
        }
        const created = await res.json();
        const dept: Department = { ...created, isHQ: false, filledSlots: created.filledSlots ?? [] };
        positionsRef.current[dept.id] = { x: dept.mapX ?? pos.x, y: dept.mapY ?? pos.y };
        setDepartments((prev) => [...prev, dept]);
        // Reload full list to sync
        loadDepartments();
      }
      setModalOpen(false);
    } finally {
      setSaving(false);
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Delete                                                           */
  /* ---------------------------------------------------------------- */

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const res = await fetchApi(`/api/departments/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setDeleteError(err?.error ?? "Failed to delete");
        return;
      }
      setDepartments((prev) => prev.filter((d) => d.id !== deleteTarget.id));
      delete positionsRef.current[deleteTarget.id];
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Reset view                                                       */
  /* ---------------------------------------------------------------- */

  function resetView() {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    setPan({ x: rect.width / 2, y: rect.height / 2 });
    setZoom(1);
  }

  /* ---------------------------------------------------------------- */
  /*  Derived                                                          */
  /* ---------------------------------------------------------------- */

  const nonHQ = departments.filter((d) => !d.isHQ);
  const hq = departments.find((d) => d.isHQ);
  const hqPos = hq ? (positionsRef.current[hq.id] ?? { x: 0, y: 0 }) : { x: 0, y: 0 };

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <AppShell
      topBarContent={
        <div className="flex items-center gap-3">
          <span className="text-xs text-white/30">{Math.round(zoom * 100)}%</span>
          <Button variant="default" size="sm" onClick={resetView}>
            Reset View
          </Button>
          <Button variant="primary" size="sm" onClick={openAdd}>
            Add Department
          </Button>
        </div>
      }
    >
      <div className="relative flex-1">
        {/* ---- infinite canvas ---- */}
        <div
          ref={containerRef}
          onMouseDown={onCanvasMouseDown}
          onWheel={onWheel}
          className="absolute inset-0 overflow-hidden select-none"
          style={{
            cursor: dragId ? "grabbing" : panning ? "grabbing" : "grab",
            background: "#080c10",
          }}
        >
          {/* Grid dots (fixed to canvas transform) */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage:
                "radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px)",
              backgroundSize: `${40 * zoom}px ${40 * zoom}px`,
              backgroundPosition: `${pan.x % (40 * zoom)}px ${pan.y % (40 * zoom)}px`,
            }}
          />

          {/* Transform layer */}
          <div
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "0 0",
              position: "absolute",
              top: 0,
              left: 0,
            }}
          >
            {loading && (
              <p className="text-white/30 text-sm" style={{ transform: `translate(-50px, -10px)` }}>
                Loading...
              </p>
            )}

            {/* ---- SVG edges: HQ → departments ---- */}
            {hq && nonHQ.length > 0 && (
              <svg
                className="absolute top-0 left-0 pointer-events-none"
                style={{ overflow: "visible", width: 1, height: 1 }}
              >
                {nonHQ.map((dept) => {
                  const dPos = positionsRef.current[dept.id];
                  if (!dPos) return null;
                  return (
                    <line
                      key={dept.id}
                      x1={hqPos.x}
                      y1={hqPos.y}
                      x2={dPos.x}
                      y2={dPos.y}
                      stroke="rgba(139,92,246,0.15)"
                      strokeWidth={1.5 / zoom}
                      strokeDasharray={`${4 / zoom} ${4 / zoom}`}
                    />
                  );
                })}
              </svg>
            )}

            {/* ---- empty state ---- */}
            {!loading && nonHQ.length === 0 && !hq && (
              <div className="text-center pointer-events-none" style={{ transform: "translate(-120px, -30px)" }}>
                <p className="text-white/30 text-sm">
                  Add your first department to start mapping your business
                </p>
              </div>
            )}

            {/* ---- CompanyHQ node ---- */}
            {hq && (
              <div
                onMouseDown={(e) => onCardMouseDown(e, hq)}
                onClick={() => {
                  if (!justDraggedRef.current) router.push(`/map/${hq.id}`);
                  justDraggedRef.current = false;
                }}
                onContextMenu={(e) => onCardContext(e, hq)}
                className={`absolute rounded-xl border border-purple-500/30 bg-purple-500/[0.08] px-5 py-4 transition hover:bg-purple-500/[0.14] hover:shadow-lg hover:shadow-purple-500/10 ${
                  dragId === hq.id ? "ring-1 ring-purple-500/40 shadow-lg z-10" : "cursor-pointer"
                }`}
                style={{
                  left: hqPos.x - HQ_W / 2,
                  top: hqPos.y - HQ_H / 2,
                  width: HQ_W,
                  cursor: dragId === hq.id ? "grabbing" : "pointer",
                }}
              >
                <h3 className="font-heading text-base font-semibold text-purple-200 truncate">
                  {hq.displayName}
                </h3>
                {hq.description && (
                  <p className="text-xs text-white/40 truncate mt-1">{hq.description}</p>
                )}
              </div>
            )}

            {/* ---- department nodes ---- */}
            {nonHQ.map((dept) => {
              const pos = positionsRef.current[dept.id];
              if (!pos) return null;
              return (
                <div
                  key={dept.id}
                  onMouseDown={(e) => onCardMouseDown(e, dept)}
                  onContextMenu={(e) => onCardContext(e, dept)}
                  onClick={() => {
                    if (!justDraggedRef.current) router.push(`/map/${dept.id}`);
                    justDraggedRef.current = false;
                  }}
                  className={`absolute wf-soft px-4 py-3 select-none transition-shadow hover:brightness-110 hover:shadow-lg hover:shadow-black/20 ${
                    dragId === dept.id ? "ring-1 ring-purple-500/40 shadow-lg z-10" : "cursor-pointer"
                  }`}
                  style={{
                    left: pos.x - CARD_W / 2,
                    top: pos.y - CARD_H / 2,
                    width: CARD_W,
                    cursor: dragId === dept.id ? "grabbing" : "pointer",
                  }}
                >
                  <h3 className="text-sm font-bold text-white/90 truncate">{dept.displayName}</h3>
                  {dept.description && (
                    <p className="text-xs text-white/40 truncate mt-0.5">{dept.description}</p>
                  )}
                  <p className="text-xs text-white/30 mt-1.5">
                    {dept.memberCount} people &middot; {dept.documentCount} docs
                  </p>
                  <div className="flex gap-1 mt-1.5">
                    {Object.entries(SLOT_ICONS).map(([slot, { path }]) => {
                      const filled = dept.filledSlots?.includes(slot);
                      return (
                        <svg
                          key={slot}
                          className={`w-3 h-3 ${filled ? "text-purple-400" : "text-white/10"}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={1.5}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d={path} />
                        </svg>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ---- context menu ---- */}
      {ctxMenu && (
        <div
          className="fixed z-50 bg-[#182027] border border-white/10 rounded-lg shadow-xl py-1 min-w-[120px]"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
        >
          <button
            className="w-full text-left px-3 py-1.5 text-sm text-white/70 hover:bg-white/[0.06] hover:text-white/90"
            onClick={() => { openEdit(ctxMenu.dept); setCtxMenu(null); }}
          >
            Edit
          </button>
          <button
            className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-white/[0.06] hover:text-red-300"
            onClick={() => { setDeleteTarget(ctxMenu.dept); setCtxMenu(null); }}
          >
            Delete
          </button>
        </div>
      )}

      {/* ---- add / edit modal ---- */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editTarget ? "Edit Department" : "Add Department"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Name"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="e.g. Engineering"
            autoFocus
          />
          <Input
            label="Description"
            value={formDesc}
            onChange={(e) => setFormDesc(e.target.value)}
            placeholder="What does this department do?"
          />
          {formError && <p className="text-sm text-red-400">{formError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="default" size="sm" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={saving}>
              {saving ? "Saving..." : editTarget ? "Save" : "Create"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ---- delete confirmation ---- */}
      <Modal open={!!deleteTarget} onClose={() => { setDeleteTarget(null); setDeleteError(""); }} title="Delete Department">
        <div className="space-y-4">
          <p className="text-sm text-white/60">
            Are you sure you want to delete <span className="text-white/90 font-medium">{deleteTarget?.displayName}</span>?
            {((deleteTarget?.memberCount ?? 0) > 0 || (deleteTarget?.documentCount ?? 0) > 0) && (
              <span className="block mt-1 text-amber-400/80">
                This department has {deleteTarget?.memberCount} members and {deleteTarget?.documentCount} documents that will be unlinked.
              </span>
            )}
          </p>
          {deleteError && <p className="text-sm text-red-400">{deleteError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="default" size="sm" onClick={() => { setDeleteTarget(null); setDeleteError(""); }}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}
