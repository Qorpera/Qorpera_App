"use client";

import { useState, useEffect, useCallback, useRef, type MutableRefObject } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OnboardingMapBuilder } from "./onboarding-map-builder";
import type { Department } from "./types";

const CLICK_THRESHOLD = 5;

function defaultPosition(index: number, total: number) {
  const radius = 180;
  const angle = (index / Math.max(total, 1)) * 2 * Math.PI - Math.PI / 2;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}

interface StepDepartmentsProps {
  departments: Department[];
  setDepartments: (d: Department[]) => void;
  positionsRef: MutableRefObject<Record<string, { x: number; y: number }>>;
  onContinue: () => void;
  onBack: () => void;
}

export function StepDepartments({
  departments,
  setDepartments,
  positionsRef,
  onContinue,
  onBack,
}: StepDepartmentsProps) {
  const [addingDept, setAddingDept] = useState(false);
  const [deptName, setDeptName] = useState("");
  const [deptDesc, setDeptDesc] = useState("");
  const [deptError, setDeptError] = useState("");
  const [savingDept, setSavingDept] = useState(false);
  const [deletingDept, setDeletingDept] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [, forceRender] = useState(0);
  const dragRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);

  const hq = departments.find(d => d.entityType?.slug === "organization");
  const nonHQ = departments.filter(d => d.entityType?.slug === "department");
  const deptCount = nonHQ.length;
  const canContinue = deptCount >= 2;

  const loadDepartments = useCallback(async () => {
    const res = await fetch("/api/departments");
    if (res.ok) {
      const data: Department[] = await res.json();
      setDepartments(data);
      const nonHQData = data.filter(d => d.entityType?.slug === "department");
      data.forEach(d => {
        if (!positionsRef.current[d.id]) {
          const isHQ = d.entityType?.slug === "organization";
          if (isHQ) {
            positionsRef.current[d.id] = d.mapX != null && d.mapY != null
              ? { x: d.mapX, y: d.mapY }
              : { x: 0, y: 0 };
          } else {
            const idx = nonHQData.indexOf(d);
            positionsRef.current[d.id] = d.mapX != null && d.mapY != null
              ? { x: d.mapX, y: d.mapY }
              : defaultPosition(idx, nonHQData.length);
          }
        }
      });
    }
  }, [setDepartments, positionsRef]);

  async function handleAddDepartment() {
    if (!deptName.trim() || !deptDesc.trim()) {
      setDeptError("Both name and description are required");
      return;
    }
    setSavingDept(true);
    setDeptError("");

    try {
      const pos = defaultPosition(nonHQ.length, nonHQ.length + 1);
      const res = await fetch("/api/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: deptName.trim(),
          description: deptDesc.trim(),
          mapX: pos.x,
          mapY: pos.y,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setDeptError(err?.error ?? "Failed to create department");
        return;
      }

      setDeptName("");
      setDeptDesc("");
      setAddingDept(false);
      await loadDepartments();
    } finally {
      setSavingDept(false);
    }
  }

  async function handleDeleteDepartment(dept: Department) {
    if (dept.memberCount > 0) {
      const ok = window.confirm(
        `"${dept.displayName}" has ${dept.memberCount} member${dept.memberCount > 1 ? "s" : ""}. Delete this department?`
      );
      if (!ok) return;
    }
    setDeletingDept(true);
    try {
      const res = await fetch(`/api/departments/${dept.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setDeptError(err?.error ?? "Failed to delete department");
        return;
      }
      delete positionsRef.current[dept.id];
      await loadDepartments();
    } finally {
      setDeletingDept(false);
    }
  }

  /* Card drag */
  const onCardMouseDown = useCallback((e: React.MouseEvent, deptId: string) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const pos = positionsRef.current[deptId] ?? { x: 0, y: 0 };
    dragRef.current = {
      id: deptId,
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.x,
      origY: pos.y,
      moved: false,
    };
    setDragId(deptId);
  }, [positionsRef]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (Math.abs(dx) > CLICK_THRESHOLD || Math.abs(dy) > CLICK_THRESHOLD) {
        d.moved = true;
      }
      positionsRef.current[d.id] = { x: d.origX + dx, y: d.origY + dy };
      forceRender(n => n + 1);
    };

    const onUp = () => {
      const d = dragRef.current;
      if (!d) return;
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
  }, [positionsRef]);

  async function handleContinue() {
    const res = await fetch("/api/departments");
    if (res.ok) {
      const data: Department[] = await res.json();
      setDepartments(data);
    }
    onContinue();
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <p className="text-xs text-white/30 uppercase tracking-wider">Step 2 of 6</p>
        <h1 className="text-2xl font-semibold text-white/90">Build your departments</h1>
        <p className="text-sm text-white/45">
          Add the teams that make up your company.
        </p>
      </div>

      <OnboardingMapBuilder
        hq={hq ?? null}
        departments={nonHQ}
        positionsRef={positionsRef}
        dragId={dragId}
        onCardMouseDown={onCardMouseDown}
        onDeleteDepartment={handleDeleteDepartment}
      />

      {addingDept ? (
        <div className="wf-soft p-4 space-y-3">
          <div className="text-xs text-white/30 uppercase tracking-wider">New department</div>
          <Input
            placeholder="Department name"
            value={deptName}
            onChange={e => { setDeptName(e.target.value); setDeptError(""); }}
            autoFocus
          />
          <Input
            placeholder="What does this department do?"
            value={deptDesc}
            onChange={e => { setDeptDesc(e.target.value); setDeptError(""); }}
          />
          {deptError && <p className="text-xs text-red-400">{deptError}</p>}
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={handleAddDepartment} disabled={savingDept}>
              {savingDept ? "Adding..." : "Add"}
            </Button>
            <Button variant="default" size="sm" onClick={() => { setAddingDept(false); setDeptName(""); setDeptDesc(""); setDeptError(""); }}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAddingDept(true)}
          className="w-full py-3 rounded-xl border border-dashed border-white/[0.1] text-sm text-white/40 hover:text-white/60 hover:border-white/20 transition"
        >
          + Add Department
        </button>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className={`w-4 h-4 ${canContinue ? "text-emerald-400" : "text-white/20"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className={`text-xs ${canContinue ? "text-white/50" : "text-white/30"}`}>
            Add at least 2 departments to continue
          </span>
        </div>
        <span className={`text-xs font-medium ${canContinue ? "text-emerald-400" : "text-white/30"}`}>
          {deptCount}/2
        </span>
      </div>

      {nonHQ.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {nonHQ.map(dept => (
            <div key={dept.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.08]">
              <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-xs text-white/70">{dept.displayName}</span>
              <button
                onClick={() => handleDeleteDepartment(dept)}
                disabled={deletingDept}
                className="ml-0.5 text-white/20 hover:text-red-400 transition"
                title="Delete department"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <button
          onClick={onBack}
          className="text-sm text-white/40 hover:text-white/60 transition"
        >
          &larr; Back
        </button>
        <Button
          variant="primary"
          size="md"
          onClick={handleContinue}
          disabled={!canContinue}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
