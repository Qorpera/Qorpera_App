"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";

type InviteInfo = {
  companyName: string;
  personName: string;
  role: string;
  departmentName: string | null;
  email: string;
};

export default function InviteAcceptPage() {
  const router = useRouter();
  const params = useParams();
  const token = params.token as string;

  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [error, setError] = useState("");
  const [gone, setGone] = useState(false); // already claimed
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState("");

  useEffect(() => {
    fetch(`/api/invite/${token}`)
      .then(async (res) => {
        const data = await res.json();
        if (res.status === 410) {
          setGone(true);
          return;
        }
        if (!res.ok) {
          setError(data.error || "Invalid invite");
          return;
        }
        setInvite(data);
      })
      .catch(() => setError("Failed to verify invite"))
      .finally(() => setLoading(false));
  }, [token]);

  const handleAccept = async () => {
    setAcceptError("");
    setAccepting(true);
    try {
      const res = await fetch(`/api/invite/${token}/accept`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setAcceptError(data.error || "Failed to join");
        return;
      }
      router.push(data.redirect || "/map");
    } catch {
      setAcceptError("Connection error");
    } finally {
      setAccepting(false);
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
              <p className="text-white/60 text-sm">This invite link is no longer valid. Contact your administrator for a new one.</p>
            </div>
          </div>
        )}

        {!loading && gone && (
          <div className="text-center space-y-4">
            <div className="wf-soft p-6">
              <p className="text-white/60 text-sm">This invite has already been used. Try logging in instead.</p>
            </div>
            <a href="/login" className="text-sm text-purple-400 hover:text-purple-300">
              Go to login
            </a>
          </div>
        )}

        {!loading && invite && (
          <div className="space-y-6">
            <div className="text-center">
              <p className="text-sm text-white/50 mb-1">You&apos;ve been invited to join</p>
              <h1 className="font-heading text-3xl font-semibold tracking-[-0.02em] text-white/90">
                {invite.companyName}
              </h1>
            </div>

            <div className="wf-soft p-6 space-y-3">
              <p className="text-white/70 text-sm">
                as <span className="text-white/90 font-medium">{invite.personName}</span>
                {invite.departmentName && (
                  <> in <span className="text-white/90 font-medium">{invite.departmentName}</span></>
                )}
              </p>

              <div className="flex items-center gap-3 text-xs text-white/40">
                <span>{invite.email}</span>
                <span className="px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 font-medium capitalize">
                  {invite.role}
                </span>
              </div>
            </div>

            {acceptError && (
              <p className="text-sm text-red-400 text-center">{acceptError}</p>
            )}

            <Button
              variant="primary"
              size="lg"
              className="w-full"
              disabled={accepting}
              onClick={handleAccept}
            >
              {accepting ? "Joining..." : `Join ${invite.companyName}`}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
