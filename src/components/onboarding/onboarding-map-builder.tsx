"use client";

import { useState, useCallback, useRef, type MutableRefObject } from "react";
import type { Department } from "./types";

const HQ_W = 200;
const HQ_H = 80;
const CARD_W = 180;
const CARD_H = 80;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 2;

interface OnboardingMapBuilderProps {
  hq: Department | null;
  departments: Department[];
  positionsRef: MutableRefObject<Record<string, { x: number; y: number }>>;
  dragId: string | null;
  onCardMouseDown: (e: React.MouseEvent, id: string) => void;
  onDeleteDepartment?: (dept: Department) => void;
}

export function OnboardingMapBuilder({
  hq,
  departments,
  positionsRef,
  dragId,
  onCardMouseDown,
  onDeleteDepartment,
}: OnboardingMapBuilderProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const panOrigin = useRef({ x: 0, y: 0 });

  const hqPos = hq ? (positionsRef.current[hq.id] ?? { x: 0, y: 0 }) : { x: 0, y: 0 };

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom(z => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z + delta)));
  }, []);

  const handleBgMouseDown = useCallback((e: React.MouseEvent) => {
    // Only pan on direct background click (not on cards)
    if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === "svg") {
      isPanning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY };
      panOrigin.current = { ...pan };
    }
  }, [pan]);

  const handleBgMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning.current) return;
    setPan({
      x: panOrigin.current.x + (e.clientX - panStart.current.x),
      y: panOrigin.current.y + (e.clientY - panStart.current.y),
    });
  }, []);

  const handleBgMouseUp = useCallback(() => {
    isPanning.current = false;
  }, []);

  return (
    <div
      className="relative w-full rounded-xl border border-white/[0.06] overflow-hidden select-none"
      style={{
        height: 380,
        background: "rgba(8,12,16,1)",
        backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px)",
        backgroundSize: "40px 40px",
        cursor: isPanning.current ? "grabbing" : "default",
      }}
      onWheel={handleWheel}
      onMouseDown={handleBgMouseDown}
      onMouseMove={handleBgMouseMove}
      onMouseUp={handleBgMouseUp}
      onMouseLeave={handleBgMouseUp}
    >
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "0 0",
        }}
      >
        {hq && departments.length > 0 && (
          <svg className="absolute top-0 left-0 pointer-events-none" style={{ overflow: "visible", width: 1, height: 1 }}>
            {departments.map(dept => {
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
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                />
              );
            })}
          </svg>
        )}

        {hq && (
          <div
            onMouseDown={e => onCardMouseDown(e, hq.id)}
            className={`absolute rounded-xl border border-purple-500/30 bg-purple-500/[0.08] px-4 py-3 transition ${
              dragId === hq.id ? "ring-1 ring-purple-500/40 shadow-lg z-10" : ""
            }`}
            style={{
              left: hqPos.x - HQ_W / 2,
              top: hqPos.y - HQ_H / 2,
              width: HQ_W,
              cursor: dragId === hq.id ? "grabbing" : "grab",
            }}
          >
            <h3 className="font-heading text-sm font-semibold text-purple-200 truncate text-center">
              {hq.displayName}
            </h3>
            {hq.description && (
              <p className="text-[10px] text-white/40 truncate text-center mt-0.5">{hq.description}</p>
            )}
          </div>
        )}

        {departments.map(dept => {
          const pos = positionsRef.current[dept.id];
          if (!pos) return null;
          return (
            <div
              key={dept.id}
              onMouseDown={e => onCardMouseDown(e, dept.id)}
              className={`group absolute rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 transition ${
                dragId === dept.id ? "ring-1 ring-purple-500/40 shadow-lg z-10" : ""
              }`}
              style={{
                left: pos.x - CARD_W / 2,
                top: pos.y - CARD_H / 2,
                width: CARD_W,
                cursor: dragId === dept.id ? "grabbing" : "grab",
              }}
            >
              {onDeleteDepartment && (
                <button
                  onClick={e => { e.stopPropagation(); e.preventDefault(); onDeleteDepartment(dept); }}
                  onMouseDown={e => e.stopPropagation()}
                  className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500/80 hover:bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Delete department"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
              <h3 className="text-xs font-bold text-white/90 truncate">{dept.displayName}</h3>
              {dept.description && (
                <p className="text-[10px] text-white/40 truncate mt-0.5">{dept.description}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Zoom indicator */}
      <div className="absolute bottom-2 right-2 text-[10px] text-white/20">
        {Math.round(zoom * 100)}%
      </div>
    </div>
  );
}
