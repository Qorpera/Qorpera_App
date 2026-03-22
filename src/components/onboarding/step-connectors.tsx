"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { Provider } from "./types";

/* ------------------------------------------------------------------ */
/*  Connector category grouping                                        */
/* ------------------------------------------------------------------ */

const PERSONAL_PROVIDERS = [
  "google", "google-sheets", "microsoft",
];

const COMPANY_PROVIDERS = [
  "hubspot", "stripe", "slack", "economic",
  "google-ads", "shopify", "linkedin", "meta-ads",
  "pipedrive", "salesforce", "intercom", "zendesk",
];

const PROVIDER_COLORS: Record<string, string> = {
  hubspot: "#ff7a59",
  stripe: "#635bff",
  slack: "#4A154B",
  economic: "#1e3a5f",
  "google-ads": "#4285f4",
  shopify: "#96bf48",
  linkedin: "#0A66C2",
  "meta-ads": "#1877F2",
  google: "#4285f4",
  "google-sheets": "#0F9D58",
  microsoft: "#00a4ef",
  pipedrive: "#28292b",
  salesforce: "#00a1e0",
  intercom: "#286efa",
  zendesk: "#03363d",
};

const PROVIDER_LABELS: Record<string, string> = {
  hubspot: "HubSpot",
  stripe: "Stripe",
  slack: "Slack",
  economic: "e-conomic",
  "google-ads": "Google Ads",
  shopify: "Shopify",
  linkedin: "LinkedIn",
  "meta-ads": "Meta Ads",
  google: "Gmail / Drive / Calendar",
  "google-sheets": "Google Sheets",
  microsoft: "Microsoft 365",
  pipedrive: "Pipedrive",
  salesforce: "Salesforce",
  intercom: "Intercom",
  zendesk: "Zendesk",
};

interface StepConnectorsProps {
  onContinue: () => void;
  onBack: () => void;
}

type Connector = { id: string; provider: string; name: string; status: string; userId?: string | null };

