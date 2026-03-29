"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConnectorConfigModal, type ConfigField } from "@/components/connector-config-modal";
import { GoogleDelegationGuide } from "@/components/onboarding/google-delegation-guide";
import { MicrosoftDelegationGuide } from "@/components/onboarding/microsoft-delegation-guide";

/* ------------------------------------------------------------------ */
/*  Types & constants                                                   */
/* ------------------------------------------------------------------ */

type FlowPhase = "email_input" | "detecting" | "guide_google" | "guide_microsoft" | "unknown_provider" | "connected" | "tier2";

interface ConnectorCategory {
  labelKey: string;
  items: ConnectorDef[];
}

interface ConnectorDef {
  id: string;
  label: string;
  color: string;
  authEndpoint?: string;
  configFields?: ConfigField[];
}

const TIER2_CATEGORIES: ConnectorCategory[] = [
  {
    labelKey: "categoryCommunication",
    items: [
      { id: "slack", label: "Slack", color: "#4A154B", authEndpoint: "/api/connectors/slack/auth-url" },
    ],
  },
  {
    labelKey: "categoryCrm",
    items: [
      { id: "hubspot", label: "HubSpot", color: "#ff7a59", authEndpoint: "/api/connectors/hubspot/auth-url" },
      { id: "pipedrive", label: "Pipedrive", color: "#28292b", authEndpoint: "/api/auth/pipedrive/auth-url" },
      { id: "salesforce", label: "Salesforce", color: "#00a1e0", authEndpoint: "/api/auth/salesforce/auth-url" },
    ],
  },
  {
    labelKey: "categorySupport",
    items: [
      { id: "intercom", label: "Intercom", color: "#286efa", authEndpoint: "/api/auth/intercom/auth-url" },
      { id: "zendesk", label: "Zendesk", color: "#03363d", authEndpoint: "/api/auth/zendesk/auth-url" },
    ],
  },
  {
    labelKey: "categoryAccounting",
    items: [
      { id: "stripe", label: "Stripe", color: "#635bff", authEndpoint: "/api/connectors/stripe/auth-url" },
      { id: "economic", label: "e-conomic", color: "#2E7D32", configFields: [
        { key: "grant_token", label: "Agreement Grant Token", type: "password", required: true, placeholder: "Paste from e-conomic Settings → Apps" },
      ]},
    ],
  },
  {
    labelKey: "categoryCommerce",
    items: [
      { id: "shopify", label: "Shopify", color: "#96bf48", authEndpoint: "/api/connectors/shopify/auth-url" },
    ],
  },
  {
    labelKey: "categoryMarketing",
    items: [
      { id: "google-ads", label: "Google Ads", color: "#4285f4", authEndpoint: "/api/connectors/google-ads/auth" },
      { id: "linkedin", label: "LinkedIn", color: "#0A66C2", authEndpoint: "/api/connectors/linkedin/auth-url" },
      { id: "meta-ads", label: "Meta Ads", color: "#1877F2", authEndpoint: "/api/connectors/meta-ads/auth-url" },
    ],
  },
  {
    labelKey: "categoryErp",
    items: [
      { id: "dynamics-bc", label: "Dynamics 365 BC", color: "#00467F", authEndpoint: "/api/connectors/dynamics-bc/auth-url" },
      { id: "sap-s4hana", label: "SAP S/4HANA", color: "#0070F2", configFields: [
        { key: "host_url", label: "S/4HANA Host URL", type: "url", required: true, placeholder: "https://your-company.s4hana.ondemand.com" },
        { key: "username", label: "Communication User", type: "text", required: true, placeholder: "QORPERA_COMM_USER" },
        { key: "password", label: "Password", type: "password", required: true },
      ]},
      { id: "oracle-erp", label: "Oracle ERP Cloud", color: "#C74634", configFields: [
        { key: "host_url", label: "Oracle Cloud Host URL", type: "url", required: true, placeholder: "https://your-company.oraclecloud.com" },
        { key: "client_id", label: "OAuth Client ID", type: "text", required: true },
        { key: "client_secret", label: "OAuth Client Secret", type: "password", required: true },
      ]},
    ],
  },
  {
    labelKey: "categoryLogistics",
    items: [
      { id: "maersk", label: "Maersk", color: "#42B0D5", configFields: [
        { key: "consumer_key", label: "Consumer Key", type: "text", required: true, placeholder: "From Maersk Developer Portal" },
        { key: "consumer_secret", label: "Consumer Secret", type: "password", required: true },
        { key: "tracking_references", label: "Tracking References", type: "text", required: true, placeholder: "Container numbers, BL numbers (comma-separated)" },
      ]},
      { id: "cargowise", label: "CargoWise", color: "#1B365D", configFields: [
        { key: "endpoint_url", label: "eAdaptor Endpoint URL", type: "url", required: true, placeholder: "https://your-instance.wisegrid.net/eadaptor" },
        { key: "username", label: "eAdaptor Username", type: "text", required: true },
        { key: "password", label: "eAdaptor Password", type: "password", required: true },
      ]},
    ],
  },
];

