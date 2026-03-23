"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

// Connector display info with proper SVG icons
const CONNECTOR_INFO: Record<string, { label: string; color: string; icon: string }> = {
  google: { label: "Google", color: "#4285f4", icon: "G" },
  gmail: { label: "Gmail", color: "#ea4335", icon: "M" },
  "google-workspace": { label: "Google Workspace", color: "#4285f4", icon: "G" },
  "google-ads": { label: "Google Ads", color: "#fbbc04", icon: "A" },
  slack: { label: "Slack", color: "#611f69", icon: "#" },
  hubspot: { label: "HubSpot", color: "#ff7a59", icon: "H" },
  stripe: { label: "Stripe", color: "#635bff", icon: "S" },
  microsoft: { label: "Microsoft", color: "#00a4ef", icon: "M" },
  outlook: { label: "Outlook", color: "#0078d4", icon: "O" },
  shopify: { label: "Shopify", color: "#96bf48", icon: "S" },
  linkedin: { label: "LinkedIn", color: "#0a66c2", icon: "in" },
  "meta-ads": { label: "Meta Ads", color: "#1877f2", icon: "f" },
  salesforce: { label: "Salesforce", color: "#00a1e0", icon: "SF" },
  pipedrive: { label: "Pipedrive", color: "#1b1b1b", icon: "P" },
  intercom: { label: "Intercom", color: "#286efa", icon: "I" },
  zendesk: { label: "Zendesk", color: "#03363d", icon: "Z" },
};

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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Setup Health</h1>
            <p className="text-sm text-[var(--fg2)] mt-1">System setup overview and diagnostics</p>
          </div>
        </div>

        {/* ── Section 1: Connectors ── */}
        <section className="bg-surface border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--fg2)]">
              Connectors
            </h2>
            {connectors.length > 0 && (
              <span className="text-xs text-[var(--fg2)]">
                {activeConnectors} active{errorConnectors > 0 && <span className="text-danger ml-1">&middot; {errorConnectors} error</span>}
              </span>
            )}
          </div>

          {connectors.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-[var(--fg2)] mb-3">No connectors configured yet.</p>
              <Button variant="primary" size="sm" onClick={() => router.push("/settings?tab=connections")}>
                Connect a tool
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {connectors.map(c => {
                const isError = c.status === "error";
                const isActive = c.status === "active";
                const info = CONNECTOR_INFO[c.provider?.toLowerCase()] ?? { label: c.providerName, color: "var(--fg2)", icon: "?" };
                return (
                  <button
                    key={c.id}
                    onClick={() => router.push("/settings?tab=connections")}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-hover ${
                      isError
                        ? "bg-[color-mix(in_srgb,var(--danger)_5%,transparent)] border border-[color-mix(in_srgb,var(--danger)_15%,transparent)]"
                        : "bg-surface border border-border"
                    }`}
                  >
                    {/* Provider icon */}
                    <div
                      className="flex items-center justify-center rounded-md flex-shrink-0"
                      style={{
                        width: 32, height: 32,
                        background: `color-mix(in srgb, ${info.color} 12%, transparent)`,
                        color: info.color,
                        fontSize: info.icon.length > 1 ? 10 : 13,
                        fontWeight: 700,
                      }}
                    >
                      {info.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium truncate text-foreground">{c.name || info.label}</div>
                      <div className={`text-[11px] ${isError ? "text-danger" : isActive ? "text-ok" : "text-[var(--fg3)]"}`}>
                        {isError ? "Sync error" : isActive ? `Synced ${timeAgo(c.lastSyncAt)}` : "Not connected"}
                      </div>
                    </div>
                    {/* Status dot */}
                    <div
                      className="flex-shrink-0 rounded-full"
                      style={{
                        width: 7, height: 7,
                        background: isError ? "var(--danger)" : isActive ? "var(--ok)" : "var(--fg3)",
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
          <section className="bg-surface border border-border rounded-lg p-5">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--fg2)] mb-3">
              Knowledge Base
            </h2>
            <div className="space-y-2">
              {allSlots.map(slot => {
                const count = slotCounts[slot];
                const missing = count === 0;
                return (
                  <div
                    key={slot}
                    className={`flex items-center justify-between rounded-md px-3 py-2 ${
                      missing
                        ? "bg-[color-mix(in_srgb,var(--warn)_6%,transparent)] border border-[color-mix(in_srgb,var(--warn)_15%,transparent)]"
                        : "bg-elevated border border-border"
                    }`}
                  >
                    <span className="text-[13px] text-foreground">{SLOT_LABELS[slot] ?? slot}</span>
                    {missing ? (
                      <Badge variant="amber">Missing</Badge>
                    ) : (
                      <span className="text-[12px] font-medium text-ok">{count} dept{count !== 1 ? "s" : ""}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Departments */}
          <section className="bg-surface border border-border rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--fg2)]">
                Departments
              </h2>
              <span className="text-xs text-[var(--fg2)]">{deptOnly.length} total</span>
            </div>
            {deptOnly.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-sm text-[var(--fg2)] mb-3">No departments created.</p>
                <Button variant="primary" size="sm" onClick={() => router.push("/map")}>
                  Create department
                </Button>
              </div>
            ) : (
              <div className="space-y-1.5">
                {deptOnly.map(d => (
                  <button
                    key={d.id}
                    onClick={() => router.push(`/map/${d.id}`)}
                    className="w-full flex items-center justify-between rounded-md px-3 py-2 bg-elevated border border-border hover:bg-hover transition text-left"
                  >
                    <span className="text-[13px] font-medium text-foreground">{d.displayName}</span>
                    <span className="text-[12px] text-[var(--fg2)]">{d.memberCount} member{d.memberCount !== 1 ? "s" : ""}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* ── Section 3: Detection Health ── */}
        <section className="bg-surface border border-border rounded-lg p-5">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--fg2)] mb-4">
            Detection Health
          </h2>

          {situationTypes.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-sm text-[var(--fg2)]">No situation types configured.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {situationTypes.map(st => {
                const zeroDetections = st.totalProposed === 0;
                return (
                  <div
                    key={st.id}
                    className={`flex items-center justify-between rounded-md px-3 py-2 ${
                      zeroDetections
                        ? "bg-[color-mix(in_srgb,var(--warn)_6%,transparent)] border border-[color-mix(in_srgb,var(--warn)_15%,transparent)]"
                        : "bg-elevated border border-border"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-[13px] font-medium text-foreground">{st.name}</span>
                      <span className="text-[12px] text-[var(--fg2)]">
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
        <section className="border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] rounded-lg p-5">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-accent">
              Weekly AI Diagnostic
            </span>
            <span className="text-[12px] ml-auto text-[var(--fg3)]">Coming soon</span>
          </div>
          <p className="text-sm text-[var(--fg2)] leading-relaxed">
            This section will show a weekly AI-generated report analyzing your setup completeness,
            detection gaps, and recommendations for improvement.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
