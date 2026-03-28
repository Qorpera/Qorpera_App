"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { QorperaLogo } from "@/components/qorpera-logo";

interface OperatorInfo {
  id: string;
  companyName: string;
  createdAt: string;
  isTestOperator: boolean;
  userCount: number;
  departmentCount: number;
  entityCount: number;
  onboardingPhase: string;
  mergeStats?: {
    total: number;
    byType: Record<string, number>;
    pending: number;
  };
  aiStats?: {
    totalAiEntities: number;
    counts: { supervised: number; notify: number; autonomous: number };
  } | null;
}

interface SystemStatus {
  situationTypeCount: number;
  lastDetectionRun: string | null;
  totalSituationsDetected: number;
  activeConnectors: number;
  aiProviderConfigured: boolean;
  aiReachable: boolean;
  cronRunning: boolean;
}

interface TestCompanyResult {
  success: boolean;
  credentials: { email: string; password: string };
  stats: Record<string, unknown>;
}

export default function AdminPage() {
  const router = useRouter();
  const [operators, setOperators] = useState<OperatorInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");
  const [entering, setEntering] = useState<string | null>(null);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [creatingTest, setCreatingTest] = useState(false);
  const [testResult, setTestResult] = useState<TestCompanyResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<OperatorInfo | null>(null);
  const [syntheticCompanies, setSyntheticCompanies] = useState<Record<string, {
    seeded: boolean;
    variants: Array<{ operatorId: string; displayName: string; model: string; phase: string; analysisStatus: string }>;
  }>>({});
  const [seedingCompany, setSeedingCompany] = useState<string | null>(null);
  const [seedResult, setSeedResult] = useState<{ company: string; credentials: Array<{ name: string; email: string; role: string }> } | null>(null);

  useEffect(() => {
    // Verify superadmin access
    Promise.all([
      fetch("/api/auth/me").then((r) => r.json()),
      fetch("/api/admin/operators").then((r) => {
        if (r.status === 403) throw new Error("forbidden");
        return r.json();
      }),
    ])
      .then(([me, ops]) => {
        if (me.user?.role !== "superadmin") {
          router.replace("/map");
          return;
        }
        setUserName(me.user.name);
        setOperators(ops);
        // Fetch system status for superadmin
        fetch("/api/situations/status")
          .then((r) => r.ok ? r.json() : null)
          .then((data) => { if (data) setSystemStatus(data); })
          .catch(() => {});
      })
      .catch(() => router.replace("/map"))
      .finally(() => setLoading(false));
  }, [router]);

  const fetchSyntheticStatus = async () => {
    try {
      const res = await fetch("/api/admin/seed-synthetic");
      if (res.ok) {
        const data = await res.json();
        setSyntheticCompanies(data.companies);
      }
    } catch { /* best-effort */ }
  };

  // Fetch synthetic status on mount
  useEffect(() => {
    fetchSyntheticStatus();
  }, []);

  // Poll while any company is analyzing
  useEffect(() => {
    const hasAnalyzing = Object.values(syntheticCompanies).some(
      (c) => c.seeded && c.variants?.some((v) => v.analysisStatus === "analyzing")
    );
    if (!hasAnalyzing) return;
    const interval = setInterval(fetchSyntheticStatus, 10000);
    return () => clearInterval(interval);
  }, [syntheticCompanies]);

  const seedCompany = async (slug: string, model?: string) => {
    const seedKey = model?.includes("sonnet") ? `${slug}-sonnet` : model?.includes("opus") ? `${slug}-opus` : slug;
    setSeedingCompany(seedKey);
    try {
      const res = await fetch("/api/admin/seed-synthetic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company: slug, model }),
      });
      const data = await res.json();
      if (res.ok) {
        setSeedResult({ company: slug, credentials: data.credentials });
        await Promise.all([refreshOperators(), fetchSyntheticStatus()]);
      } else {
        setTestError(data.error || `Failed to seed ${slug}`);
      }
    } catch {
      setTestError(`Network error seeding ${slug}`);
    } finally {
      setSeedingCompany(null);
    }
  };

  const deleteSyntheticCompany = async (slug: string, operatorId: string) => {
    try {
      const res = await fetch("/api/admin/seed-synthetic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company: slug, action: "delete", operatorId }),
      });
      if (res.ok) {
        await refreshOperators();
        await fetchSyntheticStatus();
      }
    } catch { /* best-effort */ }
  };

  const enterOperator = async (operatorId: string) => {
    setEntering(operatorId);
    try {
      const res = await fetch("/api/admin/enter-operator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operatorId }),
      });
      if (res.ok) {
        router.push("/map");
      }
    } finally {
      setEntering(null);
    }
  };

  const refreshOperators = async () => {
    const ops = await fetch("/api/admin/operators").then((r) => r.json());
    setOperators(ops);
  };

  const createTestCompany = async () => {
    setCreatingTest(true);
    setTestError(null);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/create-test-company", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setTestError(data.error || "Failed to create test company");
        return;
      }
      setTestResult(data);
      await refreshOperators();
    } catch {
      setTestError("Network error");
    } finally {
      setCreatingTest(false);
    }
  };

  const deleteOperator = async (id: string) => {
    setDeleting(id);
    try {
      const res = await fetch(`/api/admin/operators/${id}`, { method: "DELETE" });
      if (res.ok) {
        await refreshOperators();
      }
    } finally {
      setDeleting(null);
      setConfirmDelete(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-sidebar">
        <div className="text-[var(--fg3)] text-sm">Loading...</div>
      </div>
    );
  }

  const phaseColors: Record<string, string> = {
    active: "text-ok",
    mapping: "text-warn",
    populating: "text-warn",
    connecting: "text-warn",
    syncing: "text-warn",
    orienting: "text-accent",
  };

  return (
    <div className="min-h-screen bg-sidebar">
      {/* Header */}
      <div className="border-b border-border px-8 py-5">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <QorperaLogo width={32} />
            <div>
              <h1 className="font-heading text-xl font-semibold tracking-[-0.02em] text-foreground">
                Qorpera Admin
              </h1>
              <p className="text-xs text-[var(--fg2)]">{userName}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              router.push("/login");
            }}
          >
            Sign Out
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-8 py-8">
        {/* Demo Tools */}
        <div className="mb-8 wf-soft p-5 flex items-center justify-between">
          <div>
            <h3 className="text-foreground font-medium text-sm">Demo Tools</h3>
            <p className="text-xs text-[var(--fg2)] mt-0.5">
              Create a fully-populated test operator with realistic data
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            disabled={creatingTest}
            onClick={createTestCompany}
          >
            {creatingTest ? "Creating..." : "Create Test Company"}
          </Button>
        </div>
        {testError && (
          <div className="mb-4 p-3 rounded-lg bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] border border-[color-mix(in_srgb,var(--danger)_20%,transparent)] text-danger text-sm">
            {testError}
          </div>
        )}

        {/* Synthetic Companies */}
        {Object.keys(syntheticCompanies).length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-medium text-[var(--fg2)] mb-4">Simulated Companies</h2>
            <div className="space-y-4">
              {Object.entries(syntheticCompanies).map(([slug, data]) => (
                <div key={slug} className="space-y-2">
                  <h3 className="text-sm font-medium text-foreground capitalize">{slug}</h3>
                  {(() => {
                    const hasSonnet = data.variants?.some((v) => v.model?.includes("sonnet"));
                    const hasOpus = data.variants?.some((v) => v.model?.includes("opus"));
                    if (hasSonnet && hasOpus) return null;
                    return (
                      <div className="wf-soft p-4 flex items-center justify-between">
                        <span className="text-xs text-[var(--fg3)]">{!data.seeded ? "Not seeded" : "Add variant"}</span>
                        <div className="flex items-center gap-2">
                          {!hasSonnet && (
                            <Button variant="primary" size="sm" disabled={!!seedingCompany} onClick={() => seedCompany(slug, "claude-sonnet-4-20250514")}>
                              {seedingCompany === `${slug}-sonnet` ? "Seeding..." : "Seed (Sonnet)"}
                            </Button>
                          )}
                          {!hasOpus && (
                            <Button variant="primary" size="sm" disabled={!!seedingCompany} onClick={() => seedCompany(slug, "claude-opus-4-6-20250415")}>
                              {seedingCompany === `${slug}-opus` ? "Seeding..." : "Seed (Opus)"}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                  {data.seeded && data.variants?.map((v) => {
                    const phaseLabel = v.analysisStatus === "analyzing" ? "Analyzing..."
                      : v.analysisStatus === "confirming" ? "Ready for review"
                      : v.analysisStatus === "complete" ? "Complete"
                      : v.phase === "active" ? "Active"
                      : v.phase ?? "Unknown";
                    const phaseColor = v.analysisStatus === "analyzing" ? "text-warn"
                      : v.analysisStatus === "confirming" || v.analysisStatus === "complete" || v.phase === "active" ? "text-ok"
                      : "text-[var(--fg2)]";

                    return (
                      <div key={v.operatorId} className="wf-soft p-4 flex items-center justify-between">
                        <div>
                          <span className="text-sm text-foreground">{v.displayName}</span>
                          <span className={`ml-3 text-xs ${phaseColor}`}>{phaseLabel}</span>
                          {v.analysisStatus === "analyzing" && (
                            <span className="ml-2 inline-block w-3 h-3 rounded-full border-2 border-[color-mix(in_srgb,var(--warn)_40%,transparent)] border-t-warn animate-spin" />
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm" onClick={() => deleteSyntheticCompany(slug, v.operatorId)}
                            className="text-danger hover:text-danger hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)]">
                            Delete
                          </Button>
                          <Button variant="primary" size="sm" disabled={entering === v.operatorId} onClick={() => enterOperator(v.operatorId)}>
                            {entering === v.operatorId ? "Entering..." : "Enter"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Real Operators */}
        {(() => {
          const realOps = operators.filter((o) => !o.isTestOperator);
          return (
            <>
              <h2 className="text-lg font-medium text-[var(--fg2)] mb-4">
                Operators ({realOps.length})
              </h2>
              {realOps.length === 0 ? (
                <div className="wf-soft p-8 text-center">
                  <p className="text-[var(--fg2)] text-sm">No operators registered yet.</p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {realOps.map((op) => (
                    <div
                      key={op.id}
                      className="wf-soft p-5 flex items-center gap-6 hover:border-border-strong transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <h3 className="text-foreground font-medium truncate">{op.companyName}</h3>
                        <div className="flex items-center gap-4 mt-1.5 text-xs text-[var(--fg2)]">
                          <span>{op.userCount} user{op.userCount !== 1 ? "s" : ""}</span>
                          <span>{op.departmentCount} dept{op.departmentCount !== 1 ? "s" : ""}</span>
                          <span>{op.entityCount} entities</span>
                          <span className={phaseColors[op.onboardingPhase] || "text-[var(--fg2)]"}>
                            {op.onboardingPhase}
                          </span>
                          <span>
                            {new Date(op.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </span>
                        </div>
                        {op.mergeStats && op.mergeStats.total > 0 && (
                          <div className="flex items-center gap-3 mt-1 text-xs text-[var(--fg3)]">
                            <span>Merges: {op.mergeStats.total}</span>
                            {op.mergeStats.byType.auto_identity ? <span>{op.mergeStats.byType.auto_identity} email</span> : null}
                            {op.mergeStats.byType.ml_high_confidence ? <span>{op.mergeStats.byType.ml_high_confidence} ML</span> : null}
                            {op.mergeStats.byType.admin_manual ? <span>{op.mergeStats.byType.admin_manual} manual</span> : null}
                            {op.mergeStats.pending > 0 && (
                              <span className="px-1.5 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--warn)_12%,transparent)] text-warn text-[10px] font-medium">
                                {op.mergeStats.pending} pending
                              </span>
                            )}
                            <button
                              className="text-accent hover:text-accent"
                              onClick={async (e) => {
                                e.stopPropagation();
                                const res = await fetch("/api/admin/enter-operator", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ operatorId: op.id }),
                                });
                                if (res.ok) router.push("/settings?tab=merges");
                              }}
                            >
                              View
                            </button>
                          </div>
                        )}
                        {op.aiStats && (
                          <div className="flex items-center gap-3 mt-1 text-xs text-[var(--fg3)]">
                            <span>AI: {op.aiStats.totalAiEntities} entit{op.aiStats.totalAiEntities !== 1 ? "ies" : "y"}</span>
                            <span>{op.aiStats.counts.supervised} supervised</span>
                            <span>{op.aiStats.counts.notify} notify</span>
                            <span>{op.aiStats.counts.autonomous} autonomous</span>
                          </div>
                        )}
                      </div>
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={entering === op.id}
                        onClick={() => enterOperator(op.id)}
                      >
                        {entering === op.id ? "Entering..." : "Enter"}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </>
          );
        })()}

        {/* Test Operators */}
        {(() => {
          const testOps = operators.filter((o) => o.isTestOperator);
          if (testOps.length === 0) return null;
          return (
            <div className="mt-10">
              <h2 className="text-lg font-medium text-[var(--fg2)] mb-4">
                Test Operators ({testOps.length})
              </h2>
              <div className="grid gap-3">
                {testOps.map((op) => (
                  <div
                    key={op.id}
                    className="wf-soft p-5 flex items-center gap-6 hover:border-border-strong transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <h3 className="text-foreground font-medium truncate">
                        {op.companyName}
                        <span className="ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-[color-mix(in_srgb,var(--warn)_12%,transparent)] text-warn align-middle">
                          test
                        </span>
                      </h3>
                      <div className="flex items-center gap-4 mt-1.5 text-xs text-[var(--fg2)]">
                        <span>{op.userCount} user{op.userCount !== 1 ? "s" : ""}</span>
                        <span>{op.departmentCount} dept{op.departmentCount !== 1 ? "s" : ""}</span>
                        <span>{op.entityCount} entities</span>
                        <span className={phaseColors[op.onboardingPhase] || "text-[var(--fg2)]"}>
                          {op.onboardingPhase}
                        </span>
                        <span>
                          {new Date(op.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={deleting === op.id}
                        onClick={() => setConfirmDelete(op)}
                        className="text-danger hover:text-danger hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)]"
                      >
                        {deleting === op.id ? "Deleting..." : "Delete"}
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={entering === op.id}
                        onClick={() => enterOperator(op.id)}
                      >
                        {entering === op.id ? "Entering..." : "Enter"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
        {/* System Status — superadmin only */}
        {systemStatus && (
          <div className="mt-10">
            <h2 className="text-lg font-medium text-[var(--fg2)] mb-4">System Status</h2>
            <div className="wf-soft p-6 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {/* Situation Types */}
                <div>
                  <p className="text-xs text-[var(--fg2)] mb-1">Situation Types</p>
                  <p className="text-lg font-medium text-foreground">{systemStatus.situationTypeCount}</p>
                </div>
                {/* Last Detection */}
                <div>
                  <p className="text-xs text-[var(--fg2)] mb-1">Last Detection Run</p>
                  <p className="text-sm text-[var(--fg2)]">
                    {systemStatus.lastDetectionRun ? formatRelativeTime(systemStatus.lastDetectionRun) : "never"}
                  </p>
                </div>
                {/* Total Situations */}
                <div>
                  <p className="text-xs text-[var(--fg2)] mb-1">Total Situations</p>
                  <p className="text-lg font-medium text-foreground">{systemStatus.totalSituationsDetected}</p>
                </div>
                {/* Active Connectors */}
                <div>
                  <p className="text-xs text-[var(--fg2)] mb-1">Active Connectors</p>
                  <p className="text-lg font-medium text-foreground">{systemStatus.activeConnectors}</p>
                </div>
                {/* AI Provider */}
                <div>
                  <p className="text-xs text-[var(--fg2)] mb-1">AI Provider</p>
                  <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${
                    systemStatus.aiProviderConfigured
                      ? "bg-[color-mix(in_srgb,var(--ok)_12%,transparent)] text-ok"
                      : "bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] text-danger"
                  }`}>
                    {systemStatus.aiProviderConfigured ? "Configured" : "Not configured"}
                  </span>
                </div>
                {/* AI Reachable */}
                <div>
                  <p className="text-xs text-[var(--fg2)] mb-1">AI Reachable</p>
                  <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${
                    systemStatus.aiReachable
                      ? "bg-[color-mix(in_srgb,var(--ok)_12%,transparent)] text-ok"
                      : systemStatus.aiProviderConfigured
                        ? "bg-[color-mix(in_srgb,var(--warn)_12%,transparent)] text-warn"
                        : "bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] text-danger"
                  }`}>
                    {systemStatus.aiReachable ? "Yes" : "No"}
                  </span>
                </div>
              </div>
              {/* Cron status - full width */}
              <div className="pt-2 border-t border-border">
                <div className="flex items-center gap-2">
                  <p className="text-xs text-[var(--fg2)]">Detection Cron:</p>
                  <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${
                    systemStatus.cronRunning
                      ? "bg-[color-mix(in_srgb,var(--ok)_12%,transparent)] text-ok"
                      : "bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] text-danger"
                  }`}>
                    {systemStatus.cronRunning ? "Running" : "Stopped"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay backdrop-blur-sm">
          <div className="wf-soft max-w-sm w-full mx-4 p-6 space-y-4">
            <h3 className="text-lg font-medium text-foreground">Delete Test Operator</h3>
            <p className="text-sm text-[var(--fg2)]">
              Delete <span className="text-foreground">{confirmDelete.companyName}</span> and all its data?
            </p>
            <p className="text-xs text-[var(--fg3)]">
              This will permanently remove all users, entities, documents, situations, and configuration for this operator.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={deleting === confirmDelete.id}
                onClick={() => deleteOperator(confirmDelete.id)}
                className="bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] text-danger hover:bg-[color-mix(in_srgb,var(--danger)_30%,transparent)] border-[color-mix(in_srgb,var(--danger)_20%,transparent)]"
              >
                {deleting === confirmDelete.id ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Synthetic Seed Result Modal */}
      {seedResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay backdrop-blur-sm">
          <div className="wf-soft max-w-md w-full mx-4 p-6 space-y-4">
            <h3 className="text-lg font-medium text-foreground">
              {seedResult.company.charAt(0).toUpperCase() + seedResult.company.slice(1)} Seeded
            </h3>
            <p className="text-sm text-[var(--fg2)]">
              Company created. Onboarding analysis is running — agents will analyze the data and build the org structure.
            </p>
            <div className="bg-hover rounded-lg p-4 space-y-2 font-mono text-xs max-h-60 overflow-y-auto">
              {seedResult.credentials.map((cred, i) => (
                <div key={i} className="flex justify-between py-1 border-b border-border last:border-0">
                  <span className="text-[var(--fg2)]">{cred.name}</span>
                  <span className="text-foreground">{cred.email}</span>
                </div>
              ))}
              <div className="pt-2 text-[var(--fg3)]">Password: demo1234 (all accounts)</div>
            </div>
            <p className="text-xs text-[var(--fg3)]">
              Use &quot;Enter&quot; to view as the company admin, then navigate to the org map and &quot;View as&quot; any employee.
            </p>
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => setSeedResult(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {testResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay backdrop-blur-sm">
          <div className="wf-soft max-w-md w-full mx-4 p-6 space-y-4">
            <h3 className="text-lg font-medium text-foreground">Test Company Created</h3>
            <p className="text-sm text-[var(--fg2)]">
              Nordic Digital Solutions is ready. Log in with these credentials:
            </p>
            <div className="bg-hover rounded-lg p-4 space-y-2 font-mono text-sm">
              <div className="flex justify-between">
                <span className="text-[var(--fg2)]">Email</span>
                <span className="text-foreground">{testResult.credentials.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--fg2)]">Password</span>
                <span className="text-foreground">{testResult.credentials.password}</span>
              </div>
            </div>
            <p className="text-xs text-[var(--fg3)]">
              3 departments, 15 team members, 11 documents, 3 connectors,
              46 entities, 8 situation types, 15 situations, 3 policies
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setTestResult(null)}>
                Close
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  const op = operators.find((o) => o.companyName === "Nordic Digital Solutions");
                  if (op) enterOperator(op.id);
                }}
              >
                Enter Operator
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
