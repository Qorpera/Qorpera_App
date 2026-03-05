"use client";

import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { useSearchParams } from "next/navigation";

type Tab = "ai" | "governance" | "connections" | "data";

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

export default function SettingsPage() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const googleParam = searchParams.get("google");

  const [activeTab, setActiveTab] = useState<Tab>(
    tabParam === "connections" ? "connections" : "ai"
  );

  // AI state
  const [aiProvider, setAiProvider] = useState("ollama");
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiBaseUrl, setAiBaseUrl] = useState("http://localhost:11434");
  const [aiModel, setAiModel] = useState("");
  const [aiSaving, setAiSaving] = useState(false);
  const [aiTesting, setAiTesting] = useState(false);

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

  // Data state
  const [dataAction, setDataAction] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

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
      .then((data) => setConnectors(data.connectors || []))
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

  // Set pending config for pending connectors
  useEffect(() => {
    const pending = connectors.find((c) => c.status === "pending");
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
      if (aiProvider === "ollama") {
        payload.ollama_base_url = aiBaseUrl;
        if (aiModel) payload.ollama_model = aiModel;
      } else if (aiProvider === "openai") {
        if (aiApiKey) payload.openai_api_key = aiApiKey;
        if (aiModel) payload.openai_model = aiModel;
      } else if (aiProvider === "anthropic") {
        if (aiApiKey) payload.anthropic_api_key = aiApiKey;
        if (aiModel) payload.anthropic_model = aiModel;
      }
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      toast("AI settings saved", "success");
    } catch {
      toast("Failed to save AI settings", "error");
    } finally {
      setAiSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setAiTesting(true);
    try {
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Hello, respond with OK" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast("Connection successful", "success");
    } catch (err) {
      toast(
        `Connection failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        "error"
      );
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

  const tabs: { key: Tab; label: string }[] = [
    { key: "ai", label: "AI Provider" },
    { key: "governance", label: "Governance" },
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
              onChange={(e) => setAiProvider(e.target.value)}
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
            <Input
              label="Model Name"
              value={aiModel}
              onChange={(e) => setAiModel(e.target.value)}
              placeholder={
                aiProvider === "openai"
                  ? "gpt-4o"
                  : aiProvider === "anthropic"
                    ? "claude-sonnet-4-20250514"
                    : "llama3.2"
              }
            />
            <div className="flex gap-3 pt-2">
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
            </div>
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

        {/* Connections Tab */}
        {activeTab === "connections" && (
          <div className="space-y-5">
            {/* Connected sources */}
            <div className="wf-soft p-6 space-y-4">
              <h2 className="text-lg font-medium text-white/80">
                Connected Sources
              </h2>

              {connectors.length === 0 && (
                <p className="text-sm text-white/35">
                  No connectors configured. Add one below.
                </p>
              )}

              {connectors.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between py-3 border-b border-white/[0.06] last:border-0"
                >
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
                  <div className="flex gap-2">
                    {c.status === "active" && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleSync(c.id)}
                        disabled={syncingId !== null}
                      >
                        {syncingId === c.id ? "Syncing..." : "Sync Now"}
                      </Button>
                    )}
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleRemoveConnector(c.id)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}

              {/* Sync result flash */}
              {syncResult && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-3 text-sm text-emerald-300">
                  Synced {syncResult.eventsCreated} events in{" "}
                  {(syncResult.durationMs / 1000).toFixed(1)}s. Processing...
                  {syncResult.errors.length > 0 && (
                    <div className="text-red-400 mt-1">
                      Errors: {syncResult.errors.join(", ")}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Pending connector config */}
            {pendingConfig && (
              <div className="wf-soft p-6 space-y-4">
                <h2 className="text-lg font-medium text-white/80">
                  Configure Google Sheets Connection
                </h2>
                <p className="text-sm text-white/50">
                  Google account connected. Enter your spreadsheet details to finish setup.
                </p>
                <Input
                  label="Connector Name"
                  value={pendingConfig.name}
                  onChange={(e) =>
                    setPendingConfig((prev) =>
                      prev ? { ...prev, name: e.target.value } : null
                    )
                  }
                  placeholder="e.g. Sales Pipeline Sheet"
                />
                <Input
                  label="Spreadsheet ID or URL"
                  value={pendingConfig.spreadsheet_id}
                  onChange={(e) =>
                    setPendingConfig((prev) =>
                      prev
                        ? { ...prev, spreadsheet_id: e.target.value }
                        : null
                    )
                  }
                  placeholder="Paste the Google Sheets URL or spreadsheet ID"
                />
                <div className="flex gap-3 pt-2">
                  <Button
                    variant="primary"
                    onClick={handleSavePending}
                    disabled={
                      savingPending || !pendingConfig.spreadsheet_id.trim()
                    }
                  >
                    {savingPending ? "Saving..." : "Save & Connect"}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      handleRemoveConnector(pendingConfig.id);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Add connector */}
            <div className="wf-soft p-6 space-y-4">
              <h2 className="text-lg font-medium text-white/80">
                Add Connector
              </h2>
              <div className="grid gap-3">
                {providers.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between py-3 border-b border-white/[0.06] last:border-0"
                  >
                    <div>
                      <div className="text-sm font-medium text-white/70">
                        {p.name}
                      </div>
                      {!p.configured && (
                        <div className="text-xs text-amber-400/70">
                          Not configured — add GOOGLE_CLIENT_ID to your
                          environment
                        </div>
                      )}
                    </div>
                    {p.configured ? (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={
                          p.id === "google-sheets"
                            ? handleConnectGoogle
                            : undefined
                        }
                      >
                        Connect
                      </Button>
                    ) : (
                      <span className="text-xs text-white/25">
                        Unavailable
                      </span>
                    )}
                  </div>
                ))}
              </div>
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
