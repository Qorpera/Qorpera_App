"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { fetchApi } from "@/lib/fetch-api";
import { useTranslations } from "next-intl";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Domain {
  slug: string;
  name: string;
  description: string | null;
  memberCount: number;
  confidence: number;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const POLL_MS = 30_000;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2;
const ZOOM_SENSITIVITY = 0.001;

/* ------------------------------------------------------------------ */
/*  Layout: position domains in a circle around center                 */
/* ------------------------------------------------------------------ */

const DOMAIN_W = 198;
const DOMAIN_H = 80;

function layoutDomains(count: number, radius: number): Array<{ x: number; y: number }> {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * 2 * Math.PI - Math.PI / 2;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function MapPage() {
  const router = useRouter();
  const t = useTranslations("map");
  const tc = useTranslations("common");

  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  // Pan & zoom
  const containerRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ startX: number; startY: number; origPanX: number; origPanY: number } | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [panning, setPanning] = useState(false);
  const hasFitted = useRef(false);

  /* ── Data fetching ── */

  const loadDomains = useCallback(async () => {
    try {
      const res = await fetchApi("/api/domains");
      if (!res.ok) return;
      const data: Domain[] = await res.json();
      setDomains(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDomains();
    const iv = setInterval(loadDomains, POLL_MS);
    return () => clearInterval(iv);
  }, [loadDomains]);

  /* ── Fit to center on load ── */

  useEffect(() => {
    if (loading || domains.length === 0 || hasFitted.current) return;
    const container = containerRef.current;
    if (!container) return;
    hasFitted.current = true;
    const rect = container.getBoundingClientRect();
    setPan({ x: rect.width / 2, y: rect.height / 2 });
    setZoom(1);
  }, [loading, domains]);

  /* ── Pan handlers ── */

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-node]")) return;
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

  /* ── Zoom handler ── */

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

  /* ── Derived ── */

  const radius = Math.max(300, domains.length * 55);
  const initialPositions = layoutDomains(domains.length, radius);

  // Domain node positions — draggable
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({});
  const draggingNode = useRef<{ slug: string; startX: number; startY: number; origX: number; origY: number; didMove: boolean } | null>(null);

  // Initialize positions when domains load
  useEffect(() => {
    if (domains.length === 0) return;
    setNodePositions(prev => {
      const next = { ...prev };
      domains.forEach((dom, i) => {
        if (!next[dom.slug]) next[dom.slug] = initialPositions[i];
      });
      return next;
    });
  }, [domains.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const onNodeMouseDown = useCallback((e: React.MouseEvent, domSlug: string) => {
    e.stopPropagation();
    e.preventDefault();
    const pos = nodePositions[domSlug];
    if (!pos) return;
    draggingNode.current = { slug: domSlug, startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y, didMove: false };
  }, [nodePositions]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = draggingNode.current;
      if (!d) return;
      const dx = (e.clientX - d.startX) / zoom;
      const dy = (e.clientY - d.startY) / zoom;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) d.didMove = true;
      setNodePositions(prev => ({ ...prev, [d.slug]: { x: d.origX + dx, y: d.origY + dy } }));
    };
    const onUp = () => { draggingNode.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [zoom]);

  /* ── Render ── */

  return (
    <AppShell>
      <div
        ref={containerRef}
        onMouseDown={onMouseDown}
        onWheel={onWheel}
        className="flex-1 overflow-hidden select-none"
        style={{ cursor: panning ? "grabbing" : "grab", position: "relative" }}
      >
        {loading && (
          <p className="text-[var(--fg4)] text-sm absolute top-1/2 left-1/2 -translate-x-1/2">{tc("loading")}</p>
        )}

        {!loading && domains.length === 0 && (
          <p className="text-[var(--fg4)] text-sm absolute top-1/2 left-1/2 -translate-x-1/2">{t("emptyMapHint")}</p>
        )}

        {/* Zoom controls */}
        <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
          <button
            onClick={() => setZoom(z => Math.min(MAX_ZOOM, z * 1.2))}
            style={{ width: 28, height: 28, borderRadius: 4, background: "var(--elevated)", border: "1px solid var(--border)", color: "var(--fg2)" }}
            className="flex items-center justify-center text-sm font-medium hover:brightness-110 transition"
          >+</button>
          <button
            onClick={() => setZoom(z => Math.max(MIN_ZOOM, z / 1.2))}
            style={{ width: 28, height: 28, borderRadius: 4, background: "var(--elevated)", border: "1px solid var(--border)", color: "var(--fg2)" }}
            className="flex items-center justify-center text-sm font-medium hover:brightness-110 transition"
          >&minus;</button>
        </div>

        {/* Transform layer */}
        <div style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "0 0",
          position: "absolute",
          top: 0,
          left: 0,
        }}>
          {/* SVG lines from center to domains */}
          <svg style={{ position: "absolute", overflow: "visible", width: 1, height: 1, pointerEvents: "none" }}>
            {domains.map((dom) => {
              const pos = nodePositions[dom.slug];
              if (!pos) return null;
              return (
                <line key={dom.slug} x1={0} y1={0} x2={pos.x} y2={pos.y} stroke="var(--border)" strokeWidth={1} />
              );
            })}
          </svg>

          {/* Domain nodes — draggable, fixed size */}
          {domains.map((dom) => {
            const pos = nodePositions[dom.slug];
            if (!pos) return null;
            return (
              <div
                key={dom.slug}
                data-node
                onMouseDown={(e) => onNodeMouseDown(e, dom.slug)}
                onMouseUp={() => {
                  const d = draggingNode.current;
                  if (d && d.slug === dom.slug && !d.didMove) {
                    router.push(`/wiki?domain=${dom.slug}`);
                  }
                }}
                className="absolute hover:brightness-125 transition"
                style={{
                  left: pos.x - DOMAIN_W / 2,
                  top: pos.y - DOMAIN_H / 2,
                  width: DOMAIN_W,
                  height: DOMAIN_H,
                  borderRadius: 8,
                  background: "var(--elevated)",
                  border: "1px solid var(--border)",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: draggingNode.current?.slug === dom.slug ? "grabbing" : "pointer",
                  userSelect: "none",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: DOMAIN_W - 20, textAlign: "center" }}>
                  {dom.name}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
