"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { Department } from "./types";

interface StepSyncProps {
  departments: Department[];
  setDepartments: (d: Department[]) => void;
}

export function StepSync({ departments, setDepartments }: StepSyncProps) {
  const router = useRouter();
  const realDepts = departments.filter(d => d.entityType?.slug === "department");

  const [syncStarted, setSyncStarted] = useState(false);
  const [syncDone, setSyncDone] = useState(false);
  const [manualSyncInProgress, setManualSyncInProgress] = useState(false);
  const [manualSyncResult, setManualSyncResult] = useState<{
    synced: Array<{ name: string; status: string }>;
    errors: Array<{ name: string; error: string }>;
  } | null>(null);
  const [deptEntityCounts, setDeptEntityCounts] = useState<Record<string, number>>({});
  const [totalEntities, setTotalEntities] = useState(0);
  const [totalRelationships, setTotalRelationships] = useState(0);
  const syncPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevCountsRef = useRef<string>("");
  const stableCountRef = useRef(0);

  useEffect(() => {
    if (!syncStarted) {
      setSyncStarted(true);
      fetch("/api/connectors/sync-all", { method: "POST" })
        .then(r => r.json())
        .then(() => setSyncDone(true))
        .catch(() => setSyncDone(true));
    }

    if (syncPollRef.current) return;
    syncPollRef.current = setInterval(async () => {
      try {
        const [deptRes, ctxRes] = await Promise.all([
          fetch("/api/departments"),
          fetch("/api/copilot/context"),
        ]);
        if (deptRes.ok) {
          const depts: Department[] = await deptRes.json();
          setDepartments(depts);
          const counts: Record<string, number> = {};
          depts.forEach(d => {
            if (d.entityType?.slug === "department") {
              counts[d.id] = d.memberCount;
            }
          });
          setDeptEntityCounts(counts);

          const snapshot = JSON.stringify(counts);
          if (snapshot === prevCountsRef.current) {
            stableCountRef.current++;
          } else {
            stableCountRef.current = 0;
          }
          prevCountsRef.current = snapshot;
        }
        if (ctxRes.ok) {
          const ctx = await ctxRes.json();
          setTotalEntities(ctx.totalEntities ?? 0);
          setTotalRelationships(ctx.totalRelationships ?? 0);
        }
      } catch { /* ignore */ }
    }, 3000);

    return () => {
      if (syncPollRef.current) {
        clearInterval(syncPollRef.current);
        syncPollRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const syncComplete = syncDone || stableCountRef.current >= 2;

  async function handleFinish() {
    if (syncPollRef.current) {
      clearInterval(syncPollRef.current);
      syncPollRef.current = null;
    }
    const res = await fetch("/api/orientation/advance", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetPhase: "orienting" }),
    });
    if (!res.ok) {
      await fetch("/api/orientation/advance", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      await fetch("/api/orientation/advance", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    }
    router.replace("/copilot");
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <p className="text-xs text-white/30 uppercase tracking-wider">Step 6 of 6</p>
        <h1 className="text-2xl font-semibold text-white/90">
          {syncComplete ? "Your business model" : "Learning your business..."}
        </h1>
        <p className="text-sm text-white/45">
          {syncComplete
            ? "Here's what we discovered from your connected tools."
            : "Syncing and analyzing your connected data sources."}
        </p>
      </div>

      {/* Manual Start Sync button */}
      <div className="flex flex-col items-center gap-3">
        <Button
          variant="primary"
          size="md"
          disabled={manualSyncInProgress}
          onClick={async () => {
            setManualSyncInProgress(true);
            setManualSyncResult(null);
            try {
              const res = await fetch("/api/connectors/sync-all", { method: "POST" });
              if (res.ok) {
                const data = await res.json();
                setManualSyncResult({
                  synced: (data.synced || []).map((s: { name: string; status: string }) => ({ name: s.name, status: s.status })),
                  errors: (data.errors || []).map((e: { name: string; error: string }) => ({ name: e.name, error: e.error })),
                });
              } else {
                setManualSyncResult({ synced: [], errors: [{ name: "Sync", error: "Request failed" }] });
              }
            } catch {
              setManualSyncResult({ synced: [], errors: [{ name: "Sync", error: "Network error" }] });
            }
            setManualSyncInProgress(false);
          }}
        >
          {manualSyncInProgress ? (
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Syncing...
            </span>
          ) : "Start Sync"}
        </Button>
        {manualSyncResult && (
          <div className="w-full space-y-1">
            <p className="text-xs text-center text-white/60">
              Synced {manualSyncResult.synced.length} connector{manualSyncResult.synced.length !== 1 ? "s" : ""}.
              {manualSyncResult.errors.length > 0 && (
                <span className="text-red-400"> {manualSyncResult.errors.length} error{manualSyncResult.errors.length !== 1 ? "s" : ""}.</span>
              )}
            </p>
            {manualSyncResult.errors.map((e, i) => (
              <p key={i} className="text-[11px] text-red-400/80 text-center">{e.name}: {e.error}</p>
            ))}
          </div>
        )}
      </div>

      {/* Per-department progress */}
      <div className="space-y-3">
        {realDepts.map(dept => {
          const count = deptEntityCounts[dept.id] ?? dept.memberCount ?? 0;
          return (
            <div key={dept.id} className="wf-soft p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-white/90">{dept.displayName}</h3>
                {syncComplete ? (
                  <span className="text-xs text-emerald-400 font-medium">Done</span>
                ) : (
                  <div className="w-3 h-3 rounded-full border-2 border-purple-500/40 border-t-purple-400 animate-spin" />
                )}
              </div>
              <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden mb-2">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${syncComplete ? "bg-emerald-500" : "bg-purple-500"}`}
                  style={{ width: syncComplete ? "100%" : `${Math.min(80, count * 5)}%` }}
                />
              </div>
              <p className="text-xs text-white/40">
                {count} {count === 1 ? "entity" : "entities"}
              </p>
            </div>
          );
        })}
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 gap-3">
        <div className="wf-soft p-4 text-center">
          <div className="text-2xl font-semibold text-white/90">{totalEntities}</div>
          <div className="text-xs text-white/40 mt-1">Total entities</div>
        </div>
        <div className="wf-soft p-4 text-center">
          <div className="text-2xl font-semibold text-white/90">{totalRelationships}</div>
          <div className="text-xs text-white/40 mt-1">Relationships</div>
        </div>
      </div>

      {syncComplete && (
        <div className="flex justify-center pt-4">
          <Button variant="primary" size="lg" onClick={handleFinish}>
            Ready! Let&apos;s talk about your business &rarr;
          </Button>
        </div>
      )}

      {!syncComplete && (
        <p className="text-xs text-white/25 text-center">
          This may take a moment depending on your data volume.
        </p>
      )}
    </div>
  );
}
