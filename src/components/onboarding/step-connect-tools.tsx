"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

/* ------------------------------------------------------------------ */
/*  Connector config                                                    */
/* ------------------------------------------------------------------ */

interface ConnectorCategory {
  labelKey: string;
  items: ConnectorDef[];
}

interface ConnectorDef {
  id: string;
  label: string;
  color: string;
  authEndpoint: string;
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
];

const GOOGLE_WORKSPACE_PROVIDERS = ["google-gmail", "google-drive", "google-calendar", "google-sheets", "google"];
const MICROSOFT_PROVIDERS = ["microsoft-365", "microsoft"];

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

type Connector = {
  id: string;
  provider: string;
  name: string;
  status: string;
  userId?: string | null;
};

interface StepConnectToolsProps {
  onContinue: () => void;
  onBack: () => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                           */
/* ------------------------------------------------------------------ */

export function StepConnectTools({ onContinue, onBack }: StepConnectToolsProps) {
  const t = useTranslations("onboarding.connectTools");
  const tc = useTranslations("common");
  const searchParams = useSearchParams();
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);

  const loadConnectors = useCallback(async () => {
    const res = await fetch("/api/connectors");
    if (res.ok) {
      const data = await res.json();
      setConnectors(data.connectors || []);
    }
  }, []);

