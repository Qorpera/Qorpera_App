"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { fetchApi } from "@/lib/fetch-api";
import { useUser } from "@/components/user-provider";
import { useTranslations } from "next-intl";
import { useIsMobile } from "@/hooks/use-media-query";

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

interface Member {
  id: string;
  displayName: string;
  entityType: { slug: string };
  propertyValues: Array<{ property: { slug: string }; value: string }>;
  autonomySummary?: { supervised: number; notify: number; autonomous: number } | null;
  ownerUserId: string | null;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const ORG_W = 260, ORG_H = 100;
const DEPT_W = 200, DEPT_H = 90;
const MEM_W = 96, MEM_H = 72;
const MEM_COLS = 5;
const MEM_ROW_GAP = 8;
const ORG_DEPT_GAP = 160;
const DEPT_MEM_GAP = 120;
const SIB_GAP = 10;
const DEPT_GAP = 80;
const CARD_BORDER = "1px solid var(--border)";
const CARD_BORDER_EDIT = "1px solid rgba(245,158,11,0.3)";
const CARD_SHADOW = "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)";

const POLL_MS = 30_000;
const MIN_ZOOM = 0.02;
const MAX_ZOOM = 2;
const ZOOM_SENSITIVITY = 0.001;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getInitials(name: string): string {
  const parts = name.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function getFirstName(name: string): string {
  return name.split(/\s+/)[0];
}

function getMemberRole(m: Member): string {
  const pv = m.propertyValues.find(
    p => p.property.slug === "role" || p.property.slug === "title" || p.property.slug === "job-title",
  );
  return pv?.value ?? "";
}

function getAiLevel(m: Member): "act" | "propose" | "observe" | null {
  if (m.entityType.slug !== "ai-agent") return null;
  const s = m.autonomySummary;
  if (!s) return "observe";
  if (s.autonomous > 0) return "act";
  if (s.notify > 0) return "propose";
  return "observe";
}

/** Still used when creating a new department to store mapX/mapY for onboarding builder */
function defaultPosition(index: number, total: number) {
  const radius = 250 + Math.floor(index / 8) * 160;
  const angle = (index / Math.max(total, 1)) * 2 * Math.PI - Math.PI / 2;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

/* ------------------------------------------------------------------ */
/*  Tree layout                                                        */
/* ------------------------------------------------------------------ */

interface TreePos { x: number; y: number }

function memberGridWidth(count: number): number {
  const cols = Math.min(count, MEM_COLS);
  return cols * (MEM_W + SIB_GAP) - SIB_GAP;
}

function computeTreeLayout(
  departments: Department[],
  membersByDept: Record<string, Member[]>,
) {
  const org = departments.find(d => d.isHQ);
  const depts = departments.filter(d => !d.isHQ);

  const orgPos: TreePos = { x: 0, y: 0 };
  const deptY = org ? ORG_DEPT_GAP : 0;

  const deptNodes: Record<string, TreePos & { w: number }> = {};
  const memberNodeMap: Record<string, TreePos> = {};

  // Use uniform spacing based on the widest member grid across all depts
  // so departments stay evenly spaced and centered under the org card
  const maxSlotW = Math.max(DEPT_W, ...depts.map(d => {
    const members = membersByDept[d.id] ?? [];
    return members.length > 0 ? memberGridWidth(members.length) : 0;
  }));

  const totalWidth = depts.length * maxSlotW + Math.max(0, depts.length - 1) * DEPT_GAP;
  let startX = -totalWidth / 2;

  depts.forEach((dept) => {
    deptNodes[dept.id] = { x: startX + maxSlotW / 2, y: deptY, w: maxSlotW };
    startX += maxSlotW + DEPT_GAP;
  });

  // Place members in rows of MEM_COLS, centered per-row under dept card
  depts.forEach(dept => {
    const dNode = deptNodes[dept.id];
    if (!dNode) return;
    const members = membersByDept[dept.id] ?? [];
    if (members.length === 0) return;

    const totalRows = Math.ceil(members.length / MEM_COLS);

    members.forEach((m, i) => {
      const row = Math.floor(i / MEM_COLS);
      const col = i % MEM_COLS;
      // How many members in THIS row (last row may have fewer)
      const membersInRow = row < totalRows - 1 ? MEM_COLS : members.length - row * MEM_COLS;
      const rowW = membersInRow * (MEM_W + SIB_GAP) - SIB_GAP;

      memberNodeMap[m.id] = {
        x: dNode.x - rowW / 2 + col * (MEM_W + SIB_GAP) + MEM_W / 2,
        y: dNode.y + DEPT_MEM_GAP + row * (MEM_H + MEM_ROW_GAP),
      };
    });
  });

  return { orgPos, deptY, deptNodes, memberNodes: memberNodeMap };
}

/* ------------------------------------------------------------------ */
/*  Connecting lines                                                   */
/* ------------------------------------------------------------------ */

function computeLines(
  hasOrg: boolean,
  depts: Department[],
  deptNodes: Record<string, TreePos & { w: number }>,
  membersByDept: Record<string, Member[]>,
  memberNodes: Record<string, TreePos>,
  deptY: number,
) {
  const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];

  // Org → departments
  if (hasOrg && depts.length > 0) {
    const orgBottom = ORG_H / 2;
    const deptTop = deptY - DEPT_H / 2;
    const midY = (orgBottom + deptTop) / 2;

    lines.push({ x1: 0, y1: orgBottom, x2: 0, y2: midY });

    if (depts.length > 1) {
      const xs = depts.map(d => deptNodes[d.id]?.x ?? 0);
      lines.push({ x1: Math.min(...xs), y1: midY, x2: Math.max(...xs), y2: midY });
    }

    depts.forEach(d => {
      const n = deptNodes[d.id];
      if (n) lines.push({ x1: n.x, y1: midY, x2: n.x, y2: deptTop });
    });
  }

  // Department → members
  depts.forEach(dept => {
    const members = membersByDept[dept.id] ?? [];
    if (members.length === 0) return;
    const dNode = deptNodes[dept.id];
    if (!dNode) return;

    const deptBottom = dNode.y + DEPT_H / 2;
    const memberTop = dNode.y + DEPT_MEM_GAP - MEM_H / 2;
    const midY = (deptBottom + memberTop) / 2;

    lines.push({ x1: dNode.x, y1: deptBottom, x2: dNode.x, y2: midY });

    if (members.length > 1) {
      const xs = members.map(m => memberNodes[m.id]?.x ?? 0);
      lines.push({ x1: Math.min(...xs), y1: midY, x2: Math.max(...xs), y2: midY });
    }

    members.forEach(m => {
      const mn = memberNodes[m.id];
      if (mn) lines.push({ x1: mn.x, y1: midY, x2: mn.x, y2: memberTop });
    });
  });

  return lines;
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function MapPage() {
  const router = useRouter();
  const { isAdmin } = useUser();
  const isMobile = useIsMobile();
  const t = useTranslations("map");
  const tc = useTranslations("common");

  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [membersByDept, setMembersByDept] = useState<Record<string, Member[]>>({});
  const [activeSituationCount, setActiveSituationCount] = useState(0);
  const [deptStats, setDeptStats] = useState<Record<string, { situations: number; initiatives: number }>>({});

  /* ---- add / edit modal ---- */
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Department | null>(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  /* ---- edit mode ---- */
  const [editMode, setEditMode] = useState(false);
  const [editingDept, setEditingDept] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  /* ---- unrouted entities ---- */
  const [unroutedEntities, setUnroutedEntities] = useState<Array<{
    id: string; displayName: string;
    entityType: { slug: string; name: string; color: string };
    sourceSystem: string | null;
  }>>([]);
  const [unroutedCount, setUnroutedCount] = useState(0);
  const [unroutedOpen, setUnroutedOpen] = useState(true);

  /* ---- toast ---- */
  const [toast, setToast] = useState("");

  /* ---- context menu ---- */
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; dept: Department } | null>(null);

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
      const mapped = data.map((d) => ({ ...d, isHQ: d.entityType.slug === "organization" })) as Department[];
      setDepartments(mapped);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMembers = useCallback(async (depts: Department[]) => {
    const nonHQ = depts.filter(d => !d.isHQ);
    const results = await Promise.all(
      nonHQ.map(async d => {
        try {
          const res = await fetchApi(`/api/departments/${d.id}/members`);
          if (!res.ok) return { id: d.id, members: [] as Member[] };
          return { id: d.id, members: (await res.json()) as Member[] };
        } catch {
          return { id: d.id, members: [] as Member[] };
        }
      }),
    );
    const map: Record<string, Member[]> = {};
    results.forEach(r => { map[r.id] = r.members; });
    setMembersByDept(map);
  }, []);

  const fetchSituationCount = useCallback(async () => {
    try {
      const res = await fetchApi("/api/situations?status=detected,proposed");
      if (res.ok) {
        const data = await res.json();
        setActiveSituationCount(data.items?.length ?? 0);
      }
    } catch {}
  }, []);

  const fetchUnrouted = useCallback(async () => {
    const res = await fetchApi("/api/entities/unrouted");
    if (res.ok) {
      const data = await res.json();
      setUnroutedEntities(data.entities);
      setUnroutedCount(data.count);
    }
  }, []);

  useEffect(() => {
    loadDepartments();
    fetchUnrouted();
    fetchSituationCount();
    const iv = setInterval(loadDepartments, POLL_MS);
    return () => clearInterval(iv);
  }, [loadDepartments, fetchUnrouted, fetchSituationCount]);

  // Fetch department stats (situation + initiative counts)
  useEffect(() => {
    if (departments.length === 0) return;
    Promise.all([
      fetchApi("/api/situations?status=detected,proposed,reasoning,executing").then(r => r.ok ? r.json() : { items: [] }),
      fetchApi("/api/initiatives").then(r => r.ok ? r.json() : { items: [] }),
    ]).then(([sitData, iniData]) => {
      const stats: Record<string, { situations: number; initiatives: number }> = {};
      for (const dept of departments) {
        stats[dept.id] = { situations: 0, initiatives: 0 };
      }
      for (const s of sitData.items ?? []) {
        if (s.departmentName) {
          const dept = departments.find(d => d.displayName === s.departmentName);
          if (dept && stats[dept.id]) stats[dept.id].situations++;
        }
      }
      for (const i of iniData.items ?? []) {
        if (i.goalDepartmentId && stats[i.goalDepartmentId]) {
          stats[i.goalDepartmentId].initiatives++;
        }
      }
      setDeptStats(stats);
    }).catch(() => {});
  }, [departments]);

  // Fetch members when departments change
  useEffect(() => {
    if (departments.length > 0) fetchMembers(departments);
  }, [departments, fetchMembers]);

  // Escape exits edit mode
  useEffect(() => {
    if (!editMode) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") { setEditMode(false); setEditingDept(null); } };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editMode]);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  /* ---------------------------------------------------------------- */
  /*  Canvas pan                                                       */
  /* ---------------------------------------------------------------- */

  const onCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-card]")) return;
    e.preventDefault();
    panRef.current = { startX: e.clientX, startY: e.clientY, origPanX: pan.x, origPanY: pan.y };
    setPanning(true);
  }, [pan]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const p = panRef.current;
      if (!p) return;
      setPan({ x: p.origPanX + (e.clientX - p.startX), y: p.origPanY + (e.clientY - p.startY) });
    };
    const onUp = () => {
      if (!panRef.current) return;
      panRef.current = null;
      setPanning(false);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Zoom                                                             */
  /* ---------------------------------------------------------------- */

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const delta = -e.deltaY * ZOOM_SENSITIVITY;
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * (1 + delta)));
    const scale = newZoom / zoom;
    setPan(prev => ({ x: mx - scale * (mx - prev.x), y: my - scale * (my - prev.y) }));
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
    return () => { window.removeEventListener("click", close); window.removeEventListener("keydown", onKey); };
  }, [ctxMenu]);

  /* ---------------------------------------------------------------- */
  /*  Fit view (placeholder — actual logic after layout computation)   */
  /* ---------------------------------------------------------------- */

  const hasFitted = useRef(false);

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
    if (!formName.trim()) { setFormError(t("nameRequired")); return; }
    if (!formDesc.trim()) { setFormError(t("descriptionRequired")); return; }
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
        setDepartments(prev =>
          prev.map(d =>
            d.id === editTarget.id
              ? { ...d, displayName: updated.displayName, description: updated.description }
              : d,
          ),
        );
      } else {
        const nonHQDepts = departments.filter(d => !d.isHQ);
        const pos = defaultPosition(nonHQDepts.length, nonHQDepts.length + 1);
        const res = await fetchApi("/api/departments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: formName.trim(), description: formDesc.trim(), mapX: pos.x, mapY: pos.y }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          setFormError(err?.error ?? "Failed to create");
          return;
        }
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
      setDepartments(prev => prev.filter(d => d.id !== deleteTarget.id));
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Inline card edit (edit mode)                                     */
  /* ---------------------------------------------------------------- */

  function startEditing(deptId: string) {
    if (editingDept && editingDept !== deptId) setEditingDept(null);
    const dept = departments.find(d => d.id === deptId);
    if (!dept) return;
    setEditingDept(deptId);
    setEditName(dept.displayName);
    setEditDesc(dept.description ?? "");
  }

  async function saveInlineEdit() {
    if (!editingDept) return;
    const res = await fetchApi(`/api/departments/${editingDept}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim(), description: editDesc.trim() }),
    });
    if (res.ok) loadDepartments();
    setEditingDept(null);
  }

  /* ---------------------------------------------------------------- */
  /*  Assign unrouted entity                                           */
  /* ---------------------------------------------------------------- */

  async function assignToDepartment(entityId: string, departmentId: string) {
    const res = await fetchApi(`/api/entities/${entityId}/assign-department`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ departmentId }),
    });
    if (res.ok) {
      setUnroutedEntities(prev => prev.filter(e => e.id !== entityId));
      setUnroutedCount(prev => prev - 1);
      loadDepartments();
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Derived / layout                                                 */
  /* ---------------------------------------------------------------- */

  const hq = departments.find(d => d.isHQ);
  const depts = departments.filter(d => !d.isHQ);
  const totalPeople = depts.reduce((s, d) => s + d.memberCount, 0);

  const { orgPos, deptY, deptNodes, memberNodes } = computeTreeLayout(departments, membersByDept);
  const lines = computeLines(!!hq, depts, deptNodes, membersByDept, memberNodes, deptY);

  // Fit view to tree on initial load
  useEffect(() => {
    if (loading || departments.length === 0 || hasFitted.current) return;
    const container = containerRef.current;
    if (!container) return;
    hasFitted.current = true;

    const rect = container.getBoundingClientRect();
    const bounds = { minX: -ORG_W / 2, maxX: ORG_W / 2, minY: -ORG_H / 2, maxY: ORG_H / 2 };
    const expand = (cx: number, cy: number, hw: number, hh: number) => {
      bounds.minX = Math.min(bounds.minX, cx - hw);
      bounds.maxX = Math.max(bounds.maxX, cx + hw);
      bounds.minY = Math.min(bounds.minY, cy - hh);
      bounds.maxY = Math.max(bounds.maxY, cy + hh);
    };
    for (const id in deptNodes) { const n = deptNodes[id]; expand(n.x, n.y, DEPT_W / 2, DEPT_H / 2); }
    for (const id in memberNodes) { const n = memberNodes[id]; expand(n.x, n.y, MEM_W / 2, MEM_H / 2); }

    const treeW = bounds.maxX - bounds.minX;
    const treeH = bounds.maxY - bounds.minY;
    const treeCX = (bounds.minX + bounds.maxX) / 2;
    const treeCY = (bounds.minY + bounds.maxY) / 2;
    const pad = 60;
    const z = Math.max(MIN_ZOOM, Math.min((rect.width - pad * 2) / treeW, (rect.height - pad * 2) / treeH, MAX_ZOOM));

    setPan({ x: rect.width / 2 - treeCX * z, y: rect.height / 2 - treeCY * z });
    setZoom(z);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, departments]);

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <AppShell
      topBarContent={
        <div className="flex items-center gap-3">
          {isAdmin && (
            <button
              onClick={() => { setEditMode(!editMode); if (editMode) setEditingDept(null); }}
              className={`px-3 py-1.5 rounded text-xs font-medium transition ${
                editMode
                  ? "bg-[color-mix(in_srgb,var(--warn)_20%,transparent)] text-warn border border-[color-mix(in_srgb,var(--warn)_30%,transparent)]"
                  : "bg-surface text-muted hover:bg-elevated border border-border"
              }`}
            >
              {editMode ? t("doneEditing") : t("editMap")}
              {!editMode && unroutedCount > 0 && (
                <span className="ml-1.5 min-w-[16px] h-[16px] inline-flex items-center justify-center rounded-full bg-warn text-[9px] font-bold text-black px-1">
                  {unroutedCount}
                </span>
              )}
            </button>
          )}
          {isAdmin && (
            <Button variant="primary" size="sm" onClick={openAdd}>
              {t("addDepartment")}
            </Button>
          )}
        </div>
      }
    >
      <div className="relative flex-1">
        {/* Toast */}
        {toast && (
          <div className="fixed top-4 right-4 z-50 bg-[color-mix(in_srgb,var(--ok)_20%,transparent)] border border-[color-mix(in_srgb,var(--ok)_30%,transparent)] text-ok text-sm px-4 py-2 rounded shadow-lg">
            {toast}
          </div>
        )}

        {isMobile ? (
          /* ── Mobile: vertical list of department cards ── */
          <div className="px-4 py-4 space-y-3 overflow-y-auto absolute inset-0 bg-surface">
            {loading && (
              <p className="text-[var(--fg4)] text-sm text-center py-8">{tc("loading")}</p>
            )}
            {!loading && departments.length === 0 && (
              <p className="text-[var(--fg4)] text-sm text-center py-8">{t("emptyMapHint")}</p>
            )}
            {hq && (
              <button
                onClick={() => router.push(`/map/${hq.id}`)}
                className="w-full text-left rounded-lg p-4 transition hover:brightness-110 bg-elevated"
                style={{ border: CARD_BORDER }}
              >
                <div className="text-lg font-semibold text-foreground">{hq.displayName}</div>
                <div className="text-sm text-[var(--fg3)] mt-1">
                  {depts.length} department{depts.length !== 1 ? "s" : ""} &middot; {totalPeople} people
                </div>
                {activeSituationCount > 0 && (
                  <div className="text-xs text-[var(--fg4)] mt-1">
                    {activeSituationCount} active situation{activeSituationCount !== 1 ? "s" : ""}
                  </div>
                )}
              </button>
            )}
            {depts.map(dept => (
              <button
                key={dept.id}
                onClick={() => router.push(`/map/${dept.id}`)}
                className="w-full text-left rounded-lg p-4 transition hover:brightness-110 bg-elevated"
                style={{ border: CARD_BORDER }}
              >
                <div className="text-base font-semibold text-foreground">{dept.displayName}</div>
                <div className="text-sm text-[var(--fg3)] mt-1">
                  {dept.memberCount} people &middot; {dept.documentCount} docs
                </div>
                {(deptStats[dept.id]?.situations > 0 || deptStats[dept.id]?.initiatives > 0) && (
                  <div className="text-xs text-[var(--fg4)] mt-1">
                    {deptStats[dept.id].situations > 0 && <>{deptStats[dept.id].situations} situation{deptStats[dept.id].situations !== 1 ? "s" : ""}</>}
                    {deptStats[dept.id].situations > 0 && deptStats[dept.id].initiatives > 0 && " · "}
                    {deptStats[dept.id].initiatives > 0 && <>{deptStats[dept.id].initiatives} initiative{deptStats[dept.id].initiatives !== 1 ? "s" : ""}</>}
                  </div>
                )}
              </button>
            ))}
          </div>
        ) : (
        /* ── Desktop: Canvas ── */
        <div
          ref={containerRef}
          onMouseDown={onCanvasMouseDown}
          onWheel={onWheel}
          className="absolute inset-0 overflow-hidden select-none"
          style={{ cursor: panning ? "grabbing" : "grab", background: "var(--surface)" }}
        >
          {/* Edit mode indicator */}
          <div className={`absolute inset-0 pointer-events-none transition ${editMode ? "ring-1 ring-inset ring-[color-mix(in_srgb,var(--warn)_20%,transparent)]" : ""}`} style={{ zIndex: 50 }} />

          {/* Zoom controls */}
          <div className="absolute top-3 right-3 z-40 flex flex-col gap-1">
            <button
              onClick={() => setZoom(z => Math.min(MAX_ZOOM, z * 1.2))}
              style={{ width: 28, height: 28, borderRadius: 4, background: "var(--elevated)", border: "1px solid var(--border)", color: "var(--fg2)" }}
              className="flex items-center justify-center text-sm font-medium hover:bg-surface transition"
            >+</button>
            <button
              onClick={() => setZoom(z => Math.max(MIN_ZOOM, z / 1.2))}
              style={{ width: 28, height: 28, borderRadius: 4, background: "var(--elevated)", border: "1px solid var(--border)", color: "var(--fg2)" }}
              className="flex items-center justify-center text-sm font-medium hover:bg-surface transition"
            >&minus;</button>
          </div>

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
              <p className="text-[var(--fg4)] text-sm" style={{ transform: "translate(-50px, -10px)" }}>
                Loading...
              </p>
            )}

            {/* SVG connecting lines */}
            <svg className="absolute top-0 left-0 pointer-events-none" style={{ overflow: "visible", width: 1, height: 1 }}>
              {lines.map((l, i) => (
                <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="var(--border)" strokeWidth={1} />
              ))}
            </svg>

            {/* Empty state */}
            {!loading && depts.length === 0 && !hq && (
              <div className="text-center pointer-events-none" style={{ transform: "translate(-120px, -30px)" }}>
                <p className="text-[var(--fg4)] text-sm">Add your first department to start mapping your business</p>
              </div>
            )}

            {/* ── Organization card ── */}
            {hq && (
              <div
                data-card
                onClick={() => {
                  if (editMode) { startEditing(hq.id); return; }
                  router.push(`/map/${hq.id}`);
                }}
                onContextMenu={e => onCardContext(e, hq)}
                className="absolute cursor-pointer transition hover:brightness-110"
                style={{
                  left: orgPos.x - ORG_W / 2,
                  top: orgPos.y - ORG_H / 2,
                  width: ORG_W,
                  height: ORG_H,
                  borderRadius: 8,
                  background: "var(--elevated)",
                  border: editMode ? CARD_BORDER_EDIT : CARD_BORDER,
                  boxShadow: CARD_SHADOW,
                }}
              >
                {editMode && (
                  <div className="absolute top-1.5 right-1.5">
                    <button
                      onClick={e => { e.stopPropagation(); startEditing(hq.id); }}
                      className="w-5 h-5 rounded flex items-center justify-center bg-surface hover:bg-elevated transition"
                    >
                      <svg className="w-3 h-3 text-[var(--fg3)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                      </svg>
                    </button>
                  </div>
                )}
                {editingDept === hq.id ? (
                  <div className="p-3 space-y-1.5" onClick={e => e.stopPropagation()}>
                    <input value={editName} onChange={e => setEditName(e.target.value)}
                      className="w-full bg-transparent border-b border-accent outline-none text-sm font-semibold text-foreground"
                      autoFocus onKeyDown={e => { if (e.key === "Enter") saveInlineEdit(); if (e.key === "Escape") setEditingDept(null); }} />
                    <input value={editDesc} onChange={e => setEditDesc(e.target.value)}
                      className="w-full bg-transparent border-b border-border outline-none text-xs text-[var(--fg3)]"
                      placeholder={t("description")} onKeyDown={e => { if (e.key === "Enter") saveInlineEdit(); if (e.key === "Escape") setEditingDept(null); }} />
                    <div className="flex gap-1.5">
                      <button onClick={saveInlineEdit} className="text-[10px] text-accent hover:text-accent">{tc("save")}</button>
                      <button onClick={() => setEditingDept(null)} className="text-[10px] text-[var(--fg3)] hover:text-[var(--fg2)]">{tc("cancel")}</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full px-4">
                    <span style={{ fontSize: 18, fontWeight: 600, color: "var(--foreground)", letterSpacing: "-0.01em" }} className="truncate max-w-full">{hq.displayName}</span>
                    <span style={{ fontSize: 11, color: "var(--fg2)" }} className="mt-1">
                      {depts.length} department{depts.length !== 1 ? "s" : ""} &middot; {totalPeople} people
                    </span>
                    {activeSituationCount > 0 && (
                      <span style={{ fontSize: 10, color: "var(--fg3)" }} className="mt-0.5">
                        {activeSituationCount} active situation{activeSituationCount !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Department cards ── */}
            {depts.map(dept => {
              const node = deptNodes[dept.id];
              if (!node) return null;
              const isEditing = editingDept === dept.id;
              return (
                <div
                  key={dept.id}
                  data-card
                  onClick={() => {
                    if (editMode) { startEditing(dept.id); return; }
                    router.push(`/map/${dept.id}`);
                  }}
                  onContextMenu={e => onCardContext(e, dept)}
                  className="absolute cursor-pointer transition hover:brightness-110"
                  style={{
                    left: node.x - DEPT_W / 2,
                    top: node.y - DEPT_H / 2,
                    width: DEPT_W,
                    height: DEPT_H,
                    borderRadius: 8,
                    background: "var(--elevated)",
                    border: editMode ? CARD_BORDER_EDIT : CARD_BORDER,
                    boxShadow: CARD_SHADOW,
                  }}
                >
                  {editMode && !isEditing && (
                    <div className="absolute top-1.5 right-1.5 flex gap-1">
                      <button onClick={e => { e.stopPropagation(); startEditing(dept.id); }}
                        className="w-5 h-5 rounded flex items-center justify-center bg-surface hover:bg-elevated transition">
                        <svg className="w-3 h-3 text-[var(--fg3)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                        </svg>
                      </button>
                      <button onClick={e => { e.stopPropagation(); setDeleteTarget(dept); }}
                        className="w-5 h-5 rounded flex items-center justify-center bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] transition">
                        <svg className="w-3 h-3 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )}
                  {isEditing ? (
                    <div className="p-3 space-y-1.5" onClick={e => e.stopPropagation()}>
                      <input value={editName} onChange={e => setEditName(e.target.value)}
                        className="w-full bg-transparent border-b border-accent outline-none text-sm font-bold text-foreground"
                        autoFocus onKeyDown={e => { if (e.key === "Enter") saveInlineEdit(); if (e.key === "Escape") setEditingDept(null); }} />
                      <input value={editDesc} onChange={e => setEditDesc(e.target.value)}
                        className="w-full bg-transparent border-b border-border outline-none text-xs text-[var(--fg3)]"
                        placeholder={t("description")} onKeyDown={e => { if (e.key === "Enter") saveInlineEdit(); if (e.key === "Escape") setEditingDept(null); }} />
                      <div className="flex gap-1.5">
                        <button onClick={saveInlineEdit} className="text-[10px] text-accent hover:text-accent">{tc("save")}</button>
                        <button onClick={() => setEditingDept(null)} className="text-[10px] text-[var(--fg3)] hover:text-[var(--fg2)]">{tc("cancel")}</button>
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center px-3">
                      <span style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)" }} className="truncate max-w-full text-center">{dept.displayName}</span>
                      <span style={{ fontSize: 10, color: "var(--fg2)" }} className="mt-1">
                        {dept.memberCount} people &middot; {dept.documentCount} docs
                      </span>
                      {(deptStats[dept.id]?.situations > 0 || deptStats[dept.id]?.initiatives > 0) && (
                        <span style={{ fontSize: 9, color: "var(--fg3)" }} className="mt-0.5">
                          {deptStats[dept.id].situations > 0 && <>{deptStats[dept.id].situations} situation{deptStats[dept.id].situations !== 1 ? "s" : ""}</>}
                          {deptStats[dept.id].situations > 0 && deptStats[dept.id].initiatives > 0 && " · "}
                          {deptStats[dept.id].initiatives > 0 && <>{deptStats[dept.id].initiatives} initiative{deptStats[dept.id].initiatives !== 1 ? "s" : ""}</>}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* ── Member cards ── */}
            {depts.map(dept => {
              const members = membersByDept[dept.id] ?? [];
              return members.map(m => {
                const mNode = memberNodes[m.id];
                if (!mNode) return null;
                const role = getMemberRole(m);
                const aiLevel = getAiLevel(m);
                const truncRole = role.length > 14 ? role.slice(0, 13) + "\u2026" : role;
                return (
                  <div
                    key={m.id}
                    data-card
                    className="absolute"
                    style={{
                      left: mNode.x - MEM_W / 2,
                      top: mNode.y - MEM_H / 2,
                      width: MEM_W,
                      height: MEM_H,
                      borderRadius: 6,
                      background: "var(--elevated)",
                      border: CARD_BORDER,
                      boxShadow: CARD_SHADOW,
                    }}
                  >
                    <div className="flex flex-col items-center justify-center h-full">
                      {/* Avatar */}
                      <div style={{
                        width: 26, height: 26, borderRadius: aiLevel ? 6 : 13,
                        background: aiLevel ? "var(--accent-light)" : "var(--elevated)",
                        border: aiLevel ? "1px solid color-mix(in srgb, var(--accent) 30%, transparent)" : "1px solid var(--border-strong)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {aiLevel ? (
                          <span style={{ fontSize: 9, fontWeight: 700, color: "var(--accent)" }}>AI</span>
                        ) : (
                          <span style={{ fontSize: 10, color: "var(--fg2)" }}>{getInitials(m.displayName)}</span>
                        )}
                      </div>
                      {/* Name */}
                      <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--foreground)" }} className="mt-1 truncate max-w-[96px] text-center">
                        {getFirstName(m.displayName)}
                      </span>
                      {/* Role */}
                      {role && (
                        <span style={{ fontSize: 9, color: "var(--fg3)" }} className="truncate max-w-[96px] text-center">
                          {truncRole}
                        </span>
                      )}
                      {/* AI dot */}
                      {aiLevel && (
                        <div className="flex items-center gap-1 mt-1">
                          <div style={{
                            width: 7, height: 7, borderRadius: 3.5,
                            background: aiLevel === "act" ? "var(--ok)" : aiLevel === "propose" ? "var(--warn)" : "var(--border)",
                          }} />
                          <span style={{ fontSize: 8, color: "var(--fg4)" }}>AI</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              });
            })}
          </div>
        </div>
        )}

        {/* Unrouted entities panel */}
        {editMode && unroutedEntities.length > 0 && (
          <div className="absolute bottom-0 left-0 right-0 z-40 border-t border-[color-mix(in_srgb,var(--warn)_20%,transparent)]" style={{ background: "color-mix(in srgb, var(--surface) 95%, transparent)" }}>
            <button
              onClick={() => setUnroutedOpen(!unroutedOpen)}
              className="w-full flex items-center justify-between px-4 py-2 text-xs font-medium text-warn hover:text-warn transition"
            >
              <span>{t("unassignedEntities", { count: unroutedCount })}</span>
              <svg className={`w-3.5 h-3.5 transition ${unroutedOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {unroutedOpen && (
              <div className="max-h-[250px] overflow-y-auto px-4 pb-3 space-y-1">
                {unroutedEntities.map(entity => (
                  <div key={entity.id} className="flex items-center gap-3 px-3 py-2 rounded hover:bg-surface transition">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entity.entityType.color ?? "#888" }} />
                    <span className="text-sm text-foreground flex-1 min-w-0 truncate">{entity.displayName}</span>
                    <span className="text-[10px] text-[var(--fg4)]">{entity.entityType.name}</span>
                    {entity.sourceSystem && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-surface text-[var(--fg4)]">{entity.sourceSystem}</span>
                    )}
                    <select
                      defaultValue=""
                      onChange={e => { if (e.target.value) assignToDepartment(entity.id, e.target.value); }}
                      className="bg-transparent border border-border rounded px-2 py-1 text-[11px] text-[var(--fg3)] outline-none cursor-pointer"
                    >
                      <option value="" disabled>{t("assignTo")}</option>
                      {departments.filter(d => d.entityType.slug === "department" || d.isHQ).map(d => (
                        <option key={d.id} value={d.id} className="bg-surface">{d.displayName}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Context menu */}
      {isAdmin && ctxMenu && (
        <div
          className="fixed z-50 shadow-xl py-1 min-w-[120px]"
          style={{ left: ctxMenu.x, top: ctxMenu.y, background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: 4 }}
        >
          <button
            className="w-full text-left px-3 py-1.5 text-sm text-[var(--fg2)] hover:bg-surface hover:text-foreground"
            onClick={() => { openEdit(ctxMenu.dept); setCtxMenu(null); }}
          >{tc("edit")}</button>
          <button
            className="w-full text-left px-3 py-1.5 text-sm text-danger hover:bg-surface hover:text-danger"
            onClick={() => { setDeleteTarget(ctxMenu.dept); setCtxMenu(null); }}
          >{tc("delete")}</button>
        </div>
      )}

      {/* Add/Edit modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editTarget ? t("editDepartment") : t("addDepartment")}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label={t("departmentName")} value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. Engineering" autoFocus />
          <Input label={t("description")} value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="What does this department do?" />
          {formError && <p className="text-sm text-danger">{formError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="default" size="sm" onClick={() => setModalOpen(false)}>{tc("cancel")}</Button>
            <Button type="submit" variant="primary" size="sm" disabled={saving}>
              {saving ? tc("saving") : editTarget ? tc("save") : tc("create")}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete confirmation */}
      <Modal open={!!deleteTarget} onClose={() => { setDeleteTarget(null); setDeleteError(""); }} title={t("deleteDepartment")}>
        <div className="space-y-4">
          <p className="text-sm text-[var(--fg3)]">
            Are you sure you want to delete <span className="text-foreground font-medium">{deleteTarget?.displayName}</span>?
            {((deleteTarget?.memberCount ?? 0) > 0 || (deleteTarget?.documentCount ?? 0) > 0) && (
              <span className="block mt-1 text-warn">
                This department has {deleteTarget?.memberCount} members and {deleteTarget?.documentCount} documents that will be unlinked.
              </span>
            )}
          </p>
          {deleteError && <p className="text-sm text-danger">{deleteError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="default" size="sm" onClick={() => { setDeleteTarget(null); setDeleteError(""); }}>{tc("cancel")}</Button>
            <Button variant="danger" size="sm" onClick={handleDelete} disabled={deleting}>
              {deleting ? tc("deleting") : tc("delete")}
            </Button>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}
