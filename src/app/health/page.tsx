"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
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

// Real connector logos as inline SVGs
function ConnectorLogo({ provider, size = 20 }: { provider: string; size?: number }) {
  const p = provider?.toLowerCase();
  const s = size;
  // Google "G" multicolor
  if (p === "google" || p === "google-workspace" || p === "google-ads") return (
    <svg width={s} height={s} viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
  );
  // Gmail envelope
  if (p === "gmail") return (
    <svg width={s} height={s} viewBox="0 0 24 24"><path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 010 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" fill="#EA4335"/></svg>
  );
  // Slack hash
  if (p === "slack") return (
    <svg width={s} height={s} viewBox="0 0 24 24"><path d="M5.042 15.165a2.528 2.528 0 01-2.52 2.523A2.528 2.528 0 010 15.165a2.527 2.527 0 012.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 012.521-2.52 2.527 2.527 0 012.521 2.52v6.313A2.528 2.528 0 018.834 24a2.528 2.528 0 01-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 01-2.521-2.52A2.528 2.528 0 018.834 0a2.528 2.528 0 012.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 012.521 2.521 2.528 2.528 0 01-2.521 2.521H2.522A2.528 2.528 0 010 8.834a2.528 2.528 0 012.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 012.522-2.521A2.528 2.528 0 0124 8.834a2.528 2.528 0 01-2.522 2.521h-2.522V8.834zm-1.27 0a2.528 2.528 0 01-2.523 2.521 2.527 2.527 0 01-2.52-2.521V2.522A2.527 2.527 0 0115.163 0a2.528 2.528 0 012.523 2.522v6.312zM15.163 18.956a2.528 2.528 0 012.523 2.522A2.528 2.528 0 0115.163 24a2.527 2.527 0 01-2.52-2.522v-2.522h2.52zm0-1.27a2.527 2.527 0 01-2.52-2.523 2.527 2.527 0 012.52-2.52h6.315A2.528 2.528 0 0124 15.163a2.528 2.528 0 01-2.522 2.523h-6.315z" fill="#E01E5A"/></svg>
  );
  // HubSpot sprocket
  if (p === "hubspot") return (
    <svg width={s} height={s} viewBox="0 0 24 24"><path d="M18.164 7.93V5.084a2.198 2.198 0 001.267-1.984v-.066A2.198 2.198 0 0017.236.839h-.066a2.198 2.198 0 00-2.195 2.195v.066c0 .87.514 1.617 1.252 1.97v2.86a5.892 5.892 0 00-2.675 1.396l-7.103-5.525a2.55 2.55 0 00.076-.605 2.553 2.553 0 00-2.553-2.553A2.553 2.553 0 001.42 3.196a2.553 2.553 0 002.553 2.553c.426 0 .824-.107 1.176-.293l6.998 5.445a5.902 5.902 0 00-.905 3.142 5.93 5.93 0 001.01 3.315l-2.16 2.16a1.905 1.905 0 00-.554-.088 1.926 1.926 0 101.926 1.926c0-.194-.035-.38-.088-.554l2.108-2.108a5.93 5.93 0 003.553 1.18 5.936 5.936 0 005.936-5.936 5.934 5.934 0 00-4.81-5.828zm-.993 8.576a2.761 2.761 0 01-2.766-2.766 2.761 2.761 0 012.766-2.766 2.761 2.761 0 012.766 2.766 2.761 2.761 0 01-2.766 2.766z" fill="#FF7A59"/></svg>
  );
  // Stripe "S"
  if (p === "stripe") return (
    <svg width={s} height={s} viewBox="0 0 24 24"><path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.918 3.757 7.076c0 4.72 2.888 6.017 6.012 7.180 2.136.794 3.24 1.4 3.24 2.453 0 .93-.796 1.487-2.252 1.487-1.907 0-4.926-.932-6.755-2.022l-.89 5.494C4.932 22.585 7.637 24 11.757 24c2.6 0 4.717-.644 6.136-1.872 1.575-1.363 2.35-3.251 2.35-5.616 0-4.82-2.94-6.102-6.267-7.362z" fill="#635BFF"/></svg>
  );
  // Microsoft four squares
  if (p === "microsoft" || p === "outlook") return (
    <svg width={s} height={s} viewBox="0 0 24 24"><rect x="1" y="1" width="10" height="10" fill="#F25022"/><rect x="13" y="1" width="10" height="10" fill="#7FBA00"/><rect x="1" y="13" width="10" height="10" fill="#00A4EF"/><rect x="13" y="13" width="10" height="10" fill="#FFB900"/></svg>
  );
  // Shopify bag
  if (p === "shopify") return (
    <svg width={s} height={s} viewBox="0 0 24 24"><path d="M15.337 23.979l7.216-1.561s-2.604-17.613-2.625-17.73c-.018-.116-.114-.192-.211-.192s-2.007-.141-2.007-.141-.937-.937-1.174-1.174c-.076-.076-.165-.112-.259-.123l-.865 19.921zm-1.337-19.885c-.043 0-.074.011-.106.011 0 0-.213.054-.533.15-.318-.918-.879-1.762-1.87-1.762h-.088c-.281-.363-.631-.526-.938-.526-2.32 0-3.434 2.898-3.78 4.373-.898.278-1.538.476-1.616.501-.505.158-.52.173-.586.647-.05.356-1.364 10.502-1.364 10.502L14.17 20l-.17-15.906z" fill="#95BF47"/></svg>
  );
  // LinkedIn "in"
  if (p === "linkedin") return (
    <svg width={s} height={s} viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" fill="#0A66C2"/></svg>
  );
  // Meta "f"
  if (p === "meta-ads") return (
    <svg width={s} height={s} viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" fill="#1877F2"/></svg>
  );
  // Salesforce cloud
  if (p === "salesforce") return (
    <svg width={s} height={s} viewBox="0 0 24 24"><path d="M10.006 5.415a4.195 4.195 0 013.045-1.306c1.56 0 2.954.9 3.69 2.205.63-.3 1.35-.45 2.1-.45 2.85 0 5.16 2.34 5.16 5.22s-2.31 5.22-5.16 5.22c-.45 0-.87-.06-1.29-.165a3.87 3.87 0 01-3.39 2.01 3.93 3.93 0 01-1.89-.48 4.8 4.8 0 01-4.17 2.445c-2.37 0-4.38-1.71-4.77-3.99a4.095 4.095 0 01-1.62.33C.84 16.455 0 14.865 0 13.455c0-1.68.99-3.135 2.43-3.78-.15-.465-.24-.96-.24-1.485C2.19 5.43 4.62 3 7.605 3c1.2 0 2.31.45 3.15 1.17l-.75 1.245z" fill="#00A1E0"/></svg>
  );
  // Pipedrive
  if (p === "pipedrive") return (
    <svg width={s} height={s} viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#1B1B1B"/><text x="12" y="16" textAnchor="middle" fill="#fff" fontSize="12" fontWeight="700">P</text></svg>
  );
  // Intercom
  if (p === "intercom") return (
    <svg width={s} height={s} viewBox="0 0 24 24"><path d="M20.4 0H3.6A3.6 3.6 0 000 3.6v16.8A3.6 3.6 0 003.6 24h16.8a3.6 3.6 0 003.6-3.6V3.6A3.6 3.6 0 0020.4 0zM6 14.4V7.2h2.4v7.2H6zm4.8.6V6.6h2.4v8.4h-2.4zm4.8-.6V7.2H18v7.2h-2.4zm3 3.6a.6.6 0 01-.42-.18C17.1 16.77 14.64 15.6 12 15.6s-5.1 1.17-6.18 2.22A.6.6 0 015.4 18V16.2c0-.18.06-.36.18-.48C6.72 14.58 9.24 13.2 12 13.2s5.28 1.38 6.42 2.52c.12.12.18.3.18.48V18z" fill="#286EFA"/></svg>
  );
  // Zendesk
  if (p === "zendesk") return (
    <svg width={s} height={s} viewBox="0 0 24 24"><path d="M11.1 8.52V24H0L11.1 8.52zM11.1 0a5.55 5.55 0 11-11.1 0h11.1zM12.9 15.48V0H24L12.9 15.48zM12.9 24a5.55 5.55 0 1111.1 0H12.9z" fill="#03363D"/></svg>
  );
  // Fallback
  return (
    <div className="flex items-center justify-center rounded-md text-[11px] font-bold" style={{ width: s, height: s, background: "var(--border)", color: "var(--fg2)" }}>
      {provider?.[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

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
                      <span className="text-[13px] font-medium text-foreground">{c.name || c.providerName}</span>
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
            {situationTypes.length > 0 && (
              <div className="text-xs text-[var(--fg2)]">
                {situationTypes.filter(st => st.totalProposed > 0).length}/{situationTypes.length} detecting
              </div>
            )}
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
                  <div
                    key={st.id}
                    className={`flex items-center justify-between px-5 py-2.5 ${
                      zero ? "bg-[color-mix(in_srgb,var(--warn)_4%,transparent)]" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {zero ? (
                        <svg className="w-4 h-4 text-warn flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                      ) : (
                        <svg className="w-4 h-4 text-ok flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      )}
                      <span className="text-[13px] font-medium text-foreground">{st.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-[12px] ${zero ? "text-warn font-medium" : "text-[var(--fg2)]"}`}>
                        {zero ? "No detections" : `${st.totalProposed} detection${st.totalProposed !== 1 ? "s" : ""}`}
                      </span>
                    </div>
                  </div>
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
