"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { useSearchParams } from "next/navigation";

type Tab = "ai" | "governance" | "connections" | "data" | "autonomy";

type SituationTypeItem = {
  id: string;
  name: string;
  slug: string;
  autonomyLevel: string;
  consecutiveApprovals: number;
  totalApproved: number;
  totalProposed: number;
  approvalRate: number;
};

type ConnectorItem = {
  id: string;
  provider: string;
  providerName: string;
  name: string;
  status: string;
  lastSyncAt: string | null;
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

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsPageInner />
    </Suspense>
  );
}

function SettingsPageInner() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const googleParam = searchParams.get("google");
  const hubspotParam = searchParams.get("hubspot");
  const stripeParam = searchParams.get("stripe");

  const [activeTab, setActiveTab] = useState<Tab>(
    tabParam === "connections" ? "connections" : tabParam === "autonomy" ? "autonomy" : "ai"
  );

  // AI state
  const [aiProvider, setAiProvider] = useState("ollama");
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiBaseUrl, setAiBaseUrl] = useState("http://localhost:11434");
  const [aiModel, setAiModel] = useState("");
  const [aiSaving, setAiSaving] = useState(false);
  const [aiTesting, setAiTesting] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<{
    ok: boolean;
    provider?: string;
    model?: string;
    baseUrl?: string;
    response?: string;
    error?: string;
  } | null>(null);
  const [aiSaved, setAiSaved] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<Array<{ value: string; label: string }>>([]);

  // Governance state
  const [govApprovalThreshold, setGovApprovalThreshold] = useState("");
  const [govAutoApproveReads, setGovAutoApproveReads] = useState(true);
  const [govMaxPending, setGovMaxPending] = useState("50");
  const [govExpiryHours, setGovExpiryHours] = useState("72");
  const [govSaving, setGovSaving] = useState(false);

  // Connections state
  const [connectors, setConnectors] = useState<ConnectorItem[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<{
    id: string;
    eventsCreated: number;
    durationMs: number;
    errors: string[];
  } | null>(null);
  const [pendingConfig, setPendingConfig] = useState<{
    id: string;
    name: string;
    spreadsheet_id: string;
  } | null>(null);
  const [savingPending, setSavingPending] = useState(false);
  const [pendingMode, setPendingMode] = useState<"sheet" | "folder">("sheet");
  const [folderUrl, setFolderUrl] = useState("");
  const [discovering, setDiscovering] = useState(false);
  const [discoverResult, setDiscoverResult] = useState<{
    created: Array<{ id: string; name: string; spreadsheetId: string }>;
    skipped: Array<{ name: string; reason: string }>;
    total: number;
  } | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncAllResult, setSyncAllResult] = useState<{
    synced: Array<{ connectorId: string; name: string; eventsCreated: number; status: string }>;
    errors: Array<{ connectorId: string; name: string; error: string }>;
  } | null>(null);

  // Connector bindings (read-only overview)
  const [connectorBindings, setConnectorBindings] = useState<Record<string, Array<{ id: string; departmentId: string; departmentName: string; enabled: boolean }>>>({});

  // Autonomy state
  const [autoSupervisedConsecutive, setAutoSupervisedConsecutive] = useState("10");
  const [autoSupervisedRate, setAutoSupervisedRate] = useState("90");
  const [autoNotifyConsecutive, setAutoNotifyConsecutive] = useState("20");
  const [autoNotifyRate, setAutoNotifyRate] = useState("95");
  const [autoSaving, setAutoSaving] = useState(false);
  const [situationTypes, setSituationTypes] = useState<SituationTypeItem[]>([]);
  const [autoLoading, setAutoLoading] = useState(false);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [demotingId, setDemotingId] = useState<string | null>(null);

  // Data state
  const [dataAction, setDataAction] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  // Load autonomy settings and situation types
  const loadSituationTypes = useCallback(() => {
    fetch("/api/situation-types")
      .then((r) => r.json())
      .then((data) => setSituationTypes(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (activeTab === "autonomy") {
      setAutoLoading(true);
      Promise.all([
        fetch("/api/autonomy/settings").then((r) => r.json()),
        fetch("/api/situation-types").then((r) => r.json()),
      ]).then(([settings, types]) => {
        setAutoSupervisedConsecutive(String(settings.supervisedToNotifyConsecutive));
        setAutoSupervisedRate(String(Math.round(settings.supervisedToNotifyRate * 100)));
        setAutoNotifyConsecutive(String(settings.notifyToAutonomousConsecutive));
        setAutoNotifyRate(String(Math.round(settings.notifyToAutonomousRate * 100)));
        setSituationTypes(types);
      }).catch(() => {}).finally(() => setAutoLoading(false));
    }
  }, [activeTab]);

  // Fetch Ollama models when provider is ollama
  useEffect(() => {
    if (aiProvider !== "ollama") return;
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
  }, [aiProvider, aiBaseUrl]);

  // Load AI settings from DB
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data: Record<string, string>) => {
        if (data.ai_provider) setAiProvider(data.ai_provider);
        if (data.ai_base_url) setAiBaseUrl(data.ai_base_url);
        if (data.ai_api_key) setAiApiKey(data.ai_api_key);
        if (data.ai_model) setAiModel(data.ai_model);
      })
      .catch(() => {});
  }, []);

  // Load governance config
  useEffect(() => {
    fetch("/api/governance")
      .then((r) => r.json())
      .then((data) => {
        if (data.requireApprovalAboveAmount != null) {
          setGovApprovalThreshold(String(data.requireApprovalAboveAmount));
        }
        setGovAutoApproveReads(data.autoApproveReadActions ?? true);
        setGovMaxPending(String(data.maxPendingProposals ?? 50));
        setGovExpiryHours(String(data.approvalExpiryHours ?? 72));
      })
      .catch(() => {});
  }, []);

  // Load connectors and providers
  const loadConnectors = useCallback(() => {
    fetch("/api/connectors")
      .then((r) => r.json())
      .then((data) => {
        const items: ConnectorItem[] = data.connectors || [];
        setConnectors(items);
        // Load bindings for each connector
        for (const c of items) {
          fetch(`/api/connectors/${c.id}/bindings`)
            .then((r) => r.json())
            .then((bindings) => {
              setConnectorBindings((prev) => ({ ...prev, [c.id]: bindings }));
            })
            .catch(() => {});
        }
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
      toast("Google account connected. Configure your spreadsheet below.", "success");
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

  // Set pending config for pending Google Sheets connectors (HubSpot is immediately active)
  useEffect(() => {
    const pending = connectors.find((c) => c.status === "pending" && c.provider === "google-sheets");
    if (pending && !pendingConfig) {
      setPendingConfig({
        id: pending.id,
        name: pending.name || "",
        spreadsheet_id: "",
      });
    }
  }, [connectors, pendingConfig]);

  // Save AI settings
  const handleSaveAi = async () => {
    setAiSaving(true);
    try {
      const payload: Record<string, string> = { ai_provider: aiProvider };
      if (aiProvider === "ollama" && aiBaseUrl) payload.ai_base_url = aiBaseUrl;
      if (aiProvider !== "ollama") {
        // Clear base URL so provider default kicks in
        payload.ai_base_url = "";
      }
      if (aiApiKey) payload.ai_api_key = aiApiKey;
      if (aiModel) payload.ai_model = aiModel;
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setAiSaved(true);
      setAiTestResult(null);
      setTimeout(() => setAiSaved(false), 3000);
      toast("AI settings saved", "success");
    } catch {
      toast("Failed to save AI settings", "error");
    } finally {
      setAiSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setAiTesting(true);
    setAiTestResult(null);
    try {
      const res = await fetch("/api/settings/test-ai", { method: "POST" });
      const data = await res.json();
      setAiTestResult(data);
    } catch (err) {
      setAiTestResult({
        ok: false,
        error: err instanceof Error ? err.message : "Request failed",
      });
    } finally {
      setAiTesting(false);
    }
  };

  const handleSaveGovernance = async () => {
    setGovSaving(true);
    try {
      const res = await fetch("/api/governance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requireApprovalAboveAmount: govApprovalThreshold
            ? parseFloat(govApprovalThreshold)
            : null,
          autoApproveReadActions: govAutoApproveReads,
          maxPendingProposals: parseInt(govMaxPending) || 50,
          approvalExpiryHours: parseInt(govExpiryHours) || 72,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast("Governance settings saved", "success");
    } catch {
      toast("Failed to save governance settings", "error");
    } finally {
      setGovSaving(false);
    }
  };

  // Connections handlers
  const handleConnectGoogle = async () => {
    try {
      const res = await fetch("/api/connectors/google-sheets/auth-url");
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast(data.error || "Failed to get auth URL", "error");
      }
    } catch {
      toast("Failed to start Google authorization", "error");
    }
  };

  const handleConnectHubSpot = async () => {
    try {
      const res = await fetch("/api/connectors/hubspot/auth-url");
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast(data.error || "Failed to get auth URL", "error");
      }
    } catch {
      toast("Failed to start HubSpot authorization", "error");
    }
  };

  const handleConnectStripe = async () => {
    try {
      const res = await fetch("/api/connectors/stripe/auth-url");
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast(data.error || "Failed to get auth URL", "error");
      }
    } catch {
      toast("Failed to start Stripe authorization", "error");
    }
  };

  const [copiedWebhook, setCopiedWebhook] = useState<string | null>(null);
  const copyWebhookUrl = (connectorId: string) => {
    const url = `${window.location.origin}/api/webhooks/${connectorId}`;
    navigator.clipboard.writeText(url);
    setCopiedWebhook(connectorId);
    setTimeout(() => setCopiedWebhook(null), 2000);
  };

  const handleSync = async (connectorId: string) => {
    setSyncingId(connectorId);
    setSyncResult(null);
    try {
      const res = await fetch(`/api/connectors/${connectorId}/sync`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Sync failed", "error");
        return;
      }
      setSyncResult({
        id: connectorId,
        eventsCreated: data.eventsCreated,
        durationMs: data.durationMs,
        errors: data.errors || [],
      });
      toast(
        `Synced ${data.eventsCreated} events in ${(data.durationMs / 1000).toFixed(1)}s`,
        "success"
      );
      loadConnectors();
    } catch {
      toast("Sync failed", "error");
    } finally {
      setSyncingId(null);
    }
  };

  const handleRemoveConnector = async (connectorId: string) => {
    try {
      await fetch(`/api/connectors/${connectorId}`, { method: "DELETE" });
      toast("Connector removed", "success");
      setConnectors((prev) => prev.filter((c) => c.id !== connectorId));
      if (pendingConfig?.id === connectorId) setPendingConfig(null);
    } catch {
      toast("Failed to remove connector", "error");
    }
  };

  const handleDiscoverFolder = async () => {
    if (!pendingConfig || !folderUrl.trim()) return;
    setDiscovering(true);
    setDiscoverResult(null);
    setSyncAllResult(null);
    try {
      const res = await fetch("/api/connectors/google-drive/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folderUrl: folderUrl.trim(),
          connectorId: pendingConfig.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Discovery failed", "error");
        return;
      }
      if (data.total === 0) {
        toast(data.message || "No spreadsheets found in folder", "info");
        setPendingConfig(null);
        loadConnectors();
        return;
      }
      setDiscoverResult(data);
      toast(`Found ${data.total} spreadsheet(s)`, "success");
      setPendingConfig(null);
      loadConnectors();
    } catch {
      toast("Failed to discover folder", "error");
    } finally {
      setDiscovering(false);
    }
  };

  const handleSyncAll = async () => {
    setSyncingAll(true);
    setSyncAllResult(null);
    try {
      const res = await fetch("/api/connectors/sync-all", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Batch sync failed", "error");
        return;
      }
      setSyncAllResult(data);
      const totalEvents = data.synced.reduce(
        (sum: number, s: { eventsCreated: number }) => sum + s.eventsCreated,
        0
      );
      toast(
        `Synced ${data.synced.length} connector(s), ${totalEvents} events total`,
        "success"
      );
      loadConnectors();
    } catch {
      toast("Batch sync failed", "error");
    } finally {
      setSyncingAll(false);
    }
  };

  const handleSavePending = async () => {
    if (!pendingConfig) return;
    setSavingPending(true);
    try {
      const res = await fetch(`/api/connectors/${pendingConfig.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: pendingConfig.name,
          spreadsheet_id: pendingConfig.spreadsheet_id,
        }),
      });
      if (!res.ok) throw new Error();
      toast("Connector configured", "success");
      setPendingConfig(null);
      loadConnectors();
    } catch {
      toast("Failed to configure connector", "error");
    } finally {
      setSavingPending(false);
    }
  };

  const handleSaveAutonomy = async () => {
    setAutoSaving(true);
    try {
      await fetch("/api/autonomy/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          graduation_supervised_to_notify_consecutive: parseInt(autoSupervisedConsecutive) || 10,
          graduation_supervised_to_notify_rate: (parseInt(autoSupervisedRate) || 90) / 100,
          graduation_notify_to_autonomous_consecutive: parseInt(autoNotifyConsecutive) || 20,
          graduation_notify_to_autonomous_rate: (parseInt(autoNotifyRate) || 95) / 100,
        }),
      });
      toast("Autonomy thresholds saved", "success");
    } catch {
      toast("Failed to save thresholds", "error");
    } finally {
      setAutoSaving(false);
    }
  };

  const handlePromote = async (stId: string) => {
    setPromotingId(stId);
    try {
      await fetch("/api/autonomy/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ situationTypeId: stId }),
      });
      toast("Promoted successfully", "success");
      loadSituationTypes();
    } catch {
      toast("Promotion failed", "error");
    } finally {
      setPromotingId(null);
    }
  };

  const handleDemote = async (stId: string) => {
    setDemotingId(stId);
    try {
      await fetch("/api/autonomy/demote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ situationTypeId: stId }),
      });
      toast("Demoted successfully", "success");
      loadSituationTypes();
    } catch {
      toast("Demotion failed", "error");
    } finally {
      setDemotingId(null);
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "ai", label: "AI Provider" },
    { key: "governance", label: "Governance" },
    { key: "autonomy", label: "Autonomy" },
    { key: "connections", label: "Connections" },
    { key: "data", label: "Data Management" },
  ];

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
        {activeTab === "ai" && (
          <div className="wf-soft p-6 space-y-5">
            <h2 className="text-lg font-medium text-white/80">
              AI Provider Configuration
            </h2>
            <Select
              label="Provider"
              options={PROVIDER_OPTIONS}
              value={aiProvider}
              onChange={(e) => {
                const newProvider = e.target.value;
                setAiProvider(newProvider);
                // Auto-select the first model for the new provider
                const models = newProvider === "ollama" ? ollamaModels : (CLOUD_MODEL_OPTIONS[newProvider] ?? []);
                if (models.length > 0) setAiModel(models[0].value);
              }}
            />
            {aiProvider !== "ollama" && (
              <Input
                label="API Key"
                type="password"
                value={aiApiKey}
                onChange={(e) => setAiApiKey(e.target.value)}
                placeholder="sk-..."
              />
            )}
            {aiProvider === "ollama" && (
              <Input
                label="Base URL"
                value={aiBaseUrl}
                onChange={(e) => setAiBaseUrl(e.target.value)}
                placeholder="http://localhost:11434"
              />
            )}
            <Select
              label="Model"
              options={aiProvider === "ollama" ? ollamaModels : (CLOUD_MODEL_OPTIONS[aiProvider] ?? [])}
              value={aiModel}
              onChange={(e) => setAiModel(e.target.value)}
            />
            <div className="flex items-center gap-3 pt-2">
              <Button
                variant="primary"
                onClick={handleSaveAi}
                disabled={aiSaving}
              >
                {aiSaving ? "Saving..." : "Save"}
              </Button>
              <Button
                variant="default"
                onClick={handleTestConnection}
                disabled={aiTesting}
              >
                {aiTesting ? "Testing..." : "Test Connection"}
              </Button>
              {aiSaved && (
                <span className="text-xs text-emerald-400">Saved</span>
              )}
            </div>

            {/* Test result */}
            {aiTestResult && (
              <div
                className={`rounded-lg p-4 text-sm space-y-1 ${
                  aiTestResult.ok
                    ? "bg-emerald-500/10 border border-emerald-500/20"
                    : "bg-red-500/10 border border-red-500/20"
                }`}
              >
                {aiTestResult.ok ? (
                  <>
                    <div className="flex items-center gap-2 text-emerald-400 font-medium">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      Connection successful
                    </div>
                    <div className="text-white/50 text-xs space-y-0.5 pt-1">
                      <div>Provider: <span className="text-white/70">{aiTestResult.provider}</span></div>
                      <div>Model: <span className="text-white/70">{aiTestResult.model}</span></div>
                      {aiTestResult.baseUrl && (
                        <div>URL: <span className="text-white/70">{aiTestResult.baseUrl}</span></div>
                      )}
                      <div>Response: <span className="text-white/70">&quot;{aiTestResult.response}&quot;</span></div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2 text-red-400 font-medium">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Connection failed
                    </div>
                    <div className="text-red-300/70 text-xs pt-1">{aiTestResult.error}</div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Governance Tab */}
        {activeTab === "governance" && (
          <div className="wf-soft p-6 space-y-5">
            <h2 className="text-lg font-medium text-white/80">
              Governance Configuration
            </h2>
            <Input
              label="Approval Threshold (amount)"
              type="number"
              value={govApprovalThreshold}
              onChange={(e) => setGovApprovalThreshold(e.target.value)}
              placeholder="Leave empty for no threshold"
            />
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-white/70">
                  Auto-approve read actions
                </div>
                <div className="text-xs text-white/35">
                  Allow read operations without policy checks
                </div>
              </div>
              <button
                onClick={() => setGovAutoApproveReads(!govAutoApproveReads)}
                className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors ${
                  govAutoApproveReads ? "bg-purple-500" : "bg-white/10"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                    govAutoApproveReads
                      ? "translate-x-5"
                      : "translate-x-1"
                  }`}
                />
              </button>
            </div>
            <Input
              label="Max Pending Proposals"
              type="number"
              value={govMaxPending}
              onChange={(e) => setGovMaxPending(e.target.value)}
            />
            <Input
              label="Approval Expiry (hours)"
              type="number"
              value={govExpiryHours}
              onChange={(e) => setGovExpiryHours(e.target.value)}
            />
            <div className="flex gap-3 pt-2">
              <Button
                variant="primary"
                onClick={handleSaveGovernance}
                disabled={govSaving}
              >
                {govSaving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        )}

        {/* Connections Tab — Read-only overview */}
        {activeTab === "connections" && (
          <div className="space-y-5">
            <div className="wf-soft p-6 space-y-4">
              <h2 className="text-lg font-medium text-white/80">
                Connected Sources
              </h2>
              <p className="text-sm text-white/40">
                Connectors are managed from within departments. This page shows a global overview of all connected data sources.
              </p>

              {connectors.length === 0 && (
                <p className="text-sm text-white/25">
                  No connectors configured yet. Connect data sources from a department&apos;s Connected Data section.
                </p>
              )}

              {connectors.map((c) => {
                const bindings = connectorBindings[c.id] || [];
                return (
                  <div
                    key={c.id}
                    className="py-3 border-b border-white/[0.06] last:border-0 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-white/80">
                            {c.name || c.providerName}
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
                    </div>
                    {/* Department bindings */}
                    {bindings.length > 0 ? (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {bindings.map((b) => (
                          <a
                            key={b.id}
                            href={`/map/${b.departmentId}`}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.04] hover:bg-white/[0.08] transition text-xs"
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${b.enabled ? "bg-emerald-400" : "bg-white/20"}`} />
                            <span className="text-white/60">{b.departmentName}</span>
                            <svg className="w-3 h-3 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                            </svg>
                          </a>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-white/25 pt-1">Not bound to any department</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Autonomy Tab */}
        {activeTab === "autonomy" && (
          <div className="space-y-5">
            <div className="wf-soft p-6 space-y-5">
              <h2 className="text-lg font-medium text-white/80">
                Global Graduation Thresholds
              </h2>
              {autoLoading ? (
                <div className="flex justify-center py-4">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-purple-400" />
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    <p className="text-xs text-white/40 uppercase tracking-wider font-semibold">Supervised → Notify</p>
                    <Input
                      label="Consecutive approvals required"
                      type="number"
                      value={autoSupervisedConsecutive}
                      onChange={(e) => setAutoSupervisedConsecutive(e.target.value)}
                    />
                    <Input
                      label="Minimum approval rate (%)"
                      type="number"
                      value={autoSupervisedRate}
                      onChange={(e) => setAutoSupervisedRate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-3 pt-2">
                    <p className="text-xs text-white/40 uppercase tracking-wider font-semibold">Notify → Autonomous</p>
                    <Input
                      label="Consecutive approvals required"
                      type="number"
                      value={autoNotifyConsecutive}
                      onChange={(e) => setAutoNotifyConsecutive(e.target.value)}
                    />
                    <Input
                      label="Minimum approval rate (%)"
                      type="number"
                      value={autoNotifyRate}
                      onChange={(e) => setAutoNotifyRate(e.target.value)}
                    />
                  </div>
                  <div className="pt-2">
                    <Button variant="primary" onClick={handleSaveAutonomy} disabled={autoSaving}>
                      {autoSaving ? "Saving..." : "Save"}
                    </Button>
                  </div>
                </>
              )}
            </div>

            <div className="wf-soft p-6 space-y-4">
              <h2 className="text-lg font-medium text-white/80">
                Situation Type Autonomy Levels
              </h2>
              {situationTypes.length === 0 && !autoLoading && (
                <p className="text-sm text-white/35">No situation types configured yet.</p>
              )}
              {situationTypes.map((st) => {
                const levelColor = st.autonomyLevel === "autonomous"
                  ? "bg-emerald-500/15 text-emerald-400"
                  : st.autonomyLevel === "notify"
                    ? "bg-amber-500/15 text-amber-400"
                    : "bg-white/10 text-white/50";
                return (
                  <div key={st.id} className="py-3 border-b border-white/[0.06] last:border-0">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white/80">{st.name}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${levelColor}`}>
                          {st.autonomyLevel}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        {st.autonomyLevel !== "autonomous" && (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handlePromote(st.id)}
                            disabled={promotingId !== null}
                          >
                            {promotingId === st.id ? "..." : "Promote"}
                          </Button>
                        )}
                        {st.autonomyLevel !== "supervised" && (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleDemote(st.id)}
                            disabled={demotingId !== null}
                          >
                            {demotingId === st.id ? "..." : "Demote"}
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-4 text-xs text-white/40">
                      <span>Consecutive: <span className="text-white/60">{st.consecutiveApprovals}</span></span>
                      <span>Approved: <span className="text-white/60">{st.totalApproved}/{st.totalProposed}</span></span>
                      <span>Rate: <span className="text-white/60">{(st.approvalRate * 100).toFixed(0)}%</span></span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Data Management Tab */}
        {activeTab === "data" && (
          <div className="wf-soft p-6 space-y-5">
            <h2 className="text-lg font-medium text-white/80">
              Data Management
            </h2>

            <div className="space-y-4">
              {/* Reset Database */}
              <div className="flex items-center justify-between py-3 border-b border-white/[0.06]">
                <div>
                  <div className="text-sm text-white/70">Reset Database</div>
                  <div className="text-xs text-white/35">
                    Delete all entities, types, and relationships. This cannot be
                    undone.
                  </div>
                </div>
                {!confirmReset ? (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setConfirmReset(true)}
                    disabled={dataAction !== null}
                  >
                    Reset
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmReset(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={async () => {
                        setDataAction("resetting");
                        try {
                          await fetch("/api/data/reset", { method: "POST" });
                          toast("Database reset complete", "success");
                        } catch {
                          toast("Reset failed", "error");
                        } finally {
                          setDataAction(null);
                          setConfirmReset(false);
                        }
                      }}
                      disabled={dataAction !== null}
                    >
                      {dataAction === "resetting"
                        ? "Resetting..."
                        : "Confirm Reset"}
                    </Button>
                  </div>
                )}
              </div>

              {/* Re-seed Demo Data */}
              <div className="flex items-center justify-between py-3 border-b border-white/[0.06]">
                <div>
                  <div className="text-sm text-white/70">
                    Re-seed Demo Data
                  </div>
                  <div className="text-xs text-white/35">
                    Populate the database with sample entities and relationships.
                  </div>
                </div>
                <Button
                  variant="default"
                  size="sm"
                  onClick={async () => {
                    setDataAction("seeding");
                    try {
                      await fetch("/api/data/seed", { method: "POST" });
                      toast("Demo data seeded", "success");
                    } catch {
                      toast("Seeding failed", "error");
                    } finally {
                      setDataAction(null);
                    }
                  }}
                  disabled={dataAction !== null}
                >
                  {dataAction === "seeding" ? "Seeding..." : "Seed Data"}
                </Button>
              </div>

              {/* Export Database */}
              <div className="flex items-center justify-between py-3">
                <div>
                  <div className="text-sm text-white/70">Export Database</div>
                  <div className="text-xs text-white/35">
                    Download all data as a JSON file.
                  </div>
                </div>
                <Button
                  variant="default"
                  size="sm"
                  onClick={async () => {
                    setDataAction("exporting");
                    try {
                      const res = await fetch("/api/data/export");
                      if (!res.ok) throw new Error();
                      const blob = await res.blob();
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "qorpera-export.json";
                      a.click();
                      URL.revokeObjectURL(url);
                      toast("Export downloaded", "success");
                    } catch {
                      toast("Export failed", "error");
                    } finally {
                      setDataAction(null);
                    }
                  }}
                  disabled={dataAction !== null}
                >
                  {dataAction === "exporting" ? "Exporting..." : "Export"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
