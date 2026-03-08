"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

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
  entityType: { slug: string };
  isHQ: boolean;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const SURFACE_W = 3000;
const SURFACE_H = 2000;
const CENTER_X = SURFACE_W / 2;
const CENTER_Y = SURFACE_H / 2;
const CARD_W = 200;
const CLICK_THRESHOLD = 5;
const POLL_MS = 30_000;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function defaultPosition(index: number, total: number) {
  const radius = 180 + Math.floor(index / 8) * 120;
  const angle = (index / Math.max(total, 1)) * 2 * Math.PI - Math.PI / 2;
  return {
    x: CENTER_X + Math.cos(angle) * radius,
    y: CENTER_Y + Math.sin(angle) * radius,
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

  /* ---- drag state (refs for perf) ---- */
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
  const positionsRef = useRef<Record<string, { x: number; y: number }>>({});
  const [, forceRender] = useState(0);

  /* ---- delete state ---- */
  const [deleteTarget, setDeleteTarget] = useState<Department | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);

  /* ---------------------------------------------------------------- */
  /*  Data fetching                                                    */
  /* ---------------------------------------------------------------- */

  const loadDepartments = useCallback(async () => {
    try {
      const res = await fetch("/api/departments");
      if (!res.ok) return;
      const data: Array<Omit<Department, "isHQ"> & { entityType: { slug: string } }> = await res.json();
      const mapped = data.map((d, i) => {
        const isHQ = d.entityType.slug === "organization";
        const pos = d.mapX != null && d.mapY != null
          ? { x: d.mapX, y: d.mapY }
          : isHQ
            ? { x: CENTER_X, y: CENTER_Y }
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
  /*  Drag handlers                                                    */
  /* ---------------------------------------------------------------- */

  const onCardMouseDown = useCallback((e: React.MouseEvent, dept: Department) => {
    if (e.button !== 0 || dept.isHQ) return;
    e.preventDefault();
    const pos = positionsRef.current[dept.id] ?? { x: CENTER_X, y: CENTER_Y };
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
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (Math.abs(dx) > CLICK_THRESHOLD || Math.abs(dy) > CLICK_THRESHOLD) {
        d.moved = true;
      }
      positionsRef.current[d.id] = {
        x: d.origX + dx,
        y: d.origY + dy,
      };
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
        fetch(`/api/departments/${d.id}`, {
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
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Context menu                                                     */
  /* ---------------------------------------------------------------- */

  const onCardContext = useCallback((e: React.MouseEvent, dept: Department) => {
    if (dept.isHQ) return;
    e.preventDefault();
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
        const res = await fetch(`/api/departments/${editTarget.id}`, {
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
        const nonHQ = departments.filter((d) => !d.isHQ);
        const pos = defaultPosition(nonHQ.length, nonHQ.length + 1);
        const res = await fetch("/api/departments", {
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
        const dept: Department = { ...created, isHQ: false };
        positionsRef.current[dept.id] = { x: dept.mapX ?? pos.x, y: dept.mapY ?? pos.y };
        setDepartments((prev) => [...prev, dept]);
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
      const res = await fetch(`/api/departments/${deleteTarget.id}`, { method: "DELETE" });
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
  /*  Derived                                                          */
  /* ---------------------------------------------------------------- */

  const nonHQ = departments.filter((d) => !d.isHQ);
  const hq = departments.find((d) => d.isHQ);

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <AppShell>
      <div className="flex flex-col flex-1 min-h-0">
        {/* ---- top bar ---- */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-white/[0.06]">
          <h1 className="text-lg font-medium text-white/90">Business Map</h1>
          <Button variant="primary" size="sm" onClick={openAdd}>
            Add Department
          </Button>
        </div>

        {/* ---- map surface ---- */}
        <div
          className="flex-1 overflow-auto relative"
          style={{ cursor: dragId ? "grabbing" : "grab" }}
        >
          <div
            className="relative"
            style={{
              width: SURFACE_W,
              height: SURFACE_H,
              backgroundImage:
                "radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)",
              backgroundSize: "40px 40px",
            }}
          >
            {loading && (
              <p className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white/30 text-sm">
                Loading...
              </p>
            )}

            {/* ---- empty state ---- */}
            {!loading && nonHQ.length === 0 && (
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 mt-32 text-center pointer-events-none">
                <p className="text-white/30 text-sm">
                  Add your first department to start mapping your business
                </p>
                <svg className="mx-auto mt-3 text-white/20" width="24" height="48" viewBox="0 0 24 48" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 48V8M6 14l6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            )}

            {/* ---- CompanyHQ card ---- */}
            {hq && (
              <div
                onClick={() => router.push(`/map/${hq.id}`)}
                className="absolute cursor-pointer rounded-xl border border-purple-500/30 bg-purple-500/[0.06] px-5 py-4 transition hover:bg-purple-500/[0.10] hover:shadow-lg hover:shadow-purple-500/5"
                style={{
                  left: (positionsRef.current[hq.id]?.x ?? CENTER_X) - 120,
                  top: (positionsRef.current[hq.id]?.y ?? CENTER_Y) - 36,
                  width: 240,
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

            {/* ---- department cards ---- */}
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
                    top: pos.y - 30,
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
