"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { useSearchParams } from "next/navigation";
import { useUser } from "@/components/user-provider";
import { NotificationPreferences } from "@/components/settings/notification-preferences";

type Tab = "ai" | "connections" | "team" | "merges" | "governance" | "notifications";

type ConnectorItem = {
  id: string;
  provider: string;
  providerName: string;
  name: string;
  status: string;
  lastSyncAt: string | null;
  spreadsheetCount?: number;
  lastSyncResult?: {
    eventsCreated: number;
    status: string;
    createdAt: string;
  };
};

type ProviderInfo = {
  id: string;
  name: string;
  configured: boolean;
  configSchema: Array<{
    key: string;
    label: string;
    type: string;
    required: boolean;
    placeholder?: string;
  }>;
};

const PROVIDER_OPTIONS = [
  { value: "ollama", label: "Ollama (Local)" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
];

const CLOUD_MODEL_OPTIONS: Record<string, Array<{ value: string; label: string }>> = {
  openai: [
    { value: "gpt-5.4", label: "GPT-5.4 (Latest, most capable)" },
    { value: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
    { value: "gpt-5.2", label: "GPT-5.2" },
    { value: "gpt-5.2-mini", label: "GPT-5.2 Mini" },
    { value: "gpt-5", label: "GPT-5" },
    { value: "gpt-5-mini", label: "GPT-5 Mini" },
    { value: "o4-mini", label: "o4-mini (Reasoning)" },
    { value: "o3", label: "o3 (Reasoning)" },
    { value: "o3-mini", label: "o3-mini (Reasoning, fast)" },
    { value: "gpt-4.1", label: "GPT-4.1" },
    { value: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
    { value: "gpt-4.1-nano", label: "GPT-4.1 Nano" },
    { value: "gpt-4o", label: "GPT-4o (Legacy)" },
    { value: "gpt-4o-mini", label: "GPT-4o Mini (Legacy)" },
  ],
  anthropic: [
    { value: "claude-opus-4-20250514", label: "Claude Opus 4 (Most capable)" },
    { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4 (Balanced)" },
    { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (Fastest)" },
  ],
};

const EMBEDDING_MODEL_OPTIONS: Record<string, Array<{ value: string; label: string }>> = {
  openai: [
    { value: "text-embedding-3-small", label: "text-embedding-3-small (Recommended)" },
    { value: "text-embedding-3-large", label: "text-embedding-3-large" },
    { value: "text-embedding-ada-002", label: "text-embedding-ada-002 (Legacy)" },
  ],
  anthropic: [
    { value: "text-embedding-3-small", label: "text-embedding-3-small (via OpenAI)" },
  ],
  ollama: [
    { value: "nomic-embed-text", label: "nomic-embed-text" },
    { value: "mxbai-embed-large", label: "mxbai-embed-large" },
    { value: "all-minilm", label: "all-minilm" },
  ],
};

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsPageInner />
    </Suspense>
  );
}

function SettingsPageInner() {
  const { toast } = useToast();
  const { isAdmin, isSuperadmin } = useUser();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const googleParam = searchParams.get("google");
  const hubspotParam = searchParams.get("hubspot");
  const stripeParam = searchParams.get("stripe");

  const [activeTab, setActiveTab] = useState<Tab>(
    tabParam === "connections" ? "connections" : tabParam === "team" ? "team" : tabParam === "merges" ? "merges" : tabParam === "governance" ? "governance" : tabParam === "notifications" ? "notifications" : "ai"
  );

  // AI state
  type FnConfig = { provider: string; apiKey: string; model: string };
  type TestResult = { ok: boolean; provider?: string; model?: string; baseUrl?: string; response?: string; error?: string };
  const AI_FUNCTIONS = ["reasoning", "copilot", "embedding", "orientation"] as const;
  type AIFn = typeof AI_FUNCTIONS[number];
  const AI_FN_LABELS: Record<AIFn, { label: string; desc: string }> = {
    reasoning: { label: "Reasoning", desc: "Situation detection, analysis, and pre-filtering" },
    copilot: { label: "Copilot", desc: "Interactive chat assistant" },
    embedding: { label: "Embeddings", desc: "Document processing and vector search" },
    orientation: { label: "Orientation", desc: "Onboarding conversation" },
  };
  const DEFAULT_FN: FnConfig = { provider: "ollama", apiKey: "", model: "" };
  const [sameForAll, setSameForAll] = useState(true);
  const [aiBaseUrl, setAiBaseUrl] = useState("http://localhost:11434");
  const [fnConfigs, setFnConfigs] = useState<Record<AIFn, FnConfig>>({
    reasoning: { ...DEFAULT_FN },
    copilot: { ...DEFAULT_FN },
    embedding: { ...DEFAULT_FN },
    orientation: { ...DEFAULT_FN },
  });
  const [aiSaving, setAiSaving] = useState(false);
  const [aiTesting, setAiTesting] = useState<AIFn | "all" | null>(null);
  const [aiTestResults, setAiTestResults] = useState<Partial<Record<AIFn | "all", TestResult>>>({});
  const [aiSaved, setAiSaved] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<Array<{ value: string; label: string }>>([]);

  // Connections state
  const [connectors, setConnectors] = useState<ConnectorItem[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncAllResult, setSyncAllResult] = useState<{
    synced: Array<{ name: string; status: string }>;
    errors: Array<{ name: string; error: string }>;
  } | null>(null);

  // Google Sheets spreadsheet picker
  type SheetEntry = { id: string; name: string; selected: boolean };
  const [expandedConnector, setExpandedConnector] = useState<string | null>(null);
  const [sheetsByConnector, setSheetsByConnector] = useState<Record<string, SheetEntry[]>>({});
  const [savingSheets, setSavingSheets] = useState<string | null>(null);
  const [manualSheetUrl, setManualSheetUrl] = useState("");

  // Team state
  type TeamUserScope = { id: string; departmentEntityId: string; departmentName: string };
  type TeamUser = { id: string; name: string; email: string; role: string; entityId: string | null; entityName: string | null; departmentName: string | null; scopes: TeamUserScope[]; lastActive: string | null; createdAt: string };
  type TeamInvite = { id: string; email: string; role: string; entityName: string; departmentName: string | null; link: string; expiresAt: string; createdAt: string };
  type TeamDept = { id: string; displayName: string };
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [teamInvites, setTeamInvites] = useState<TeamInvite[]>([]);
  const [teamDepts, setTeamDepts] = useState<TeamDept[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkSource, setBulkSource] = useState("");
  const [bulkTarget, setBulkTarget] = useState("");
  const [bulkRunning, setBulkRunning] = useState(false);

  // Merge state
  type MergeLogEntry = {
    id: string;
    mergeType: string;
    confidence: number | null;
    signals: Record<string, number>[] | null;
    reversible: boolean;
    reversedAt: string | null;
    createdAt: string;
    survivor: { id: string; displayName: string; status: string };
    absorbed: { id: string; displayName: string; status: string };
  };
  type MergeSuggestionEntity = {
    id: string;
    displayName: string;
    status?: string;
    category?: string;
    sourceSystem?: string | null;
    entityType?: { name: string; slug: string } | null;
    properties?: Record<string, string>;
    identityValues?: Record<string, string>;
  };
  type MergeSuggestion = {
    id: string;
    confidence: number | null;
    signals: Record<string, number>[] | null;
    createdAt: string;
    entityA: MergeSuggestionEntity;
    entityB: MergeSuggestionEntity;
  };
  const [mergeLog, setMergeLog] = useState<MergeLogEntry[]>([]);
  const [mergeLogTotal, setMergeLogTotal] = useState(0);
  const [mergeLogPage, setMergeLogPage] = useState(1);
  const [mergeSuggestions, setMergeSuggestions] = useState<MergeSuggestion[]>([]);
  const [mergeLoading, setMergeLoading] = useState(false);
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [confirmReverseId, setConfirmReverseId] = useState<string | null>(null);

  // Governance state (moved from governance page)
  const [govAutoSupervisedConsecutive, setGovAutoSupervisedConsecutive] = useState("10");
  const [govAutoSupervisedRate, setGovAutoSupervisedRate] = useState("90");
  const [govAutoNotifyConsecutive, setGovAutoNotifyConsecutive] = useState("20");
  const [govAutoNotifyRate, setGovAutoNotifyRate] = useState("95");
  const [govThresholdSaving, setGovThresholdSaving] = useState(false);
  const [govApprovalThreshold, setGovApprovalThreshold] = useState("");
  const [govAutoApproveReads, setGovAutoApproveReads] = useState(true);
  const [govMaxPending, setGovMaxPending] = useState("50");
  const [govExpiryHours, setGovExpiryHours] = useState("72");
  const [govSettingsSaving, setGovSettingsSaving] = useState(false);
  const [govLoading, setGovLoading] = useState(false);

  // Load team data
  const loadTeamData = useCallback(async () => {
    setTeamLoading(true);
    try {
      const [usersRes, invitesRes, deptRes] = await Promise.all([
        fetch("/api/users").then((r) => r.json()),
        fetch("/api/users/invite").then((r) => r.json()),
        fetch("/api/departments").then((r) => r.json()),
      ]);
      setTeamUsers(Array.isArray(usersRes) ? usersRes : []);
      setTeamInvites(Array.isArray(invitesRes) ? invitesRes : []);
      setTeamDepts((deptRes || []).filter((d: { entityType?: { slug?: string } }) => d.entityType?.slug === "department"));
    } catch {}
    setTeamLoading(false);
  }, []);

  useEffect(() => {
    if (activeTab === "team") loadTeamData();
  }, [activeTab, loadTeamData]);

  // Load merge data
  const loadMergeData = useCallback(async (page = 1) => {
    setMergeLoading(true);
    try {
      const [logRes, sugRes] = await Promise.all([
        fetch(`/api/admin/merge-log?page=${page}&limit=20`).then((r) => r.json()),
        fetch("/api/admin/merge-suggestions").then((r) => r.json()),
      ]);
      setMergeLog(logRes.entries || []);
      setMergeLogTotal(logRes.total || 0);
      setMergeLogPage(page);
      setMergeSuggestions(sugRes.suggestions || []);
    } catch {}
    setMergeLoading(false);
  }, []);

  useEffect(() => {
    if (activeTab === "merges") loadMergeData();
  }, [activeTab, loadMergeData]);

  // Load governance data
  const loadGovernanceData = useCallback(async () => {
    setGovLoading(true);
    try {
      const settings = await fetch("/api/autonomy/settings").then(r => r.json());
      setGovAutoSupervisedConsecutive(String(settings.supervisedToNotifyConsecutive ?? 10));
      setGovAutoSupervisedRate(String(Math.round((settings.supervisedToNotifyRate ?? 0.9) * 100)));
      setGovAutoNotifyConsecutive(String(settings.notifyToAutonomousConsecutive ?? 20));
      setGovAutoNotifyRate(String(Math.round((settings.notifyToAutonomousRate ?? 0.95) * 100)));
    } catch {}
    setGovLoading(false);
  }, []);

  useEffect(() => {
    if (activeTab === "governance") loadGovernanceData();
  }, [activeTab, loadGovernanceData]);

  const handleSaveThresholds = async () => {
    setGovThresholdSaving(true);
    try {
      await fetch("/api/autonomy/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          graduation_supervised_to_notify_consecutive: parseInt(govAutoSupervisedConsecutive) || 10,
          graduation_supervised_to_notify_rate: (parseInt(govAutoSupervisedRate) || 90) / 100,
          graduation_notify_to_autonomous_consecutive: parseInt(govAutoNotifyConsecutive) || 20,
          graduation_notify_to_autonomous_rate: (parseInt(govAutoNotifyRate) || 95) / 100,
        }),
      });
      toast("Graduation thresholds saved", "success");
    } catch {
      toast("Failed to save thresholds", "error");
    } finally {
      setGovThresholdSaving(false);
    }
  };

  const handleSaveGovernanceSettings = async () => {
    setGovSettingsSaving(true);
    try {
      const res = await fetch("/api/governance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requireApprovalAboveAmount: govApprovalThreshold ? parseFloat(govApprovalThreshold) : null,
          autoApproveReadActions: govAutoApproveReads,
          maxPendingProposals: parseInt(govMaxPending) || 50,
          approvalExpiryHours: parseInt(govExpiryHours) || 72,
        }),
      });
      if (!res.ok) throw new Error();
      toast("Governance settings saved", "success");
    } catch {
      toast("Failed to save governance settings", "error");
    } finally {
      setGovSettingsSaving(false);
    }
  };

  // Fetch Ollama models when any function uses ollama
  const anyOllama = Object.values(fnConfigs).some(c => c.provider === "ollama");
  useEffect(() => {
    if (!anyOllama) return;
    const url = aiBaseUrl || "http://localhost:11434";
    fetch(`${url}/api/tags`)
      .then((r) => r.json())
      .then((data) => {
        const models = (data.models ?? []).map((m: { name: string }) => ({
          value: m.name.replace(/:latest$/, ""),
          label: m.name.replace(/:latest$/, ""),
        }));
        setOllamaModels(models.length > 0 ? models : [{ value: "llama3.2", label: "llama3.2 (default)" }]);
      })
      .catch(() => {
        setOllamaModels([
          { value: "llama3.2", label: "llama3.2" },
          { value: "llama3.1", label: "llama3.1" },
          { value: "mistral", label: "mistral" },
          { value: "deepseek-r1", label: "deepseek-r1" },
        ]);
      });
  }, [anyOllama, aiBaseUrl]);

  // Load AI settings from DB
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data: Record<string, string>) => {
        if (data.ai_base_url) setAiBaseUrl(data.ai_base_url);

        const loaded: Record<AIFn, FnConfig> = {
          reasoning: { ...DEFAULT_FN },
          copilot: { ...DEFAULT_FN },
          embedding: { ...DEFAULT_FN },
          orientation: { ...DEFAULT_FN },
        };
        const genericProvider = data.ai_provider || "ollama";
        const genericKey = data.ai_api_key || "";
        const genericModel = data.ai_model || "";

        for (const fn of AI_FUNCTIONS) {
          loaded[fn] = {
            provider: data[`ai_${fn}_provider`] || genericProvider,
            apiKey: data[`ai_${fn}_key`] || genericKey,
            model: data[`ai_${fn}_model`] || genericModel,
          };
        }
        setFnConfigs(loaded);

        // Detect if all functions use the same config
        const allSame = AI_FUNCTIONS.every(fn =>
          loaded[fn].provider === loaded.reasoning.provider &&
          loaded[fn].apiKey === loaded.reasoning.apiKey
        );
        setSameForAll(allSame);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load connectors and providers
  const loadConnectors = useCallback(() => {
    fetch("/api/connectors")
      .then((r) => r.json())
      .then((data) => {
        const items: ConnectorItem[] = data.connectors || [];
        setConnectors(items);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadConnectors();
    fetch("/api/connectors/providers")
      .then((r) => r.json())
      .then((data) => setProviders(data.providers || []))
      .catch(() => {});
  }, [loadConnectors]);

  // Handle google=connected flash
  useEffect(() => {
    if (googleParam === "connected") {
      toast("Google account connected successfully.", "success");
      loadConnectors();
    } else if (googleParam === "error") {
      toast("Google authorization failed. Please try again.", "error");
    }
  }, [googleParam]);

  // Handle hubspot=connected flash
  useEffect(() => {
    if (hubspotParam === "connected") {
      toast("HubSpot connected successfully.", "success");
      loadConnectors();
    } else if (hubspotParam === "error") {
      toast("HubSpot authorization failed. Please try again.", "error");
    }
  }, [hubspotParam]);

  // Handle stripe=connected flash
  useEffect(() => {
    if (stripeParam === "connected") {
      toast("Stripe connected successfully.", "success");
      loadConnectors();
    } else if (stripeParam === "error") {
      toast("Stripe authorization failed. Please try again.", "error");
    }
  }, [stripeParam]);


  // Helper to update a single function config
  const updateFnConfig = (fn: AIFn, patch: Partial<FnConfig>) => {
    setFnConfigs(prev => {
      const updated = { ...prev, [fn]: { ...prev[fn], ...patch } };
      // If sameForAll, propagate to all functions
      if (sameForAll) {
        const val = { ...updated[fn] };
        for (const f of AI_FUNCTIONS) updated[f] = { ...val };
      }
      return updated;
    });
  };

  // The "primary" function shown when sameForAll
  const primaryFn: AIFn = "copilot";

  // Save AI settings
  const handleSaveAi = async () => {
    setAiSaving(true);
    try {
      const payload: Record<string, string> = {};
      // Base URL
      const hasOllama = Object.values(fnConfigs).some(c => c.provider === "ollama");
      payload.ai_base_url = hasOllama && aiBaseUrl ? aiBaseUrl : "";
      // Generic keys (backward compat — use copilot values)
      payload.ai_provider = fnConfigs.copilot.provider;
      if (fnConfigs.copilot.apiKey) payload.ai_api_key = fnConfigs.copilot.apiKey;
      payload.ai_model = fnConfigs.copilot.model;
      // Per-function keys
      for (const fn of AI_FUNCTIONS) {
        payload[`ai_${fn}_provider`] = fnConfigs[fn].provider;
        if (fnConfigs[fn].apiKey) payload[`ai_${fn}_key`] = fnConfigs[fn].apiKey;
        payload[`ai_${fn}_model`] = fnConfigs[fn].model;
      }
      // Also update embedding_provider/embedding_api_key for embedder backward compat
      payload.embedding_provider = fnConfigs.embedding.provider;
      if (fnConfigs.embedding.apiKey) payload.embedding_api_key = fnConfigs.embedding.apiKey;

      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setAiSaved(true);
      setAiTestResults({});
      setTimeout(() => setAiSaved(false), 3000);
      toast("AI settings saved", "success");
    } catch {
      toast("Failed to save AI settings", "error");
    } finally {
      setAiSaving(false);
    }
  };

  const handleTestConnection = async (fn?: AIFn) => {
    const key = fn || "all";
    setAiTesting(key);
    setAiTestResults(prev => ({ ...prev, [key]: undefined }));
    try {
      const res = await fetch("/api/settings/test-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiFunction: fn }),
      });
      const data = await res.json();
      setAiTestResults(prev => ({ ...prev, [key]: data }));
    } catch (err) {
      setAiTestResults(prev => ({
        ...prev,
        [key]: { ok: false, error: err instanceof Error ? err.message : "Request failed" },
      }));
    } finally {
      setAiTesting(null);
    }
  };

  const allTabs: { key: Tab; label: string; adminOnly?: boolean }[] = [
    { key: "ai", label: "AI Configuration" },
    { key: "notifications", label: "Notifications" },
    { key: "connections", label: "Connections", adminOnly: true },
    { key: "team", label: "Team", adminOnly: true },
    { key: "merges", label: "Entity Merges", adminOnly: true },
    { key: "governance", label: "AI Governance", adminOnly: true },
  ];
  const tabs = allTabs.filter((t) => !t.adminOnly || isAdmin);

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      active: "bg-emerald-500/15 text-emerald-400",
      pending: "bg-amber-500/15 text-amber-400",
      error: "bg-red-500/15 text-red-400",
      paused: "bg-white/10 text-white/50",
      disconnected: "bg-red-500/15 text-red-400",
    };
    return (
      <span
        className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${colors[status] || "bg-white/10 text-white/50"}`}
      >
        {status}
      </span>
    );
  };

  return (
    <AppShell>
      <div className="p-8 max-w-3xl mx-auto space-y-6">
        <h1 className="text-2xl font-semibold text-white/90">Settings</h1>

        {/* Tab bar */}
        <div className="flex gap-1 bg-white/[0.03] rounded-lg p-1 w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
                activeTab === tab.key
                  ? "bg-purple-500/15 text-purple-300"
                  : "text-white/40 hover:text-white/60"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* AI Provider Tab */}
        {activeTab === "ai" && (() => {
          const getModelOptions = (fn: AIFn, provider: string) => {
            if (fn === "embedding") return provider === "ollama" ? (EMBEDDING_MODEL_OPTIONS.ollama ?? []) : (EMBEDDING_MODEL_OPTIONS[provider] ?? EMBEDDING_MODEL_OPTIONS.openai);
            return provider === "ollama" ? ollamaModels : (CLOUD_MODEL_OPTIONS[provider] ?? []);
          };

          const renderTestResult = (key: AIFn | "all") => {
            const result = aiTestResults[key];
            if (!result) return null;
            return (
              <div className={`rounded-lg p-3 text-sm space-y-1 ${result.ok ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-red-500/10 border border-red-500/20"}`}>
                {result.ok ? (
                  <>
                    <div className="flex items-center gap-2 text-emerald-400 font-medium text-xs">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                      Connected — {result.provider} / {result.model}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2 text-red-400 font-medium text-xs">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      Failed
                    </div>
                    <div className="text-red-300/70 text-[11px]">{result.error}</div>
                  </>
                )}
              </div>
            );
          };

          const renderFnSection = (fn: AIFn) => {
            const cfg = fnConfigs[fn];
            const meta = AI_FN_LABELS[fn];
            const models = getModelOptions(fn, cfg.provider);
            const testKey = fn;
            return (
              <div key={fn} className="wf-soft p-5 space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-white/80">{meta.label}</h3>
                  <p className="text-xs text-white/35 mt-0.5">{meta.desc}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Select
                    label="Provider"
                    options={PROVIDER_OPTIONS}
                    value={cfg.provider}
                    onChange={(e) => {
                      const np = e.target.value;
                      const ms = getModelOptions(fn, np);
                      updateFnConfig(fn, { provider: np, model: ms.length > 0 ? ms[0].value : "" });
                    }}
                  />
                  <Select
                    label="Model"
                    options={models}
                    value={cfg.model}
                    onChange={(e) => updateFnConfig(fn, { model: e.target.value })}
                  />
                </div>
                {cfg.provider !== "ollama" && (
                  <Input
                    label="API Key"
                    type="password"
                    value={cfg.apiKey}
                    onChange={(e) => updateFnConfig(fn, { apiKey: e.target.value })}
                    placeholder="sk-..."
                  />
                )}
                <div className="flex items-center gap-2">
                  <Button variant="default" size="sm" onClick={() => handleTestConnection(fn)} disabled={aiTesting === fn}>
                    {aiTesting === fn ? "Testing..." : "Test"}
                  </Button>
                  {renderTestResult(testKey)}
                </div>
              </div>
            );
          };

          return (
          <div className="space-y-5">
            <div className="wf-soft p-6 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium text-white/80">AI Configuration</h2>
                {aiSaved && <span className="text-xs text-emerald-400">Saved</span>}
              </div>

              {/* Same for all toggle */}
              <label className="flex items-center gap-3 cursor-pointer">
                <button
                  type="button"
                  onClick={() => {
                    const next = !sameForAll;
                    setSameForAll(next);
                    if (next) {
                      // Propagate primary config to all
                      const src = fnConfigs[primaryFn];
                      setFnConfigs(prev => {
                        const u = { ...prev };
                        for (const f of AI_FUNCTIONS) u[f] = { ...src };
                        return u;
                      });
                    }
                  }}
                  className={`relative w-9 h-5 rounded-full transition ${sameForAll ? "bg-purple-500" : "bg-white/10"}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${sameForAll ? "translate-x-4" : ""}`} />
                </button>
                <span className="text-sm text-white/60">Use same provider for all functions</span>
              </label>

              {/* Unified mode */}
              {sameForAll && (() => {
                const cfg = fnConfigs[primaryFn];
                const chatModels = cfg.provider === "ollama" ? ollamaModels : (CLOUD_MODEL_OPTIONS[cfg.provider] ?? []);
                return (
                  <div className="space-y-4">
                    <Select
                      label="Provider"
                      options={PROVIDER_OPTIONS}
                      value={cfg.provider}
                      onChange={(e) => {
                        const np = e.target.value;
                        const ms = np === "ollama" ? ollamaModels : (CLOUD_MODEL_OPTIONS[np] ?? []);
                        const embMs = EMBEDDING_MODEL_OPTIONS[np] ?? EMBEDDING_MODEL_OPTIONS.openai;
                        const newModel = ms.length > 0 ? ms[0].value : "";
                        const embModel = embMs.length > 0 ? embMs[0].value : "text-embedding-3-small";
                        setFnConfigs(prev => {
                          const u = { ...prev };
                          for (const f of AI_FUNCTIONS) {
                            u[f] = { ...u[f], provider: np, model: f === "embedding" ? embModel : newModel };
                          }
                          return u;
                        });
                      }}
                    />
                    {cfg.provider !== "ollama" && (
                      <Input
                        label="API Key"
                        type="password"
                        value={cfg.apiKey}
                        onChange={(e) => {
                          const v = e.target.value;
                          setFnConfigs(prev => {
                            const u = { ...prev };
                            for (const f of AI_FUNCTIONS) u[f] = { ...u[f], apiKey: v };
                            return u;
                          });
                        }}
                        placeholder="sk-..."
                      />
                    )}
                    {cfg.provider === "ollama" && (
                      <Input
                        label="Base URL"
                        value={aiBaseUrl}
                        onChange={(e) => setAiBaseUrl(e.target.value)}
                        placeholder="http://localhost:11434"
                      />
                    )}
                    <Select
                      label="Model"
                      options={chatModels}
                      value={cfg.model}
                      onChange={(e) => {
                        const v = e.target.value;
                        setFnConfigs(prev => {
                          const u = { ...prev };
                          for (const f of AI_FUNCTIONS) {
                            if (f !== "embedding") u[f] = { ...u[f], model: v };
                          }
                          return u;
                        });
                      }}
                    />
                    <p className="text-[11px] text-white/30">
                      Embedding model: {fnConfigs.embedding.model || "auto"}
                    </p>
                  </div>
                );
              })()}

              <div className="flex items-center gap-3 pt-1">
                <Button variant="primary" onClick={handleSaveAi} disabled={aiSaving}>
                  {aiSaving ? "Saving..." : "Save"}
                </Button>
                {sameForAll && (
                  <Button variant="default" onClick={() => handleTestConnection()} disabled={!!aiTesting}>
                    {aiTesting === "all" ? "Testing..." : "Test Connection"}
                  </Button>
                )}
              </div>

              {sameForAll && renderTestResult("all")}
            </div>

            {/* Per-function sections */}
            {!sameForAll && (
              <div className="space-y-4">
                {AI_FUNCTIONS.map(fn => renderFnSection(fn))}
                {Object.values(fnConfigs).some(c => c.provider === "ollama") && (
                  <div className="wf-soft p-5">
                    <Input
                      label="Ollama Base URL"
                      value={aiBaseUrl}
                      onChange={(e) => setAiBaseUrl(e.target.value)}
                      placeholder="http://localhost:11434"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
          );
        })()}

        {/* Notifications Tab */}
        {activeTab === "notifications" && (
          <NotificationPreferences />
        )}

        {/* Connections Tab — Read-only overview */}
        {activeTab === "connections" && (
          <div className="space-y-5">
            <div className="wf-soft p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium text-white/80">
                  Connected Sources
                </h2>
                {connectors.length > 0 && (
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={syncingAll}
                    onClick={async () => {
                      setSyncingAll(true);
                      setSyncAllResult(null);
                      try {
                        const res = await fetch("/api/connectors/sync-all", { method: "POST" });
                        if (res.ok) {
                          const data = await res.json();
                          setSyncAllResult({
                            synced: (data.synced || []).map((s: { name: string; status: string }) => ({ name: s.name, status: s.status })),
                            errors: (data.errors || []).map((e: { name: string; error: string }) => ({ name: e.name, error: e.error })),
                          });
                          loadConnectors();
                        } else {
                          setSyncAllResult({ synced: [], errors: [{ name: "Sync", error: "Request failed" }] });
                        }
                      } catch {
                        setSyncAllResult({ synced: [], errors: [{ name: "Sync", error: "Network error" }] });
                      }
                      setSyncingAll(false);
                    }}
                  >
                    {syncingAll ? (
                      <span className="flex items-center gap-2">
                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        Syncing...
                      </span>
                    ) : "Sync All"}
                  </Button>
                )}
              </div>
              <p className="text-sm text-white/40">
                Connectors are managed from within departments. This page shows a global overview of all connected data sources.
              </p>
              {syncAllResult && (
                <div className="bg-white/[0.03] rounded-lg px-4 py-3 space-y-1">
                  <p className="text-xs text-white/60">
                    Synced {syncAllResult.synced.length} connector{syncAllResult.synced.length !== 1 ? "s" : ""}.
                    {syncAllResult.errors.length > 0 && (
                      <span className="text-red-400"> {syncAllResult.errors.length} error{syncAllResult.errors.length !== 1 ? "s" : ""}.</span>
                    )}
                  </p>
                  {syncAllResult.synced.map((s, i) => (
                    <p key={i} className="text-[11px] text-emerald-400/70">{s.name}: {s.status}</p>
                  ))}
                  {syncAllResult.errors.map((e, i) => (
                    <p key={i} className="text-[11px] text-red-400/80">{e.name}: {e.error}</p>
                  ))}
                </div>
              )}

              {connectors.length === 0 && (
                <p className="text-sm text-white/25">
                  No connectors configured yet. Connect data sources from a department&apos;s Connected Data section.
                </p>
              )}

              {connectors.map((c) => {
                const isGoogle = c.provider === "google-sheets";
                const sheetCount = c.spreadsheetCount || 0;
                const isExpanded = expandedConnector === c.id;
                const sheets = sheetsByConnector[c.id] || [];

                return (
                  <div
                    key={c.id}
                    className="py-3 border-b border-white/[0.06] last:border-0 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-white/80">
                            {isGoogle && sheetCount > 0
                              ? `Google Sheets — ${sheetCount} spreadsheet${sheetCount !== 1 ? "s" : ""} synced`
                              : c.name || c.providerName}
                          </span>
                          {statusBadge(c.status)}
                        </div>
                        <div className="text-xs text-white/35">
                          {c.providerName}
                          {c.lastSyncAt && (
                            <>
                              {" "}
                              &middot; Last sync:{" "}
                              {new Date(c.lastSyncAt).toLocaleString()}
                            </>
                          )}
                          {c.lastSyncResult && (
                            <>
                              {" "}
                              &middot; {c.lastSyncResult.eventsCreated} events
                            </>
                          )}
                        </div>
                      </div>
                      {isGoogle && (
                        <button
                          className="text-xs text-purple-400 hover:text-purple-300"
                          onClick={async () => {
                            if (isExpanded) {
                              setExpandedConnector(null);
                              return;
                            }
                            setExpandedConnector(c.id);
                            if (!sheetsByConnector[c.id]) {
                              const res = await fetch(`/api/connectors/${c.id}`);
                              if (res.ok) {
                                const data = await res.json();
                                const ss = (data.config?.spreadsheets || []) as SheetEntry[];
                                setSheetsByConnector(prev => ({ ...prev, [c.id]: ss }));
                              }
                            }
                          }}
                        >
                          {isExpanded ? "Close" : "Manage Sheets"}
                        </button>
                      )}
                    </div>

                    {/* Google Sheets spreadsheet picker */}
                    {isGoogle && isExpanded && (
                      <div className="bg-white/[0.02] rounded-lg p-4 space-y-3 border border-white/[0.06]">
                        {sheets.length > 0 ? (
                          <>
                            <p className="text-xs text-white/50">
                              {sheets.length} spreadsheet{sheets.length !== 1 ? "s" : ""} found from the last 30 days
                            </p>
                            <div className="space-y-1.5 max-h-60 overflow-y-auto">
                              {sheets.map((sheet) => (
                                <label key={sheet.id} className="flex items-center gap-2.5 py-1 cursor-pointer group">
                                  <input
                                    type="checkbox"
                                    checked={sheet.selected}
                                    onChange={() => {
                                      setSheetsByConnector(prev => ({
                                        ...prev,
                                        [c.id]: (prev[c.id] || []).map(s =>
                                          s.id === sheet.id ? { ...s, selected: !s.selected } : s
                                        ),
                                      }));
                                    }}
                                    className="rounded border-white/20 bg-white/5 text-purple-500 focus:ring-purple-500/30"
                                  />
                                  <span className="text-sm text-white/70 group-hover:text-white/90 transition truncate">{sheet.name}</span>
                                  <span className="text-[10px] text-white/20 ml-auto shrink-0 font-mono">{sheet.id.slice(0, 12)}...</span>
                                </label>
                              ))}
                            </div>
                            <Button
                              variant="primary"
                              size="sm"
                              disabled={savingSheets === c.id}
                              onClick={async () => {
                                setSavingSheets(c.id);
                                try {
                                  await fetch(`/api/connectors/${c.id}`, {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ spreadsheets: sheetsByConnector[c.id] }),
                                  });
                                  toast("Spreadsheet selection saved", "success");
                                  loadConnectors();
                                } catch {
                                  toast("Failed to save", "error");
                                }
                                setSavingSheets(null);
                              }}
                            >
                              {savingSheets === c.id ? "Saving..." : `Save (${(sheetsByConnector[c.id] || []).filter(s => s.selected).length} selected)`}
                            </Button>
                          </>
                        ) : (
                          <div className="space-y-3">
                            <p className="text-xs text-white/40">No recently modified spreadsheets found. Add one manually:</p>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={manualSheetUrl}
                                onChange={(e) => setManualSheetUrl(e.target.value)}
                                placeholder="Paste Google Sheets URL or ID"
                                className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white/80 placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-purple-500/40"
                              />
                              <Button
                                variant="primary"
                                size="sm"
                                disabled={!manualSheetUrl.trim() || savingSheets === c.id}
                                onClick={async () => {
                                  setSavingSheets(c.id);
                                  const idMatch = manualSheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
                                  const sheetId = idMatch ? idMatch[1] : manualSheetUrl.trim();
                                  try {
                                    await fetch(`/api/connectors/${c.id}`, {
                                      method: "PATCH",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({
                                        spreadsheet_ids: [sheetId],
                                        spreadsheets: [{ id: sheetId, name: "Manual", selected: true }],
                                      }),
                                    });
                                    toast("Spreadsheet added", "success");
                                    setManualSheetUrl("");
                                    loadConnectors();
                                  } catch {
                                    toast("Failed", "error");
                                  }
                                  setSavingSheets(null);
                                }}
                              >
                                Add
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Team Tab */}
        {activeTab === "team" && (
          <div className="space-y-6">
            {/* Active Users */}
            <div className="wf-soft p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium text-white/80">Team Members</h2>
                <Button variant="default" size="sm" onClick={() => setBulkOpen(!bulkOpen)}>
                  {bulkOpen ? "Close" : "Grant Cross-Department Access"}
                </Button>
              </div>

              {/* Bulk Grant */}
              {bulkOpen && (
                <div className="bg-white/[0.03] rounded-lg p-4 space-y-3">
                  <p className="text-xs text-white/50">Allow all members of one department to also access another department.</p>
                  <div className="flex items-end gap-3">
                    <Select
                      label="Source Department"
                      options={[{ value: "", label: "Select..." }, ...teamDepts.map((d) => ({ value: d.id, label: d.displayName }))]}
                      value={bulkSource}
                      onChange={(e) => setBulkSource(e.target.value)}
                    />
                    <span className="text-white/30 pb-2">→</span>
                    <Select
                      label="Target Department"
                      options={[{ value: "", label: "Select..." }, ...teamDepts.map((d) => ({ value: d.id, label: d.displayName }))]}
                      value={bulkTarget}
                      onChange={(e) => setBulkTarget(e.target.value)}
                    />
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={bulkRunning || !bulkSource || !bulkTarget || bulkSource === bulkTarget}
                      onClick={async () => {
                        setBulkRunning(true);
                        try {
                          const res = await fetch("/api/users/bulk-grant", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ sourceDepartmentId: bulkSource, targetDepartmentId: bulkTarget }),
                          });
                          const data = await res.json();
                          if (res.ok) {
                            toast(`Granted: ${data.granted}, already had: ${data.alreadyHad}`, "success");
                            loadTeamData();
                          } else {
                            toast(data.error || "Failed", "error");
                          }
                        } catch { toast("Failed", "error"); }
                        setBulkRunning(false);
                      }}
                    >
                      {bulkRunning ? "..." : "Grant"}
                    </Button>
                  </div>
                </div>
              )}

              {teamLoading ? (
                <p className="text-sm text-white/30">Loading...</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-white/40 border-b border-white/[0.06]">
                        <th className="pb-2 font-medium">Name</th>
                        <th className="pb-2 font-medium">Email</th>
                        <th className="pb-2 font-medium">Role</th>
                        <th className="pb-2 font-medium">Home Dept</th>
                        <th className="pb-2 font-medium">Additional Access</th>
                        <th className="pb-2 font-medium">Last Active</th>
                        <th className="pb-2 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teamUsers.map((u) => {
                        const isEditing = editingUserId === u.id;
                        // Home dept scope = scope matching entity's department
                        const homeDeptScopes = u.scopes.filter((s) => s.departmentName === u.departmentName);
                        const extraScopes = u.scopes.filter((s) => s.departmentName !== u.departmentName);

                        return (
                          <tr key={u.id} className="border-b border-white/[0.04] align-top">
                            <td className="py-2.5 text-white/70">
                              {u.name}
                              {u.entityId && (
                                <span className="ml-1.5 text-[10px] text-purple-400" title="Linked to entity">&#9679;</span>
                              )}
                            </td>
                            <td className="py-2.5 text-white/50">{u.email}</td>
                            <td className="py-2.5">
                              {isEditing ? (
                                <select
                                  className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white/70"
                                  defaultValue={u.role}
                                  onChange={async (e) => {
                                    const newRole = e.target.value;
                                    try {
                                      const res = await fetch(`/api/users/${u.id}/role`, {
                                        method: "PUT",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ role: newRole }),
                                      });
                                      if (res.ok) {
                                        toast("Role updated", "success");
                                        loadTeamData();
                                      } else {
                                        const d = await res.json();
                                        toast(d.error || "Failed", "error");
                                      }
                                    } catch { toast("Failed", "error"); }
                                    setEditingUserId(null);
                                  }}
                                  onBlur={() => setEditingUserId(null)}
                                >
                                  {["admin", "member"].map((r) => (
                                    <option key={r} value={r}>{r}</option>
                                  ))}
                                </select>
                              ) : (
                                <span
                                  className={`text-xs font-medium capitalize px-2 py-0.5 rounded ${
                                    u.role === "admin" ? "bg-purple-500/15 text-purple-300" : "bg-white/5 text-white/50"
                                  } cursor-pointer`}
                                  onClick={() => setEditingUserId(u.id)}
                                  title="Click to edit role"
                                >
                                  {u.role}
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 text-white/50 text-xs">{u.departmentName || (u.role === "admin" ? "All" : "—")}</td>
                            <td className="py-2.5">
                              {u.role === "admin" ? (
                                <span className="text-xs text-white/30">All (admin)</span>
                              ) : (
                                <div className="flex flex-wrap gap-1">
                                  {extraScopes.map((s) => (
                                    <span key={s.id} className="inline-flex items-center gap-1 text-[10px] bg-white/[0.06] rounded px-1.5 py-0.5 text-white/50">
                                      {s.departmentName}
                                      <button
                                        className="text-red-400 hover:text-red-300"
                                        title="Remove access"
                                        onClick={async () => {
                                          try {
                                            const res = await fetch(`/api/users/${u.id}/scopes/${s.id}`, { method: "DELETE" });
                                            if (res.ok) { toast("Access removed", "success"); loadTeamData(); }
                                            else { const d = await res.json(); toast(d.error || "Failed", "error"); }
                                          } catch { toast("Failed", "error"); }
                                        }}
                                      >
                                        ×
                                      </button>
                                    </span>
                                  ))}
                                  {homeDeptScopes.length > 0 && (
                                    <span className="text-[10px] bg-white/[0.06] rounded px-1.5 py-0.5 text-white/30">{u.departmentName} (home)</span>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 text-white/40 text-xs">
                              {u.lastActive
                                ? new Date(u.lastActive).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                                : "—"}
                            </td>
                            <td className="py-2.5">
                              {u.role !== "admin" && isEditing && (
                                <select
                                  className="bg-white/5 border border-white/10 rounded px-2 py-1 text-[10px] text-white/70"
                                  value=""
                                  onChange={async (e) => {
                                    const deptId = e.target.value;
                                    if (!deptId) return;
                                    try {
                                      const res = await fetch(`/api/users/${u.id}/scopes`, {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ departmentEntityId: deptId }),
                                      });
                                      if (res.ok) { toast("Access granted", "success"); loadTeamData(); }
                                      else { const d = await res.json(); toast(d.error || "Failed", "error"); }
                                    } catch { toast("Failed", "error"); }
                                  }}
                                >
                                  <option value="">+ Add dept</option>
                                  {teamDepts
                                    .filter((d) => !u.scopes.some((s) => s.departmentEntityId === d.id))
                                    .map((d) => <option key={d.id} value={d.id}>{d.displayName}</option>)}
                                </select>
                              )}
                              {!isEditing && (
                                <button
                                  className="text-xs text-purple-400 hover:text-purple-300"
                                  onClick={() => setEditingUserId(u.id)}
                                >
                                  Edit
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Pending Invites */}
            <div className="wf-soft p-6 space-y-4">
              <h2 className="text-lg font-medium text-white/80">Pending Invites</h2>
              {teamInvites.length === 0 ? (
                <p className="text-sm text-white/30">No pending invites</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-white/40 border-b border-white/[0.06]">
                        <th className="pb-2 font-medium">Person</th>
                        <th className="pb-2 font-medium">Email</th>
                        <th className="pb-2 font-medium">Role</th>
                        <th className="pb-2 font-medium">Department</th>
                        <th className="pb-2 font-medium">Invite Link</th>
                        <th className="pb-2 font-medium">Expires</th>
                        <th className="pb-2 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teamInvites.map((inv) => (
                        <tr key={inv.id} className="border-b border-white/[0.04]">
                          <td className="py-2.5 text-white/70">{inv.entityName}</td>
                          <td className="py-2.5 text-white/50">{inv.email}</td>
                          <td className="py-2.5 text-white/50 capitalize">{inv.role}</td>
                          <td className="py-2.5 text-white/50">{inv.departmentName || "—"}</td>
                          <td className="py-2.5">
                            <button
                              className="text-xs text-purple-400 hover:text-purple-300"
                              onClick={() => {
                                navigator.clipboard.writeText(inv.link);
                                toast("Link copied", "success");
                              }}
                            >
                              Copy Link
                            </button>
                          </td>
                          <td className="py-2.5 text-white/40 text-xs">
                            in {Math.max(0, Math.ceil((new Date(inv.expiresAt).getTime() - Date.now()) / 86400000))} days
                          </td>
                          <td className="py-2.5">
                            <button
                              className="text-xs text-red-400 hover:text-red-300"
                              disabled={revokingId === inv.id}
                              onClick={async () => {
                                if (!confirm("Revoke this invite?")) return;
                                setRevokingId(inv.id);
                                try {
                                  const res = await fetch(`/api/users/invite/${inv.id}`, { method: "DELETE" });
                                  if (res.ok) { toast("Invite revoked", "success"); loadTeamData(); }
                                  else { const d = await res.json(); toast(d.error || "Failed", "error"); }
                                } catch { toast("Failed", "error"); }
                                setRevokingId(null);
                              }}
                            >
                              {revokingId === inv.id ? "..." : "Revoke"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Entity Merges Tab */}
        {activeTab === "merges" && (
          <div className="space-y-6">
            {/* Section 1: Auto-Merge Log */}
            <div className="wf-soft p-6 space-y-4">
              <h2 className="text-lg font-medium text-white/80">Auto-Merge Log</h2>
              {mergeLoading ? (
                <p className="text-sm text-white/30">Loading...</p>
              ) : mergeLog.length === 0 ? (
                <p className="text-sm text-white/30">No merges recorded yet.</p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-white/40 border-b border-white/[0.06]">
                          <th className="pb-2 font-medium">Date</th>
                          <th className="pb-2 font-medium">Survivor</th>
                          <th className="pb-2 font-medium">Absorbed</th>
                          <th className="pb-2 font-medium">Type</th>
                          <th className="pb-2 font-medium">Confidence</th>
                          <th className="pb-2 font-medium">Undo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mergeLog.map((entry) => {
                          const typeBadge: Record<string, { label: string; cls: string }> = {
                            auto_identity: { label: "Email Match", cls: "bg-blue-500/15 text-blue-400" },
                            ml_high_confidence: { label: "ML Auto", cls: "bg-amber-500/15 text-amber-400" },
                            admin_manual: { label: "Manual", cls: "bg-emerald-500/15 text-emerald-400" },
                          };
                          const badge = typeBadge[entry.mergeType] || { label: entry.mergeType, cls: "bg-white/10 text-white/50" };

                          return (
                            <tr key={entry.id} className="border-b border-white/[0.04] align-top">
                              <td className="py-2.5 text-white/50 text-xs">
                                {formatMergeDate(entry.createdAt)}
                              </td>
                              <td className="py-2.5 text-white/70">{entry.survivor.displayName}</td>
                              <td className="py-2.5 text-white/50">
                                {entry.absorbed.displayName}
                                {entry.absorbed.status === "merged" && (
                                  <span className="ml-1 text-[10px] text-white/25">(merged)</span>
                                )}
                              </td>
                              <td className="py-2.5">
                                <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${badge.cls}`}>
                                  {badge.label}
                                </span>
                              </td>
                              <td className="py-2.5 text-white/60 text-xs">
                                {entry.confidence != null ? `${Math.round(entry.confidence * 100)}%` : "—"}
                              </td>
                              <td className="py-2.5">
                                {entry.reversedAt ? (
                                  <span className="text-xs text-white/25">Reversed</span>
                                ) : (
                                  <button
                                    className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                                    disabled={reversingId === entry.id}
                                    onClick={() => setConfirmReverseId(entry.id)}
                                  >
                                    {reversingId === entry.id ? "..." : "Undo"}
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {mergeLogTotal > mergeLog.length && (
                    <button
                      className="text-xs text-purple-400 hover:text-purple-300"
                      onClick={() => loadMergeData(mergeLogPage + 1)}
                    >
                      Load more ({mergeLogTotal - mergeLog.length} remaining)
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Section 2: Pending Suggestions */}
            <div className="wf-soft p-6 space-y-4">
              <h2 className="text-lg font-medium text-white/80">Pending Suggestions</h2>
              {mergeLoading ? (
                <p className="text-sm text-white/30">Loading...</p>
              ) : mergeSuggestions.length === 0 ? (
                <div className="flex items-center gap-3 py-4">
                  <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <p className="text-sm text-white/40">No pending merge suggestions — all entities are resolved.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {mergeSuggestions.map((s) => {
                    const aProps = s.entityA.properties || {};
                    const bProps = s.entityB.properties || {};
                    const allKeys = Array.from(new Set([...Object.keys(aProps), ...Object.keys(bProps)]));
                    const signals = Array.isArray(s.signals) ? s.signals : [];
                    const confPct = s.confidence != null ? Math.round(s.confidence * 100) : null;
                    const confColor = confPct != null && confPct > 70 ? "text-emerald-400" : "text-amber-400";

                    return (
                      <div key={s.id} className="bg-white/[0.03] rounded-lg p-5 border border-white/[0.06] space-y-4">
                        <div className="grid grid-cols-2 gap-6">
                          {/* Entity A */}
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-medium text-white/80">{s.entityA.displayName}</h4>
                              {s.entityA.entityType && (
                                <span className="text-[10px] text-white/30">{s.entityA.entityType.name}</span>
                              )}
                            </div>
                            {s.entityA.sourceSystem && (
                              <p className="text-[11px] text-white/30">Source: {s.entityA.sourceSystem}</p>
                            )}
                            <div className="space-y-1">
                              {allKeys.map((key) => {
                                const aVal = aProps[key];
                                const bVal = bProps[key];
                                const isMatch = aVal && bVal && aVal === bVal;
                                return (
                                  <div key={key} className="flex items-center gap-2 text-xs">
                                    <span className="text-white/30 w-16 shrink-0 capitalize">{key}:</span>
                                    <span className={aVal ? (isMatch ? "text-white/80 font-medium" : "text-white/60") : "text-white/20"}>
                                      {aVal || "—"}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          {/* Entity B */}
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-medium text-white/80">{s.entityB.displayName}</h4>
                              {s.entityB.entityType && (
                                <span className="text-[10px] text-white/30">{s.entityB.entityType.name}</span>
                              )}
                            </div>
                            {s.entityB.sourceSystem && (
                              <p className="text-[11px] text-white/30">Source: {s.entityB.sourceSystem}</p>
                            )}
                            <div className="space-y-1">
                              {allKeys.map((key) => {
                                const aVal = aProps[key];
                                const bVal = bProps[key];
                                const isMatch = aVal && bVal && aVal === bVal;
                                return (
                                  <div key={key} className="flex items-center gap-2 text-xs">
                                    <span className="text-white/30 w-16 shrink-0 capitalize">{key}:</span>
                                    <span className={bVal ? (isMatch ? "text-white/80 font-medium" : "text-white/60") : "text-white/20"}>
                                      {bVal || "—"}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        {/* Match signals + confidence */}
                        <div className="flex items-center justify-between border-t border-white/[0.06] pt-3">
                          <div className="flex items-center gap-3 text-xs">
                            {signals.map((sig, i) => {
                              const key = Object.keys(sig)[0];
                              const val = sig[key];
                              if (!key) return null;
                              return (
                                <span key={i} className="text-white/40">
                                  <span className="text-emerald-400 mr-1">&#10003;</span>
                                  {key.replace(/_/g, " ")} {val != null && typeof val === "number" && val < 1 ? `(${val.toFixed(2)})` : ""}
                                </span>
                              );
                            })}
                            {confPct != null && (
                              <span className={`font-medium ${confColor}`}>{confPct}%</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              className="px-3 py-1 rounded-md text-xs font-medium bg-purple-500/15 text-purple-300 hover:bg-purple-500/25 disabled:opacity-50"
                              disabled={approvingId === s.id}
                              onClick={async () => {
                                setApprovingId(s.id);
                                try {
                                  const res = await fetch(`/api/admin/merge-suggestions/${s.id}/approve`, { method: "POST" });
                                  if (res.ok) {
                                    setMergeSuggestions((prev) => prev.filter((x) => x.id !== s.id));
                                    toast("Entities merged", "success");
                                    loadMergeData(mergeLogPage);
                                  } else {
                                    const d = await res.json();
                                    toast(d.error || "Merge failed", "error");
                                  }
                                } catch { toast("Failed", "error"); }
                                setApprovingId(null);
                              }}
                            >
                              {approvingId === s.id ? "..." : "Merge"}
                            </button>
                            <button
                              className="px-3 py-1 rounded-md text-xs font-medium text-white/40 hover:text-white/60 hover:bg-white/[0.05] disabled:opacity-50"
                              disabled={dismissingId === s.id}
                              onClick={async () => {
                                setDismissingId(s.id);
                                try {
                                  const res = await fetch(`/api/admin/merge-suggestions/${s.id}/dismiss`, { method: "POST" });
                                  if (res.ok) {
                                    setMergeSuggestions((prev) => prev.filter((x) => x.id !== s.id));
                                    toast("Suggestion dismissed", "success");
                                  } else {
                                    const d = await res.json();
                                    toast(d.error || "Failed", "error");
                                  }
                                } catch { toast("Failed", "error"); }
                                setDismissingId(null);
                              }}
                            >
                              {dismissingId === s.id ? "..." : "Dismiss"}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Undo Merge Confirmation Modal */}
        {confirmReverseId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="wf-soft max-w-sm w-full mx-4 p-6 space-y-4">
              <h3 className="text-lg font-medium text-white/90">Reverse Merge</h3>
              <p className="text-sm text-white/50">
                This will restore the absorbed entity and revert relationship changes. Continue?
              </p>
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="ghost" size="sm" onClick={() => setConfirmReverseId(null)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={reversingId === confirmReverseId}
                  onClick={async () => {
                    const id = confirmReverseId;
                    setReversingId(id);
                    try {
                      const res = await fetch(`/api/admin/merge-log/${id}/reverse`, { method: "POST" });
                      if (res.ok) {
                        toast("Merge reversed", "success");
                        loadMergeData(mergeLogPage);
                      } else {
                        const d = await res.json();
                        toast(d.error || "Failed", "error");
                      }
                    } catch { toast("Failed", "error"); }
                    setReversingId(null);
                    setConfirmReverseId(null);
                  }}
                  className="bg-red-500/20 text-red-400 hover:bg-red-500/30 border-red-500/20"
                >
                  {reversingId === confirmReverseId ? "Reversing..." : "Reverse"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── AI Governance Tab ── */}
        {activeTab === "governance" && (
          <div className="space-y-6">
            {govLoading ? (
              <div className="flex justify-center py-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#2a2a2a] border-t-[#707070]" />
              </div>
            ) : (
              <>
                {/* Graduation Thresholds */}
                <div style={{ background: "#161616", border: "1px solid #2a2a2a", borderRadius: 6, padding: 20 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "#484848", textTransform: "uppercase" as const }} className="mb-4">
                    Graduation Thresholds
                  </div>
                  <div className="space-y-4">
                    <p style={{ fontSize: 11, fontWeight: 600, color: "#707070", textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>
                      Supervised &rarr; Notify
                    </p>
                    <Input
                      label="Consecutive approvals required"
                      type="number"
                      value={govAutoSupervisedConsecutive}
                      onChange={e => setGovAutoSupervisedConsecutive(e.target.value)}
                    />
                    <Input
                      label="Minimum approval rate (%)"
                      type="number"
                      value={govAutoSupervisedRate}
                      onChange={e => setGovAutoSupervisedRate(e.target.value)}
                    />
                    <p style={{ fontSize: 11, fontWeight: 600, color: "#707070", textTransform: "uppercase" as const, letterSpacing: "0.05em" }} className="pt-2">
                      Notify &rarr; Autonomous
                    </p>
                    <Input
                      label="Consecutive approvals required"
                      type="number"
                      value={govAutoNotifyConsecutive}
                      onChange={e => setGovAutoNotifyConsecutive(e.target.value)}
                    />
                    <Input
                      label="Minimum approval rate (%)"
                      type="number"
                      value={govAutoNotifyRate}
                      onChange={e => setGovAutoNotifyRate(e.target.value)}
                    />
                    <div className="pt-2">
                      <Button variant="primary" onClick={handleSaveThresholds} disabled={govThresholdSaving}>
                        {govThresholdSaving ? "Saving..." : "Save Thresholds"}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* General Governance Settings */}
                <div style={{ background: "#161616", border: "1px solid #2a2a2a", borderRadius: 6, padding: 20 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "#484848", textTransform: "uppercase" as const }} className="mb-4">
                    General Settings
                  </div>
                  <div className="space-y-4">
                    <Input
                      label="Approval Threshold (amount)"
                      type="number"
                      value={govApprovalThreshold}
                      onChange={e => setGovApprovalThreshold(e.target.value)}
                      placeholder="Leave empty for no threshold"
                    />
                    <div className="flex items-center justify-between">
                      <div>
                        <div style={{ fontSize: 13, color: "#b0b0b0" }}>Auto-approve read actions</div>
                        <div style={{ fontSize: 11, color: "#484848" }}>Allow read operations without policy checks</div>
                      </div>
                      <button
                        onClick={() => setGovAutoApproveReads(!govAutoApproveReads)}
                        style={{
                          position: "relative",
                          display: "inline-flex",
                          height: 24,
                          width: 40,
                          alignItems: "center",
                          borderRadius: 12,
                          background: govAutoApproveReads ? "#a855f7" : "#222",
                          transition: "background 150ms",
                        }}
                      >
                        <span style={{
                          display: "inline-block",
                          height: 16,
                          width: 16,
                          borderRadius: 8,
                          background: "#fff",
                          transition: "transform 150ms",
                          transform: govAutoApproveReads ? "translateX(20px)" : "translateX(4px)",
                        }} />
                      </button>
                    </div>
                    <Input
                      label="Max Pending Proposals"
                      type="number"
                      value={govMaxPending}
                      onChange={e => setGovMaxPending(e.target.value)}
                    />
                    <Input
                      label="Approval Expiry (hours)"
                      type="number"
                      value={govExpiryHours}
                      onChange={e => setGovExpiryHours(e.target.value)}
                    />
                    <div className="pt-2">
                      <Button variant="primary" onClick={handleSaveGovernanceSettings} disabled={govSettingsSaving}>
                        {govSettingsSaving ? "Saving..." : "Save Settings"}
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

      </div>
    </AppShell>
  );
}

function formatMergeDate(isoString: string): string {
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
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
