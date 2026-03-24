"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { fetchApi } from "@/lib/fetch-api";
import { useUser } from "@/components/user-provider";
import { ConnectorLogo } from "@/components/connector-logo";

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


// Score badge with color
function ScoreBadge({ score, max }: { score: number; max: number }) {
  const pct = max > 0 ? score / max : 0;
  const color = pct >= 0.8 ? "var(--ok)" : pct >= 0.4 ? "var(--warn)" : "var(--danger)";
  return (
    <span className="text-xs font-semibold" style={{ color }}>
      {score}/{max}
    </span>
  );
}

// ── Page ─────────────────────────────────────────────────

export default function HealthPage() {
  const router = useRouter();
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

  const activeConnectors = connectors.filter(c => c.status === "active").length;
  const errorConnectors = connectors.filter(c => c.status === "error").length;
  const totalChecks = connectors.length + allSlots.length + (deptOnly.length > 0 ? 1 : 0) + situationTypes.length;
  const passedChecks = activeConnectors + allSlots.filter(s => slotCounts[s] > 0).length + (deptOnly.length > 0 ? 1 : 0) + situationTypes.filter(st => st.totalProposed > 0).length;

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-full">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-accent" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="p-8 max-w-4xl mx-auto space-y-6">
        {/* Header with overall score */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Setup Health</h1>
            <p className="text-sm text-[var(--fg2)] mt-1">System setup overview and diagnostics</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <ScoreBadge score={passedChecks} max={totalChecks} />
            <span className="text-[10px] text-[var(--fg3)]">checks passing</span>
          </div>
        </div>

        {/* ── Section 1: Connectors ── */}
        <section className="bg-surface border border-border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-hover">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-[var(--fg2)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
              </svg>
              <h2 className="text-[13px] font-semibold text-foreground">Connectors</h2>
            </div>
            <div className="flex items-center gap-3">
              {connectors.length > 0 && (
                <div className="flex items-center gap-2 text-xs">
                  {activeConnectors > 0 && <span className="flex items-center gap-1 text-ok"><span className="w-1.5 h-1.5 rounded-full bg-ok" />{activeConnectors} active</span>}
                  {errorConnectors > 0 && <span className="flex items-center gap-1 text-danger"><span className="w-1.5 h-1.5 rounded-full bg-danger" />{errorConnectors} error</span>}
                </div>
              )}
              <Button variant="default" size="sm" onClick={() => router.push("/settings?tab=connections")}>
                Manage
              </Button>
            </div>
          </div>

          {connectors.length === 0 ? (
            <div className="text-center py-8 px-5">
              <svg className="w-8 h-8 text-[var(--fg3)] mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
              </svg>
              <p className="text-sm font-medium text-foreground mb-1">No connectors configured</p>
              <p className="text-xs text-[var(--fg2)] mb-4">Connect your business tools to start syncing data.</p>
              <Button variant="primary" size="sm" onClick={() => router.push("/settings?tab=connections")}>
                Connect a tool
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {connectors.map(c => {
                const isError = c.status === "error";
                const isActive = c.status === "active";
                return (
                  <button
                    key={c.id}
                    onClick={() => router.push("/settings?tab=connections")}
                    className={`w-full flex items-center gap-3 px-5 py-3 text-left transition hover:bg-hover ${
                      isError ? "bg-[color-mix(in_srgb,var(--danger)_3%,transparent)]" : ""
                    }`}
                  >
                    <ConnectorLogo provider={c.provider} size={22} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium text-foreground truncate">{c.name || c.providerName}</div>
                      {c.name && c.providerName && c.name !== c.providerName && (
                        <div className="text-[10px] text-[var(--fg3)]">{c.providerName}</div>
                      )}
                    </div>
                    <div className={`text-[11px] ${isError ? "text-danger" : isActive ? "text-ok" : "text-[var(--fg3)]"}`}>
                      {isError ? "Sync error" : isActive ? `Synced ${timeAgo(c.lastSyncAt)}` : "Inactive"}
                    </div>
                    <div
                      className="flex-shrink-0 rounded-full"
                      style={{
                        width: 8, height: 8,
                        background: isError ? "var(--danger)" : isActive ? "var(--ok)" : "var(--fg4)",
                      }}
                    />
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Section 2: Knowledge Base + Departments ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Knowledge Base */}
          <section className="bg-surface border border-border rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-hover">
              <svg className="w-4 h-4 text-[var(--fg2)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
              </svg>
              <h2 className="text-[13px] font-semibold text-foreground">Knowledge Base</h2>
            </div>
            <div className="p-4 space-y-2">
              {allSlots.map(slot => {
                const count = slotCounts[slot];
                const ok = count > 0;
                return (
                  <button
                    key={slot}
                    onClick={() => router.push("/map")}
                    className={`w-full flex items-center justify-between rounded-md px-3 py-2.5 text-left transition hover:bg-hover ${
                      ok ? "bg-elevated border border-border" : "bg-[color-mix(in_srgb,var(--warn)_6%,transparent)] border border-[color-mix(in_srgb,var(--warn)_15%,transparent)]"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {ok ? (
                        <svg className="w-4 h-4 text-ok flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      ) : (
                        <svg className="w-4 h-4 text-warn flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                      )}
                      <span className="text-[13px] text-foreground">{SLOT_LABELS[slot] ?? slot}</span>
                    </div>
                    {ok ? (
                      <span className="text-[12px] font-medium text-ok">{count} dept{count !== 1 ? "s" : ""}</span>
                    ) : (
                      <span className="text-[11px] font-medium text-warn">Not uploaded</span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Departments */}
          <section className="bg-surface border border-border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-hover">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-[var(--fg2)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21" />
                </svg>
                <h2 className="text-[13px] font-semibold text-foreground">Departments</h2>
              </div>
              <span className="text-xs font-medium text-[var(--fg2)]">{deptOnly.length} total</span>
            </div>
            {deptOnly.length === 0 ? (
              <div className="text-center py-6 px-5">
                <p className="text-sm text-[var(--fg2)] mb-3">No departments created yet.</p>
                <Button variant="primary" size="sm" onClick={() => router.push("/map")}>
                  Create department
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {deptOnly.map(d => (
                  <button
                    key={d.id}
                    onClick={() => router.push(`/map/${d.id}`)}
                    className="w-full flex items-center justify-between px-5 py-2.5 hover:bg-hover transition text-left"
                  >
                    <span className="text-[13px] font-medium text-foreground">{d.displayName}</span>
                    <div className="flex items-center gap-3 text-[12px] text-[var(--fg2)]">
                      <span>{d.memberCount} member{d.memberCount !== 1 ? "s" : ""}</span>
                      <span>{d.documentCount} doc{d.documentCount !== 1 ? "s" : ""}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* ── Section 3: Detection Health ── */}
        <section className="bg-surface border border-border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-hover">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-[var(--fg2)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <h2 className="text-[13px] font-semibold text-foreground">Detection Health</h2>
            </div>
            {situationTypes.length > 0 && (() => {
              const detecting = situationTypes.filter(st => st.totalProposed > 0).length;
              const total = situationTypes.length;
              const allGood = detecting === total;
              return (
                <span className={`text-xs font-semibold ${allGood ? "text-ok" : "text-danger"}`}>
                  {detecting}/{total} detecting
                </span>
              );
            })()}
          </div>

          {situationTypes.length === 0 ? (
            <div className="text-center py-6 px-5">
              <p className="text-sm text-[var(--fg2)]">No situation types configured yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {situationTypes.map(st => {
                const zero = st.totalProposed === 0;
                return (
                  <button
                    key={st.id}
                    onClick={() => router.push(zero ? "/governance" : "/situations")}
                    className={`w-full flex items-center justify-between px-5 py-3 text-left transition group ${
                      zero
                        ? "bg-[color-mix(in_srgb,var(--warn)_8%,transparent)] hover:bg-[color-mix(in_srgb,var(--warn)_14%,transparent)]"
                        : "hover:bg-hover"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      {zero ? (
                        <div className="w-6 h-6 rounded-full bg-warn flex items-center justify-center flex-shrink-0">
                          <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008v.008H12v-.008z" /></svg>
                        </div>
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-ok flex items-center justify-center flex-shrink-0">
                          <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                        </div>
                      )}
                      <div>
                        <span className="text-[13px] font-medium text-foreground">{st.name}</span>
                        <div className={`text-[11px] ${zero ? "text-warn font-medium" : "text-[var(--fg2)]"}`}>
                          {zero ? "No detections — check configuration" : `${st.totalProposed} detection${st.totalProposed !== 1 ? "s" : ""}`}
                        </div>
                      </div>
                    </div>
                    {zero && (
                      <span className="text-[11px] font-semibold text-warn bg-[color-mix(in_srgb,var(--warn)_20%,transparent)] px-2.5 py-1 rounded-full group-hover:bg-[color-mix(in_srgb,var(--warn)_30%,transparent)] transition">
                        Fix &rarr;
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Section 4: AI Diagnostic ── */}
        <section className="bg-[color-mix(in_srgb,var(--accent)_4%,transparent)] border border-[color-mix(in_srgb,var(--accent)_15%,transparent)] rounded-lg p-5">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
            <h2 className="text-[13px] font-semibold text-accent">Weekly AI Diagnostic</h2>
            <span className="text-[10px] font-medium ml-auto px-2 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-accent">Coming soon</span>
          </div>
          <p className="text-sm text-[var(--fg2)] leading-relaxed">
            A weekly AI-generated report analyzing your setup completeness, detection gaps, and recommendations for improvement.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
