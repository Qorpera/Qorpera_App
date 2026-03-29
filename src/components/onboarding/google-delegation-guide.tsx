"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

interface GoogleDelegationGuideProps {
  adminEmail: string;
  domain: string;
  onComplete: (userCount: number, provider: "google" | "microsoft") => void;
  onBack: () => void;
}

export function GoogleDelegationGuide({ adminEmail, domain, onComplete, onBack }: GoogleDelegationGuideProps) {
  const t = useTranslations("onboarding.connectTools");
  const tc = useTranslations("common");
  const [clientId, setClientId] = useState<string | null>(null);
  const [scopes, setScopes] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; userCount?: number; error?: string } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/connectors/google-workspace/delegation-info")
      .then((r) => r.json())
      .then((data) => {
        setClientId(data.clientId);
        setScopes(data.scopes);
      })
      .catch(() => {});
  }, []);

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/connectors/google-workspace/test-delegation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, adminEmail }),
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
      const res = await fetch("/api/connectors/google-workspace/delegation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, adminEmail }),
      });
      const data = await res.json();
      if (data.success) {
        onComplete(data.employeeCount, "google");
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

  const steps = [
    { label: "Open admin.google.com in a new tab and sign in as a Super Admin", link: "https://admin.google.com/ac/owl/domainwidedelegation" },
    { label: "Click 'Add new' under Domain-wide Delegation" },
    { label: "Paste this Client ID:", copyValue: clientId, copyKey: "clientId" },
    { label: "Paste these OAuth scopes:", copyValue: scopes, copyKey: "scopes" },
    { label: "Click 'Authorize'" },
    { label: `Wait 1-2 minutes, then test the connection below` },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#4285f4]/10">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
        </div>
        <h2 className="text-[15px] font-semibold text-foreground">{t("detectedGoogle")}</h2>
      </div>

      <p className="text-xs text-[var(--fg2)]">
        Follow these steps to grant Qorpera read-only access to all employees&apos; Gmail, Drive, and Calendar.
      </p>

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

      {/* Test connection */}
      <div className="wf-soft p-4 space-y-3">
        <Button variant="primary" size="md" onClick={handleTest} disabled={testing} className="w-full min-h-[44px]">
          {testing ? (
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
