"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { useSearchParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { useUser } from "@/components/user-provider";
import { formatRelativeTime } from "@/lib/format-helpers";
import { NotificationPreferences } from "@/components/settings/notification-preferences";
import { ConnectorLogo } from "@/components/connector-logo";
import { ConnectorConfigModal, type ConfigField } from "@/components/connector-config-modal";
import { Modal } from "@/components/ui/modal";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

type Tab = "ai" | "connections" | "team" | "merges" | "governance" | "notifications" | "billing" | "usage" | "limits";

type ConnectorItem = {
  id: string;
  provider: string;
  providerName: string;
  name: string;
  status: string;
  lastSyncAt: string | null;
  spreadsheetCount?: number;
  healthStatus?: string;
  consecutiveFailures?: number;
  lastError?: string | null;
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
  description: string;
  category: string;
  scopes: string[];
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
    { value: "claude-opus-4-6", label: "Claude Opus 4.6 (Most capable)" },
    { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (Balanced)" },
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
  const t = useTranslations("settings");
  const locale = useLocale();
  const { toast } = useToast();
  const { isAdmin, isSuperadmin } = useUser();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const googleParam = searchParams.get("google");
  const hubspotParam = searchParams.get("hubspot");
  const stripeParam = searchParams.get("stripe");
  const reconnectedParam = searchParams.get("reconnected");

  const [activeTab, setActiveTab] = useState<Tab>(
    tabParam === "connections" ? "connections" : tabParam === "team" ? "team" : tabParam === "merges" ? "merges" : tabParam === "governance" ? "governance" : tabParam === "billing" ? "billing" : tabParam === "usage" ? "usage" : tabParam === "limits" ? "limits" : "connections"
  );

  // AI state
  type FnConfig = { provider: string; apiKey: string; model: string };
  type TestResult = { ok: boolean; provider?: string; model?: string; baseUrl?: string; response?: string; error?: string };
  const AI_FUNCTIONS = ["reasoning", "copilot", "embedding", "orientation"] as const;
  type AIFn = typeof AI_FUNCTIONS[number];
  const AI_FN_LABELS: Record<AIFn, { label: string; desc: string }> = {
    reasoning: { label: "Reasoning", desc: "Situation detection, analysis, and pre-filtering" },
    copilot: { label: "Chat", desc: "Interactive chat assistant" },
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

  // Slack channel mapping
  type ChannelMapping = { id: string; channelId: string; channelName: string; domainId: string; department: { id: string; displayName: string } };
  type SlackChannel = { id: string; name: string; is_private: boolean };
  const [slackMappingExpanded, setSlackMappingExpanded] = useState<string | null>(null);
  const [slackMappings, setSlackMappings] = useState<Record<string, ChannelMapping[]>>({});
  const [slackChannels, setSlackChannels] = useState<Record<string, SlackChannel[]>>({});
  const [addingMapping, setAddingMapping] = useState<{ connectorId: string; channelId: string; channelName: string; domainId: string } | null>(null);

  // Team state
  type TeamUser = { id: string; name: string; email: string; role: string; entityId: string | null; entityName: string | null; domainName: string | null; lastActive: string | null; createdAt: string };
  type TeamInvite = { id: string; email: string; role: string; entityName: string; domainName: string | null; link: string; expiresAt: string; createdAt: string };
  type TeamDept = { id: string; displayName: string };
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [teamInvites, setTeamInvites] = useState<TeamInvite[]>([]);
  const [teamDomains, setTeamDomains] = useState<TeamDept[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  // Invite link state
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteCreatedAt, setInviteCreatedAt] = useState<string | null>(null);
  const [inviteLinkLoading, setInviteLinkLoading] = useState(false);
  const [inviteLinkSaving, setInviteLinkSaving] = useState(false);

  // Deletion state
  const [deleteStep, setDeleteStep] = useState(0); // 0=hidden, 1=first confirm, 2=type confirm
  const [deleteTyped, setDeleteTyped] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteResult, setDeleteResult] = useState<{ success: boolean; scheduledFor?: string } | null>(null);
  const [operatorInfo, setOperatorInfo] = useState<{ id: string; displayName: string; deletionRequestedAt: string | null; deletionScheduledFor: string | null } | null>(null);
  const [cancellingDeletion, setCancellingDeletion] = useState(false);

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
  const [govApprovalThreshold, setGovApprovalThreshold] = useState("");
  const [govAutoApproveReads, setGovAutoApproveReads] = useState(true);
  const [govMaxPending, setGovMaxPending] = useState("50");
  const [govExpiryHours, setGovExpiryHours] = useState("72");
  const [govSettingsSaving, setGovSettingsSaving] = useState(false);

  // Emergency stop state
  type EmergencyStopState = { paused: boolean; pausedAt?: string; pausedBy?: { name: string; email: string }; reason?: string };
  const [emergencyStop, setEmergencyStop] = useState<EmergencyStopState>({ paused: false });
  const [emergencyStopLoading, setEmergencyStopLoading] = useState(true);
  const [emergencyStopConfirm, setEmergencyStopConfirm] = useState(false);
  const [emergencyStopReason, setEmergencyStopReason] = useState("");
  const [emergencyStopSaving, setEmergencyStopSaving] = useState(false);

  // Load invite link
  const loadInviteLink = useCallback(async () => {
    setInviteLinkLoading(true);
    try {
      const res = await fetch("/api/operator/invite-link");
      const data = await res.json();
      setInviteUrl(data.inviteUrl ?? null);
      setInviteCreatedAt(data.createdAt ?? null);
    } catch {}
    setInviteLinkLoading(false);
  }, []);

  // Load team data
  const loadTeamData = useCallback(async () => {
    setTeamLoading(true);
    try {
      const [usersRes, invitesRes, domainRes] = await Promise.all([
        fetch("/api/users").then((r) => r.json()),
        fetch("/api/users/invite").then((r) => r.json()),
        fetch("/api/domains").then((r) => r.json()),
      ]);
      setTeamUsers(Array.isArray(usersRes) ? usersRes : []);
      setTeamInvites(Array.isArray(invitesRes) ? invitesRes : []);
      setTeamDomains(Array.isArray(domainRes) ? domainRes : []);
    } catch {}
    setTeamLoading(false);
    loadInviteLink();
  }, [loadInviteLink]);

  useEffect(() => {
    if (activeTab === "team") loadTeamData();
  }, [activeTab, loadTeamData]);

  // Load emergency stop state on mount
  useEffect(() => {
    fetch("/api/settings/emergency-stop")
      .then((r) => r.json())
      .then((data) => setEmergencyStop(data))
      .catch(() => {})
      .finally(() => setEmergencyStopLoading(false));
  }, []);

  const toggleEmergencyStop = async (paused: boolean) => {
    setEmergencyStopSaving(true);
    try {
      const res = await fetch("/api/settings/emergency-stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused, reason: paused ? emergencyStopReason : undefined }),
      });
      if (res.ok) {
        const data = await res.json();
        setEmergencyStop(data);
        setEmergencyStopConfirm(false);
        setEmergencyStopReason("");
        toast(paused ? "AI activity paused" : "AI activity resumed", paused ? "info" : "success");
      } else {
        const err = await res.json().catch(() => null);
        toast(err?.error || "Failed to update", "error");
      }
    } catch {
      toast("Network error", "error");
    }
    setEmergencyStopSaving(false);
  };

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

  useEffect(() => {
    if (reconnectedParam === "true") {
      toast(t("connections.reconnected"), "success");
      loadConnectors();
    }
  }, [reconnectedParam]);

  // Load operator info for danger zone
  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/operator").then(r => r.json()).then(data => {
      if (data.id) setOperatorInfo(data);
    }).catch(() => {});
  }, [isAdmin]);

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
    { key: "connections", label: t("tabs.connections"), adminOnly: true },
    { key: "billing", label: t("tabs.billing"), adminOnly: true },
    { key: "usage", label: "Usage", adminOnly: true },
    { key: "limits", label: "Limits", adminOnly: true },
    { key: "merges", label: t("tabs.merges"), adminOnly: true },
  ];
  const tabs = allTabs.filter((t) => !t.adminOnly || isAdmin);

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      active: "bg-[color-mix(in_srgb,var(--ok)_12%,transparent)] text-ok",
      pending: "bg-[color-mix(in_srgb,var(--warn)_12%,transparent)] text-warn",
      error: "bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] text-danger",
      paused: "bg-hover text-[var(--fg2)]",
      disconnected: "bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] text-danger",
    };
    return (
      <span
        className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${colors[status] || "bg-hover text-[var(--fg2)]"}`}
      >
        {status}
      </span>
    );
  };

  return (
    <AppShell>
      <div>
        {/* Header + Tab bar — sticky */}
        <div>
          <div className="px-6 pt-6 pb-3 max-w-3xl mx-auto">
            <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
          </div>
          <div className="px-6 pb-4 max-w-3xl mx-auto">
            <div className="flex gap-1 bg-hover rounded-lg p-1 w-fit max-w-full overflow-x-auto whitespace-nowrap scrollbar-hide snap-x snap-mandatory">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition snap-start ${
                    activeTab === tab.key
                      ? "bg-accent-light text-accent"
                      : "text-[var(--fg2)] hover:text-[var(--fg2)]"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Tab content */}
        <div className="px-6 pb-6">
          <div className="max-w-3xl mx-auto space-y-6">

        {/* Emergency AI Pause */}
        {!emergencyStopLoading && (
          <>
            {emergencyStop.paused ? (
              <div className="rounded-lg border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger)_5%,transparent)] p-5 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-4 h-4 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-danger">AI Activity Paused</h3>
                    <p className="text-xs text-[var(--fg2)] mt-1">
                      Paused {emergencyStop.pausedAt ? new Date(emergencyStop.pausedAt).toLocaleString() : ""}{emergencyStop.pausedBy ? ` by ${emergencyStop.pausedBy.name}` : ""}
                      {emergencyStop.reason ? `. Reason: ${emergencyStop.reason}` : ""}
                    </p>
                  </div>
                  {isAdmin && (
                    emergencyStopConfirm ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setEmergencyStopConfirm(false)}
                          className="px-3 py-1.5 text-xs text-[var(--fg2)] hover:text-[var(--fg2)] transition"
                        >
                          Cancel
                        </button>
                        <button
                          disabled={emergencyStopSaving}
                          onClick={() => toggleEmergencyStop(false)}
                          className="px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded-md transition disabled:opacity-50"
                        >
                          {emergencyStopSaving ? "Resuming..." : "Confirm Resume"}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setEmergencyStopConfirm(true)}
                        className="px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded-md transition"
                      >
                        Resume AI Activity
                      </button>
                    )
                  )}
                </div>
              </div>
            ) : isAdmin ? (
              <div className="rounded-lg border border-border bg-hover p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-[var(--fg2)]">Emergency AI Pause</h3>
                    <p className="text-xs text-[var(--fg2)] mt-0.5">Immediately stop all AI detection, reasoning, and autonomous actions.</p>
                  </div>
                  {emergencyStopConfirm ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        placeholder="Reason (optional)"
                        value={emergencyStopReason}
                        onChange={(e) => setEmergencyStopReason(e.target.value)}
                        className="w-56 px-3 py-1.5 text-xs bg-hover border border-border rounded-md text-foreground placeholder:text-[var(--fg3)]"
                      />
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => { setEmergencyStopConfirm(false); setEmergencyStopReason(""); }}
                          className="px-3 py-1.5 text-xs text-[var(--fg2)] hover:text-[var(--fg2)] transition"
                        >
                          Cancel
                        </button>
                        <button
                          disabled={emergencyStopSaving}
                          onClick={() => toggleEmergencyStop(true)}
                          className="px-3 py-1.5 text-xs bg-red-600 hover:bg-red-500 text-white rounded-md transition disabled:opacity-50"
                        >
                          {emergencyStopSaving ? "Pausing..." : "Confirm Pause"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setEmergencyStopConfirm(true)}
                      className="px-3 py-1.5 text-xs border border-[color-mix(in_srgb,var(--danger)_30%,transparent)] text-danger hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] rounded-md transition flex items-center gap-1.5"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" /></svg>
                      Pause All AI Activity
                    </button>
                  )}
                </div>
              </div>
            ) : null}
          </>
        )}

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
              <div className={`rounded-lg p-3 text-sm space-y-1 ${result.ok ? "bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] border border-[color-mix(in_srgb,var(--ok)_20%,transparent)]" : "bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border border-[color-mix(in_srgb,var(--danger)_20%,transparent)]"}`}>
                {result.ok ? (
                  <>
                    <div className="flex items-center gap-2 text-ok font-medium text-xs">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                      Connected — {result.provider} / {result.model}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2 text-danger font-medium text-xs">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      Failed
                    </div>
                    <div className="text-danger/70 text-[11px]">{result.error}</div>
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
                  <h3 className="text-sm font-medium text-foreground">{meta.label}</h3>
                  <p className="text-xs text-[var(--fg3)] mt-0.5">{meta.desc}</p>
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
                <h2 className="text-lg font-medium text-foreground">AI Configuration</h2>
                {aiSaved && <span className="text-xs text-ok">Saved</span>}
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
                  className={`relative w-9 h-5 rounded-full transition ${sameForAll ? "bg-accent" : "bg-hover"}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${sameForAll ? "translate-x-4" : ""}`} />
                </button>
                <span className="text-sm text-[var(--fg2)]">Use same provider for all functions</span>
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
                    <p className="text-[11px] text-[var(--fg3)]">
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

        {/* Billing Tab */}
        {activeTab === "billing" && <BillingTab />}

        {/* Usage Tab */}
        {activeTab === "usage" && <UsageTab />}

        {/* Limits Tab */}
        {activeTab === "limits" && <LimitsTab />}

        {/* Notifications Tab */}
        {activeTab === "notifications" && (
          <NotificationPreferences />
        )}

        {/* Connections Tab — Two-section layout */}
        {activeTab === "connections" && (
          <ConnectionsTab
            connectors={connectors}
            providers={providers}
            loadConnectors={loadConnectors}
            syncingAll={syncingAll}
            setSyncingAll={setSyncingAll}
            syncAllResult={syncAllResult}
            setSyncAllResult={setSyncAllResult}
            expandedConnector={expandedConnector}
            setExpandedConnector={setExpandedConnector}
            sheetsByConnector={sheetsByConnector}
            setSheetsByConnector={setSheetsByConnector}
            savingSheets={savingSheets}
            setSavingSheets={setSavingSheets}
            manualSheetUrl={manualSheetUrl}
            setManualSheetUrl={setManualSheetUrl}
            slackMappingExpanded={slackMappingExpanded}
            setSlackMappingExpanded={setSlackMappingExpanded}
            slackMappings={slackMappings}
            setSlackMappings={setSlackMappings}
            slackChannels={slackChannels}
            setSlackChannels={setSlackChannels}
            addingMapping={addingMapping}
            setAddingMapping={setAddingMapping}
            teamDomains={teamDomains}
            setTeamDomains={setTeamDomains}
          />
        )}

        {/* Team Tab */}
        {activeTab === "team" && (() => {
          return (
          <div className="space-y-6">

            {/* Invite Link */}
            {(isAdmin || isSuperadmin) && (
              <div className="wf-soft p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-medium text-foreground">Invite Link</h2>
                    <p className="text-xs text-[var(--fg3)] mt-0.5">Share this link to let anyone join your organisation as a member.</p>
                  </div>
                </div>

                {inviteLinkLoading ? (
                  <p className="text-sm text-[var(--fg3)]">Loading...</p>
                ) : inviteUrl ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={inviteUrl}
                        className="flex-1 px-3 py-2 rounded-md bg-hover border border-border text-sm text-foreground font-mono select-all"
                        onClick={(e) => (e.target as HTMLInputElement).select()}
                      />
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(inviteUrl);
                          toast("Link copied to clipboard", "success");
                        }}
                      >
                        Copy
                      </Button>
                    </div>
                    {inviteCreatedAt && (
                      <p className="text-xs text-[var(--fg3)]">
                        Created {formatRelativeTime(inviteCreatedAt)}
                      </p>
                    )}
                    <div className="flex items-center gap-2">
                      <Button
                        variant="default"
                        size="sm"
                        disabled={inviteLinkSaving}
                        onClick={async () => {
                          if (!window.confirm("This will invalidate the current invite link. Anyone with the old link will no longer be able to join. Continue?")) return;
                          setInviteLinkSaving(true);
                          try {
                            const res = await fetch("/api/operator/invite-link", { method: "POST" });
                            const data = await res.json();
                            if (res.ok) {
                              setInviteUrl(data.inviteUrl);
                              setInviteCreatedAt(data.createdAt);
                              toast("Invite link regenerated", "success");
                            } else {
                              toast(data.error || "Failed to regenerate link", "error");
                            }
                          } catch { toast("Failed to regenerate link", "error"); }
                          setInviteLinkSaving(false);
                        }}
                      >
                        {inviteLinkSaving ? "..." : "Regenerate Link"}
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={inviteLinkSaving}
                        onClick={async () => {
                          if (!window.confirm("Revoke the invite link? Anyone with this link will no longer be able to join.")) return;
                          setInviteLinkSaving(true);
                          try {
                            const res = await fetch("/api/operator/invite-link", { method: "DELETE" });
                            if (res.ok) {
                              setInviteUrl(null);
                              setInviteCreatedAt(null);
                              toast("Invite link revoked", "success");
                            } else {
                              const data = await res.json();
                              toast(data.error || "Failed to revoke link", "error");
                            }
                          } catch { toast("Failed to revoke link", "error"); }
                          setInviteLinkSaving(false);
                        }}
                      >
                        Revoke
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={inviteLinkSaving}
                    onClick={async () => {
                      setInviteLinkSaving(true);
                      try {
                        const res = await fetch("/api/operator/invite-link", { method: "POST" });
                        const data = await res.json();
                        if (res.ok) {
                          setInviteUrl(data.inviteUrl);
                          setInviteCreatedAt(data.createdAt);
                          toast("Invite link created", "success");
                        } else {
                          toast(data.error || "Failed to create link", "error");
                        }
                      } catch { toast("Failed to create link", "error"); }
                      setInviteLinkSaving(false);
                    }}
                  >
                    {inviteLinkSaving ? "..." : "Generate Invite Link"}
                  </Button>
                )}
              </div>
            )}

            {/* Active Users */}
            <div className="wf-soft p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium text-foreground">{t("team.title")}</h2>
              </div>

              {teamLoading ? (
                <p className="text-sm text-[var(--fg3)]">Loading...</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[var(--fg2)] border-b border-border">
                        <th className="pb-2 font-medium">Name</th>
                        <th className="pb-2 font-medium">Email</th>
                        <th className="pb-2 font-medium">Role</th>
                        <th className="pb-2 font-medium">Home Dept</th>
                        <th className="pb-2 font-medium">Last Active</th>
                        <th className="pb-2 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teamUsers.map((u) => {
                        const isEditing = editingUserId === u.id;

                        return (
                          <tr key={u.id} className="border-b border-border align-top">
                            <td className="py-2.5 text-[var(--fg2)]">
                              {u.name}
                              {u.entityId && (
                                <span className="ml-1.5 text-[10px] text-accent" title="Linked to entity">&#9679;</span>
                              )}
                            </td>
                            <td className="py-2.5 text-[var(--fg2)]">{u.email}</td>
                            <td className="py-2.5">
                              {isEditing ? (
                                <select
                                  className="bg-hover border border-border rounded px-2 py-1 text-xs text-[var(--fg2)]"
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
                                    u.role === "admin" ? "bg-accent-light text-accent" : "bg-hover text-[var(--fg2)]"
                                  } cursor-pointer`}
                                  onClick={() => setEditingUserId(u.id)}
                                  title="Click to edit role"
                                >
                                  {u.role}
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 text-xs">
                              {u.domainName ? (
                                <span className="text-[var(--fg2)]">{u.domainName}</span>
                              ) : u.role === "admin" ? (
                                <span className="text-[var(--fg2)]">All</span>
                              ) : (
                                <span className="text-[var(--fg3)]">&mdash;</span>
                              )}
                            </td>
                            <td className="py-2.5 text-[var(--fg2)] text-xs">
                              {u.lastActive
                                ? new Date(u.lastActive).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                                : "—"}
                            </td>
                            <td className="py-2.5">
                              {!isEditing && (
                                <button
                                  className="text-xs text-accent hover:text-accent"
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
              <h2 className="text-lg font-medium text-foreground">Pending Invites</h2>
              {teamInvites.length === 0 ? (
                <p className="text-sm text-[var(--fg3)]">No pending invites</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[var(--fg2)] border-b border-border">
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
                        <tr key={inv.id} className="border-b border-border">
                          <td className="py-2.5 text-[var(--fg2)]">{inv.entityName}</td>
                          <td className="py-2.5 text-[var(--fg2)]">{inv.email}</td>
                          <td className="py-2.5 text-[var(--fg2)] capitalize">{inv.role}</td>
                          <td className="py-2.5 text-[var(--fg2)]">{inv.domainName || "—"}</td>
                          <td className="py-2.5">
                            <button
                              className="text-xs text-accent hover:text-accent"
                              onClick={() => {
                                navigator.clipboard.writeText(inv.link);
                                toast("Link copied", "success");
                              }}
                            >
                              Copy Link
                            </button>
                          </td>
                          <td className="py-2.5 text-[var(--fg2)] text-xs">
                            in {Math.max(0, Math.ceil((new Date(inv.expiresAt).getTime() - Date.now()) / 86400000))} days
                          </td>
                          <td className="py-2.5">
                            <button
                              className="text-xs text-danger hover:text-danger"
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
          );
        })()}

        {/* Entity Merges Tab */}
        {activeTab === "merges" && (
          <div className="space-y-6">
            {/* Section 1: Auto-Merge Log */}
            <div className="wf-soft p-6 space-y-4">
              <h2 className="text-lg font-medium text-foreground">Auto-Merge Log</h2>
              {mergeLoading ? (
                <p className="text-sm text-[var(--fg3)]">Loading...</p>
              ) : mergeLog.length === 0 ? (
                <p className="text-sm text-[var(--fg3)]">No merges recorded yet.</p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-[var(--fg2)] border-b border-border">
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
                            auto_identity: { label: "Email Match", cls: "bg-blue-500/15 text-info" },
                            ml_high_confidence: { label: "ML Auto", cls: "bg-[color-mix(in_srgb,var(--warn)_12%,transparent)] text-warn" },
                            admin_manual: { label: "Manual", cls: "bg-[color-mix(in_srgb,var(--ok)_12%,transparent)] text-ok" },
                          };
                          const badge = typeBadge[entry.mergeType] || { label: entry.mergeType, cls: "bg-hover text-[var(--fg2)]" };

                          return (
                            <tr key={entry.id} className="border-b border-border align-top">
                              <td className="py-2.5 text-[var(--fg2)] text-xs">
                                {formatMergeDate(entry.createdAt)}
                              </td>
                              <td className="py-2.5 text-[var(--fg2)]">{entry.survivor.displayName}</td>
                              <td className="py-2.5 text-[var(--fg2)]">
                                {entry.absorbed.displayName}
                                {entry.absorbed.status === "merged" && (
                                  <span className="ml-1 text-[10px] text-[var(--fg3)]">(merged)</span>
                                )}
                              </td>
                              <td className="py-2.5">
                                <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${badge.cls}`}>
                                  {badge.label}
                                </span>
                              </td>
                              <td className="py-2.5 text-[var(--fg2)] text-xs">
                                {entry.confidence != null ? `${Math.round(entry.confidence * 100)}%` : "—"}
                              </td>
                              <td className="py-2.5">
                                {entry.reversedAt ? (
                                  <span className="text-xs text-[var(--fg3)]">Reversed</span>
                                ) : (
                                  <button
                                    className="text-xs text-danger hover:text-danger disabled:opacity-50"
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
                      className="text-xs text-accent hover:text-accent"
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
              <h2 className="text-lg font-medium text-foreground">Pending Suggestions</h2>
              {mergeLoading ? (
                <p className="text-sm text-[var(--fg3)]">Loading...</p>
              ) : mergeSuggestions.length === 0 ? (
                <div className="flex items-center gap-3 py-4">
                  <svg className="w-5 h-5 text-ok" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <p className="text-sm text-[var(--fg2)]">No pending merge suggestions — all entities are resolved.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {mergeSuggestions.map((s) => {
                    const aProps = s.entityA.properties || {};
                    const bProps = s.entityB.properties || {};
                    const allKeys = Array.from(new Set([...Object.keys(aProps), ...Object.keys(bProps)]));
                    const signals = Array.isArray(s.signals) ? s.signals : [];
                    const confPct = s.confidence != null ? Math.round(s.confidence * 100) : null;
                    const confColor = confPct != null && confPct > 70 ? "text-ok" : "text-warn";

                    return (
                      <div key={s.id} className="bg-hover rounded-lg p-5 border border-border space-y-4">
                        <div className="grid grid-cols-2 gap-6">
                          {/* Entity A */}
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-medium text-foreground">{s.entityA.displayName}</h4>
                              {s.entityA.entityType && (
                                <span className="text-[10px] text-[var(--fg3)]">{s.entityA.entityType.name}</span>
                              )}
                            </div>
                            {s.entityA.sourceSystem && (
                              <p className="text-[11px] text-[var(--fg3)]">Source: {s.entityA.sourceSystem}</p>
                            )}
                            <div className="space-y-1">
                              {allKeys.map((key) => {
                                const aVal = aProps[key];
                                const bVal = bProps[key];
                                const isMatch = aVal && bVal && aVal === bVal;
                                return (
                                  <div key={key} className="flex items-center gap-2 text-xs">
                                    <span className="text-[var(--fg3)] w-16 shrink-0 capitalize">{key}:</span>
                                    <span className={aVal ? (isMatch ? "text-foreground font-medium" : "text-[var(--fg2)]") : "text-[var(--fg3)]"}>
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
                              <h4 className="text-sm font-medium text-foreground">{s.entityB.displayName}</h4>
                              {s.entityB.entityType && (
                                <span className="text-[10px] text-[var(--fg3)]">{s.entityB.entityType.name}</span>
                              )}
                            </div>
                            {s.entityB.sourceSystem && (
                              <p className="text-[11px] text-[var(--fg3)]">Source: {s.entityB.sourceSystem}</p>
                            )}
                            <div className="space-y-1">
                              {allKeys.map((key) => {
                                const aVal = aProps[key];
                                const bVal = bProps[key];
                                const isMatch = aVal && bVal && aVal === bVal;
                                return (
                                  <div key={key} className="flex items-center gap-2 text-xs">
                                    <span className="text-[var(--fg3)] w-16 shrink-0 capitalize">{key}:</span>
                                    <span className={bVal ? (isMatch ? "text-foreground font-medium" : "text-[var(--fg2)]") : "text-[var(--fg3)]"}>
                                      {bVal || "—"}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        {/* Match signals + confidence */}
                        <div className="flex items-center justify-between border-t border-border pt-3">
                          <div className="flex items-center gap-3 text-xs">
                            {signals.map((sig, i) => {
                              const key = Object.keys(sig)[0];
                              const val = sig[key];
                              if (!key) return null;
                              return (
                                <span key={i} className="text-[var(--fg2)]">
                                  <span className="text-ok mr-1">&#10003;</span>
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
                              className="px-3 py-1 rounded-md text-xs font-medium bg-accent-light text-accent hover:bg-accent/25 disabled:opacity-50"
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
                              className="px-3 py-1 rounded-md text-xs font-medium text-[var(--fg2)] hover:text-[var(--fg2)] hover:bg-hover disabled:opacity-50"
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay backdrop-blur-sm">
            <div className="wf-soft max-w-sm w-full mx-4 p-6 space-y-4">
              <h3 className="text-lg font-medium text-foreground">Reverse Merge</h3>
              <p className="text-sm text-[var(--fg2)]">
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
                  className="bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] text-danger hover:bg-[color-mix(in_srgb,var(--danger)_30%,transparent)] border-[color-mix(in_srgb,var(--danger)_20%,transparent)]"
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
                {/* General Governance Settings */}
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, padding: 20 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "var(--fg4)", textTransform: "uppercase" as const }} className="mb-4">
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
                        <div style={{ fontSize: 13, color: "var(--fg2)" }}>Auto-approve read actions</div>
                        <div style={{ fontSize: 11, color: "var(--fg4)" }}>Allow read operations without policy checks</div>
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
                          background: govAutoApproveReads ? "var(--accent)" : "var(--elevated)",
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
          </div>
        )}

        {/* Danger Zone — only visible to admins */}
        {isAdmin && operatorInfo && (
          <div style={{
            marginTop: 48,
            padding: 24,
            borderRadius: 12,
            border: "1px solid color-mix(in srgb, var(--danger) 30%, transparent)",
            background: "color-mix(in srgb, var(--danger) 4%, transparent)",
          }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--danger)", marginBottom: 8 }}>
              Danger Zone
            </h3>

            {operatorInfo.deletionRequestedAt ? (
              <>
                <p style={{ fontSize: 13, color: "var(--fg2)", marginBottom: 8, lineHeight: 1.6 }}>
                  This organization is scheduled for deletion on{" "}
                  <strong>{new Date(operatorInfo.deletionScheduledFor!).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}</strong>.
                  All data will be permanently destroyed after this time.
                </p>
                <button
                  onClick={async () => {
                    setCancellingDeletion(true);
                    try {
                      const res = await fetch(`/api/operators/${operatorInfo.id}/cancel-deletion`, { method: "POST" });
                      if (res.ok) {
                        setOperatorInfo(prev => prev ? { ...prev, deletionRequestedAt: null, deletionScheduledFor: null } : prev);
                        toast("Deletion cancelled", "success");
                      } else {
                        const data = await res.json().catch(() => null);
                        toast(data?.error || "Failed to cancel", "error");
                      }
                    } catch { toast("Connection error", "error"); }
                    finally { setCancellingDeletion(false); }
                  }}
                  disabled={cancellingDeletion}
                  style={{
                    padding: "8px 20px",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    color: "var(--foreground)",
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  {cancellingDeletion ? "Cancelling..." : "Cancel Deletion"}
                </button>
              </>
            ) : (
              <>
                <p style={{ fontSize: 13, color: "var(--fg2)", marginBottom: 16, lineHeight: 1.6 }}>
                  Permanently delete this organization and all associated data. This action cannot be undone.
                  All connected systems will be disconnected, all wiki knowledge will be destroyed, and all
                  team member accounts will be deactivated.
                </p>
                <button
                  onClick={() => setDeleteStep(1)}
                  style={{
                    padding: "8px 20px",
                    borderRadius: 6,
                    border: "1px solid var(--danger)",
                    background: "transparent",
                    color: "var(--danger)",
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  Delete Organization
                </button>
              </>
            )}
          </div>
        )}

        {/* Delete — First Confirmation Modal */}
        <Modal open={deleteStep === 1} onClose={() => { setDeleteStep(0); setDeleteResult(null); }} title={`Delete ${operatorInfo?.displayName ?? "Organization"}?`}>
          <div className="space-y-4">
            <p className="text-sm text-[var(--fg2)] leading-relaxed">
              This will permanently delete:
            </p>
            <ul className="text-sm text-[var(--fg2)] list-disc pl-5 space-y-1">
              <li>All organizational data and wiki knowledge</li>
              <li>All connected system integrations</li>
              <li>All team member accounts ({teamUsers.length} members)</li>
              <li>All situations, projects, and initiatives</li>
              <li>All AI learning and system intelligence</li>
            </ul>
            <p className="text-sm text-[var(--fg3)]">
              Deletion will be scheduled with a 48-hour grace period.
              During this period, any admin can cancel the deletion.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="default" size="sm" onClick={() => setDeleteStep(0)}>Cancel</Button>
              <Button variant="danger" size="sm" onClick={() => { setDeleteStep(2); setDeleteTyped(""); }}>
                Continue to Final Confirmation
              </Button>
            </div>
          </div>
        </Modal>

        {/* Delete — Type to Confirm Modal */}
        <Modal open={deleteStep === 2} onClose={() => { setDeleteStep(0); setDeleteResult(null); }} title="Final Confirmation">
          {deleteResult?.success ? (
            <div className="space-y-3">
              <p className="text-sm text-[var(--fg2)]">
                Deletion scheduled for{" "}
                <strong>{deleteResult.scheduledFor ? new Date(deleteResult.scheduledFor).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "48 hours from now"}</strong>.
                All admins have been notified. You can cancel this in Settings within 48 hours.
              </p>
              <div className="flex justify-end pt-2">
                <Button variant="default" size="sm" onClick={() => { setDeleteStep(0); setDeleteResult(null); }}>Close</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-[var(--fg2)]">
                Type the organization name to confirm deletion:
              </p>
              <Input
                value={deleteTyped}
                onChange={e => setDeleteTyped(e.target.value)}
                placeholder={operatorInfo?.displayName ?? ""}
                autoFocus
              />
              <p className="text-xs text-[var(--fg4)]">
                The organization name is: <strong className="text-[var(--fg2)]">{operatorInfo?.displayName}</strong>
              </p>
              <p className="text-xs text-[var(--fg4)]">
                This is irreversible after the 48-hour grace period expires.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="default" size="sm" onClick={() => setDeleteStep(0)}>Cancel</Button>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={deleteLoading || deleteTyped.toLowerCase() !== (operatorInfo?.displayName ?? "").toLowerCase()}
                  onClick={async () => {
                    if (!operatorInfo) return;
                    setDeleteLoading(true);
                    try {
                      const res = await fetch(`/api/operators/${operatorInfo.id}/request-deletion`, { method: "POST" });
                      const data = await res.json();
                      if (res.ok) {
                        setDeleteResult({ success: true, scheduledFor: data.deletionScheduledFor });
                        setOperatorInfo(prev => prev ? { ...prev, deletionRequestedAt: new Date().toISOString(), deletionScheduledFor: data.deletionScheduledFor } : prev);
                      } else {
                        toast(data.error || "Failed to request deletion", "error");
                      }
                    } catch { toast("Connection error", "error"); }
                    finally { setDeleteLoading(false); }
                  }}
                >
                  {deleteLoading ? "Deleting..." : "Delete Organization"}
                </Button>
              </div>
            </div>
          )}
        </Modal>

          </div>
        </div>
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

// ── Billing Tab ─────────────────────────────────────────────────────────────

// ── Usage Tab ────────────────────────────────────────────────────────────────

function UsageTab() {
  const [data, setData] = useState<UsageData | null>(null);
  const [limits, setLimits] = useState<LimitsData | null>(null);
  const [dateRange, setDateRange] = useState("this_month");
  const [attrView, setAttrView] = useState<"domains" | "people">("domains");

  const dateParams = () => {
    const now = new Date();
    if (dateRange === "last_month") {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      return `from=${s.toISOString()}&to=${e.toISOString()}`;
    }
    if (dateRange === "last_3_months") {
      const s = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      const e = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      return `from=${s.toISOString()}&to=${e.toISOString()}`;
    }
    const s = new Date(now.getFullYear(), now.getMonth(), 1);
    const e = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    return `from=${s.toISOString()}&to=${e.toISOString()}`;
  };

  useEffect(() => {
    fetch(`/api/billing/usage?granularity=daily&${dateParams()}`).then((r) => r.ok ? r.json() : null).then(setData).catch(() => {});
    fetch("/api/billing/limits").then((r) => r.ok ? r.json() : null).then(setLimits).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange]);

  const c = (v: number) => `$${(v / 100).toFixed(2)}`;

  if (!data) return <div className="text-[var(--fg3)] text-sm p-6">Loading usage data...</div>;

  const period = data.currentPeriod ?? { totalBilledCents: 0, copilotCostCents: 0, situationsByAutonomy: {}, departmentUsage: [], projectedMonthEndCents: 0, dailyBreakdown: [] };
  const totalSpend = period.totalBilledCents + period.copilotCostCents;
  const supervised = period.situationsByAutonomy.supervised ?? { count: 0, totalCents: 0 };
  const notify = period.situationsByAutonomy.notify ?? { count: 0, totalCents: 0 };
  const autonomous = period.situationsByAutonomy.autonomous ?? { count: 0, totalCents: 0 };
  const totalSituations = supervised.count + notify.count + autonomous.count;

  const chartData = (data.dailyBreakdown ?? []).map((d) => ({
    date: new Date(d.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    Observe: d.supervised / 100,
    Propose: d.notify / 100,
    Act: d.autonomous / 100,
    Copilot: d.copilot / 100,
  }));

  const budgetDaysLeft = limits?.budget.budgetPeriodStart
    ? Math.max(0, Math.ceil((new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;
  const budgetPct = limits?.budget.percentUsed ?? 0;
  const budgetColor = budgetPct > 80 ? "bg-[var(--danger)]" : budgetPct > 60 ? "bg-[var(--warn)]" : "bg-[var(--ok)]";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[13px] text-[var(--fg3)]">Total Spend</div>
          <div className="text-[32px] font-semibold text-foreground">{c(totalSpend)}</div>
        </div>
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
          className="px-3 py-1.5 rounded-md bg-elevated border border-border text-foreground text-[13px] appearance-none"
        >
          <option value="this_month">This month</option>
          <option value="last_month">Last month</option>
          <option value="last_3_months">Last 3 months</option>
        </select>
      </div>

      <div className="flex flex-col md:flex-row gap-5">
        {/* Left column */}
        <div className="flex-1 min-w-0 space-y-5">
          {/* Daily spend chart */}
          {chartData.length > 0 && (
            <div className="wf-soft p-5">
              <div className="text-[14px] font-semibold text-foreground mb-4">Daily spend</div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--fg3)" }} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--fg3)" }} tickFormatter={(v: number) => `$${v.toFixed(0)}`} />
                  <Tooltip
                    contentStyle={{ background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                    formatter={(v) => [`$${Number(v).toFixed(2)}`, undefined]}
                  />
                  <Bar dataKey="Observe" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Propose" stackId="a" fill="#f59e0b" />
                  <Bar dataKey="Act" stackId="a" fill="#22c55e" />
                  <Bar dataKey="Copilot" stackId="a" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Spend categories */}
          <div>
            <div className="text-[14px] font-semibold text-foreground mb-3">Spend categories</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Observe", color: "#3b82f6", count: supervised.count, cents: supervised.totalCents },
                { label: "Propose", color: "#f59e0b", count: notify.count, cents: notify.totalCents },
                { label: "Act", color: "#22c55e", count: autonomous.count, cents: autonomous.totalCents },
                { label: "Copilot", color: "#8b5cf6", count: period.copilotMessageCount, cents: period.copilotCostCents },
              ].map((cat) => (
                <div key={cat.label} className="wf-soft p-4" style={{ borderLeft: `3px solid ${cat.color}` }}>
                  <div className="text-[12px] font-medium text-[var(--fg2)] mb-1">{cat.label}</div>
                  <div className="text-[18px] font-semibold text-foreground">{cat.count}</div>
                  <div className="text-[12px] text-[var(--fg3)]">{c(cat.cents)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Attribution table */}
          <div>
            <div className="flex items-center gap-4 mb-3">
              <div className="text-[14px] font-semibold text-foreground">Attribution</div>
              <div className="flex gap-1 bg-hover rounded-md p-0.5">
                {(["domains", "people"] as const).map((v) => (
                  <button key={v} onClick={() => setAttrView(v)} className={`px-3 py-1 text-[12px] rounded-md transition-colors ${attrView === v ? "bg-elevated text-foreground font-medium" : "text-[var(--fg3)]"}`}>
                    {v === "domains" ? "Domains" : "People"}
                  </button>
                ))}
              </div>
            </div>
            <div className="wf-soft overflow-hidden">
              {attrView === "domains" ? (
                <table className="w-full text-[13px]">
                  <thead><tr className="text-[var(--fg3)] text-left border-b border-border"><th className="px-4 py-2 font-medium">Domain</th><th className="px-4 py-2 font-medium text-right">Situations</th><th className="px-4 py-2 font-medium text-right">Cost</th></tr></thead>
                  <tbody>{(data.domains ?? []).map((d, i) => (
                    <tr key={i} className="border-b border-border last:border-0"><td className="px-4 py-2 text-[var(--fg2)]">{d.name}</td><td className="px-4 py-2 text-right text-[var(--fg3)]">{d.count}</td><td className="px-4 py-2 text-right text-[var(--fg2)]">{c(d.totalCents)}</td></tr>
                  ))}{data.domains?.length === 0 && <tr><td colSpan={3} className="px-4 py-4 text-center text-[var(--fg3)]">No department data</td></tr>}</tbody>
                </table>
              ) : (
                <table className="w-full text-[13px]">
                  <thead><tr className="text-[var(--fg3)] text-left border-b border-border"><th className="px-4 py-2 font-medium">Name</th><th className="px-4 py-2 font-medium">Email</th><th className="px-4 py-2 font-medium text-right">Situations</th><th className="px-4 py-2 font-medium text-right">Copilot</th><th className="px-4 py-2 font-medium text-right">Total</th></tr></thead>
                  <tbody>{(data.employees ?? []).map((e) => (
                    <tr key={e.userId} className="border-b border-border last:border-0"><td className="px-4 py-2 text-[var(--fg2)]">{e.name}</td><td className="px-4 py-2 text-[var(--fg3)]">{e.email}</td><td className="px-4 py-2 text-right text-[var(--fg3)]">{e.situationCount}</td><td className="px-4 py-2 text-right text-[var(--fg3)]">{e.copilotMessages}</td><td className="px-4 py-2 text-right text-[var(--fg2)]">{c(e.totalBilledCents)}</td></tr>
                  ))}{(data.employees ?? []).length === 0 && <tr><td colSpan={5} className="px-4 py-4 text-center text-[var(--fg3)]">No employee data</td></tr>}</tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="w-full md:w-[280px] space-y-4 flex-shrink-0">
          {limits?.budget.monthlyBudgetCents && (
            <div className="wf-soft p-4">
              <div className="text-[12px] font-medium text-[var(--fg3)] mb-1">Monthly budget</div>
              <div className="text-[14px] font-semibold text-foreground mb-2">{c(limits.budget.currentSpendCents)} / {c(limits.budget.monthlyBudgetCents)}</div>
              <div className="h-2 rounded-full bg-skeleton overflow-hidden mb-1">
                <div className={`h-full rounded-full transition-all ${budgetColor}`} style={{ width: `${Math.min(100, budgetPct)}%` }} />
              </div>
              <div className="text-[11px] text-[var(--fg3)]">Resets in {budgetDaysLeft} days</div>
            </div>
          )}

          <div className="wf-soft p-4">
            <div className="text-[24px] font-semibold text-foreground">{totalSituations}</div>
            <div className="text-[12px] text-[var(--fg3)]">situations resolved</div>
          </div>

          <div className="wf-soft p-4">
            <div className="text-[24px] font-semibold text-foreground">{period.copilotMessageCount}</div>
            <div className="text-[12px] text-[var(--fg3)]">copilot messages</div>
          </div>

          {data.onboardingCostCents > 0 && (
            <div className="wf-soft p-4 bg-hover">
              <div className="text-[12px] text-[var(--fg3)]">Free analysis value</div>
              <div className="text-[14px] font-medium text-[var(--fg2)]">~{c(data.onboardingCostCents)}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Limits Tab ───────────────────────────────────────────────────────────────

const THRESHOLD_OPTIONS = [25, 50, 75, 80, 90, 100];

function LimitsTab() {
  const [data, setData] = useState<LimitsData | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<{ monthlyBudgetCents: number | null; budgetAlertThresholds: number[]; budgetHardStop: boolean }>({ monthlyBudgetCents: null, budgetAlertThresholds: [], budgetHardStop: false });
  const [budgetInput, setBudgetInput] = useState("");
  const [noLimit, setNoLimit] = useState(true);
  const { isAdmin } = useUser();

  const load = () => {
    fetch("/api/billing/limits").then((r) => r.ok ? r.json() : null).then((d) => {
      setData(d);
      if (d) {
        setDraft({ monthlyBudgetCents: d.budget.monthlyBudgetCents, budgetAlertThresholds: d.budget.budgetAlertThresholds, budgetHardStop: d.budget.budgetHardStop });
        setBudgetInput(d.budget.monthlyBudgetCents ? (d.budget.monthlyBudgetCents / 100).toString() : "");
        setNoLimit(!d.budget.monthlyBudgetCents);
      }
    }).catch(() => {});
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const body = {
        monthlyBudgetCents: noLimit ? null : Math.round(parseFloat(budgetInput || "0") * 100),
        budgetAlertThresholds: draft.budgetAlertThresholds,
        budgetHardStop: draft.budgetHardStop,
      };
      const res = await fetch("/api/billing/limits", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) { load(); setEditing(false); }
    } finally { setSaving(false); }
  };

  const addThreshold = (t: number) => setDraft((d) => ({ ...d, budgetAlertThresholds: [...d.budgetAlertThresholds, t].sort((a, b) => a - b) }));
  const removeThreshold = (t: number) => setDraft((d) => ({ ...d, budgetAlertThresholds: d.budgetAlertThresholds.filter((v) => v !== t) }));

  const c = (v: number) => `$${(v / 100).toFixed(2)}`;

  if (!data) return <div className="text-[var(--fg3)] text-sm p-6">Loading limits...</div>;

  const budgetDaysLeft = Math.max(0, Math.ceil((new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
  const pct = data.budget.percentUsed;
  const pctColor = pct > 80 ? "bg-[var(--danger)]" : pct > 60 ? "bg-[var(--warn)]" : "bg-[var(--ok)]";
  const availableThresholds = THRESHOLD_OPTIONS.filter((t) => !draft.budgetAlertThresholds.includes(t));

  return (
    <div className="space-y-5">
      {/* Organization Budget */}
      <div className="wf-soft p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="text-[14px] font-semibold text-foreground">Organization budget</div>
          {isAdmin && !editing && <button onClick={() => setEditing(true)} className="text-[12px] text-accent hover:underline">Edit budget</button>}
        </div>

        {!editing ? (
          <div>
            {data.budget.monthlyBudgetCents ? (
              <>
                <div className="text-[18px] font-semibold text-foreground mb-2">{c(data.budget.currentSpendCents)} / {c(data.budget.monthlyBudgetCents)}</div>
                <div className="h-2.5 rounded-full bg-skeleton overflow-hidden mb-2">
                  <div className={`h-full rounded-full transition-all ${pctColor}`} style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
                <div className="text-[12px] text-[var(--fg3)] mb-4">Resets in {budgetDaysLeft} days</div>
              </>
            ) : (
              <div className="text-[14px] text-[var(--fg3)] mb-4">No budget set</div>
            )}

            {data.budget.budgetAlertThresholds.length > 0 && (
              <div className="space-y-2">
                {data.budget.budgetAlertThresholds.map((t) => (
                  <div key={t} className="flex items-center gap-2 text-[13px] text-[var(--fg2)]">
                    <svg className="w-3.5 h-3.5 text-[var(--fg3)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
                    <span>{t}% usage alert</span>
                  </div>
                ))}
              </div>
            )}

            {data.budget.budgetHardStop && (
              <div className="mt-3 text-[12px] text-danger bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] rounded-md px-3 py-2">
                AI operations will pause when budget is reached.
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Budget input */}
            <div>
              <label className="flex items-center gap-2 text-[13px] text-[var(--fg2)] mb-2">
                <input type="checkbox" checked={noLimit} onChange={(e) => setNoLimit(e.target.checked)} className="rounded" />
                No limit
              </label>
              {!noLimit && (
                <div className="flex items-center gap-2">
                  <span className="text-[14px] text-[var(--fg2)]">$</span>
                  <input type="number" min="1" step="1" value={budgetInput} onChange={(e) => setBudgetInput(e.target.value)} className="w-32 px-3 py-1.5 rounded-md bg-elevated border border-border text-foreground text-[13px]" placeholder="e.g. 500" />
                  <span className="text-[12px] text-[var(--fg3)]">per month</span>
                </div>
              )}
            </div>

            {/* Alert thresholds */}
            <div>
              <div className="text-[13px] font-medium text-[var(--fg2)] mb-2">Alert thresholds</div>
              <div className="flex flex-wrap gap-2 mb-2">
                {draft.budgetAlertThresholds.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-hover border border-border text-[12px] text-[var(--fg2)]">
                    {t}%
                    <button onClick={() => removeThreshold(t)} className="text-[var(--fg3)] hover:text-danger">&times;</button>
                  </span>
                ))}
              </div>
              {availableThresholds.length > 0 && (
                <select
                  value=""
                  onChange={(e) => { if (e.target.value) addThreshold(parseInt(e.target.value, 10)); }}
                  className="px-3 py-1.5 rounded-md bg-elevated border border-border text-foreground text-[12px] appearance-none"
                >
                  <option value="">Add alert...</option>
                  {availableThresholds.map((t) => <option key={t} value={t}>{t}%</option>)}
                </select>
              )}
            </div>

            {/* Hard stop */}
            <div className="space-y-2">
              <div className="text-[13px] font-medium text-[var(--fg2)] mb-1">When budget is reached</div>
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="radio" name="hardStop" checked={!draft.budgetHardStop} onChange={() => setDraft((d) => ({ ...d, budgetHardStop: false }))} className="mt-0.5" />
                <div><div className="text-[13px] text-foreground">Alert only</div><div className="text-[11px] text-[var(--fg3)]">Notify admins but continue operations</div></div>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="radio" name="hardStop" checked={draft.budgetHardStop} onChange={() => setDraft((d) => ({ ...d, budgetHardStop: true }))} className="mt-0.5" />
                <div><div className="text-[13px] text-foreground">Pause AI</div><div className="text-[11px] text-[var(--fg3)]">Stop all AI operations when budget is reached</div></div>
              </label>
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={handleSave} disabled={saving} className="rounded-lg text-[13px] font-medium px-5 py-2 disabled:opacity-50" style={{ background: "rgba(255,255,255,0.9)", color: "#000" }}>{saving ? "Saving..." : "Save"}</button>
              <button onClick={() => { setEditing(false); load(); }} className="rounded-lg text-[13px] font-medium px-5 py-2 text-[var(--fg2)] bg-hover border border-border">Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* Rate Limits */}
      <div className="wf-soft p-5">
        <div className="text-[14px] font-semibold text-foreground mb-1">Rate limits</div>
        <div className="text-[12px] text-[var(--fg3)] mb-3">Platform rate limits ensure stable performance across all customers.</div>
        <table className="w-full text-[13px]">
          <thead><tr className="text-[var(--fg3)] text-left"><th className="pb-2 font-medium">Limit</th><th className="pb-2 font-medium text-right">Value</th></tr></thead>
          <tbody className="text-[var(--fg2)]">
            <tr className="border-t border-border"><td className="py-2">Copilot messages</td><td className="py-2 text-right">{data.rateLimits.copilotPerMinute} per minute</td></tr>
            <tr className="border-t border-border"><td className="py-2">Concurrent execution plans</td><td className="py-2 text-right">{data.rateLimits.concurrentExecutionPlans}</td></tr>
            <tr className="border-t border-border"><td className="py-2">Detection sweep interval</td><td className="py-2 text-right">Every {data.rateLimits.detectionSweepIntervalMinutes} minutes</td></tr>
          </tbody>
        </table>
      </div>

      {/* Free Tier Limits */}
      {data.freeTier && (
        <div className="wf-soft p-5">
          <div className="text-[14px] font-semibold text-foreground mb-3">Free tier limits</div>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-[12px] text-[var(--fg2)] mb-1"><span>Copilot budget</span><span>{c(data.freeTier.copilotUsedCents)} / {c(data.freeTier.copilotBudgetCents)}</span></div>
              <div className="h-1.5 rounded-full bg-skeleton overflow-hidden"><div className="h-full rounded-full bg-accent/60" style={{ width: `${Math.min(100, (data.freeTier.copilotUsedCents / data.freeTier.copilotBudgetCents) * 100)}%` }} /></div>
            </div>
            <div>
              <div className="flex justify-between text-[12px] text-[var(--fg2)] mb-1"><span>Detection situations</span><span>{data.freeTier.detectionSituationCount} / {data.freeTier.detectionSituationLimit}</span></div>
              <div className="h-1.5 rounded-full bg-skeleton overflow-hidden"><div className="h-full rounded-full bg-accent/60" style={{ width: `${Math.min(100, (data.freeTier.detectionSituationCount / data.freeTier.detectionSituationLimit) * 100)}%` }} /></div>
            </div>
            <div className="text-[12px] text-[var(--fg3)]">
              {data.freeTier.detectionDaysUsed >= data.freeTier.detectionDayLimit ? "Detection period expired" : `${data.freeTier.detectionDayLimit - data.freeTier.detectionDaysUsed} days remaining`}
            </div>
            <a href="/settings?tab=billing" className="inline-block rounded-lg text-[13px] font-medium px-5 py-2 mt-1" style={{ background: "rgba(255,255,255,0.9)", color: "#000" }}>Add Credits to Upgrade</a>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Billing Tab ──────────────────────────────────────────────────────────────

type BalanceData = {
  balanceCents: number;
  billingStatus: string;
  autoReloadEnabled: boolean;
  autoReloadThresholdCents: number;
  autoReloadAmountCents: number;
  hasPaymentMethod: boolean;
};

type UsageData = {
  operator: {
    billingStatus: string;
    billingStartedAt: string | null;
    orchestrationFeeMultiplier: number;
    freeCopilotBudgetCents: number;
    freeCopilotUsedCents: number;
    freeDetectionSituationCount: number;
    freeDetectionStartedAt: string | null;
  };
  currentPeriod: {
    start: string;
    end: string;
    situationsByAutonomy: Record<string, { count: number; totalCents: number }>;
    copilotMessageCount: number;
    copilotCostCents: number;
    totalBilledCents: number;
    projectedMonthEndCents: number;
  };
  domains: Array<{ name: string; count: number; totalCents: number }>;
  historicalMonths: Array<{ month: string; supervised: number; notify: number; autonomous: number; situationCount: number }>;
  dailyBreakdown?: Array<{ date: string; supervised: number; notify: number; autonomous: number; copilot: number; total: number }>;
  employees: Array<{ userId: string; name: string; email: string; situationCount: number; copilotMessages: number; totalBilledCents: number }>;
  onboardingCostCents: number;
};

type LimitsData = {
  budget: {
    monthlyBudgetCents: number | null;
    budgetAlertThresholds: number[];
    budgetHardStop: boolean;
    currentSpendCents: number;
    budgetPeriodStart: string | null;
    percentUsed: number;
  };
  rateLimits: {
    copilotPerMinute: number;
    concurrentExecutionPlans: number;
    detectionSweepIntervalMinutes: number;
  };
  freeTier: {
    copilotBudgetCents: number;
    copilotUsedCents: number;
    detectionSituationLimit: number;
    detectionSituationCount: number;
    detectionDayLimit: number;
    detectionDaysUsed: number;
  } | null;
};

type PaymentMethod = { brand: string; last4: string; expMonth: number; expYear: number } | null;
type TransactionItem = { id: string; type: string; amountCents: number; balanceAfter: number; description: string | null; createdAt: string };

const CREDIT_PRESETS = [
  { cents: 1000, label: "$10" },
  { cents: 2500, label: "$25" },
  { cents: 5000, label: "$50" },
  { cents: 10000, label: "$100" },
];

function BillingTab() {
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [balanceLoaded, setBalanceLoaded] = useState(false);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(null);
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [showAddCredits, setShowAddCredits] = useState(false);
  const [customAmount, setCustomAmount] = useState("");
  const [adding, setAdding] = useState(false);
  const [autoReloadSaving, setAutoReloadSaving] = useState(false);
  const { user } = useUser();
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";

  useEffect(() => {
    fetch("/api/billing/balance").then((r) => r.ok ? r.json() : null).then((d) => { setBalance(d); setBalanceLoaded(true); }).catch(() => setBalanceLoaded(true));
    fetch("/api/billing/usage").then((r) => r.ok ? r.json() : null).then(setUsage).catch(() => {});
    fetch("/api/billing/payment-method").then((r) => r.ok ? r.json() : null).then((d) => setPaymentMethod(d?.paymentMethod ?? null)).catch(() => {});
    if (isAdmin) {
      fetch("/api/billing/transactions?limit=20").then((r) => r.ok ? r.json() : null).then((d) => setTransactions(d?.transactions ?? [])).catch(() => {});
    }
  }, [isAdmin]);

  const ratePercent = (base: number, mult: number) => Math.round(base * mult * 100);
  const orchestrationMultiplier = usage?.operator?.orchestrationFeeMultiplier ?? 0.5;

  const handleAddCredits = async (amountCents: number) => {
    setAdding(true);
    try {
      const res = await fetch("/api/billing/add-credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else if (data.devMode) window.location.reload();
    } catch { /* ignore */ } finally { setAdding(false); }
  };

  const handleSetupPaymentMethod = async () => {
    const res = await fetch("/api/billing/setup-payment-method", { method: "POST" });
    const data = await res.json();
    if (data.clientSecret && data.clientSecret !== "dev_mode") {
      // In production, would use Stripe.js Elements with this clientSecret
      // For now, prompt user
      alert("Stripe payment method setup would open here. Client secret: " + data.clientSecret);
    } else if (data.devMode) {
      alert("Dev mode: payment method setup skipped.");
    }
  };

  const handleToggleAutoReload = async (enabled: boolean) => {
    setAutoReloadSaving(true);
    try {
      await fetch("/api/billing/auto-reload", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      setBalance((b) => b ? { ...b, autoReloadEnabled: enabled } : b);
    } catch { /* ignore */ } finally { setAutoReloadSaving(false); }
  };

  const cents = (v: number) => `$${(v / 100).toFixed(2)}`;

  if (!balanceLoaded) return <div className="text-[var(--fg3)] text-sm p-6">Loading billing data...</div>;
  if (!balance) return <div className="text-[var(--fg3)] text-sm p-6">Unable to load billing data. Please try refreshing.</div>;

  const isFree = balance.billingStatus === "free";
  const isDepleted = balance.billingStatus === "depleted";
  const isPastDue = balance.billingStatus === "past_due";
  const isActive = balance.billingStatus === "active";

  const balanceColor = balance.balanceCents <= 0
    ? "text-[var(--fg3)]"
    : balance.balanceCents < 500
    ? "text-danger"
    : balance.balanceCents <= 1000
    ? "text-warn"
    : "text-ok";

  const op = usage?.operator;
  const period = usage?.currentPeriod;
  const isDiscount = op ? op.orchestrationFeeMultiplier < 1.0 : false;
  let discountEndDate = "";
  if (isDiscount && op?.billingStartedAt) {
    const d = new Date(op.billingStartedAt);
    d.setDate(d.getDate() + 30);
    discountEndDate = d.toLocaleDateString();
  }

  return (
    <div className="space-y-5">
      {/* ── Depleted Banner ── */}
      {isDepleted && (
        <div className="wf-soft p-5" style={{ border: "1px solid rgba(239, 68, 68, 0.3)", background: "rgba(239, 68, 68, 0.05)" }}>
          <div className="text-[15px] font-semibold text-danger mb-1">Balance Empty</div>
          <div className="text-[13px] text-[var(--fg2)] mb-3">Your balance is empty. AI operations are paused.</div>
          {isAdmin && <button onClick={() => setShowAddCredits(true)} className="rounded-lg text-[13px] font-medium px-5 py-2" style={{ background: "rgba(255,255,255,0.9)", color: "#000" }}>Add Credits</button>}
        </div>
      )}

      {isPastDue && (
        <div className="wf-soft p-5" style={{ border: "1px solid rgba(245, 158, 11, 0.3)", background: "rgba(245, 158, 11, 0.05)" }}>
          <div className="text-[15px] font-semibold text-warn mb-1">Payment Failed</div>
          <div className="text-[13px] text-[var(--fg2)] mb-3">Your last payment didn&apos;t go through. Please update your payment method.</div>
          {isAdmin && <button onClick={handleSetupPaymentMethod} className="rounded-lg text-[13px] font-medium px-5 py-2" style={{ background: "var(--warn)", color: "var(--accent-ink)" }}>Update Payment Method</button>}
        </div>
      )}

      {/* ── Balance Display ── */}
      <div className="wf-soft p-6">
        <div className="flex items-center justify-between mb-1">
          <div className="text-[13px] font-medium text-[var(--fg2)]">Credit Balance</div>
          {isAdmin && !isFree && (
            <button onClick={() => setShowAddCredits(true)} className="rounded-lg text-[12px] font-medium px-4 py-1.5" style={{ background: "rgba(255,255,255,0.9)", color: "#000" }}>
              Add Credits
            </button>
          )}
        </div>
        <div className={`text-[32px] font-semibold ${balanceColor}`}>
          {cents(Math.max(0, balance.balanceCents))}
          <span className="text-[14px] text-[var(--fg3)] font-normal ml-2">remaining</span>
        </div>
      </div>

      {/* ── Free Plan Card ── */}
      {isFree && (
        <div className="wf-soft p-6 space-y-4" style={{ border: "1px solid rgba(139, 92, 246, 0.3)", background: "rgba(139, 92, 246, 0.05)" }}>
          <div>
            <div className="text-[15px] font-semibold text-foreground mb-1">Qorpera Free Plan</div>
            <div className="text-[13px] text-[var(--fg2)]">Add credits to unlock full AI operations — approve situations, invite team members, unlimited detection.</div>
          </div>
          {isAdmin && <button onClick={() => setShowAddCredits(true)} className="rounded-lg text-[13px] font-medium px-5 py-2" style={{ background: "rgba(255,255,255,0.9)", color: "#000" }}>Add Credits</button>}

          {op && (
            <div className="pt-3 space-y-3" style={{ borderTop: "1px solid rgba(139, 92, 246, 0.15)" }}>
              <div className="text-[13px] font-medium text-[var(--fg2)]">Free Usage</div>
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-[12px] text-[var(--fg2)] mb-1"><span>Chat</span><span>{cents(op.freeCopilotUsedCents)} / {cents(op.freeCopilotBudgetCents)}</span></div>
                  <div className="h-1.5 rounded-full bg-skeleton overflow-hidden"><div className="h-full rounded-full bg-accent/60 transition-all" style={{ width: `${Math.min(100, (op.freeCopilotUsedCents / op.freeCopilotBudgetCents) * 100)}%` }} /></div>
                </div>
                <div>
                  <div className="flex justify-between text-[12px] text-[var(--fg2)] mb-1"><span>Situations detected</span><span>{op.freeDetectionSituationCount} / 50</span></div>
                  <div className="h-1.5 rounded-full bg-skeleton overflow-hidden"><div className="h-full rounded-full bg-accent/60 transition-all" style={{ width: `${Math.min(100, (op.freeDetectionSituationCount / 50) * 100)}%` }} /></div>
                </div>
                {op.freeDetectionStartedAt && (() => {
                  const daysUsed = Math.floor((Date.now() - new Date(op.freeDetectionStartedAt).getTime()) / (1000 * 60 * 60 * 24));
                  const daysLeft = Math.max(0, 30 - daysUsed);
                  return <div className="text-[12px] text-[var(--fg3)]">Detection time remaining: {daysLeft} days</div>;
                })()}
              </div>
            </div>
          )}

          {op && op.freeDetectionSituationCount > 0 && (
            <div className="pt-3" style={{ borderTop: "1px solid rgba(139, 92, 246, 0.15)" }}>
              <div className="text-[13px] text-[var(--fg2)]">{op.freeDetectionSituationCount} situations detected — 0 handled.</div>
              <a href="/situations" className="text-[13px] text-accent hover:underline mt-1 inline-block">See what Qorpera found &rarr;</a>
            </div>
          )}
        </div>
      )}

      {/* ── Orchestration Rates ── */}
      {(isActive || isDepleted || isPastDue) && (
        <div className="wf-soft p-5">
          <div className="text-[14px] font-semibold text-foreground mb-3">Orchestration Rates</div>
          <table className="w-full text-[13px]">
            <thead><tr className="text-[var(--fg3)] text-left"><th className="pb-2 font-medium">Level</th><th className="pb-2 font-medium text-right">Rate</th></tr></thead>
            <tbody className="text-[var(--fg2)]">
              <tr className="border-t border-border"><td className="py-2">Observe</td><td className="py-2 text-right">{ratePercent(1.5, orchestrationMultiplier)}%</td></tr>
              <tr className="border-t border-border"><td className="py-2">Propose</td><td className="py-2 text-right">{ratePercent(1.5, orchestrationMultiplier)}%</td></tr>
              <tr className="border-t border-border"><td className="py-2">Act</td><td className="py-2 text-right">{ratePercent(3.0, orchestrationMultiplier)}%</td></tr>
              <tr className="border-t border-border"><td className="py-2">Copilot</td><td className="py-2 text-right">{ratePercent(1.5, orchestrationMultiplier)}%</td></tr>
            </tbody>
          </table>
          {isDiscount && op && (
            <div className="mt-3 text-[12px] text-accent/70 bg-accent/[0.08] rounded-md px-3 py-2">
              Learning discount active — {Math.round(op.orchestrationFeeMultiplier * 100)}% of standard rates.
              {discountEndDate && <span className="text-[var(--fg3)]"> Standard rates from {discountEndDate}.</span>}
            </div>
          )}
        </div>
      )}

      {/* ── Payment Method (admin) ── */}
      {isAdmin && !isFree && (
        <div className="wf-soft p-5">
          <div className="text-[14px] font-semibold text-foreground mb-3">Payment Method</div>
          {paymentMethod ? (
            <div className="flex items-center justify-between">
              <div className="text-[13px] text-[var(--fg2)]">{paymentMethod.brand.charAt(0).toUpperCase() + paymentMethod.brand.slice(1)} ending in {paymentMethod.last4} &middot; Expires {paymentMethod.expMonth}/{paymentMethod.expYear}</div>
              <button onClick={handleSetupPaymentMethod} className="text-[12px] text-accent hover:underline">Update</button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="text-[13px] text-[var(--fg3)]">No payment method on file</div>
              <button onClick={handleSetupPaymentMethod} className="text-[12px] text-accent hover:underline">Add card</button>
            </div>
          )}
        </div>
      )}

      {/* ── Auto-Reload (admin) ── */}
      {isAdmin && !isFree && (
        <div className="wf-soft p-5">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[14px] font-semibold text-foreground">Auto-Reload</div>
            <button
              onClick={() => handleToggleAutoReload(!balance.autoReloadEnabled)}
              disabled={autoReloadSaving || (!balance.hasPaymentMethod && !balance.autoReloadEnabled)}
              className={`relative w-10 h-5 rounded-full transition-colors ${balance.autoReloadEnabled ? "bg-accent" : "bg-skeleton"}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${balance.autoReloadEnabled ? "translate-x-5" : ""}`} />
            </button>
          </div>
          <div className="text-[13px] text-[var(--fg2)]">
            When balance drops below {cents(balance.autoReloadThresholdCents)}, automatically add {cents(balance.autoReloadAmountCents)}.
          </div>
          {!balance.hasPaymentMethod && (
            <div className="text-[12px] text-[var(--fg3)] mt-1">Add a payment method to enable auto-reload.</div>
          )}
        </div>
      )}

      {/* ── Transaction History (admin) ── */}
      {isAdmin && transactions.length > 0 && (
        <div className="wf-soft p-5">
          <div className="text-[14px] font-semibold text-foreground mb-3">Transaction History</div>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-[var(--fg3)] text-left">
                <th className="pb-2 font-medium">Date</th>
                <th className="pb-2 font-medium">Description</th>
                <th className="pb-2 font-medium text-right">Amount</th>
                <th className="pb-2 font-medium text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.id} className="border-t border-border">
                  <td className="py-2 text-[var(--fg3)]">{new Date(tx.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</td>
                  <td className="py-2 text-[var(--fg2)]">{tx.description || tx.type}</td>
                  <td className={`py-2 text-right ${tx.amountCents >= 0 ? "text-ok" : "text-danger"}`}>
                    {tx.amountCents >= 0 ? "+" : ""}{cents(tx.amountCents)}
                  </td>
                  <td className="py-2 text-right text-[var(--fg3)]">{cents(tx.balanceAfter)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Add Credits Modal ── */}
      {showAddCredits && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }}>
          <div className="wf-soft p-6 w-[420px] space-y-4" style={{ background: "var(--elevated)" }}>
            <div className="flex items-center justify-between">
              <div className="text-[16px] font-semibold text-foreground">Add Credits</div>
              <button onClick={() => setShowAddCredits(false)} className="text-[var(--fg3)] hover:text-foreground text-lg">&times;</button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {CREDIT_PRESETS.map((p) => (
                <button
                  key={p.cents}
                  onClick={() => handleAddCredits(p.cents)}
                  disabled={adding}
                  className="rounded-lg p-4 text-center border border-border bg-hover hover:border-accent transition-colors"
                >
                  <div className="text-[20px] font-semibold text-foreground">{p.label}</div>
                </button>
              ))}
            </div>

            <div className="pt-3" style={{ borderTop: "1px solid var(--border)" }}>
              <div className="text-[13px] text-[var(--fg2)] mb-2">Custom amount ($5 minimum)</div>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="5"
                  step="1"
                  placeholder="e.g. 15"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  className="flex-1 rounded-lg px-3 py-2 text-[13px] bg-hover border border-border text-foreground"
                />
                <button
                  onClick={() => {
                    const val = Math.round(parseFloat(customAmount) * 100);
                    if (val >= 500) handleAddCredits(val);
                  }}
                  disabled={adding || !customAmount || parseFloat(customAmount) < 5}
                  className="rounded-lg text-[13px] font-medium px-5 py-2 disabled:opacity-50"
                  style={{ background: "rgba(255,255,255,0.9)", color: "#000" }}
                >
                  {adding ? "..." : "Add"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Connections Tab ──────────────────────────────────────────────────────────

const CATEGORY_ORDER = ["productivity", "communication", "crm", "finance", "marketing", "ecommerce", "support"];
const CATEGORY_LABELS: Record<string, string> = {
  productivity: "Productivity",
  communication: "Communication",
  crm: "CRM",
  finance: "Finance",
  marketing: "Marketing",
  ecommerce: "E-commerce",
  support: "Support",
};
const TIER1_PROVIDERS = new Set(["google", "microsoft"]);

type SheetEntry2 = { id: string; name: string; selected: boolean };
type ChannelMapping2 = { id: string; channelId: string; channelName: string; domainId: string; department: { id: string; displayName: string } };
type SlackChannel2 = { id: string; name: string; is_private: boolean };
type TeamDept2 = { id: string; displayName: string };

function ConnectionsTab({
  connectors, providers, loadConnectors, syncingAll, setSyncingAll, syncAllResult, setSyncAllResult,
  expandedConnector, setExpandedConnector, sheetsByConnector, setSheetsByConnector,
  savingSheets, setSavingSheets, manualSheetUrl, setManualSheetUrl,
  slackMappingExpanded, setSlackMappingExpanded, slackMappings, setSlackMappings,
  slackChannels, setSlackChannels, addingMapping, setAddingMapping, teamDomains, setTeamDomains,
}: {
  connectors: ConnectorItem[];
  providers: ProviderInfo[];
  loadConnectors: () => void;
  syncingAll: boolean;
  setSyncingAll: (v: boolean) => void;
  syncAllResult: { synced: Array<{ name: string; status: string }>; errors: Array<{ name: string; error: string }> } | null;
  setSyncAllResult: (v: { synced: Array<{ name: string; status: string }>; errors: Array<{ name: string; error: string }> } | null) => void;
  expandedConnector: string | null;
  setExpandedConnector: (v: string | null) => void;
  sheetsByConnector: Record<string, SheetEntry2[]>;
  setSheetsByConnector: (fn: (prev: Record<string, SheetEntry2[]>) => Record<string, SheetEntry2[]>) => void;
  savingSheets: string | null;
  setSavingSheets: (v: string | null) => void;
  manualSheetUrl: string;
  setManualSheetUrl: (v: string) => void;
  slackMappingExpanded: string | null;
  setSlackMappingExpanded: (v: string | null) => void;
  slackMappings: Record<string, ChannelMapping2[]>;
  setSlackMappings: (fn: (prev: Record<string, ChannelMapping2[]>) => Record<string, ChannelMapping2[]>) => void;
  slackChannels: Record<string, SlackChannel2[]>;
  setSlackChannels: (fn: (prev: Record<string, SlackChannel2[]>) => Record<string, SlackChannel2[]>) => void;
  addingMapping: { connectorId: string; channelId: string; channelName: string; domainId: string } | null;
  setAddingMapping: (v: { connectorId: string; channelId: string; channelName: string; domainId: string } | null) => void;
  teamDomains: TeamDept2[];
  setTeamDomains: (v: TeamDept2[]) => void;
}) {
  const t = useTranslations("settings");
  const locale = useLocale();
  const { toast } = useToast();
  const { isAdmin } = useUser();
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [preAuthModal, setPreAuthModal] = useState<{ providerId: string; label: string; placeholder: string; paramName: string } | null>(null);
  const [preAuthInput, setPreAuthInput] = useState("");
  const [preAuthLoading, setPreAuthLoading] = useState(false);
  const [settingsConfigModal, setSettingsConfigModal] = useState<{
    providerId: string;
    providerName: string;
    fields: ConfigField[];
  } | null>(null);

  const connectedProviderIds = new Set(connectors.map((c) => c.provider));
  const unconnectedProviders = providers.filter((p) => !connectedProviderIds.has(p.id));

  // Group unconnected providers by category
  const grouped = CATEGORY_ORDER.reduce<Record<string, ProviderInfo[]>>((acc, cat) => {
    const items = unconnectedProviders.filter((p) => p.category === cat);
    if (items.length > 0) acc[cat] = items;
    return acc;
  }, {});

  const handleReconnect = async (connectorId: string) => {
    try {
      const res = await fetch(`/api/connectors/${connectorId}/reconnect`, { method: "POST" });
      const data = await res.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else if (data.requiresConfig) {
        toast("This connector requires manual configuration.", "info");
      }
    } catch {
      toast("Failed to reconnect.", "error");
    }
  };

  const handleSync = async (connectorId: string) => {
    setSyncingId(connectorId);
    try {
      await fetch(`/api/connectors/${connectorId}/sync`, { method: "POST" });
      toast("Sync started.", "success");
      setTimeout(loadConnectors, 2000);
    } catch {
      toast("Sync failed.", "error");
    }
    setSyncingId(null);
  };

  const handleRemove = async (connectorId: string, name: string) => {
    if (!confirm(`Remove ${name}? Historical data will be preserved.`)) return;
    try {
      const res = await fetch(`/api/connectors/${connectorId}`, { method: "DELETE" });
      if (res.ok) {
        toast("Connection removed.", "success");
        loadConnectors();
      } else {
        toast("Failed to remove connection.", "error");
      }
    } catch {
      toast("Failed to remove connection.", "error");
    }
  };

  const authRoutes: Record<string, string> = {
    google: "/api/connectors/google/auth",
    "google-sheets": "/api/connectors/google/auth",
    "google-ads": "/api/connectors/google-ads/auth",
    "google-workspace": "/api/connectors/google-workspace/auth-url",
    microsoft: "/api/connectors/microsoft/auth",
    slack: "/api/connectors/slack/auth-url",
    hubspot: "/api/connectors/hubspot/auth-url",
    pipedrive: "/api/auth/pipedrive/auth-url",
    salesforce: "/api/auth/salesforce/auth-url",
    intercom: "/api/auth/intercom/auth-url",
    zendesk: "/api/auth/zendesk/auth-url",
    shopify: "/api/connectors/shopify/auth-url",
    stripe: "/api/connectors/stripe/auth-url",
    linkedin: "/api/connectors/linkedin/auth-url",
    "meta-ads": "/api/connectors/meta-ads/auth-url",
    "dynamics-bc": "/api/connectors/dynamics-bc/auth-url",
    xero: "/api/connectors/xero/auth-url",
    fortnox: "/api/connectors/fortnox/auth-url",
    vismanet: "/api/connectors/vismanet/auth-url",
    "exact-online": "/api/connectors/exact-online/auth-url",
    sage: "/api/connectors/sage/auth-url",
    monday: "/api/connectors/monday/auth-url",
    asana: "/api/connectors/asana/auth-url",
    jira: "/api/connectors/jira/auth-url",
  };

  const preAuthProviders: Record<string, { label: string; placeholder: string; paramName: string }> = {
    shopify: { label: "Shopify store domain", placeholder: "mystore.myshopify.com", paramName: "store_domain" },
    zendesk: { label: "Zendesk subdomain", placeholder: "yourcompany", paramName: "subdomain" },
  };

  const handleConnect = async (providerId: string) => {
    const authRoute = authRoutes[providerId];
    if (!authRoute) {
      const provider = providers.find(p => p.id === providerId);
      if (provider && provider.configSchema?.length > 0) {
        const fields = (provider.configSchema ?? [])
          .filter((f: any) => ["text", "password", "url"].includes(f.type))
          .map((f: any) => ({ key: f.key, label: f.label, type: f.type, required: f.required ?? true, placeholder: f.placeholder }));
        if (fields.length > 0) {
          setSettingsConfigModal({
            providerId: provider.id,
            providerName: provider.name || providerId,
            fields,
          });
          return;
        }
      }
      toast("This integration isn\u2019t available for self-service connection yet.", "info");
      return;
    }

    const preAuth = preAuthProviders[providerId];
    if (preAuth) {
      setPreAuthModal({ providerId, ...preAuth });
      setPreAuthInput("");
      return;
    }

    await startOAuthFlow(authRoute);
  };

  const handlePreAuthSubmit = async () => {
    if (!preAuthModal || !preAuthInput.trim()) return;
    setPreAuthLoading(true);
    const authRoute = authRoutes[preAuthModal.providerId];
    const sep = authRoute.includes("?") ? "&" : "?";
    await startOAuthFlow(`${authRoute}${sep}${preAuthModal.paramName}=${encodeURIComponent(preAuthInput.trim())}`);
    setPreAuthLoading(false);
    setPreAuthModal(null);
  };

  const startOAuthFlow = async (url: string) => {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        toast(err.error || "Failed to start connection", "error");
        return;
      }
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast("Failed to get authorization URL", "error");
      }
    } catch (err) {
      toast("Failed to start connection", "error");
    }
  };

  const isAuthError = (lastError: string | null | undefined) => {
    if (!lastError) return false;
    const lower = lastError.toLowerCase();
    return lower.includes("401") || lower.includes("403") || lower.includes("unauthorized") || lower.includes("forbidden");
  };

  const healthBorderColor = (healthStatus: string | undefined) => {
    if (healthStatus === "error" || healthStatus === "disconnected") return "border-red-500/30";
    if (healthStatus === "degraded") return "border-amber-500/30";
    return "border-border";
  };

  return (
    <div className="space-y-8">
      {/* ── Section 1: Your Connections ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-foreground">Your Connections</h2>
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
                  }
                } catch { /* ignore */ }
                setSyncingAll(false);
              }}
            >
              {syncingAll ? "Syncing..." : "Sync All"}
            </Button>
          )}
        </div>

        {syncAllResult && (
          <div className="bg-hover rounded-lg px-4 py-3 space-y-1">
            <p className="text-xs text-[var(--fg2)]">
              Synced {syncAllResult.synced.length} connector{syncAllResult.synced.length !== 1 ? "s" : ""}.
              {syncAllResult.errors.length > 0 && (
                <span className="text-danger"> {syncAllResult.errors.length} error{syncAllResult.errors.length !== 1 ? "s" : ""}.</span>
              )}
            </p>
          </div>
        )}

        {connectors.length === 0 && (
          <div className="wf-soft p-5 text-center">
            <p className="text-sm text-[var(--fg3)]">No connections yet. Connect your tools below.</p>
          </div>
        )}

        {connectors.map((c) => {
          const isDisconnected = c.healthStatus === "disconnected";
          const isError = c.healthStatus === "error";
          const isDegraded = c.healthStatus === "degraded";
          const isHealthy = c.healthStatus === "healthy";
          const authRelated = isError && isAuthError(c.lastError);
          const isGoogleSheets = c.provider === "google-sheets";
          const sheetCount = c.spreadsheetCount || 0;
          const isExpanded = expandedConnector === c.id;
          const sheets = sheetsByConnector[c.id] || [];

          return (
            <div
              key={c.id}
              className={`wf-soft p-4 space-y-3 border ${healthBorderColor(c.healthStatus)}`}
            >
              {/* Card header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ConnectorLogo provider={c.provider} size={24} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {isGoogleSheets && sheetCount > 0
                          ? `Google Sheets — ${sheetCount} spreadsheet${sheetCount !== 1 ? "s" : ""}`
                          : c.name || c.providerName}
                      </span>
                      <span className={`w-2 h-2 rounded-full ${
                        isHealthy ? "bg-emerald-400"
                        : isDegraded ? "bg-amber-400"
                        : isError || isDisconnected ? "bg-red-400"
                        : "bg-[var(--fg3)]"
                      }`} />
                    </div>
                    <div className="text-[12px] text-[var(--fg3)]">
                      {c.providerName}
                      {c.lastSyncAt && <> &middot; {t("connections.lastSynced", { time: formatRelativeTime(c.lastSyncAt, locale) })}</>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isHealthy && (
                    <button
                      onClick={() => handleSync(c.id)}
                      disabled={syncingId === c.id}
                      className="text-[12px] text-accent hover:underline"
                    >
                      {syncingId === c.id ? "Syncing..." : "Sync"}
                    </button>
                  )}
                  {isGoogleSheets && (
                    <button
                      className="text-[12px] text-accent hover:underline"
                      onClick={async () => {
                        if (isExpanded) { setExpandedConnector(null); return; }
                        setExpandedConnector(c.id);
                        if (!sheetsByConnector[c.id]) {
                          const res = await fetch(`/api/connectors/${c.id}`);
                          if (res.ok) {
                            const data = await res.json();
                            setSheetsByConnector(prev => ({ ...prev, [c.id]: (data.config?.spreadsheets || []) as SheetEntry2[] }));
                          }
                        }
                      }}
                    >
                      {isExpanded ? "Close" : "Manage Sheets"}
                    </button>
                  )}
                  <button
                    onClick={() => handleRemove(c.id, c.name || c.providerName)}
                    className="text-[12px] text-danger/60 hover:text-danger hover:underline"
                  >
                    Remove
                  </button>
                </div>
              </div>

              {/* ── Error state: disconnected ── */}
              {isDisconnected && (
                <div className="rounded-lg p-3 space-y-2" style={{ background: "rgba(239, 68, 68, 0.05)" }}>
                  <p className="text-[13px] text-danger font-medium">Connection lost — your authorization has expired.</p>
                  <p className="text-[12px] text-[var(--fg2)]">Reconnect to re-authorize Qorpera&apos;s access to {c.providerName}.</p>
                  {isAdmin && (
                    <button onClick={() => handleReconnect(c.id)} className="rounded-lg text-[12px] font-medium px-4 py-1.5 bg-danger text-white">
                      Reconnect
                    </button>
                  )}
                </div>
              )}

              {/* ── Error state: sync failing ── */}
              {isError && !isDisconnected && (
                <div className="rounded-lg p-3 space-y-2" style={{ background: "rgba(239, 68, 68, 0.05)" }}>
                  <p className="text-[13px] text-danger font-medium">
                    Sync failing{c.lastError ? ` — ${c.lastError.length > 80 ? c.lastError.slice(0, 80) + "..." : c.lastError}` : ""}
                  </p>
                  <p className="text-[12px] text-[var(--fg2)]">
                    {authRelated
                      ? "This looks like an authorization issue. Reconnect to re-authorize access."
                      : `This usually means a temporary issue with ${c.providerName}. Try syncing again.`}
                  </p>
                  {isAdmin && (
                    <div className="flex items-center gap-3">
                      {authRelated ? (
                        <>
                          <button onClick={() => handleReconnect(c.id)} className="rounded-lg text-[12px] font-medium px-4 py-1.5 bg-danger text-white">Reconnect</button>
                          <button onClick={() => handleSync(c.id)} disabled={syncingId === c.id} className="text-[12px] text-[var(--fg2)] hover:underline">Retry Sync</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => handleSync(c.id)} disabled={syncingId === c.id} className="rounded-lg text-[12px] font-medium px-4 py-1.5 bg-danger text-white">
                            {syncingId === c.id ? "Retrying..." : "Retry Sync"}
                          </button>
                          <button onClick={() => handleReconnect(c.id)} className="text-[12px] text-[var(--fg2)] hover:underline">Reconnect</button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── Degraded state ── */}
              {isDegraded && (
                <div className="rounded-lg p-3 space-y-2" style={{ background: "rgba(245, 158, 11, 0.05)" }}>
                  <p className="text-[13px] text-warn font-medium">Experiencing sync issues — retrying automatically.</p>
                  <p className="text-[12px] text-[var(--fg2)]">If this persists, try a manual sync or reconnect.</p>
                  {isAdmin && (
                    <button onClick={() => handleSync(c.id)} disabled={syncingId === c.id} className="text-[12px] text-accent hover:underline">
                      {syncingId === c.id ? "Syncing..." : "Sync Now"}
                    </button>
                  )}
                </div>
              )}

              {/* ── Slack channel mapping ── */}
              {c.provider === "slack" && (isHealthy || isDegraded) && (
                <SlackMappingPanel
                  connectorId={c.id}
                  slackMappingExpanded={slackMappingExpanded}
                  setSlackMappingExpanded={setSlackMappingExpanded}
                  slackMappings={slackMappings}
                  setSlackMappings={setSlackMappings}
                  slackChannels={slackChannels}
                  setSlackChannels={setSlackChannels}
                  addingMapping={addingMapping}
                  setAddingMapping={setAddingMapping}
                  teamDomains={teamDomains}
                  setTeamDomains={setTeamDomains}
                />
              )}

              {/* ── Google Sheets picker ── */}
              {isGoogleSheets && isExpanded && (
                <GoogleSheetsPanel
                  connectorId={c.id}
                  sheets={sheets}
                  sheetsByConnector={sheetsByConnector}
                  setSheetsByConnector={setSheetsByConnector}
                  savingSheets={savingSheets}
                  setSavingSheets={setSavingSheets}
                  manualSheetUrl={manualSheetUrl}
                  setManualSheetUrl={setManualSheetUrl}
                  loadConnectors={loadConnectors}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* ── Section 2: Available Integrations ── */}
      {Object.keys(grouped).length > 0 && (
        <div className="space-y-5">
          <div className="pt-4" style={{ borderTop: "1px solid var(--border)" }}>
            <h2 className="text-[15px] font-semibold text-foreground">Available Integrations</h2>
            <p className="text-[12px] text-[var(--fg3)] mt-1">Connect your business tools to give Qorpera visibility across your organization.</p>
          </div>

          {CATEGORY_ORDER.filter((cat) => grouped[cat]).map((cat) => (
            <div key={cat} className="space-y-3">
              <h3 className="text-[13px] font-medium text-[var(--fg2)]">{CATEGORY_LABELS[cat]}</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {grouped[cat].map((p) => {
                  const isTier1 = TIER1_PROVIDERS.has(p.id);
                  return (
                    <div
                      key={p.id}
                      className={`wf-soft p-4 flex items-start gap-3 ${!p.configured ? "opacity-60" : ""} ${isTier1 ? "border-accent/20" : ""}`}
                    >
                      <div className="mt-0.5 shrink-0">
                        <ConnectorLogo provider={p.id} size={28} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[14px] font-medium text-foreground">{p.name}</span>
                          {isTier1 && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-accent/10 text-accent">Recommended</span>}
                        </div>
                        <p className="text-[12px] text-[var(--fg2)] mt-0.5">{p.description}</p>
                        {p.scopes.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {p.scopes.map((s) => (
                              <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-hover text-[var(--fg3)]">{s}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0">
                        {p.configured ? (
                          <button
                            onClick={() => handleConnect(p.id)}
                            className="rounded-lg text-[12px] font-medium px-4 py-1.5 transition-all hover:opacity-80"
                            style={{ background: "rgba(255,255,255,0.9)", color: "#000" }}
                          >
                            Connect
                          </button>
                        ) : (
                          <span className="text-[11px] text-[var(--fg3)]">Requires configuration</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Config-Form Connector Modal ── */}
      {settingsConfigModal && (
        <ConnectorConfigModal
          providerId={settingsConfigModal.providerId}
          providerName={settingsConfigModal.providerName}
          fields={settingsConfigModal.fields}
          onClose={() => setSettingsConfigModal(null)}
          onConnected={() => {
            setSettingsConfigModal(null);
            loadConnectors();
            toast("Connected successfully!", "success");
          }}
        />
      )}

      {/* ── Pre-Auth Input Modal (Shopify domain, Zendesk subdomain, etc.) ── */}
      {preAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }}>
          <div className="wf-soft p-6 w-[420px] space-y-4" style={{ background: "var(--elevated)" }}>
            <div className="flex items-center justify-between">
              <div className="text-[15px] font-semibold text-foreground">{preAuthModal.label}</div>
              <button onClick={() => setPreAuthModal(null)} className="text-[var(--fg3)] hover:text-foreground text-lg">&times;</button>
            </div>
            <input
              type="text"
              placeholder={preAuthModal.placeholder}
              value={preAuthInput}
              onChange={(e) => setPreAuthInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handlePreAuthSubmit()}
              autoFocus
              className="w-full rounded-lg px-3 py-2 text-[13px] bg-hover border border-border text-foreground"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPreAuthModal(null)}
                className="rounded-lg text-[13px] font-medium px-4 py-2 text-[var(--fg2)] hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handlePreAuthSubmit}
                disabled={preAuthLoading || !preAuthInput.trim()}
                className="rounded-lg text-[13px] font-medium px-5 py-2 disabled:opacity-50"
                style={{ background: "rgba(255,255,255,0.9)", color: "#000" }}
              >
                {preAuthLoading ? "Connecting..." : "Connect"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-panels extracted for readability ──────────────────────────────────────

function SlackMappingPanel({
  connectorId, slackMappingExpanded, setSlackMappingExpanded,
  slackMappings, setSlackMappings, slackChannels, setSlackChannels,
  addingMapping, setAddingMapping, teamDomains, setTeamDomains,
}: {
  connectorId: string;
  slackMappingExpanded: string | null;
  setSlackMappingExpanded: (v: string | null) => void;
  slackMappings: Record<string, ChannelMapping2[]>;
  setSlackMappings: (fn: (prev: Record<string, ChannelMapping2[]>) => Record<string, ChannelMapping2[]>) => void;
  slackChannels: Record<string, SlackChannel2[]>;
  setSlackChannels: (fn: (prev: Record<string, SlackChannel2[]>) => Record<string, SlackChannel2[]>) => void;
  addingMapping: { connectorId: string; channelId: string; channelName: string; domainId: string } | null;
  setAddingMapping: (v: { connectorId: string; channelId: string; channelName: string; domainId: string } | null) => void;
  teamDomains: TeamDept2[];
  setTeamDomains: (v: TeamDept2[]) => void;
}) {
  const t = useTranslations("settings");
  const isExpanded = slackMappingExpanded === connectorId;

  return (
    <div>
      <button
        className="flex items-center gap-1.5 text-xs transition-colors hover:text-[var(--fg2)]"
        style={{ color: "#585858" }}
        onClick={async () => {
          if (isExpanded) { setSlackMappingExpanded(null); return; }
          setSlackMappingExpanded(connectorId);
          if (!slackMappings[connectorId]) {
            try {
              const res = await fetch(`/api/connectors/${connectorId}/channel-mappings`);
              if (res.ok) {
                const data = await res.json();
                setSlackMappings(prev => ({ ...prev, [connectorId]: data.mappings || [] }));
                setSlackChannels(prev => ({ ...prev, [connectorId]: data.availableChannels || [] }));
              }
            } catch { /* ignore */ }
          }
          if (teamDomains.length === 0) {
            try {
              const dRes = await fetch("/api/domains");
              if (dRes.ok) {
                const dData = await dRes.json();
                setTeamDomains(Array.isArray(dData) ? dData : []);
              }
            } catch { /* ignore */ }
          }
        }}
      >
        <svg className={`w-3 h-3 transition-transform ${isExpanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        {t("connections.channelMapping")}
      </button>
      {isExpanded && (
        <div className="mt-2 bg-hover rounded-lg p-4 space-y-3 border border-border">
          <p className="text-xs text-[var(--fg2)]">{t("connections.channelMappingHint")}</p>
          {(slackMappings[connectorId] || []).length === 0 && !addingMapping && (
            <p className="text-xs text-[var(--fg3)] italic">{t("connections.noChannelsMapped")}</p>
          )}
          <div className="space-y-1.5">
            {(slackMappings[connectorId] || []).map((m) => (
              <div key={m.channelId} className="flex items-center gap-2 py-1">
                <span className="text-sm text-[var(--fg2)] font-medium" style={{ minWidth: 120 }}>#{m.channelName}</span>
                <span className="text-xs text-[var(--fg3)]">&rarr;</span>
                <span className="text-sm text-[var(--fg2)] flex-1">{m.department.displayName}</span>
                <button
                  className="text-xs text-danger/60 hover:text-danger transition-colors"
                  onClick={async () => {
                    const res = await fetch(`/api/connectors/${connectorId}/channel-mappings`, {
                      method: "DELETE",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ channelId: m.channelId }),
                    });
                    if (res.ok) {
                      setSlackMappings(prev => ({
                        ...prev,
                        [connectorId]: (prev[connectorId] || []).filter(x => x.channelId !== m.channelId),
                      }));
                    }
                  }}
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
          {addingMapping?.connectorId === connectorId ? (
            <div className="flex items-center gap-2">
              <select
                className="flex-1 bg-hover border border-border rounded px-2 py-1.5 text-sm text-foreground"
                value={addingMapping.channelId}
                onChange={(e) => {
                  const ch = (slackChannels[connectorId] || []).find(x => x.id === e.target.value);
                  setAddingMapping({ ...addingMapping, channelId: e.target.value, channelName: ch?.name || "" });
                }}
              >
                <option value="">{t("connections.selectChannel")}</option>
                {(slackChannels[connectorId] || [])
                  .filter(ch => !(slackMappings[connectorId] || []).some(m => m.channelId === ch.id))
                  .map(ch => (<option key={ch.id} value={ch.id}>#{ch.name}</option>))}
              </select>
              <span className="text-xs text-[var(--fg3)]">&rarr;</span>
              <select
                className="flex-1 bg-hover border border-border rounded px-2 py-1.5 text-sm text-foreground"
                value={addingMapping.domainId}
                onChange={(e) => setAddingMapping({ ...addingMapping, domainId: e.target.value })}
              >
                <option value="">{t("connections.selectDepartment")}</option>
                {teamDomains.map(d => (<option key={d.id} value={d.id}>{d.displayName}</option>))}
              </select>
              <button
                className="text-xs font-medium px-2.5 py-1.5 rounded bg-accent text-white disabled:opacity-40"
                disabled={!addingMapping.channelId || !addingMapping.domainId}
                onClick={async () => {
                  const res = await fetch(`/api/connectors/${connectorId}/channel-mappings`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ channelId: addingMapping.channelId, channelName: addingMapping.channelName, domainId: addingMapping.domainId }),
                  });
                  if (res.ok) {
                    const created = await res.json();
                    setSlackMappings(prev => ({ ...prev, [connectorId]: [...(prev[connectorId] || []), created] }));
                    setAddingMapping(null);
                  }
                }}
              >
                {t("connections.save")}
              </button>
              <button className="text-xs text-[var(--fg2)]" onClick={() => setAddingMapping(null)}>{t("connections.cancel")}</button>
            </div>
          ) : (
            <button
              className="text-xs text-accent hover:text-accent"
              onClick={() => setAddingMapping({ connectorId, channelId: "", channelName: "", domainId: "" })}
            >
              + {t("connections.addChannelMapping")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function GoogleSheetsPanel({
  connectorId, sheets, sheetsByConnector, setSheetsByConnector,
  savingSheets, setSavingSheets, manualSheetUrl, setManualSheetUrl, loadConnectors,
}: {
  connectorId: string;
  sheets: SheetEntry2[];
  sheetsByConnector: Record<string, SheetEntry2[]>;
  setSheetsByConnector: (fn: (prev: Record<string, SheetEntry2[]>) => Record<string, SheetEntry2[]>) => void;
  savingSheets: string | null;
  setSavingSheets: (v: string | null) => void;
  manualSheetUrl: string;
  setManualSheetUrl: (v: string) => void;
  loadConnectors: () => void;
}) {
  const { toast } = useToast();

  return (
    <div className="bg-hover rounded-lg p-4 space-y-3 border border-border">
      {sheets.length > 0 ? (
        <>
          <p className="text-xs text-[var(--fg2)]">{sheets.length} spreadsheet{sheets.length !== 1 ? "s" : ""} found from the last 30 days</p>
          <div className="space-y-1.5 max-h-60 overflow-y-auto">
            {sheets.map((sheet) => (
              <label key={sheet.id} className="flex items-center gap-2.5 py-1 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={sheet.selected}
                  onChange={() => {
                    setSheetsByConnector(prev => ({
                      ...prev,
                      [connectorId]: (prev[connectorId] || []).map(s => s.id === sheet.id ? { ...s, selected: !s.selected } : s),
                    }));
                  }}
                  className="rounded border-border-strong bg-hover text-accent"
                />
                <span className="text-sm text-[var(--fg2)] group-hover:text-foreground transition truncate">{sheet.name}</span>
                <span className="text-[10px] text-[var(--fg3)] ml-auto shrink-0 font-mono">{sheet.id.slice(0, 12)}...</span>
              </label>
            ))}
          </div>
          <Button
            variant="primary"
            size="sm"
            disabled={savingSheets === connectorId}
            onClick={async () => {
              setSavingSheets(connectorId);
              try {
                await fetch(`/api/connectors/${connectorId}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ spreadsheets: sheetsByConnector[connectorId] }),
                });
                toast("Spreadsheet selection saved", "success");
                loadConnectors();
              } catch { toast("Failed to save", "error"); }
              setSavingSheets(null);
            }}
          >
            {savingSheets === connectorId ? "Saving..." : `Save (${(sheetsByConnector[connectorId] || []).filter(s => s.selected).length} selected)`}
          </Button>
        </>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-[var(--fg2)]">No recently modified spreadsheets found. Add one manually:</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={manualSheetUrl}
              onChange={(e) => setManualSheetUrl(e.target.value)}
              placeholder="Paste Google Sheets URL or ID"
              className="flex-1 bg-hover border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-[var(--fg3)]"
            />
            <Button
              variant="primary"
              size="sm"
              disabled={!manualSheetUrl.trim() || savingSheets === connectorId}
              onClick={async () => {
                setSavingSheets(connectorId);
                const idMatch = manualSheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
                const sheetId = idMatch ? idMatch[1] : manualSheetUrl.trim();
                try {
                  await fetch(`/api/connectors/${connectorId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ spreadsheet_ids: [sheetId], spreadsheets: [{ id: sheetId, name: "Manual", selected: true }] }),
                  });
                  toast("Spreadsheet added", "success");
                  setManualSheetUrl("");
                  loadConnectors();
                } catch { toast("Failed", "error"); }
                setSavingSheets(null);
              }}
            >
              Add
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
