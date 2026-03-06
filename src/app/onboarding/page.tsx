"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Provider = {
  id: string;
  name: string;
  configured: boolean;
};

type Connector = {
  id: string;
  provider: string;
  providerName: string;
  name: string;
  status: string;
};

type InferredType = {
  name: string;
  slug: string;
  properties: { name: string; slug: string; dataType: string }[];
};

type OntologyProposal = {
  entityTypes: InferredType[];
};

const STEPS = ["Connect your tools", "Learning your business", "Start using Qorpera"];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Step 1 state
  const [providers, setProviders] = useState<Provider[]>([]);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(true);

  // Step 2 state
  const [syncing, setSyncing] = useState(false);
  const [syncDone, setSyncDone] = useState(false);
  const [inferring, setInferring] = useState(false);
  const [building, setBuilding] = useState(false);
  const [proposal, setProposal] = useState<OntologyProposal | null>(null);
  const [built, setBuilt] = useState(false);
  const [liveStats, setLiveStats] = useState({ events: 0, entityTypes: 0, relationships: 0 });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initialize: create or resume orientation session
  useEffect(() => {
    (async () => {
      // Try to get an existing session
      const currentRes = await fetch("/api/orientation/current");
      if (currentRes.ok) {
        const { session } = await currentRes.json();
        if (session) {
          setSessionId(session.id);
          if (session.phase === "connecting") {
            setStep(0);
          } else if (session.phase === "learning") {
            setStep(1);
          } else {
            // orienting or later — redirect
            router.replace("/copilot");
            return;
          }
          return;
        }
      }
      // No active session — create one
      const startRes = await fetch("/api/orientation/start", { method: "POST" });
      if (startRes.ok) {
        const { session } = await startRes.json();
        setSessionId(session.id);
      } else if (startRes.status === 409) {
        // Session exists but wasn't caught above — use it
        const data = await startRes.json();
        setSessionId(data.session?.id ?? null);
      }
    })();
  }, [router]);

  // Load providers + connectors for Step 1
  const loadConnectors = useCallback(async () => {
    const res = await fetch("/api/connectors");
    if (res.ok) {
      const data = await res.json();
      setConnectors(data.connectors || []);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const [provRes] = await Promise.all([
        fetch("/api/connectors/providers"),
        loadConnectors(),
      ]);
      if (provRes.ok) {
        const data = await provRes.json();
        setProviders(data.providers || []);
      }
      setLoadingProviders(false);
    })();
  }, [loadConnectors]);

  // Poll connectors every 3s in step 1 (for OAuth return detection)
  useEffect(() => {
    if (step !== 0) return;
    const interval = setInterval(loadConnectors, 3000);
    return () => clearInterval(interval);
  }, [step, loadConnectors]);

  const hasActiveConnector = connectors.some((c) => c.status === "active");

  const handleConnect = async (providerId: string) => {
    if (providerId === "google-sheets") {
      const res = await fetch("/api/connectors/google-sheets/auth-url");
      if (res.ok) {
        const data = await res.json();
        if (data.url) window.location.href = data.url;
      }
    }
  };

  // Step 1 → Step 2
  const handleContinueToLearning = async () => {
    await fetch("/api/orientation/advance", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    setStep(1);
    startLearning();
  };

  // Poll live stats
  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch("/api/copilot/context");
        if (res.ok) {
          const data = await res.json();
          setLiveStats({
            events: data.totalEntities ?? 0,
            entityTypes: data.entityTypes?.length ?? 0,
            relationships: data.totalRelationships ?? 0,
          });
        }
      } catch { /* ignore */ }
    }, 2000);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  // Learning flow
  const startLearning = useCallback(async () => {
    setSyncing(true);
    startPolling();

    // Sync all connectors
    try {
      await fetch("/api/connectors/sync-all", { method: "POST" });
    } catch { /* continue */ }
    setSyncing(false);
    setSyncDone(true);

    // Infer ontology
    setInferring(true);
    let inferredProposal: OntologyProposal | null = null;
    try {
      const res = await fetch("/api/ontology/infer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        inferredProposal = data.proposal ?? null;
        setProposal(inferredProposal);
      }
    } catch { /* continue */ }
    setInferring(false);

    // Auto-build ontology
    if (inferredProposal) {
      setBuilding(true);
      try {
        await fetch("/api/ontology/build", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ proposal: inferredProposal }),
        });
        setBuilt(true);
      } catch { /* continue */ }
      setBuilding(false);
    }

    stopPolling();
    // Final stats update
    try {
      const res = await fetch("/api/copilot/context");
      if (res.ok) {
        const data = await res.json();
        setLiveStats({
          events: data.totalEntities ?? 0,
          entityTypes: data.entityTypes?.length ?? 0,
          relationships: data.totalRelationships ?? 0,
        });
      }
    } catch { /* ignore */ }
  }, [startPolling, stopPolling]);

  // Step 2 → Step 3 (redirect)
  const handleStartConversation = async () => {
    setStep(2);
    // Advance: learning → orienting
    await fetch("/api/orientation/advance", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    router.replace("/copilot");
  };

  const isConnected = (providerId: string) =>
    connectors.some((c) => c.provider === providerId && c.status === "active");

  return (
    <div className="min-h-screen bg-[rgba(8,12,16,1)] flex flex-col items-center justify-center px-4">
      {/* Progress indicator */}
      <div className="w-full max-w-[600px] mb-12">
        <div className="flex items-center justify-between">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-3">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                  i < step
                    ? "bg-purple-500 text-white"
                    : i === step
                      ? "bg-purple-500/20 text-purple-300 ring-2 ring-purple-500/40"
                      : "bg-white/[0.06] text-white/30"
                }`}
              >
                {i < step ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`hidden sm:block w-16 lg:w-24 h-px ${i < step ? "bg-purple-500/40" : "bg-white/[0.08]"}`} />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-2">
          {STEPS.map((label, i) => (
            <span
              key={label}
              className={`text-xs ${i === step ? "text-white/70" : i < step ? "text-purple-400/60" : "text-white/25"}`}
            >
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Content area */}
      <div className="w-full max-w-[600px]">
        {/* Step 1: Connect your tools */}
        {step === 0 && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-semibold text-white/90">Connect your tools</h1>
              <p className="text-sm text-white/45">
                Link your data sources so Qorpera can learn about your business.
              </p>
            </div>

            <div className="wf-soft p-6 space-y-4">
              {loadingProviders ? (
                <div className="text-sm text-white/35 text-center py-4">Loading providers...</div>
              ) : providers.length === 0 ? (
                <div className="text-sm text-white/35 text-center py-4">No providers available.</div>
              ) : (
                providers.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between py-3 border-b border-white/[0.06] last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      {isConnected(p.id) ? (
                        <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center">
                          <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-white/[0.06]" />
                      )}
                      <span className="text-sm font-medium text-white/80">{p.name}</span>
                    </div>
                    {isConnected(p.id) ? (
                      <span className="text-xs text-emerald-400/70 font-medium">Connected</span>
                    ) : p.configured ? (
                      <Button variant="default" size="sm" onClick={() => handleConnect(p.id)}>
                        Connect
                      </Button>
                    ) : (
                      <span className="text-xs text-white/25">Not configured</span>
                    )}
                  </div>
                ))
              )}

              {/* Already-connected connectors */}
              {connectors.filter((c) => c.status === "active").length > 0 && (
                <div className="pt-2 space-y-2">
                  <div className="text-xs text-white/30 uppercase tracking-wider">Active connections</div>
                  {connectors
                    .filter((c) => c.status === "active")
                    .map((c) => (
                      <div key={c.id} className="flex items-center gap-2 text-sm text-white/60">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                        {c.name || c.providerName}
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div className="flex justify-center">
              <Button
                variant="primary"
                size="lg"
                onClick={handleContinueToLearning}
                disabled={!hasActiveConnector}
              >
                Continue
              </Button>
            </div>
            {!hasActiveConnector && (
              <p className="text-xs text-white/25 text-center">
                Connect at least one data source to continue.
              </p>
            )}
          </div>
        )}

        {/* Step 2: Learning about your business */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-semibold text-white/90">
                {built ? "Your business model" : "Learning about your business..."}
              </h1>
              <p className="text-sm text-white/45">
                {built
                  ? "Here's what we discovered from your data."
                  : "Syncing and analyzing your connected data sources."}
              </p>
            </div>

            {/* Live stats */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Entities found", value: liveStats.events },
                { label: "Entity types", value: liveStats.entityTypes },
                { label: "Relationships", value: liveStats.relationships },
              ].map((s) => (
                <div key={s.label} className="wf-soft p-4 text-center">
                  <div className="text-2xl font-semibold text-white/90">{s.value}</div>
                  <div className="text-xs text-white/40 mt-1">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Progress phases */}
            <div className="wf-soft p-6 space-y-3">
              <ProgressRow label="Syncing data sources" status={syncing ? "active" : syncDone ? "done" : "pending"} />
              <ProgressRow label="Inferring business model" status={inferring ? "active" : proposal ? "done" : syncDone ? "pending" : "waiting"} />
              <ProgressRow label="Building knowledge graph" status={building ? "active" : built ? "done" : proposal ? "pending" : "waiting"} />
            </div>

            {/* Ontology summary */}
            {built && proposal && (
              <div className="wf-soft p-6 space-y-3">
                <div className="text-xs text-white/30 uppercase tracking-wider">Discovered entity types</div>
                {proposal.entityTypes.map((et) => (
                  <div key={et.slug} className="flex items-center justify-between py-2 border-b border-white/[0.06] last:border-0">
                    <span className="text-sm font-medium text-white/80">{et.name}</span>
                    <span className="text-xs text-white/35">
                      {et.properties.length} {et.properties.length === 1 ? "property" : "properties"}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {built && (
              <div className="flex justify-center">
                <Button variant="primary" size="lg" onClick={handleStartConversation}>
                  Start conversation
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Redirecting */}
        {step === 2 && (
          <div className="text-center space-y-4">
            <div className="w-8 h-8 mx-auto rounded-full border-2 border-purple-500/40 border-t-purple-400 animate-spin" />
            <p className="text-sm text-white/45">Starting your conversation...</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ProgressRow({ label, status }: { label: string; status: "waiting" | "pending" | "active" | "done" }) {
  return (
    <div className="flex items-center gap-3">
      {status === "done" ? (
        <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
          <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      ) : status === "active" ? (
        <div className="w-5 h-5 rounded-full border-2 border-purple-500/40 border-t-purple-400 animate-spin shrink-0" />
      ) : (
        <div className="w-5 h-5 rounded-full bg-white/[0.06] shrink-0" />
      )}
      <span className={`text-sm ${status === "done" ? "text-white/60" : status === "active" ? "text-white/80" : "text-white/30"}`}>
        {label}
      </span>
    </div>
  );
}
