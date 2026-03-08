"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type InviteInfo = {
  companyName: string;
  role: string;
  departmentName: string | null;
  inviterName: string;
  email: string;
};

export default function InviteClaimPage() {
  const router = useRouter();
  const params = useParams();
  const token = params.token as string;

  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [error, setError] = useState("");

  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState("");

  useEffect(() => {
    fetch(`/api/invite/${token}/check`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Invalid invite");
          return;
        }
        setInvite(data);
      })
      .catch(() => setError("Failed to verify invite"))
      .finally(() => setLoading(false));
  }, [token]);

  const handleClaim = async () => {
    setClaimError("");

    if (password !== confirmPassword) {
      setClaimError("Passwords do not match");
      return;
    }
    if (password.length < 6) {
      setClaimError("Password must be at least 6 characters");
      return;
    }

    setClaiming(true);
    try {
      const res = await fetch(`/api/invite/${token}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        setClaimError(data.error || "Failed to create account");
        return;
      }

      router.push("/map");
    } catch {
      setClaimError("Connection error");
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0e1418]">
      <div className="w-full max-w-lg px-6">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <svg viewBox="0 0 40 40" className="w-16 h-16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.5 23 C17 21, 9 12, 3 5" stroke="white" strokeWidth="1.1" strokeLinecap="round" />
            <circle cx="27" cy="27" r="6.5" stroke="white" strokeWidth="1.1" />
          </svg>
        </div>

        {loading && (
          <div className="text-center text-white/30 text-sm">Verifying invite...</div>
        )}

        {!loading && error && (
          <div className="text-center space-y-4">
            <div className="wf-soft p-6">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
            <a href="/login" className="text-sm text-purple-400 hover:text-purple-300">
              Go to login
            </a>
          </div>
        )}

        {!loading && invite && (
          <div className="space-y-6">
            <div className="text-center">
              <p className="text-sm text-white/50 mb-1">You&apos;ve been invited to</p>
              <h1 className="font-heading text-3xl font-semibold tracking-[-0.02em] text-white/90">
                {invite.companyName}
              </h1>
            </div>

            <div className="flex justify-center gap-6 text-sm">
              <div className="text-center">
                <span className="text-white/40">Role</span>
                <div className="text-white/70 font-medium capitalize">{invite.role}</div>
              </div>
              {invite.departmentName && (
                <div className="text-center">
                  <span className="text-white/40">Department</span>
                  <div className="text-white/70 font-medium">{invite.departmentName}</div>
                </div>
              )}
              <div className="text-center">
                <span className="text-white/40">Invited by</span>
                <div className="text-white/70 font-medium">{invite.inviterName}</div>
              </div>
            </div>

            <div className="wf-soft p-6 space-y-5">
              <div className="text-sm text-white/50">
                <span className="text-white/30">Email: </span>
                <span className="text-white/70">{invite.email}</span>
              </div>

              <Input
                label="Your Name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
              />
              <Input
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
              <Input
                label="Confirm Password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
              />

              {claimError && (
                <p className="text-sm text-red-400 text-center">{claimError}</p>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <Button
                variant="primary"
                size="lg"
                onClick={handleClaim}
                disabled={claiming || !displayName || !password || !confirmPassword}
              >
                {claiming ? "Creating Account..." : "Create Account"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
