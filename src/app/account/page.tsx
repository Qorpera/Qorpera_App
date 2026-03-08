"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { fetchApi } from "@/lib/fetch-api";

interface UserProfile {
  id: string;
  displayName: string;
  email: string;
  role: string;
  createdAt: string;
  operatorName: string | null;
}

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  member: "bg-white/[0.06] text-white/60 border-white/10",
};

export default function AccountPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

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

  const roleClass = ROLE_COLORS[profile.role] ?? ROLE_COLORS.member;
  const joined = new Date(profile.createdAt).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <AppShell>
      <div className="max-w-xl mx-auto px-6 py-12">
        {/* Avatar + name */}
        <div className="flex items-center gap-5 mb-8">
          <div className="w-16 h-16 rounded-full bg-purple-500/15 border border-purple-500/20 flex items-center justify-center text-2xl font-semibold text-purple-300">
            {profile.displayName.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white/90">{profile.displayName}</h1>
            <p className="text-sm text-white/40 mt-0.5">{profile.email}</p>
          </div>
        </div>

        {/* Info card */}
        <div className="wf-soft p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/40">Role</span>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${roleClass}`}>
              {profile.role.charAt(0).toUpperCase() + profile.role.slice(1)}
            </span>
          </div>

          {profile.operatorName && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/40">Organization</span>
              <span className="text-sm text-white/70">{profile.operatorName}</span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-sm text-white/40">Member since</span>
            <span className="text-sm text-white/70">{joined}</span>
          </div>
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
      </div>
    </AppShell>
  );
}
