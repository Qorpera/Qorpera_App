"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ONBOARDING_SCRIPT } from "@/lib/demo/onboarding-script";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface ProgressMessage {
  timestamp: string;
  message: string;
  agentName?: string;
}

interface AnalysisProgress {
  status: "pending" | "analyzing" | "confirming" | "complete" | "failed";
  currentPhase: string;
  progressMessages: ProgressMessage[];
  estimatedMinutesRemaining?: number;
  synthesisOutput?: unknown;
  uncertaintyLog?: unknown;
  failureReason?: string;
}

interface StepAnalysisProps {
  onComplete: () => void;
  demoMode?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Phase label mapping                                                 */
/* ------------------------------------------------------------------ */

function getPhaseLabel(phase: string, t: ReturnType<typeof useTranslations>) {
  switch (phase) {
    case "idle":
    case "syncing":
      return t("syncing");
    case "round_0":
      return t("discovering");
    case "round_1":
      return t("specialistAgents", { count: 5 });
    case "organizer_1":
    case "round_2":
    case "organizer_2":
    case "round_3":
      return t("crossReferencing");
    case "synthesis":
      return t("almostDone");
    default:
      return t("syncing");
  }
}

function getEstimateLabel(phase: string, t: ReturnType<typeof useTranslations>) {
  switch (phase) {
    case "idle":
    case "syncing":
    case "round_0":
      return t("estimateRound0");
    case "round_1":
      return t("estimateRound1");
    case "organizer_1":
    case "round_2":
    case "organizer_2":
    case "round_3":
      return t("estimateRound2");
    case "synthesis":
      return t("estimateSynthesis");
    default:
      return t("estimateRound0");
  }
}

function getPhaseProgress(phase: string): number {
  switch (phase) {
    case "idle": return 0;
    case "syncing": return 5;
    case "round_0": return 15;
    case "round_1": return 35;
    case "organizer_1": return 60;
    case "round_2": return 70;
    case "organizer_2": return 80;
    case "round_3": return 85;
    case "synthesis": return 92;
    default: return 5;
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                           */
/* ------------------------------------------------------------------ */

export function StepAnalysis({ onComplete, demoMode }: StepAnalysisProps) {
  const t = useTranslations("onboarding.analysis");
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const [syncPhase, setSyncPhase] = useState<"syncing" | "analyzing" | "done">("syncing");
  const [emailOptIn, setEmailOptIn] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const feedEndRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  // Auto-scroll activity feed
  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [progress?.progressMessages?.length]);

  const pollProgress = useCallback(async () => {
    try {
      const res = await fetch("/api/onboarding/analysis-progress");
      if (!res.ok) return;
      const data: AnalysisProgress = await res.json();
      setProgress(data);

      if (data.status === "confirming" || data.status === "complete") {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        onComplete();
      } else if (data.status === "failed") {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }
    } catch { /* ignore */ }
  }, [onComplete]);

  // Demo mode: scripted messages
  const demoStartRef = useRef<number | null>(null);
  const demoIndexRef = useRef(0);

  useEffect(() => {
    if (!demoMode) return;

    // Skip all real API calls in demo mode
    setSyncPhase("done");
    demoStartRef.current = Date.now();
    demoIndexRef.current = 0;

    const demoMessages: ProgressMessage[] = [];

    const interval = setInterval(() => {
      if (!demoStartRef.current) return;
      const elapsed = Date.now() - demoStartRef.current;

      let added = false;
      while (demoIndexRef.current < ONBOARDING_SCRIPT.length && ONBOARDING_SCRIPT[demoIndexRef.current].delayMs <= elapsed) {
        const msg = ONBOARDING_SCRIPT[demoIndexRef.current];
        demoMessages.push({
          timestamp: new Date().toISOString(),
          message: msg.message,
          agentName: msg.agentName === "System" ? undefined : msg.agentName,
        });
        demoIndexRef.current++;
        added = true;
      }

      if (added) {
        setProgress({
          status: "analyzing",
          currentPhase: getCurrentDemoPhase(elapsed),
          progressMessages: [...demoMessages],
        });
      }

      if (demoIndexRef.current >= ONBOARDING_SCRIPT.length) {
        clearInterval(interval);
        // Brief pause then complete
        setTimeout(() => onComplete(), 1500);
      }
    }, 200);

    return () => clearInterval(interval);
  }, [demoMode, onComplete]);

  function getCurrentDemoPhase(elapsed: number): string {
    if (elapsed < 15000) return "round_0";
    if (elapsed < 63000) return "round_1";
    if (elapsed < 85000) return "organizer_1";
    return "synthesis";
  }

  // On mount: trigger sync, then analysis
  useEffect(() => {
    if (demoMode) return; // Demo mode handles its own flow
    if (startedRef.current) return;
    startedRef.current = true;

    async function run() {
      // Check if analysis is already running (resume after refresh)
      try {
        const checkRes = await fetch("/api/onboarding/analysis-progress");
        if (checkRes.ok) {
          const existing = await checkRes.json();
          if (existing.status === "analyzing" || existing.status === "confirming" || existing.status === "complete") {
            // Analysis already in progress or done — skip sync/start, just poll
            setSyncPhase("done");
            setProgress(existing);
            if (existing.status === "confirming" || existing.status === "complete") {
              onComplete();
              return;
            }
            pollRef.current = setInterval(pollProgress, 3000);
            return;
          }
        }
      } catch { /* no existing analysis — proceed normally */ }

      // Step 1: Trigger sync
      setSyncPhase("syncing");
      try {
        await fetch("/api/connectors/sync-all", { method: "POST" });
      } catch { /* continue anyway */ }

      // Step 2: Advance orientation phase (only if not already past syncing)
      try {
        const orientRes = await fetch("/api/orientation/current");
        if (orientRes.ok) {
          const orient = await orientRes.json();
          const phase = orient.session?.phase;
          if (phase === "syncing" || phase === "connecting" || phase === "mapping") {
            await fetch("/api/orientation/advance", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({}),
            });
          }
        }
      } catch { /* ignore */ }

      // Step 3: Start analysis
      setSyncPhase("analyzing");
      try {
        await fetch("/api/onboarding/start-analysis", { method: "POST" });
      } catch { /* ignore */ }

      setSyncPhase("done");

      // Step 4: Start polling
      pollProgress();
      pollRef.current = setInterval(pollProgress, 3000);
    }
    run();

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRetry() {
    setRetrying(true);
    setProgress(null);
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    try {
      await fetch("/api/onboarding/start-analysis", { method: "POST" });
      pollRef.current = setInterval(pollProgress, 3000);
    } finally {
      setRetrying(false);
    }
  }

  const isFailed = progress?.status === "failed";
  const phase = progress?.currentPhase ?? "idle";
  const messages = progress?.progressMessages ?? [];

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <p className="text-xs text-[var(--fg3)] uppercase tracking-wider">Step 3 of 4</p>
        <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
        <p className="text-sm text-[var(--fg2)]">{t("subtitle")}</p>
      </div>

      {/* Phase indicator */}
      {!isFailed && (
        <div className="flex flex-col items-center gap-3">
          <div className="relative w-16 h-16">
            <svg className="w-16 h-16 animate-spin-slow" viewBox="0 0 64 64" fill="none">
              <circle cx="32" cy="32" r="28" stroke="color-mix(in srgb, var(--accent) 15%, transparent)" strokeWidth="4" />
              <path
                d="M32 4a28 28 0 0 1 28 28"
                stroke="color-mix(in srgb, var(--accent) 60%, transparent)"
                strokeWidth="4"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <p className="text-sm text-accent/80 font-medium">
            {syncPhase === "syncing" ? t("syncing") : getPhaseLabel(phase, t)}
          </p>
          {/* Progress bar */}
          <div className="w-full max-w-xs">
            <div className="h-1.5 rounded-full bg-skeleton overflow-hidden">
              <div
                className="h-full rounded-full bg-accent/60 transition-all duration-1000 ease-out"
                style={{ width: `${getPhaseProgress(phase)}%` }}
              />
            </div>
          </div>
          <p className="text-xs text-[var(--fg3)]">{getEstimateLabel(phase, t)}</p>
        </div>
      )}

      {/* Activity feed */}
      {messages.length > 0 && (
        <div className="wf-soft p-4 max-h-72 overflow-y-auto space-y-2">
          {messages.map((msg, i) => {
            const time = formatTime(msg.timestamp);
            return (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="text-[var(--fg3)] shrink-0 font-mono">[{time}]</span>
                {msg.agentName && (
                  <span className="shrink-0 px-1.5 py-0.5 rounded bg-accent-light text-accent/70 text-[10px]">
                    {msg.agentName}
                  </span>
                )}
                <span className="text-[var(--fg2)]">{msg.message}</span>
              </div>
            );
          })}
          <div ref={feedEndRef} />
        </div>
      )}

      {/* Failed state */}
      {isFailed && (
        <div className="wf-soft p-5 space-y-4 border border-[color-mix(in_srgb,var(--danger)_20%,transparent)]">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-danger shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <h3 className="text-sm font-medium text-danger">{t("failed")}</h3>
          </div>
          {progress?.failureReason && (
            <p className="text-xs text-[var(--fg2)]">{progress.failureReason}</p>
          )}
          <div className="flex items-center gap-3">
            <Button variant="primary" size="md" onClick={handleRetry} disabled={retrying} className="min-h-[44px]">
              {retrying ? (
                <span className="flex items-center gap-2">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-foreground/30 border-t-foreground" />
                  {t("retrying")}
                </span>
              ) : t("retry")}
            </Button>
            <a href="mailto:support@qorpera.com" className="text-xs text-[var(--fg2)] hover:text-foreground transition">
              {t("contactSupport")}
            </a>
          </div>
        </div>
      )}

      {/* Email me option */}
      {!isFailed && !emailOptIn && syncPhase !== "syncing" && (
        <div className="flex justify-center sm:sticky sm:bottom-4">
          <button
            onClick={() => setEmailOptIn(true)}
            className="text-xs text-foreground/70 hover:text-foreground transition underline underline-offset-2 min-h-[44px]"
          >
            {t("emailMe")}
          </button>
        </div>
      )}

      {emailOptIn && (
        <div className="wf-soft p-4 text-center space-y-2">
          <svg className="w-6 h-6 text-ok mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <p className="text-sm text-[var(--fg2)]">{t("emailConfirm")}</p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function formatTime(ts: string): string {
  try {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  } catch {
    return ts;
  }
}