export function StepConnectors({ onContinue, onBack }: StepConnectorsProps) {
  const t = useTranslations("onboarding.connectors");
  const tc = useTranslations("common");
  const searchParams = useSearchParams();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [tokenModal, setTokenModal] = useState<{
    providerId: string;
    label: string;
    fields: Array<{ key: string; label: string; placeholder?: string }>;
  } | null>(null);
  const [tokenValues, setTokenValues] = useState<Record<string, string>>({});

  const loadProviders = useCallback(async () => {
    const res = await fetch("/api/connectors/providers");
    if (res.ok) {
      const data = await res.json();
      setProviders(data.providers || []);
    }
  }, []);

  const loadConnectors = useCallback(async () => {
    const res = await fetch("/api/connectors");
    if (res.ok) {
      const data = await res.json();
      setConnectors(data.connectors || []);
    }
  }, []);

  useEffect(() => {
    loadProviders();
    loadConnectors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Detect OAuth return
  useEffect(() => {
    const oauthProviders = [...COMPANY_PROVIDERS, ...PERSONAL_PROVIDERS];
    const connected = oauthProviders.some(p => searchParams.get(p) === "connected");
    if (!connected) return;

    (async () => {
      await loadConnectors();
      window.history.replaceState({}, "", "/onboarding");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function handleConnectProvider(providerId: string) {
    const provider = providers.find(p => p.id === providerId);
    const nonOauthFields = provider?.configSchema?.filter((f) => f.type !== "oauth") || [];
    if (nonOauthFields.length > 0) {
      setTokenModal({
        providerId,
        label: PROVIDER_LABELS[providerId] ?? provider?.name ?? providerId,
        fields: nonOauthFields.map((f) => ({ key: f.key, label: f.label, placeholder: f.placeholder })),
      });
      setTokenValues({});
      return;
    }
    fetch(`/api/connectors/${providerId}/auth-url?from=onboarding`)
      .then(r => r.json())
      .then(data => {
        if (data.url) window.location.href = data.url;
      });
  }

  async function handleStep5Continue() {
    await fetch("/api/orientation/advance", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    onContinue();
  }

  function isConnected(providerId: string) {
    return connectors.some(c => c.provider === providerId);
  }

  const configuredPersonal = providers.filter(p => p.configured && PERSONAL_PROVIDERS.includes(p.id));
  const configuredCompany = providers.filter(p => p.configured && COMPANY_PROVIDERS.includes(p.id));
  const totalConnected = connectors.length;

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <p className="text-xs text-white/30 uppercase tracking-wider">Step 5 of 6</p>
        <h1 className="text-2xl font-semibold text-white/90">{t("title")}</h1>
        <p className="text-sm text-white/45">
          Link your work tools so the AI can learn how your business operates.
        </p>
      </div>

      {/* Personal connectors */}
      {configuredPersonal.length > 0 && (
        <div className="space-y-3">
          <div className="text-xs text-white/30 uppercase tracking-wider px-1">{t("personal")}</div>
          {configuredPersonal.map(p => (
            <ConnectorRow
              key={p.id}
              providerId={p.id}
              connected={isConnected(p.id)}
              onConnect={() => handleConnectProvider(p.id)}
            />
          ))}
        </div>
      )}

      {/* Company connectors (admin-only) */}
      {configuredCompany.length > 0 && (
        <div className="space-y-3">
          <div className="text-xs text-white/30 uppercase tracking-wider px-1">{t("company")}</div>
          {configuredCompany.map(p => (
            <ConnectorRow
              key={p.id}
              providerId={p.id}
              connected={isConnected(p.id)}
              onConnect={() => handleConnectProvider(p.id)}
            />
          ))}
        </div>
      )}

      {configuredPersonal.length === 0 && configuredCompany.length === 0 && (
        <div className="wf-soft px-5 py-4">
          <p className="text-xs text-white/25">No connectors configured. Set environment variables for your tools to enable them.</p>
        </div>
      )}

      {/* Gate indicator */}
      <div className="flex items-center gap-2">
        <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="text-xs text-white/50">
          {t("subtitle")}
        </span>
        {totalConnected > 0 && (
          <span className="text-xs font-medium ml-auto text-emerald-400">
            {totalConnected} connected
          </span>
        )}
      </div>

      <div className="flex items-center justify-between pt-2">
        <button
          onClick={onBack}
          className="text-sm text-white/40 hover:text-white/60 transition"
        >
          &larr; {tc("back")}
        </button>
        <Button variant="primary" size="md" onClick={handleStep5Continue}>
          {tc("continue")}
        </Button>
      </div>

      {/* Token modal for non-OAuth connectors */}
      {tokenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="wf-soft p-6 w-full max-w-md space-y-4">
            <h3 className="text-lg font-medium text-white/80">Connect {tokenModal.label}</h3>
            {tokenModal.fields.map(f => (
              <div key={f.key} className="space-y-1">
                <label className="text-xs text-white/50">{f.label}</label>
                <input
                  type="password"
                  placeholder={f.placeholder}
                  value={tokenValues[f.key] || ""}
                  onChange={e => setTokenValues(prev => ({ ...prev, [f.key]: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white/80 placeholder-white/20"
                />
              </div>
            ))}
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setTokenModal(null)} className="text-sm text-white/40 hover:text-white/60">{tc("cancel")}</button>
              <Button
                variant="primary"
                size="sm"
                disabled={tokenModal.fields.some(f => !tokenValues[f.key])}
                onClick={async () => {
                  const config: Record<string, string> = {};
                  tokenModal.fields.forEach(f => { config[f.key] = tokenValues[f.key]; });

                  const provider = providers.find(p => p.id === tokenModal.providerId);
                  const hasOauth = provider?.configSchema?.some((f) => f.type === "oauth");

                  if (hasOauth) {
                    const params = new URLSearchParams({ from: "onboarding" });
                    tokenModal.fields.forEach(f => { params.set(f.key, tokenValues[f.key]); });
                    const authRes = await fetch(`/api/connectors/${tokenModal.providerId}/auth-url?${params.toString()}`);
                    const authData = await authRes.json();
                    if (authData.url) window.location.href = authData.url;
                    setTokenModal(null);
                    return;
                  }

                  const res = await fetch("/api/connectors", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ provider: tokenModal.providerId, config }),
                  });
                  if (res.ok) {
                    setTokenModal(null);
                    loadConnectors();
                  }
                }}
              >
                {t("connect")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ConnectorRow({
  providerId,
  connected,
  onConnect,
}: {
  providerId: string;
  connected: boolean;
  onConnect: () => void;
}) {
  const t = useTranslations("onboarding.connectors");
  const label = PROVIDER_LABELS[providerId] ?? providerId;
  const color = PROVIDER_COLORS[providerId] ?? "#888";

  return (
    <div className="wf-soft px-5 py-4 flex items-center gap-3">
      <span
        className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold text-white shrink-0"
        style={{ backgroundColor: color }}
      >
        {label.slice(0, 2).toUpperCase()}
      </span>
      <div className="flex-1 min-w-0">
        <span className="text-sm text-white/80">{label}</span>
      </div>
      {connected ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-emerald-400">{t("connected")}</span>
          <svg className="w-3 h-3 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      ) : (
        <button
          onClick={onConnect}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] text-xs text-white/60 hover:bg-white/[0.06] hover:text-white/80 transition"
        >
          {t("connect")}
        </button>
      )}
    </div>
  );
}
