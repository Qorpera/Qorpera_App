"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface OperatorInfo {
  id: string;
  companyName: string;
  createdAt: string;
  isTestOperator: boolean;
  userCount: number;
  departmentCount: number;
  entityCount: number;
  onboardingPhase: string;
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
      <div className="min-h-screen flex items-center justify-center bg-[#0e1418]">
        <div className="text-white/30 text-sm">Loading...</div>
      </div>
    );
  }

  const phaseColors: Record<string, string> = {
    active: "text-emerald-400",
    mapping: "text-amber-400",
    populating: "text-amber-400",
    connecting: "text-amber-400",
    syncing: "text-amber-400",
    orienting: "text-purple-400",
  };

  return (
    <div className="min-h-screen bg-[#0e1418]">
      {/* Header */}
      <div className="border-b border-white/[0.06] px-8 py-5">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg viewBox="0 0 40 40" className="w-8 h-8" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.5 23 C17 21, 9 12, 3 5" stroke="white" strokeWidth="1.1" strokeLinecap="round" />
              <circle cx="27" cy="27" r="6.5" stroke="white" strokeWidth="1.1" />
            </svg>
            <div>
              <h1 className="font-heading text-xl font-semibold tracking-[-0.02em] text-white/90">
                Qorpera Admin
              </h1>
              <p className="text-xs text-white/40">{userName}</p>
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
            <h3 className="text-white/80 font-medium text-sm">Demo Tools</h3>
            <p className="text-xs text-white/40 mt-0.5">
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
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {testError}
          </div>
        )}

        {/* Real Operators */}
        {(() => {
          const realOps = operators.filter((o) => !o.isTestOperator);
          return (
            <>
              <h2 className="text-lg font-medium text-white/70 mb-4">
                Operators ({realOps.length})
              </h2>
              {realOps.length === 0 ? (
                <div className="wf-soft p-8 text-center">
                  <p className="text-white/40 text-sm">No operators registered yet.</p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {realOps.map((op) => (
                    <div
                      key={op.id}
                      className="wf-soft p-5 flex items-center gap-6 hover:border-white/[0.12] transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <h3 className="text-white/80 font-medium truncate">{op.companyName}</h3>
                        <div className="flex items-center gap-4 mt-1.5 text-xs text-white/40">
                          <span>{op.userCount} user{op.userCount !== 1 ? "s" : ""}</span>
                          <span>{op.departmentCount} dept{op.departmentCount !== 1 ? "s" : ""}</span>
                          <span>{op.entityCount} entities</span>
                          <span className={phaseColors[op.onboardingPhase] || "text-white/40"}>
                            {op.onboardingPhase}
                          </span>
                          <span>
                            {new Date(op.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </span>
                        </div>
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
              <h2 className="text-lg font-medium text-white/70 mb-4">
                Test Operators ({testOps.length})
              </h2>
              <div className="grid gap-3">
                {testOps.map((op) => (
                  <div
                    key={op.id}
                    className="wf-soft p-5 flex items-center gap-6 hover:border-white/[0.12] transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <h3 className="text-white/80 font-medium truncate">
                        {op.companyName}
                        <span className="ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/15 text-amber-400 align-middle">
                          test
                        </span>
                      </h3>
                      <div className="flex items-center gap-4 mt-1.5 text-xs text-white/40">
                        <span>{op.userCount} user{op.userCount !== 1 ? "s" : ""}</span>
                        <span>{op.departmentCount} dept{op.departmentCount !== 1 ? "s" : ""}</span>
                        <span>{op.entityCount} entities</span>
                        <span className={phaseColors[op.onboardingPhase] || "text-white/40"}>
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
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
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
            <h2 className="text-lg font-medium text-white/70 mb-4">System Status</h2>
            <div className="wf-soft p-6 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {/* Situation Types */}
                <div>
                  <p className="text-xs text-white/40 mb-1">Situation Types</p>
                  <p className="text-lg font-medium text-white/80">{systemStatus.situationTypeCount}</p>
                </div>
                {/* Last Detection */}
                <div>
                  <p className="text-xs text-white/40 mb-1">Last Detection Run</p>
                  <p className="text-sm text-white/70">
                    {systemStatus.lastDetectionRun ? formatRelativeTime(systemStatus.lastDetectionRun) : "never"}
                  </p>
                </div>
                {/* Total Situations */}
                <div>
                  <p className="text-xs text-white/40 mb-1">Total Situations</p>
                  <p className="text-lg font-medium text-white/80">{systemStatus.totalSituationsDetected}</p>
                </div>
                {/* Active Connectors */}
                <div>
                  <p className="text-xs text-white/40 mb-1">Active Connectors</p>
                  <p className="text-lg font-medium text-white/80">{systemStatus.activeConnectors}</p>
                </div>
                {/* AI Provider */}
                <div>
                  <p className="text-xs text-white/40 mb-1">AI Provider</p>
                  <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${
                    systemStatus.aiProviderConfigured
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "bg-red-500/15 text-red-400"
                  }`}>
                    {systemStatus.aiProviderConfigured ? "Configured" : "Not configured"}
                  </span>
                </div>
                {/* AI Reachable */}
                <div>
                  <p className="text-xs text-white/40 mb-1">AI Reachable</p>
                  <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${
                    systemStatus.aiReachable
                      ? "bg-emerald-500/15 text-emerald-400"
                      : systemStatus.aiProviderConfigured
                        ? "bg-amber-500/15 text-amber-400"
                        : "bg-red-500/15 text-red-400"
                  }`}>
                    {systemStatus.aiReachable ? "Yes" : "No"}
                  </span>
                </div>
              </div>
              {/* Cron status - full width */}
              <div className="pt-2 border-t border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <p className="text-xs text-white/40">Detection Cron:</p>
                  <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${
                    systemStatus.cronRunning
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "bg-red-500/15 text-red-400"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="wf-soft max-w-sm w-full mx-4 p-6 space-y-4">
            <h3 className="text-lg font-medium text-white/90">Delete Test Operator</h3>
            <p className="text-sm text-white/50">
              Delete <span className="text-white/80">{confirmDelete.companyName}</span> and all its data?
            </p>
            <p className="text-xs text-white/30">
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
                className="bg-red-500/20 text-red-400 hover:bg-red-500/30 border-red-500/20"
              >
                {deleting === confirmDelete.id ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {testResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="wf-soft max-w-md w-full mx-4 p-6 space-y-4">
            <h3 className="text-lg font-medium text-white/90">Test Company Created</h3>
            <p className="text-sm text-white/50">
              Nordic Digital Solutions is ready. Log in with these credentials:
            </p>
            <div className="bg-white/[0.04] rounded-lg p-4 space-y-2 font-mono text-sm">
              <div className="flex justify-between">
                <span className="text-white/40">Email</span>
                <span className="text-white/80">{testResult.credentials.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/40">Password</span>
                <span className="text-white/80">{testResult.credentials.password}</span>
              </div>
            </div>
            <p className="text-xs text-white/30">
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
