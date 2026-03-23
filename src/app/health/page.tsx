"use client";

import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { fetchApi } from "@/lib/fetch-api";
import { useUser } from "@/components/user-provider";

// ── Types ────────────────────────────────────────────────

interface ConnectorItem {
  id: string;
  provider: string;
  providerName: string;
  name: string;
  status: string;
  lastSyncAt: string | null;
}

interface Department {
  id: string;
  displayName: string;
  memberCount: number;
  documentCount: number;
  filledSlots: string[];
  entityType: { slug: string };
}

interface SituationTypeItem {
  id: string;
  name: string;
  slug: string;
  totalProposed: number;
  autonomyLevel: string;
}

// ── Helpers ──────────────────────────────────────────────

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const SLOT_LABELS: Record<string, string> = {
  "org-chart": "Org Chart",
  playbook: "Playbook",
};

const CONNECTOR_COLORS: Record<string, string> = {
  google: "#4285f4",
  gmail: "#ea4335",
  slack: "#611f69",
  hubspot: "#ff7a59",
  stripe: "#635bff",
  microsoft: "#00a4ef",
  outlook: "#0078d4",
};

// ── Page ─────────────────────────────────────────────────

export default function HealthPage() {
  const { isAdmin } = useUser();
  const [connectors, setConnectors] = useState<ConnectorItem[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [situationTypes, setSituationTypes] = useState<SituationTypeItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [connRes, deptRes, stRes] = await Promise.all([
        fetchApi("/api/connectors").then(r => r.ok ? r.json() : { connectors: [] }),
        fetchApi("/api/departments").then(r => r.ok ? r.json() : []),
        fetchApi("/api/situation-types").then(r => r.ok ? r.json() : []),
      ]);
      setConnectors(connRes.connectors ?? []);
      setDepartments(Array.isArray(deptRes) ? deptRes : []);
      setSituationTypes(Array.isArray(stRes) ? stRes : []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Derived
  const deptOnly = departments.filter((d: Department) => d.entityType?.slug === "department");
  const allSlots = ["org-chart", "playbook"];
  const slotCounts: Record<string, number> = {};
  allSlots.forEach(slot => {
    slotCounts[slot] = deptOnly.filter(d => d.filledSlots?.includes(slot)).length;
  });

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-full">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-[var(--fg2)]" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="p-8 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600 }} className="text-foreground">Setup Health</h1>
          <p style={{ fontSize: 12 }} className="mt-1 text-[var(--fg2)]">System setup overview and diagnostics</p>
        </div>

        {/* ── Section 1: Connectors ── */}
        <section style={{ borderRadius: 6, padding: 20 }} className="bg-surface border border-border">
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }} className="mb-4 text-[var(--fg3)]">
            Connectors
          </div>

          {connectors.length === 0 ? (
            <p style={{ fontSize: 13 }} className="text-[var(--fg3)]">No connectors configured.</p>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {connectors.map(c => {
                const isError = c.status === "error";
                const isActive = c.status === "active";
                const brandColor = CONNECTOR_COLORS[c.provider?.toLowerCase()] ?? "var(--fg2)";
                return (
                  <div
                    key={c.id}
                    style={{
                      background: isError ? "color-mix(in srgb, var(--danger) 6%, transparent)" : undefined,
                      border: isError ? "1px solid color-mix(in srgb, var(--danger) 15%, transparent)" : undefined,
                      borderRadius: 4,
                      padding: "10px 12px",
                    }}
                    className={`flex items-center gap-3 ${!isError ? "bg-surface border border-border" : ""}`}
                  >
                    {/* Icon */}
                    <div style={{
                      width: 26, height: 26, borderRadius: 4,
                      background: `${brandColor}1a`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, fontWeight: 600, color: brandColor,
                    }}>
                      {c.providerName?.[0]?.toUpperCase() ?? "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div style={{ fontSize: 12, fontWeight: 500 }} className="truncate text-foreground">{c.name || c.providerName}</div>
                      <div style={{ fontSize: 11 }} className={isError ? "text-danger" : isActive ? "text-ok" : "text-[var(--fg3)]"}>
                        {isError ? `Error \u2014 ${timeAgo(c.lastSyncAt)}` : isActive ? `Synced ${timeAgo(c.lastSyncAt)}` : "Not connected"}
                      </div>
                    </div>
                    {/* Status dot */}
                    <div style={{
                      width: 6, height: 6, borderRadius: 3,
                      background: isError ? "var(--danger)" : isActive ? "var(--ok)" : "var(--fg3)",
                      flexShrink: 0,
                    }} />
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Section 2: Knowledge Base + Departments ── */}
        <div className="grid grid-cols-2 gap-4">
          {/* Knowledge Base */}
          <section style={{ borderRadius: 6, padding: 20 }} className="bg-surface border border-border">
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }} className="mb-3 text-[var(--fg3)]">
              Knowledge Base
            </div>
            <div className="space-y-2">
              {allSlots.map(slot => {
                const count = slotCounts[slot];
                const missing = count === 0;
                return (
                  <div
                    key={slot}
                    className={`flex items-center justify-between rounded px-3 py-2 ${!missing ? "bg-surface border border-border" : ""}`}
                    style={missing ? {
                      background: "color-mix(in srgb, var(--warn) 6%, transparent)",
                      border: "1px solid color-mix(in srgb, var(--warn) 15%, transparent)",
                    } : undefined}
                  >
                    <span style={{ fontSize: 12 }} className="text-foreground">{SLOT_LABELS[slot] ?? slot}</span>
                    {missing ? (
                      <Badge variant="amber">Missing</Badge>
                    ) : (
                      <span style={{ fontSize: 11 }} className="text-ok">{count} dept{count !== 1 ? "s" : ""}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Departments */}
          <section style={{ borderRadius: 6, padding: 20 }} className="bg-surface border border-border">
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }} className="mb-3 text-[var(--fg3)]">
              Departments
            </div>
            {deptOnly.length === 0 ? (
              <p style={{ fontSize: 13 }} className="text-[var(--fg3)]">No departments created.</p>
            ) : (
              <div className="space-y-1.5">
                {deptOnly.map(d => (
                  <div key={d.id} className="flex items-center justify-between bg-surface" style={{ borderRadius: 4, padding: "6px 10px" }}>
                    <span style={{ fontSize: 12 }} className="text-foreground">{d.displayName}</span>
                    <span style={{ fontSize: 11 }} className="text-[var(--fg3)]">{d.memberCount} member{d.memberCount !== 1 ? "s" : ""}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* ── Section 3: Detection Health ── */}
        <section style={{ borderRadius: 6, padding: 20 }} className="bg-surface border border-border">
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }} className="mb-4 text-[var(--fg3)]">
            Detection Health
          </div>

          {situationTypes.length === 0 ? (
            <p style={{ fontSize: 13 }} className="text-[var(--fg3)]">No situation types configured.</p>
          ) : (
            <div className="space-y-1.5">
              {situationTypes.map(st => {
                const zeroDetections = st.totalProposed === 0;
                return (
                  <div
                    key={st.id}
                    className={`flex items-center justify-between rounded px-3 py-2 ${!zeroDetections ? "bg-surface border border-border" : ""}`}
                    style={zeroDetections ? {
                      background: "color-mix(in srgb, var(--warn) 6%, transparent)",
                      border: "1px solid color-mix(in srgb, var(--warn) 15%, transparent)",
                    } : undefined}
                  >
                    <div>
                      <span style={{ fontSize: 12, fontWeight: 500 }} className="text-foreground">{st.name}</span>
                      <span style={{ fontSize: 11 }} className="ml-3 text-[var(--fg3)]">
                        {st.totalProposed} detection{st.totalProposed !== 1 ? "s" : ""}
                      </span>
                    </div>
                    {zeroDetections && <Badge variant="amber">Check config</Badge>}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Section 4: Weekly AI Diagnostic ── */}
        <section style={{
          background: "transparent",
          border: "1px solid color-mix(in srgb, var(--accent) 20%, transparent)",
          borderRadius: 6,
          padding: 20,
        }}>
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }} className="text-accent">
              Weekly AI Diagnostic
            </span>
            <span style={{ fontSize: 11 }} className="ml-auto text-[var(--fg3)]">Coming soon</span>
          </div>
          <p style={{ fontSize: 13, lineHeight: 1.65 }} className="text-[var(--fg2)]">
            This section will show a weekly AI-generated report analyzing your setup completeness,
            detection gaps, and recommendations for improvement.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
