"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { fetchApi } from "@/lib/fetch-api";
import { useTranslations } from "next-intl";

interface UserProfile {
  user: { id: string; name: string; email: string; role: string };
  operator: { id: string; companyName: string | null };
  isSuperadmin: boolean;
}

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-accent-light text-accent border-[color-mix(in_srgb,var(--accent)_30%,transparent)]",
  member: "bg-skeleton text-[var(--fg2)] border-border",
};

export function AccountTab() {
  const t = useTranslations("account");
  const router = useRouter();
  const searchParams = useSearchParams();
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

  useEffect(() => {
    const googleParam = searchParams.get("google");
    if (googleParam === "connected") {
      toast("Google account connected successfully.", "success");
    } else if (googleParam === "error") {
      const reason = searchParams.get("reason") || "unknown";
      toast(`Google connection failed: ${reason}`, "error");
    }

    const microsoftParam = searchParams.get("microsoft");
    if (microsoftParam === "connected") {
      toast("Microsoft account connected successfully.", "success");
    } else if (microsoftParam === "error") {
      const reason = searchParams.get("reason") || "unknown";
      toast(`Microsoft connection failed: ${reason}`, "error");
    }
  }, [searchParams, toast]);

  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  if (loading) {
    return <div className="text-[var(--fg3)] text-sm">Loading...</div>;
  }

  if (!profile) {
    return <div className="text-[var(--fg2)] text-sm">Could not load profile.</div>;
  }

  const { user, operator } = profile;
  const roleClass = ROLE_COLORS[user.role] ?? ROLE_COLORS.member;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-accent-light border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] flex items-center justify-center text-xl font-semibold text-accent flex-shrink-0">
          {user.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-foreground truncate">{user.name}</h2>
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
  );
}
