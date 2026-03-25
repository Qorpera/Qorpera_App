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
  const [activeTab, setActiveTab] = useState<"profile" | "notifications">("profile");

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
      <div>
        {/* Header + Tabs — sticky */}
        <div>
          <div className="px-6 pt-6 pb-4 max-w-2xl mx-auto">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-accent-light border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] flex items-center justify-center text-xl font-semibold text-accent flex-shrink-0">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-semibold text-foreground truncate">{user.name}</h1>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${roleClass}`}>
                    {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                  </span>
                </div>
                <p className="text-sm text-[var(--fg2)]">{user.email}</p>
                {operator.companyName && (
                  <p className="text-xs text-[var(--fg3)]">{operator.companyName}</p>
                )}
              </div>
              <Button variant="danger" size="sm" onClick={handleLogout} disabled={loggingOut}>
                {loggingOut ? t("signingOut") : t("signOut")}
              </Button>
            </div>
          </div>
          <div className="px-6 max-w-2xl mx-auto">
            <div className="flex gap-1 border-b border-border">
              {([
                { key: "profile" as const, label: "Profile & AI" },
                { key: "notifications" as const, label: "Notifications" },
              ]).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-4 py-2 text-sm font-medium transition-colors relative ${
                    activeTab === tab.key
                      ? "text-accent"
                      : "text-[var(--fg3)] hover:text-[var(--fg2)]"
                  }`}
                >
                  {tab.label}
                  {activeTab === tab.key && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-full" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Tab content */}
        <div className="px-6 py-5">
          <div className="max-w-2xl mx-auto">

        {/* ── Tab: Profile & AI ── */}
        {activeTab === "profile" && (
          <div className="space-y-5">
            {/* AI Assistant */}
            <section className="bg-surface border border-border rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-hover">
                <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
                </svg>
                <h2 className="text-[13px] font-semibold text-foreground">{t("myAiAssistant")}</h2>
              </div>

          {aiEntity === undefined ? (
            <div className="px-5 py-4 text-xs text-[var(--fg3)]">Loading...</div>
          ) : aiEntity === null ? (
            <div className="px-5 py-6 text-center">
              <p className="text-sm text-[var(--fg2)]">{t("noAiAssistant")}</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              <div className="flex items-center justify-between px-5 py-3">
                <span className="text-sm text-[var(--fg2)]">Name</span>
                <span className="text-sm text-foreground">{aiEntity.displayName}</span>
              </div>
              {aiEntity.departments.length > 0 && (
                <div className="flex items-center justify-between px-5 py-3">
                  <span className="text-sm text-[var(--fg2)]">Departments</span>
                  <span className="text-sm text-foreground">{aiEntity.departments.map(d => d.displayName).join(", ")}</span>
                </div>
              )}
              {paRows.length > 0 && (
                <div className="px-5 py-3">
                  <p className="text-xs text-[var(--fg2)] mb-2 font-medium">{t("learningProgress")}</p>
                  <div className="space-y-1.5">
                    {paRows.map((pa) => {
                      const total = pa.totalProposed;
                      const rate = total > 0 ? Math.round((pa.totalApproved / total) * 100) : 0;
                      const levelColors: Record<string, string> = {
                        supervised: "bg-skeleton text-[var(--fg2)]",
                        notify: "bg-[color-mix(in_srgb,var(--warn)_12%,transparent)] text-warn",
                        autonomous: "bg-[color-mix(in_srgb,var(--ok)_12%,transparent)] text-ok",
                      };
                      const lc = levelColors[pa.autonomyLevel] ?? levelColors.supervised;
                      return (
                        <div key={pa.id} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${lc}`}>{pa.autonomyLevel}</span>
                            <span className="text-[var(--fg2)]">{pa.situationType.name}</span>
                          </div>
                          <span className="text-xs text-[var(--fg3)]">{rate}% · {pa.consecutiveApprovals} streak</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
            </section>

            {/* Export */}
            <section className="bg-surface border border-border rounded-lg p-5 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-foreground">{t("exportMyData")}</h3>
                <p className="text-xs text-[var(--fg3)] mt-0.5">{t("exportDescription")}</p>
              </div>
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
            </section>
          </div>
        )}

        {/* ── Tab: Notifications ── */}
        {activeTab === "notifications" && (
          <NotificationPreferences />
        )}

          </div>
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
    <div>
      <p className="text-xs text-[var(--fg2)] mb-3">
        Choose how you receive each type of notification.
      </p>

      {loading ? (
        <div className="flex justify-center py-4">
          <div className="h-4 w-4 animate-spin rounded-full border border-border border-t-muted" />
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg divide-y divide-border overflow-hidden">
          {NOTIFICATION_TYPES.map(({ type, label }) => (
            <div key={type} className="flex items-center justify-between px-5 py-2.5">
              <span className="text-sm text-foreground">{label}</span>
              <select
                value={prefs[type] ?? "in_app"}
                onChange={e => updatePref(type, e.target.value)}
                disabled={saving === type}
                className="outline-none text-xs rounded bg-elevated border border-border px-2 py-1 text-[var(--fg2)]"
              >
                {CHANNEL_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
