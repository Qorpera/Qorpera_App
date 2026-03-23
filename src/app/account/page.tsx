"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { fetchApi } from "@/lib/fetch-api";
import { useTranslations } from "next-intl";
import { ConnectorLogo } from "@/components/connector-logo";

interface UserProfile {
  user: { id: string; name: string; email: string; role: string };
  operator: { id: string; companyName: string | null };
  isSuperadmin: boolean;
}

interface PersonalConnector {
  id: string;
  provider: string;
  name: string;
  status: string;
  email?: string;
}

interface AiEntity {
  id: string;
  displayName: string;
  departments: Array<{ id: string; displayName: string }>;
}

interface PersonalAutonomyRow {
  id: string;
  autonomyLevel: string;
  totalProposed: number;
  totalApproved: number;
  consecutiveApprovals: number;
  situationType: { name: string; slug: string };
}

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-accent-light text-accent border-[color-mix(in_srgb,var(--accent)_30%,transparent)]",
  member: "bg-skeleton text-[var(--fg2)] border-border",
};

export default function AccountPage() {
  return (
    <Suspense fallback={<AppShell><div className="p-8 text-[var(--fg3)] text-sm">Loading...</div></AppShell>}>
      <AccountPageInner />
    </Suspense>
  );
}

function AccountPageInner() {
  const t = useTranslations("account");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [googleConnector, setGoogleConnector] = useState<PersonalConnector | null>(null);
  const [microsoftConnector, setMicrosoftConnector] = useState<PersonalConnector | null>(null);
  const [economicConnector, setEconomicConnector] = useState<PersonalConnector | null>(null);
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [connectingMicrosoft, setConnectingMicrosoft] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [tokenModal, setTokenModal] = useState<{ providerId: string; label: string; fields: Array<{ key: string; label: string; placeholder?: string }> } | null>(null);
  const [tokenValues, setTokenValues] = useState<Record<string, string>>({});
  const [aiEntity, setAiEntity] = useState<AiEntity | null | undefined>(undefined);
  const [paRows, setPaRows] = useState<PersonalAutonomyRow[]>([]);

  const loadPersonalConnectors = useCallback(async () => {
    try {
      const res = await fetchApi("/api/connectors");
      if (res.ok) {
        const data = await res.json();
        const connectors = data.connectors || [];
        const google = connectors.find(
          (c: { provider: string; userId?: string | null }) => c.provider === "google" && c.userId
        );
        const microsoft = connectors.find(
          (c: { provider: string; userId?: string | null }) => c.provider === "microsoft" && c.userId
        );
        const economic = connectors.find(
          (c: { provider: string; userId?: string | null }) => c.provider === "economic" && !c.userId
        );
        setGoogleConnector(google || null);
        setMicrosoftConnector(microsoft || null);
        setEconomicConnector(economic || null);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchApi("/api/auth/me")
      .then(async (res) => {
        if (res.ok) setProfile(await res.json());
      })
      .finally(() => setLoading(false));
    loadPersonalConnectors();
    // Load AI entity + autonomy
    fetchApi("/api/me/ai-entity").then(async (res) => {
      if (res.ok) {
        const data = await res.json();
        setAiEntity(data);
        if (data) {
          const paRes = await fetchApi("/api/personal-autonomy");
          if (paRes.ok) setPaRows(await paRes.json());
        }
      } else {
        setAiEntity(null);
      }
    }).catch(() => setAiEntity(null));
  }, [loadPersonalConnectors]);

  // Handle OAuth return
  useEffect(() => {
    const googleParam = searchParams.get("google");
    if (googleParam === "connected") {
      toast("Google account connected successfully.", "success");
      loadPersonalConnectors();
      window.history.replaceState({}, "", "/account");
    } else if (googleParam === "error") {
      const reason = searchParams.get("reason") || "unknown";
      toast(`Google connection failed: ${reason}`, "error");
      window.history.replaceState({}, "", "/account");
    }

    const microsoftParam = searchParams.get("microsoft");
    if (microsoftParam === "connected") {
      toast("Microsoft account connected successfully.", "success");
      loadPersonalConnectors();
      window.history.replaceState({}, "", "/account");
    } else if (microsoftParam === "error") {
      const reason = searchParams.get("reason") || "unknown";
      toast(`Microsoft connection failed: ${reason}`, "error");
      window.history.replaceState({}, "", "/account");
    }
  }, [searchParams, toast, loadPersonalConnectors]);

  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  if (loading) {
    return (
      <AppShell>
        <div className="p-8 text-[var(--fg3)] text-sm">Loading...</div>
      </AppShell>
    );
  }

  if (!profile) {
    return (
      <AppShell>
        <div className="p-8 text-[var(--fg2)] text-sm">Could not load profile.</div>
      </AppShell>
    );
  }

  const { user, operator } = profile;
  const roleClass = ROLE_COLORS[user.role] ?? ROLE_COLORS.member;

  return (
    <AppShell>
      <div className="max-w-xl mx-auto px-6 py-12">
        {/* Avatar + name */}
        <div className="flex items-center gap-5 mb-8">
          <div className="w-16 h-16 rounded-full bg-accent-light border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] flex items-center justify-center text-2xl font-semibold text-accent">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">{user.name}</h1>
            <p className="text-sm text-[var(--fg2)] mt-0.5">{user.email}</p>
          </div>
        </div>

        {/* Info card */}
        <div className="wf-soft p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--fg2)]">{t("role")}</span>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${roleClass}`}>
              {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
            </span>
          </div>

          {operator.companyName && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--fg2)]">{t("organization")}</span>
              <span className="text-sm text-[var(--fg2)]">{operator.companyName}</span>
            </div>
          )}
        </div>

        {/* My AI Assistant */}
        <div className="mt-8 pt-8 border-t border-border">
          <h2 className="text-sm font-medium text-[var(--fg2)] mb-2 flex items-center gap-2">
            <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
            </svg>
            {t("myAiAssistant")}
          </h2>

          {aiEntity === undefined ? (
            <p className="text-xs text-[var(--fg3)]">Loading...</p>
          ) : aiEntity === null ? (
            <div className="wf-soft p-5">
              <p className="text-sm text-[var(--fg2)]">
                {t("noAiAssistant")}
              </p>
            </div>
          ) : (
            <div className="wf-soft p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--fg2)]">Name</span>
                <span className="text-sm text-[var(--fg2)]">{aiEntity.displayName}</span>
              </div>
              {aiEntity.departments.length > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[var(--fg2)]">Departments</span>
                  <span className="text-sm text-[var(--fg2)]">
                    {aiEntity.departments.map(d => d.displayName).join(", ")}
                  </span>
                </div>
              )}
              {paRows.length > 0 ? (
                <div className="pt-3 border-t border-border">
                  <p className="text-xs text-[var(--fg3)] mb-3">{t("learningProgress")}</p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[11px] text-[var(--fg3)] uppercase tracking-wider">
                        <th className="text-left pb-2 font-medium">{t("situationType")}</th>
                        <th className="text-left pb-2 font-medium">{t("level")}</th>
                        <th className="text-right pb-2 font-medium">{t("approvals")}</th>
                        <th className="text-right pb-2 font-medium">{t("rate")}</th>
                        <th className="text-right pb-2 font-medium">{t("consecutive")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paRows.map((pa) => {
                        const total = pa.totalProposed;
                        const rate = total > 0 ? Math.round((pa.totalApproved / total) * 100) : 0;
                        const levelColors: Record<string, string> = {
                          supervised: "bg-skeleton text-[var(--fg2)] border-border",
                          notify: "bg-[color-mix(in_srgb,var(--warn)_12%,transparent)] text-warn border-[color-mix(in_srgb,var(--warn)_20%,transparent)]",
                          autonomous: "bg-[color-mix(in_srgb,var(--ok)_12%,transparent)] text-ok border-[color-mix(in_srgb,var(--ok)_20%,transparent)]",
                        };
                        const lc = levelColors[pa.autonomyLevel] ?? levelColors.supervised;
                        return (
                          <tr key={pa.id} className="border-t border-border">
                            <td className="py-2 text-[var(--fg2)]">{pa.situationType.name}</td>
                            <td className="py-2">
                              <span className={`text-[11px] px-2 py-0.5 rounded-full border ${lc}`}>
                                {pa.autonomyLevel}
                              </span>
                            </td>
                            <td className="py-2 text-right text-[var(--fg2)]">{pa.totalApproved}/{total}</td>
                            <td className="py-2 text-right text-[var(--fg2)]">{rate}%</td>
                            <td className="py-2 text-right text-[var(--fg2)]">{pa.consecutiveApprovals}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-[var(--fg3)] pt-2">{t("noLearningData")}</p>
              )}
            </div>
          )}
        </div>

        {/* Connected Accounts */}
        <div className="mt-8 pt-8 border-t border-border">
          <h2 className="text-sm font-medium text-[var(--fg2)] mb-2">{t("connectedAccounts")}</h2>
          <p className="text-xs text-[var(--fg3)] mb-4">
            {t("connectedAccountsDescription")}
          </p>

          <div className="wf-soft px-5 py-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0">
              <ConnectorLogo provider="google" size={24} />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-sm text-foreground">{t("google")}</span>
              <p className="text-[11px] text-[var(--fg3)] mt-0.5">
                {t("googleDescription")}
              </p>
            </div>
            {googleConnector ? (
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <span className="text-xs text-[var(--fg2)] block">{googleConnector.name}</span>
                  <span className="text-[10px] text-ok">{t("connected")}</span>
                </div>
                <svg className="w-3.5 h-3.5 text-ok shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <button
                  disabled={disconnecting}
                  className="text-[11px] text-[var(--fg3)] hover:text-danger transition-colors ml-1 disabled:opacity-50"
                  onClick={async () => {
                    if (!confirm("Disconnect your Google account? Synced data (emails, documents, activity) will remain, but no new data will sync.")) return;
                    setDisconnecting(true);
                    try {
                      const res = await fetchApi(`/api/connectors/${googleConnector.id}`, { method: "DELETE" });
                      if (res.ok) {
                        setGoogleConnector(null);
                        toast("Google account disconnected.", "success");
                      } else {
                        const data = await res.json().catch(() => ({}));
                        toast(data.error || "Failed to disconnect.", "error");
                      }
                    } catch {
                      toast("Failed to disconnect.", "error");
                    } finally {
                      setDisconnecting(false);
                    }
                  }}
                >
                  {disconnecting ? "..." : t("disconnect")}
                </button>
              </div>
            ) : (
              <Button
                variant="default"
                size="sm"
                disabled={connectingGoogle}
                onClick={async () => {
                  setConnectingGoogle(true);
                  try {
                    const res = await fetchApi("/api/connectors/google/auth");
                    if (res.ok) {
                      const data = await res.json();
                      if (data.url) window.location.href = data.url;
                    } else {
                      toast("Google OAuth not configured.", "error");
                    }
                  } catch {
                    toast("Failed to start Google connection.", "error");
                  }
                  setConnectingGoogle(false);
                }}
              >
                {connectingGoogle ? "Connecting..." : "Connect Google"}
              </Button>
            )}
          </div>

          {/* Microsoft 365 */}
          <div className="wf-soft px-5 py-4 flex items-center gap-3 mt-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0">
              <ConnectorLogo provider="microsoft" size={24} />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-sm text-foreground">{t("microsoft")}</span>
              <p className="text-[11px] text-[var(--fg3)] mt-0.5">
                {t("microsoftDescription")}
              </p>
            </div>
            {microsoftConnector ? (
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <span className="text-xs text-[var(--fg2)] block">{microsoftConnector.name}</span>
                  <span className="text-[10px] text-ok">{t("connected")}</span>
                </div>
                <svg className="w-3.5 h-3.5 text-ok shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <button
                  disabled={disconnecting}
                  className="text-[11px] text-[var(--fg3)] hover:text-danger transition-colors ml-1 disabled:opacity-50"
                  onClick={async () => {
                    if (!confirm("Disconnect your Microsoft account? Synced data will remain, but no new data will sync.")) return;
                    setDisconnecting(true);
                    try {
                      const res = await fetchApi(`/api/connectors/${microsoftConnector.id}`, { method: "DELETE" });
                      if (res.ok) {
                        setMicrosoftConnector(null);
                        toast("Microsoft account disconnected.", "success");
                      } else {
                        const data = await res.json().catch(() => ({}));
                        toast(data.error || "Failed to disconnect.", "error");
                      }
                    } catch {
                      toast("Failed to disconnect.", "error");
                    } finally {
                      setDisconnecting(false);
                    }
                  }}
                >
                  {disconnecting ? "..." : t("disconnect")}
                </button>
              </div>
            ) : (
              <Button
                variant="default"
                size="sm"
                disabled={connectingMicrosoft}
                onClick={async () => {
                  setConnectingMicrosoft(true);
                  try {
                    const res = await fetchApi("/api/connectors/microsoft/auth");
                    if (res.ok) {
                      const data = await res.json();
                      if (data.url) window.location.href = data.url;
                    } else {
                      toast("Microsoft OAuth not configured.", "error");
                    }
                  } catch {
                    toast("Failed to start Microsoft connection.", "error");
                  }
                  setConnectingMicrosoft(false);
                }}
              >
                {connectingMicrosoft ? "Connecting..." : "Connect Microsoft"}
              </Button>
            )}
          </div>

          {/* e-conomic */}
          <div className="wf-soft px-5 py-4 flex items-center gap-3 mt-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0">
              <ConnectorLogo provider="economic" size={24} />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-sm text-foreground">{t("economic")}</span>
              <p className="text-[11px] text-[var(--fg3)] mt-0.5">
                {t("economicDescription")}
              </p>
            </div>
            {economicConnector ? (
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <span className="text-xs text-[var(--fg2)] block">{economicConnector.name}</span>
                  <span className="text-[10px] text-ok">{t("connected")}</span>
                </div>
                <svg className="w-3.5 h-3.5 text-ok shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <button
                  disabled={disconnecting}
                  className="text-[11px] text-[var(--fg3)] hover:text-danger transition-colors ml-1 disabled:opacity-50"
                  onClick={async () => {
                    if (!confirm("Disconnect e-conomic? Synced data will remain, but no new data will sync.")) return;
                    setDisconnecting(true);
                    try {
                      const res = await fetchApi(`/api/connectors/${economicConnector.id}`, { method: "DELETE" });
                      if (res.ok) {
                        setEconomicConnector(null);
                        toast("e-conomic disconnected.", "success");
                      } else {
                        const data = await res.json().catch(() => ({}));
                        toast(data.error || "Failed to disconnect.", "error");
                      }
                    } catch {
                      toast("Failed to disconnect.", "error");
                    } finally {
                      setDisconnecting(false);
                    }
                  }}
                >
                  {disconnecting ? "..." : t("disconnect")}
                </button>
              </div>
            ) : (
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  setTokenModal({
                    providerId: "economic",
                    label: "e-conomic",
                    fields: [{ key: "grant_token", label: "Agreement Grant Token", placeholder: "Paste your grant token from e-conomic Settings → Apps" }],
                  });
                  setTokenValues({});
                }}
              >
                Connect e-conomic
              </Button>
            )}
          </div>

          {tokenModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay">
              <div className="wf-soft p-6 w-full max-w-md space-y-4">
                <h3 className="text-lg font-medium text-foreground">Connect {tokenModal.label}</h3>
                {tokenModal.fields.map(f => (
                  <div key={f.key} className="space-y-1">
                    <label className="text-xs text-[var(--fg2)]">{f.label}</label>
                    <input
                      type="password"
                      placeholder={f.placeholder}
                      value={tokenValues[f.key] || ""}
                      onChange={e => setTokenValues(prev => ({ ...prev, [f.key]: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg bg-hover border border-border text-sm text-foreground placeholder-[var(--fg3)]"
                    />
                  </div>
                ))}
                <div className="flex justify-end gap-3 pt-2">
                  <button onClick={() => setTokenModal(null)} className="text-sm text-[var(--fg2)] hover:text-[var(--fg2)]">Cancel</button>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={tokenModal.fields.some(f => !tokenValues[f.key])}
                    onClick={async () => {
                      const config: Record<string, string> = {};
                      tokenModal.fields.forEach(f => { config[f.key] = tokenValues[f.key]; });
                      const res = await fetchApi("/api/connectors", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ provider: tokenModal.providerId, config }),
                      });
                      if (res.ok) {
                        setTokenModal(null);
                        loadPersonalConnectors();
                        toast(`${tokenModal.label} connected.`, "success");
                      } else {
                        const data = await res.json().catch(() => ({}));
                        toast(data.error || "Connection failed.", "error");
                      }
                    }}
                  >
                    Connect
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Notification Preferences */}
        <NotificationPreferences />

        {/* Logout */}
        <div className="mt-8">
          <Button
            variant="danger"
            size="sm"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            {loggingOut ? t("signingOut") : t("signOut")}
          </Button>
        </div>

        {/* Export My Data */}
        <div className="mt-8 pt-8 border-t border-border">
          <h2 className="text-sm font-medium text-[var(--fg2)] mb-2">{t("exportMyData")}</h2>
          <p className="text-xs text-[var(--fg3)] mb-4">
            {t("exportDescription")}
          </p>
          <Button
            variant="default"
            size="sm"
            disabled={exporting}
            onClick={async () => {
              setExporting(true);
              try {
                const res = await fetchApi("/api/users/export");
                if (!res.ok) throw new Error();
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "qorpera-my-data.json";
                a.click();
                URL.revokeObjectURL(url);
                toast("Export downloaded", "success");
              } catch {
                toast("Export failed", "error");
              } finally {
                setExporting(false);
              }
            }}
          >
            {exporting ? "Exporting..." : t("exportButton")}
          </Button>
        </div>
      </div>
    </AppShell>
  );
}

// ── Notification Preferences ────────────────────────────────────────────────

const NOTIFICATION_TYPES = [
  { type: "situation_proposed", label: "New situation detected" },
  { type: "situation_resolved", label: "Situation resolved" },
  { type: "initiative_proposed", label: "Initiative proposed" },
  { type: "step_ready", label: "Step ready for review" },
  { type: "delegation_received", label: "Task delegated to you" },
  { type: "follow_up_triggered", label: "Follow-up triggered" },
  { type: "plan_auto_executed", label: "Plan auto-executed" },
  { type: "peer_signal", label: "Cross-department signal" },
  { type: "insight_discovered", label: "New insight discovered" },
  { type: "system_alert", label: "System alert" },
];

const CHANNEL_OPTIONS = [
  { value: "in_app", label: "In-app" },
  { value: "email", label: "Email" },
  { value: "both", label: "Both" },
  { value: "none", label: "None" },
];

function NotificationPreferences() {
  const t = useTranslations("account");
  const [prefs, setPrefs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchApi("/api/notification-preferences")
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          const map: Record<string, string> = {};
          if (Array.isArray(data)) {
            for (const p of data) map[p.notificationType] = p.channel;
          }
          setPrefs(map);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const updatePref = async (type: string, channel: string) => {
    setSaving(type);
    try {
      const res = await fetchApi("/api/notification-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, channel }),
      });
      if (res.ok) {
        setPrefs(prev => ({ ...prev, [type]: channel }));
        toast("Preference saved", "success");
      }
    } catch {}
    setSaving(null);
  };

  return (
    <div className="mt-8 pt-8 border-t border-border">
      <h2 className="text-sm font-medium text-[var(--fg2)] mb-2">{t("notificationPreferences")}</h2>
      <p className="text-xs text-[var(--fg3)] mb-4">
        Choose how you receive each type of notification.
      </p>

      {loading ? (
        <div className="flex justify-center py-4">
          <div className="h-4 w-4 animate-spin rounded-full border border-border border-t-muted" />
        </div>
      ) : (
        <div className="wf-soft divide-y divide-border">
          {NOTIFICATION_TYPES.map(({ type, label }) => (
            <div key={type} className="flex items-center justify-between px-5 py-3">
              <span className="text-sm text-[var(--fg2)]">{label}</span>
              <select
                value={prefs[type] ?? "in_app"}
                onChange={e => updatePref(type, e.target.value)}
                disabled={saving === type}
                className="outline-none text-xs"
                style={{ background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: 4, padding: "4px 8px", color: "var(--fg2)" }}
              >
                {CHANNEL_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value} style={{ background: "var(--elevated)" }}>{opt.label}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
