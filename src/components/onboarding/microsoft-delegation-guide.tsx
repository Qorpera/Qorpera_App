"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

interface MicrosoftDelegationGuideProps {
  adminEmail: string;
  domain: string;
  onComplete: (userCount: number, provider: "google" | "microsoft") => void;
  onBack: () => void;
}

export function MicrosoftDelegationGuide({ adminEmail, domain, onComplete, onBack }: MicrosoftDelegationGuideProps) {
  const t = useTranslations("onboarding.connectTools");
  const tc = useTranslations("common");
  const [appClientId, setAppClientId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; userCount?: number; error?: string } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/connectors/microsoft-365/delegation-info")
      .then((r) => r.json())
      .then((data) => {
        setAppClientId(data.clientId);
        setPermissions(data.permissions || []);
      })
      .catch(() => {});
  }, []);

  async function handleSaveConfig() {
    setSaving(true);
    try {
      const res = await fetch("/api/connectors/microsoft-365/save-tenant-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, clientSecret }),
      });
      if (res.ok) {
        setConfigSaved(true);
      } else {
        const data = await res.json();
        setTestResult({ success: false, error: data.error || "Failed to save configuration" });
      }
    } catch {
      setTestResult({ success: false, error: "Network error. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    // Save config first if not yet saved
    if (!configSaved && tenantId && clientSecret) {
      await handleSaveConfig();
    }

    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/connectors/microsoft-365/test-app-permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: tenantId || undefined }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch {
      setTestResult({ success: false, error: "Network error. Please try again." });
    } finally {
      setTesting(false);
    }
  }

  async function handleConnectAll() {
    setConnecting(true);
    try {
      const res = await fetch("/api/connectors/microsoft-365/delegation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: tenantId || undefined }),
      });
      const data = await res.json();
      if (data.success) {
        onComplete(data.employeeCount, "microsoft");
      } else {
        setTestResult({ success: false, error: data.error || "Failed to connect" });
      }
    } catch {
      setTestResult({ success: false, error: "Network error. Please try again." });
    } finally {
      setConnecting(false);
    }
  }

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  const permissionsString = permissions.join(", ");
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const canTest = tenantId && isUUID.test(tenantId) && clientSecret.length >= 10;

  const steps = [
    { label: t("msStep1"), link: "https://portal.azure.com/#view/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/~/RegisteredApps" },
    { label: t("msStep2") },
    { label: t("msStep3") },
    { label: t("msStep4") },
    { label: t("msStep5"), copyValue: permissionsString, copyKey: "permissions" },
    { label: t("msStep6") },
    { label: t("msStep7") },
    { label: t("msStep8") },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#00a4ef]/10">
          <svg className="w-4 h-4" viewBox="0 0 21 21" fill="none">
            <rect x="1" y="1" width="9" height="9" fill="#F25022" />
            <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
            <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
            <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
          </svg>
        </div>
        <h2 className="text-[15px] font-semibold text-foreground">{t("detectedMicrosoft")}</h2>
      </div>

      <p className="text-xs text-[var(--fg2)]">
        Follow these steps to grant Qorpera read-only access to all employees&apos; Outlook, OneDrive, and Calendar.
      </p>

      {appClientId && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--fg3)]">Application ID:</span>
          <code className="text-xs bg-hover rounded px-2 py-1 text-[var(--fg2)] select-all">{appClientId}</code>
          <button
            onClick={() => copyToClipboard(appClientId, "appId")}
            className="text-xs text-accent hover:text-accent/80 transition"
          >
            {copied === "appId" ? "Copied!" : "Copy"}
          </button>
        </div>
      )}

      {/* Guide steps */}
      <div className="space-y-3">
        {steps.map((step, i) => (
          <div key={i} className="flex gap-3">
            <div className="w-6 h-6 rounded-full bg-accent/10 text-accent text-xs flex items-center justify-center shrink-0 mt-0.5">
              {i + 1}
            </div>
            <div className="flex-1 space-y-1.5">
              <p className="text-sm text-foreground">
                {step.label}
                {step.link && (
                  <a href={step.link} target="_blank" rel="noopener noreferrer" className="ml-1 text-accent hover:underline text-xs">
                    Open &rarr;
                  </a>
                )}
              </p>
              {step.copyValue && (
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-hover rounded px-2 py-1.5 text-[var(--fg2)] break-all select-all">
                    {step.copyValue}
                  </code>
                  <button
                    onClick={() => copyToClipboard(step.copyValue!, step.copyKey!)}
                    className="shrink-0 text-xs text-accent hover:text-accent/80 transition min-h-[32px] px-2"
                  >
                    {copied === step.copyKey ? "Copied!" : "Copy"}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Tenant config inputs */}
      <div className="wf-soft p-4 space-y-3">
        <div>
          <label className="block text-xs font-medium text-[var(--fg2)] mb-1">{t("msTenantId")}</label>
          <input
            type="text"
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            className="w-full px-3 py-2 rounded-lg border border-border bg-hover text-sm text-foreground placeholder:text-[var(--fg3)] focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--fg2)] mb-1">{t("msClientSecret")}</label>
          <input
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder="Paste the client secret value"
            className="w-full px-3 py-2 rounded-lg border border-border bg-hover text-sm text-foreground placeholder:text-[var(--fg3)] focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>

        <Button variant="primary" size="md" onClick={handleTest} disabled={!canTest || testing || saving} className="w-full min-h-[44px]">
          {saving ? (
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-foreground/30 border-t-foreground" />
              {t("msSavingConfig")}
            </span>
          ) : testing ? (
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-foreground/30 border-t-foreground" />
              Testing connection...
            </span>
          ) : "Test Connection"}
        </Button>

        {testResult && !testResult.success && (
          <div className="text-xs text-red-500 bg-red-500/10 rounded-lg px-3 py-2">
            {testResult.error}
          </div>
        )}

        {testResult?.success && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-ok shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-sm text-ok font-medium">
                {t("connectedCount", { count: testResult.userCount ?? 0 })}
              </span>
            </div>
            <Button
              variant="primary"
              size="md"
              onClick={handleConnectAll}
              disabled={connecting}
              className="w-full min-h-[44px]"
            >
              {connecting ? "Connecting..." : `Connect All ${testResult.userCount ?? 0} Employees`}
            </Button>
          </div>
        )}
      </div>

      {/* Back */}
      <button onClick={onBack} className="text-sm text-[var(--fg2)] hover:text-foreground transition min-h-[44px]">
        &larr; {tc("back")}
      </button>
    </div>
  );
}