type Connector = {
  id: string;
  provider: string;
  name: string;
  status: string;
};

/* ------------------------------------------------------------------ */
/*  Component                                                           */
/* ------------------------------------------------------------------ */

interface StepConnectToolsProps {
  onContinue: () => void;
  onBack: () => void;
  demoMode?: boolean;
}

export function StepConnectTools({ onContinue, onBack, demoMode }: StepConnectToolsProps) {
  const t = useTranslations("onboarding.connectTools");
  const tc = useTranslations("common");
  const searchParams = useSearchParams();

  const [phase, setPhase] = useState<FlowPhase>("email_input");
  const [email, setEmail] = useState("");
  const [detectedDomain, setDetectedDomain] = useState("");
  const [connectedUserCount, setConnectedUserCount] = useState(0);
  const [primaryProvider, setPrimaryProvider] = useState<"google" | "microsoft" | null>(null);
  const [secondaryAvailable, setSecondaryAvailable] = useState(false);
  const [secondaryChecked, setSecondaryChecked] = useState(false);
  const [showSecondaryGuide, setShowSecondaryGuide] = useState(false);
  const [secondaryConnected, setSecondaryConnected] = useState(false);
  const [secondaryUserCount, setSecondaryUserCount] = useState(0);
  const [advancing, setAdvancing] = useState(false);

  // Tier 2 state
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [detectedTools, setDetectedTools] = useState<Map<string, number>>(new Map());
  const [detectedCount, setDetectedCount] = useState(0);
  const [demoConnected, setDemoConnected] = useState<Set<string>>(new Set());
  const [demoAnimating, setDemoAnimating] = useState<string | null>(null);
  const [configModal, setConfigModal] = useState<{
    providerId: string;
    providerName: string;
    fields: ConfigField[];
  } | null>(null);

  // Pre-fill email from session
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.user?.email) setEmail(data.user.email);
      })
      .catch(() => {});
  }, []);

  const loadConnectors = useCallback(async () => {
    const res = await fetch("/api/connectors");
    if (res.ok) {
      const data = await res.json();
      setConnectors(data.connectors || []);
    }
  }, []);

  useEffect(() => { loadConnectors(); }, [loadConnectors]);

  // Detect OAuth return for Tier 2
  useEffect(() => {
    const allProviders = [
      "workspace", "google", "microsoft", "slack", "hubspot", "stripe",
      "google-ads", "shopify", "linkedin", "meta-ads",
      "pipedrive", "salesforce", "intercom", "zendesk", "dynamics-bc",
    ];
    const connected = allProviders.some(p => searchParams.get(p) === "connected");
    if (!connected) return;
    (async () => {
      await loadConnectors();
      window.history.replaceState({}, "", "/onboarding");
    })();
  }, [searchParams, loadConnectors]);

  // Demo mode: skip to tier2 after a brief animation
  async function handleDemoDetect() {
    setPhase("detecting");
    await new Promise(r => setTimeout(r, 800));
    setConnectedUserCount(47);
    setPhase("connected");
  }

  async function handleDetect() {
    if (demoMode) { await handleDemoDetect(); return; }

    const domain = email.includes("@") ? email.split("@")[1] : email;
    setDetectedDomain(domain);
    setPhase("detecting");

    try {
      const res = await fetch("/api/connectors/detect-provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      const data = await res.json();

      if (data.provider === "google") setPhase("guide_google");
      else if (data.provider === "microsoft") setPhase("guide_microsoft");
      else setPhase("unknown_provider");
    } catch {
      setPhase("unknown_provider");
    }
  }

  function loadDetectedTools() {
    fetch("/api/connectors/detect-tools")
      .then((r) => r.json())
      .then((data) => {
        const tools = (data.tools || []) as Array<{ provider: string; emailCount: number; alreadyConnected: boolean }>;
        const map = new Map<string, number>();
        let count = 0;
        for (const tool of tools) {
          if (!tool.alreadyConnected) {
            map.set(tool.provider, tool.emailCount);
            count++;
          }
        }
        setDetectedTools(map);
        setDetectedCount(count);
      })
      .catch(() => {});
  }

  function handleDelegationComplete(userCount: number, provider: "google" | "microsoft") {
    setPrimaryProvider(provider);
    setConnectedUserCount(userCount);
    setPhase("connected");
    loadDetectedTools();

    // Check if secondary provider is available
    const secondaryEndpoint = provider === "google"
      ? "/api/connectors/microsoft-365/delegation-info"
      : "/api/connectors/google-workspace/delegation-info";

    fetch(secondaryEndpoint)
      .then((r) => r.json())
      .then((data) => {
        setSecondaryAvailable(!!(data.clientId));
        setSecondaryChecked(true);
      })
      .catch(() => setSecondaryChecked(true));
  }

  function handleSecondaryComplete(userCount: number, _provider: "google" | "microsoft") {
    setSecondaryConnected(true);
    setSecondaryUserCount(userCount);
    setShowSecondaryGuide(false);
  }

  function isProviderConnected(providerId: string) {
    if (demoMode && demoConnected.has(providerId)) return true;
    return connectors.some(c => c.provider === providerId && c.status !== "error" && c.status !== "disconnected");
  }

  async function handleConnectTier2(def: ConnectorDef) {
    if (demoMode) {
      setDemoAnimating(def.id);
      await new Promise(r => setTimeout(r, 500));
      setDemoConnected(prev => new Set([...prev, def.id]));
      setDemoAnimating(null);
      return;
    }
    if (def.configFields) {
      setConfigModal({ providerId: def.id, providerName: def.label, fields: def.configFields });
      return;
    }
    if (def.authEndpoint) {
      setConnecting(def.id);
      try {
        const sep = def.authEndpoint.includes("?") ? "&" : "?";
        const res = await fetch(`${def.authEndpoint}${sep}from=onboarding`);
        const data = await res.json();
        if (data.url) window.location.href = data.url;
      } finally {
        setConnecting(null);
      }
    }
  }

  async function handleConnectGoogleOAuth() {
    if (demoMode) { setPhase("connected"); setConnectedUserCount(4); return; }
    setConnecting("google-workspace");
    try {
      const res = await fetch("/api/connectors/google-workspace/auth-url", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } finally {
      setConnecting(null);
    }
  }

  async function handleConnectMicrosoftOAuth() {
    if (demoMode) { setPhase("connected"); setConnectedUserCount(3); return; }
    setConnecting("microsoft");
    try {
      const res = await fetch("/api/connectors/microsoft/auth?from=onboarding");
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } finally {
      setConnecting(null);
    }
  }

  async function handleContinue() {
    if (demoMode) { onContinue(); return; }
    setAdvancing(true);
    try {
      await fetch("/api/orientation/advance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      onContinue();
    } finally {
      setAdvancing(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <p className="text-xs text-[var(--fg3)] uppercase tracking-wider">Step 2 of 4</p>
        <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
        <p className="text-sm text-[var(--fg2)]">{t("subtitle")}</p>
      </div>

      {/* Phase: Email Input */}
      {phase === "email_input" && (
        <div className="max-w-md mx-auto space-y-4">
          <label className="block text-sm font-medium text-foreground">{t("emailLabel")}</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("emailPlaceholder")}
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && email.includes("@") && handleDetect()}
            className="w-full px-4 py-3 rounded-lg border border-border bg-hover text-sm text-foreground placeholder:text-[var(--fg3)] focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <p className="text-xs text-[var(--fg3)]">{t("emailSubtitle")}</p>
          <Button
            variant="primary"
            size="md"
            onClick={handleDetect}
            disabled={!email.includes("@")}
            className="w-full min-h-[44px]"
          >
            {t("emailContinue")}
          </Button>
        </div>
      )}

      {/* Phase: Detecting */}
      {phase === "detecting" && (
        <div className="flex flex-col items-center gap-3 py-8">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
          <p className="text-sm text-[var(--fg2)]">{t("detecting", { domain: detectedDomain || email.split("@")[1] || "" })}</p>
        </div>
      )}

      {/* Phase: Google Delegation Guide */}
      {phase === "guide_google" && (
        <GoogleDelegationGuide
          adminEmail={email}
          domain={detectedDomain}
          onComplete={handleDelegationComplete}
          onBack={() => setPhase("email_input")}
        />
      )}

      {/* Phase: Microsoft Delegation Guide */}
      {phase === "guide_microsoft" && (
        <MicrosoftDelegationGuide
          adminEmail={email}
          domain={detectedDomain}
          onComplete={handleDelegationComplete}
          onBack={() => setPhase("email_input")}
        />
      )}

      {/* Phase: Unknown Provider */}
      {phase === "unknown_provider" && (
        <div className="space-y-6">
          <div className="wf-soft p-5 text-center space-y-4">
            <p className="text-sm text-[var(--fg2)]">{t("detectedUnknown")}</p>
            <p className="text-xs text-[var(--fg3)]">{t("manualConnect")}</p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={handleConnectGoogleOAuth}
                disabled={connecting === "google-workspace"}
                className="flex items-center gap-2 px-5 py-3 rounded-lg border border-border bg-hover text-sm text-foreground hover:bg-skeleton transition min-h-[44px] disabled:opacity-40"
              >
                <GoogleIcon />
                {t("googleWorkspace")}
              </button>
              <button
                onClick={handleConnectMicrosoftOAuth}
                disabled={connecting === "microsoft"}
                className="flex items-center gap-2 px-5 py-3 rounded-lg border border-border bg-hover text-sm text-foreground hover:bg-skeleton transition min-h-[44px] disabled:opacity-40"
              >
                <MicrosoftIcon />
                {t("microsoft365")}
              </button>
            </div>
          </div>

          {/* Also show Tier 2 */}
          <Tier2Section
            t={t}
            categories={TIER2_CATEGORIES}
            isProviderConnected={isProviderConnected}
            connecting={connecting}
            demoAnimating={demoAnimating}
            onConnect={handleConnectTier2}
          />

          <div className="flex items-center justify-between pt-2">
            <button onClick={() => setPhase("email_input")} className="text-sm text-[var(--fg2)] hover:text-foreground transition min-h-[44px]">
              &larr; {tc("back")}
            </button>
            <Button variant="primary" size="md" onClick={handleContinue} disabled={advancing} className="min-h-[44px]">
              {advancing ? tc("saving") : tc("continue")}
            </Button>
          </div>
        </div>
      )}

      {/* Phase: Connected → Secondary offer → Tier 2 */}
      {(phase === "connected" || phase === "tier2") && (
        <div className="space-y-6">
          {/* Success banner */}
          <div className="wf-soft p-5 flex items-center gap-3">
            <svg className="w-6 h-6 text-ok shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm text-ok font-medium">
              {secondaryConnected
                ? t("connectedBoth", { count: connectedUserCount + secondaryUserCount })
                : t("connectedCount", { count: connectedUserCount })}
            </span>
          </div>

          {/* Secondary provider offer */}
          {secondaryChecked && secondaryAvailable && !secondaryConnected && !showSecondaryGuide && (
            <div className="wf-soft p-5 space-y-3">
              <h3 className="text-sm font-medium text-foreground">
                {primaryProvider === "google" ? t("alsoUseMicrosoft") : t("alsoUseGoogle")}
              </h3>
              <p className="text-xs text-[var(--fg2)]">
                {primaryProvider === "google" ? t("alsoUseSubtitleMs") : t("alsoUseSubtitleGoogle")}
              </p>
              <div className="flex items-center gap-3">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setShowSecondaryGuide(true)}
                  className="min-h-[44px]"
                >
                  {t("setupSecondary", { provider: primaryProvider === "google" ? "Microsoft 365" : "Google Workspace" })}
                </Button>
                <button
                  onClick={() => setSecondaryAvailable(false)}
                  className="text-sm text-[var(--fg2)] hover:text-foreground transition min-h-[44px] px-3"
                >
                  {t("skipSecondary")}
                </button>
              </div>
            </div>
          )}

          {/* Secondary delegation guide (inline) */}
          {showSecondaryGuide && primaryProvider === "google" && (
            <MicrosoftDelegationGuide
              adminEmail={email}
              domain={detectedDomain}
              onComplete={handleSecondaryComplete}
              onBack={() => setShowSecondaryGuide(false)}
            />
          )}
          {showSecondaryGuide && primaryProvider === "microsoft" && (
            <GoogleDelegationGuide
              adminEmail={email}
              domain={detectedDomain}
              onComplete={handleSecondaryComplete}
              onBack={() => setShowSecondaryGuide(false)}
            />
          )}

          {/* Tier 2 tools (show when not in secondary guide) */}
          {!showSecondaryGuide && (
            <>
              <div className="space-y-2">
                <h2 className="text-sm font-medium text-foreground">{t("additionalTools")}</h2>
                <p className="text-xs text-[var(--fg3)]">
                  {detectedCount > 0
                    ? t("detectedSummary", { count: detectedCount })
                    : t("detectedNone")}
                </p>
              </div>

              <Tier2Section
                t={t}
                categories={TIER2_CATEGORIES}
                isProviderConnected={isProviderConnected}
                connecting={connecting}
                demoAnimating={demoAnimating}
                onConnect={handleConnectTier2}
                detectedTools={detectedTools.size > 0 ? detectedTools : undefined}
              />

              <div className="flex items-center justify-end pt-2">
                <Button variant="primary" size="md" onClick={handleContinue} disabled={advancing} className="min-h-[44px]">
                  {advancing ? tc("saving") : tc("continue")}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Phase: Back button for email input */}
      {phase === "email_input" && (
        <div className="flex items-center justify-between">
          <button onClick={onBack} className="text-sm text-[var(--fg2)] hover:text-foreground transition min-h-[44px]">
            &larr; {tc("back")}
          </button>
          <div />
        </div>
      )}

      {configModal && (
        <ConnectorConfigModal
          providerId={configModal.providerId}
          providerName={configModal.providerName}
          fields={configModal.fields}
          onClose={() => setConfigModal(null)}
          onConnected={() => {
            setConfigModal(null);
            loadConnectors();
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tier 2 section                                                      */
/* ------------------------------------------------------------------ */

function Tier2Section({
  t,
  categories,
  isProviderConnected,
  connecting,
  demoAnimating,
  onConnect,
  detectedTools,
}: {
  t: ReturnType<typeof useTranslations>;
  categories: ConnectorCategory[];
  isProviderConnected: (id: string) => boolean;
  connecting: string | null;
  demoAnimating: string | null;
  onConnect: (def: ConnectorDef) => void;
  detectedTools?: Map<string, number>;
}) {
  return (
    <div className="space-y-3">
      {categories.map(cat => {
        // Sort detected tools to the top of their category
        const items = detectedTools
          ? [...cat.items].sort((a, b) => {
              const aDetected = detectedTools.has(a.id) ? 1 : 0;
              const bDetected = detectedTools.has(b.id) ? 1 : 0;
              return bDetected - aDetected;
            })
          : cat.items;
        return (
        <div key={cat.labelKey}>
          <div className="text-[11px] text-[var(--fg3)] uppercase tracking-wider px-1 mb-2">{t(cat.labelKey)}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {items.map(item => (
              <Tier2Card
                key={item.id}
                def={item}
                connected={isProviderConnected(item.id)}
                connecting={connecting === item.id || demoAnimating === item.id}
                connectLabel={t("connect")}
                connectedLabel={t("connected")}
                detectedLabel={detectedTools?.has(item.id) ? t("detectedInEmail", { count: detectedTools.get(item.id)! }) : undefined}
                onConnect={() => onConnect(item)}
              />
            ))}
          </div>
        </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tier 2 card                                                         */
/* ------------------------------------------------------------------ */

function Tier2Card({
  def,
  connected,
  connecting,
  connectLabel,
  connectedLabel,
  detectedLabel,
  onConnect,
}: {
  def: ConnectorDef;
  connected: boolean;
  connecting: boolean;
  connectLabel: string;
  connectedLabel: string;
  detectedLabel?: string;
  onConnect: () => void;
}) {
  return (
    <div className="wf-soft px-4 py-3 flex items-center gap-3">
      <span
        className="w-6 h-6 rounded flex items-center justify-center text-[9px] font-bold text-foreground shrink-0"
        style={{ backgroundColor: def.color }}
      >
        {def.label.slice(0, 2).toUpperCase()}
      </span>
      <div className="flex-1 min-w-0">
        <span className="text-sm text-foreground truncate block">{def.label}</span>
        {detectedLabel && !connected && (
          <span className="text-[10px] text-warn/80 bg-warn/10 px-1.5 py-0.5 rounded inline-block mt-0.5">
            {detectedLabel}
          </span>
        )}
      </div>
      {connected ? (
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs text-ok">{connectedLabel}</span>
          <svg className="w-3 h-3 text-ok" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      ) : (
        <button
          onClick={onConnect}
          disabled={connecting}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-hover text-xs text-[var(--fg2)] hover:bg-skeleton hover:text-foreground transition disabled:opacity-40 min-h-[44px]"
        >
          {connecting ? (
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-foreground/30 border-t-foreground" />
          ) : (
            connectLabel
          )}
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Icons                                                               */
/* ------------------------------------------------------------------ */

function GoogleIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 21 21" fill="none">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}
