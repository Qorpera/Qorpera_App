"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { fetchApi } from "@/lib/fetch-api";

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
  admin: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  member: "bg-white/[0.06] text-white/60 border-white/10",
};

export default function AccountPage() {
  return (
    <Suspense fallback={<AppShell><div className="p-8 text-white/30 text-sm">Loading...</div></AppShell>}>
      <AccountPageInner />
    </Suspense>
  );
}

function AccountPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [googleConnector, setGoogleConnector] = useState<PersonalConnector | null>(null);
  const [microsoftConnector, setMicrosoftConnector] = useState<PersonalConnector | null>(null);
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [connectingMicrosoft, setConnectingMicrosoft] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
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
        setGoogleConnector(google || null);
        setMicrosoftConnector(microsoft || null);
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
        <div className="p-8 text-white/30 text-sm">Loading...</div>
      </AppShell>
    );
  }

  if (!profile) {
    return (
      <AppShell>
        <div className="p-8 text-white/40 text-sm">Could not load profile.</div>
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
          <div className="w-16 h-16 rounded-full bg-purple-500/15 border border-purple-500/20 flex items-center justify-center text-2xl font-semibold text-purple-300">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white/90">{user.name}</h1>
            <p className="text-sm text-white/40 mt-0.5">{user.email}</p>
          </div>
        </div>

        {/* Info card */}
        <div className="wf-soft p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/40">Role</span>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${roleClass}`}>
              {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
            </span>
          </div>

          {operator.companyName && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/40">Organization</span>
              <span className="text-sm text-white/70">{operator.companyName}</span>
            </div>
          )}
        </div>

        {/* My AI Assistant */}
        <div className="mt-8 pt-8 border-t border-white/[0.06]">
          <h2 className="text-sm font-medium text-white/60 mb-2 flex items-center gap-2">
            <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
            </svg>
            My AI Assistant
          </h2>

          {aiEntity === undefined ? (
            <p className="text-xs text-white/30">Loading...</p>
          ) : aiEntity === null ? (
            <div className="wf-soft p-5">
              <p className="text-sm text-white/40">
                No AI assistant yet. Your assistant will be created when your account is set up by an admin.
              </p>
            </div>
          ) : (
            <div className="wf-soft p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/40">Name</span>
                <span className="text-sm text-white/70">{aiEntity.displayName}</span>
              </div>
              {aiEntity.departments.length > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white/40">Departments</span>
                  <span className="text-sm text-white/70">
                    {aiEntity.departments.map(d => d.displayName).join(", ")}
                  </span>
                </div>
              )}
              {paRows.length > 0 ? (
                <div className="pt-3 border-t border-white/[0.06]">
                  <p className="text-xs text-white/35 mb-3">Learning Progress</p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[11px] text-white/30 uppercase tracking-wider">
                        <th className="text-left pb-2 font-medium">Situation Type</th>
                        <th className="text-left pb-2 font-medium">Level</th>
                        <th className="text-right pb-2 font-medium">Approvals</th>
                        <th className="text-right pb-2 font-medium">Rate</th>
                        <th className="text-right pb-2 font-medium">Consecutive</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paRows.map((pa) => {
                        const total = pa.totalProposed;
                        const rate = total > 0 ? Math.round((pa.totalApproved / total) * 100) : 0;
                        const levelColors: Record<string, string> = {
                          supervised: "bg-white/[0.06] text-white/60 border-white/10",
                          notify: "bg-amber-500/15 text-amber-300 border-amber-500/20",
                          autonomous: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
                        };
                        const lc = levelColors[pa.autonomyLevel] ?? levelColors.supervised;
                        return (
                          <tr key={pa.id} className="border-t border-white/[0.04]">
                            <td className="py-2 text-white/70">{pa.situationType.name}</td>
                            <td className="py-2">
                              <span className={`text-[11px] px-2 py-0.5 rounded-full border ${lc}`}>
                                {pa.autonomyLevel}
                              </span>
                            </td>
                            <td className="py-2 text-right text-white/50">{pa.totalApproved}/{total}</td>
                            <td className="py-2 text-right text-white/50">{rate}%</td>
                            <td className="py-2 text-right text-white/50">{pa.consecutiveApprovals}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-white/25 pt-2">No learning data yet. Approve or reject situations to start training.</p>
              )}
            </div>
          )}
        </div>

        {/* Connected Accounts */}
        <div className="mt-8 pt-8 border-t border-white/[0.06]">
          <h2 className="text-sm font-medium text-white/60 mb-2">Connected Accounts</h2>
          <p className="text-xs text-white/35 mb-4">
            Connect your personal accounts for email, files, calendar, and messaging.
          </p>

          <div className="wf-soft px-5 py-4 flex items-center gap-3">
            <span
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold text-white shrink-0"
              style={{ backgroundColor: "#4285f4" }}
            >
              G
            </span>
            <div className="flex-1 min-w-0">
              <span className="text-sm text-white/80">Google</span>
              <p className="text-[11px] text-white/35 mt-0.5">
                Gmail, Drive, Calendar, Sheets
              </p>
            </div>
            {googleConnector ? (
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <span className="text-xs text-white/50 block">{googleConnector.name}</span>
                  <span className="text-[10px] text-emerald-400">Connected</span>
                </div>
                <svg className="w-3.5 h-3.5 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <button
                  disabled={disconnecting}
                  className="text-[11px] text-white/30 hover:text-red-400 transition-colors ml-1 disabled:opacity-50"
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
                  {disconnecting ? "..." : "Disconnect"}
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
            <span
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold text-white shrink-0"
              style={{ backgroundColor: "#00a4ef" }}
            >
              M
            </span>
            <div className="flex-1 min-w-0">
              <span className="text-sm text-white/80">Microsoft 365</span>
              <p className="text-[11px] text-white/35 mt-0.5">
                Outlook, OneDrive, Teams, Calendar
              </p>
            </div>
            {microsoftConnector ? (
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <span className="text-xs text-white/50 block">{microsoftConnector.name}</span>
                  <span className="text-[10px] text-emerald-400">Connected</span>
                </div>
                <svg className="w-3.5 h-3.5 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <button
                  disabled={disconnecting}
                  className="text-[11px] text-white/30 hover:text-red-400 transition-colors ml-1 disabled:opacity-50"
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
                  {disconnecting ? "..." : "Disconnect"}
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
            {loggingOut ? "Signing out..." : "Sign Out"}
          </Button>
        </div>

        {/* Export My Data */}
        <div className="mt-8 pt-8 border-t border-white/[0.06]">
          <h2 className="text-sm font-medium text-white/60 mb-2">Export My Data</h2>
          <p className="text-xs text-white/35 mb-4">
            Download your personal data (profile, conversations, approvals) as a JSON file.
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
            {exporting ? "Exporting..." : "Export My Data"}
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
          for (const p of data) map[p.notificationType] = p.channel;
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
    <div className="mt-8 pt-8 border-t border-white/[0.06]">
      <h2 className="text-sm font-medium text-white/60 mb-2">Notification Preferences</h2>
      <p className="text-xs text-white/35 mb-4">
        Choose how you receive each type of notification.
      </p>

      {loading ? (
        <div className="flex justify-center py-4">
          <div className="h-4 w-4 animate-spin rounded-full border border-[#2a2a2a] border-t-[#707070]" />
        </div>
      ) : (
        <div className="wf-soft divide-y divide-white/[0.04]">
          {NOTIFICATION_TYPES.map(({ type, label }) => (
            <div key={type} className="flex items-center justify-between px-5 py-3">
              <span className="text-sm text-white/70">{label}</span>
              <select
                value={prefs[type] ?? "in_app"}
                onChange={e => updatePref(type, e.target.value)}
                disabled={saving === type}
                className="outline-none text-xs"
                style={{ background: "#1c1c1c", border: "1px solid #333", borderRadius: 4, padding: "4px 8px", color: "#b0b0b0" }}
              >
                {CHANNEL_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value} style={{ background: "#1c1c1c" }}>{opt.label}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
