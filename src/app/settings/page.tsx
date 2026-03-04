"use client";

import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";

type Tab = "ai" | "governance" | "data";

const PROVIDER_OPTIONS = [
  { value: "ollama", label: "Ollama (Local)" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
];

export default function SettingsPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>("ai");

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

  // Data state
  const [dataAction, setDataAction] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  // Load settings
  useEffect(() => {
    // Load governance config
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

  // Save AI settings
  const handleSaveAi = async () => {
    setAiSaving(true);
    try {
      // Save settings via individual PUT calls or a settings endpoint
      // For now, we'll store them via a simple approach
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

  // Test AI connection
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
        "error",
      );
    } finally {
      setAiTesting(false);
    }
  };

  // Save governance settings
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

  const tabs: { key: Tab; label: string }[] = [
    { key: "ai", label: "AI Provider" },
    { key: "governance", label: "Governance" },
    { key: "data", label: "Data Management" },
  ];

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