  useEffect(() => {
    loadConnectors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Detect OAuth return
  useEffect(() => {
    const allProviders = [
      "workspace", "google", "microsoft", "slack", "hubspot", "stripe",
      "google-ads", "shopify", "linkedin", "meta-ads",
      "pipedrive", "salesforce", "intercom", "zendesk",
    ];
    const connected = allProviders.some(p => searchParams.get(p) === "connected");
    if (!connected) return;

    (async () => {
      await loadConnectors();
      window.history.replaceState({}, "", "/onboarding");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const activeConnectors = connectors.filter(c => c.status !== "error" && c.status !== "disconnected");

  function isGoogleWorkspaceConnected() {
    return GOOGLE_WORKSPACE_PROVIDERS.some(p => activeConnectors.some(c => c.provider === p));
  }

  function isMicrosoftConnected() {
    return MICROSOFT_PROVIDERS.some(p => activeConnectors.some(c => c.provider === p));
  }

  function isProviderConnected(providerId: string) {
    return activeConnectors.some(c => c.provider === providerId);
  }

  const totalConnected = new Set(activeConnectors.map(c => c.provider)).size;

  async function handleConnectGoogleWorkspace() {
    setConnecting("google-workspace");
    try {
      const res = await fetch("/api/connectors/google-workspace/auth-url", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } finally {
      setConnecting(null);
    }
  }

  async function handleConnectMicrosoft() {
    setConnecting("microsoft");
    try {
      const res = await fetch("/api/connectors/microsoft/auth?from=onboarding");
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } finally {
      setConnecting(null);
    }
  }

  async function handleConnectTier2(def: ConnectorDef) {
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

  async function handleContinue() {
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

  function getConfidenceMessage() {
    if (totalConnected >= 6) return t("confidence6", { count: totalConnected });
    if (totalConnected >= 3) return t("confidence3", { count: totalConnected });
    if (totalConnected >= 1) return t("confidence1", { count: totalConnected });
    return null;
  }

  const googleConnected = isGoogleWorkspaceConnected();
  const microsoftConnected = isMicrosoftConnected();
  const showNudge = totalConnected <= 1 && !googleConnected && !microsoftConnected;

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <p className="text-xs text-[var(--fg3)] uppercase tracking-wider">Step 2 of 4</p>
        <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
        <p className="text-sm text-[var(--fg2)]">{t("subtitle")}</p>
      </div>

      {/* Tier 1 — Workspace */}
      <div className="space-y-3">
        <h2 className="text-xs text-[var(--fg2)] uppercase tracking-wider px-1">{t("workspace")}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Google Workspace */}
          <WorkspaceCard
            name={t("googleWorkspace")}
            subtitle={t("googleSubtitle")}
            connected={googleConnected}
            connectedLabel={t("toolsConnected", { count: 4 })}
            connecting={connecting === "google-workspace"}
            connectLabel={t("connect")}
            connectingLabel={t("connecting")}
            connectedTextLabel={t("connected")}
            color="#4285f4"
            icon={<GoogleIcon />}
            onConnect={handleConnectGoogleWorkspace}
          />
          {/* Microsoft 365 */}
          <WorkspaceCard
            name={t("microsoft365")}
            subtitle={t("microsoftSubtitle")}
            connected={microsoftConnected}
            connectedLabel={t("toolsConnected", { count: 4 })}
            connecting={connecting === "microsoft"}
            connectLabel={t("connect")}
            connectingLabel={t("connecting")}
            connectedTextLabel={t("connected")}
            color="#00a4ef"
            icon={<MicrosoftIcon />}
            onConnect={handleConnectMicrosoft}
          />
        </div>
      </div>

      {/* Tier 2 — Business Tools */}
      <div className="space-y-3">
        <h2 className="text-xs text-[var(--fg2)] uppercase tracking-wider px-1">{t("businessTools")}</h2>
        {TIER2_CATEGORIES.map(cat => (
          <div key={cat.labelKey}>
            <div className="text-[11px] text-[var(--fg3)] uppercase tracking-wider px-1 mb-2">{t(cat.labelKey)}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {cat.items.map(item => (
                <Tier2Card
                  key={item.id}
                  def={item}
                  connected={isProviderConnected(item.id)}
                  connecting={connecting === item.id}
                  connectLabel={t("connect")}
                  connectedLabel={t("connected")}
                  onConnect={() => handleConnectTier2(item)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Confidence indicator */}
      {totalConnected > 0 && (
        <div className="flex items-center gap-2 px-1">
          <div className={`w-2 h-2 rounded-full ${totalConnected >= 6 ? "bg-ok" : totalConnected >= 3 ? "bg-ok/70" : "bg-warn"}`} />
          <span className="text-xs text-[var(--fg2)]">{getConfidenceMessage()}</span>
        </div>
      )}

      {/* Nudge */}
      {showNudge && (
        <p className="text-xs text-warn/70 text-center px-4">
          {t("nudge")}
        </p>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={onBack}
          className="text-sm text-[var(--fg2)] hover:text-foreground transition min-h-[44px]"
        >
          &larr; {tc("back")}
        </button>
        <Button variant="primary" size="md" onClick={handleContinue} disabled={advancing} className="min-h-[44px]">
          {advancing ? tc("saving") : tc("continue")}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Workspace card (Tier 1)                                             */
/* ------------------------------------------------------------------ */

function WorkspaceCard({
  name,
  subtitle,
  connected,
  connectedLabel,
  connecting,
  connectLabel,
  connectingLabel,
  connectedTextLabel,
  color,
  icon,
  onConnect,
}: {
  name: string;
  subtitle: string;
  connected: boolean;
  connectedLabel: string;
  connecting: boolean;
  connectLabel: string;
  connectingLabel: string;
  connectedTextLabel: string;
  color: string;
  icon: React.ReactNode;
  onConnect: () => void;
}) {
  return (
    <div className="wf-soft p-5 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}20` }}>
          {icon}
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-foreground">{name}</h3>
          <p className="text-xs text-[var(--fg2)]">{subtitle}</p>
        </div>
      </div>
      {connected ? (
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-ok shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-xs text-ok font-medium">{connectedTextLabel}</span>
          <span className="text-xs text-[var(--fg3)] ml-auto">{connectedLabel}</span>
        </div>
      ) : (
        <button
          onClick={onConnect}
          disabled={connecting}
          className="w-full px-4 py-2.5 rounded-lg border border-border bg-hover text-sm text-[var(--fg2)] hover:bg-skeleton hover:text-foreground transition disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px]"
        >
          {connecting ? (
            <span className="flex items-center justify-center gap-2">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-foreground/30 border-t-foreground" />
              {connectingLabel}
            </span>
          ) : (
            connectLabel
          )}
        </button>
      )}
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
  onConnect,
}: {
  def: ConnectorDef;
  connected: boolean;
  connecting: boolean;
  connectLabel: string;
  connectedLabel: string;
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
      <span className="text-sm text-foreground flex-1 min-w-0 truncate">{def.label}</span>
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
