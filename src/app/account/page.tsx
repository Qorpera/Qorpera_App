"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { fetchApi } from "@/lib/fetch-api";

interface UserProfile {
  user: { id: string; name: string; email: string; role: string };
  operator: { id: string; companyName: string | null };
  isSuperadmin: boolean;
}

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  member: "bg-white/[0.06] text-white/60 border-white/10",
};

export default function AccountPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetchApi("/api/auth/me")
      .then(async (res) => {
        if (res.ok) setProfile(await res.json());
      })
      .finally(() => setLoading(false));
  }, []);

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
