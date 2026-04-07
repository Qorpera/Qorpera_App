"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QorperaLogo } from "@/components/qorpera-logo";

type JoinInfo = {
  companyName: string;
  operatorName: string;
};

export default function JoinPage() {
  const router = useRouter();
  const params = useParams();
  const token = params.token as string;

  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<JoinInfo | null>(null);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    fetch(`/api/join/${token}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Invalid invite link");
          return;
        }
        setInfo(data);
      })
      .catch(() => setError("Failed to verify invite link"))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError("");

    if (password !== confirmPassword) {
      setSubmitError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setSubmitError("Password must be at least 8 characters");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/join/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error || "Failed to create account");
        return;
      }

      router.push("/");
    } catch {
      setSubmitError("Connection error");
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = name && email && password.length >= 8 && password === confirmPassword;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background">
      <div className="w-full max-w-sm mx-auto px-4">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <QorperaLogo width={120} />
        </div>

        {loading && (
          <div className="text-center text-[var(--fg3)] text-sm">Verifying invite link...</div>
        )}

        {!loading && error && (
          <div className="text-center space-y-4">
            <h1 className="font-heading text-2xl font-semibold tracking-[-0.02em] text-foreground">
              Invalid Invite Link
            </h1>
            <p className="text-sm text-[var(--fg2)]">
              This invite link is no longer valid. Contact your administrator for a new one.
            </p>
            <a href="/login" className="text-sm text-accent hover:text-accent font-medium">
              Go to login
            </a>
          </div>
        )}

        {!loading && info && (
          <>
            <div className="text-center mb-6">
              <p className="text-sm text-[var(--fg2)] mb-1">Join</p>
              <h1 className="font-heading text-2xl font-semibold tracking-[-0.02em] text-foreground">
                {info.companyName}
              </h1>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
                required
              />
              <Input
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
              <div className="relative">
                <Input
                  label="Password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-[34px] text-[var(--fg3)] hover:text-[var(--fg2)] transition"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </button>
              </div>
              <Input
                label="Confirm password"
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat password"
                required
              />

              {submitError && (
                <p className="text-sm text-danger text-center">{submitError}</p>
              )}

              <Button
                variant="primary"
                size="lg"
                type="submit"
                disabled={submitting || !canSubmit}
                className="w-full min-h-[44px]"
              >
                {submitting ? "Creating account..." : "Create Account"}
              </Button>
            </form>

            <p className="text-center text-sm text-[var(--fg3)] mt-6">
              Already have an account?{" "}
              <a href="/login" className="text-accent hover:text-accent font-medium">
                Sign in
              </a>
            </p>
          </>
        )}
      </div>
      <div className="fixed bottom-4 right-4 text-xs text-[var(--fg3)]">
        <a href="/terms" className="hover:text-[var(--fg2)]">Terms</a>
        {" · "}
        <a href="/privacy" className="hover:text-[var(--fg2)]">Privacy</a>
        {" · "}
        <a href="/dpa" className="hover:text-[var(--fg2)]">DPA</a>
      </div>
    </div>
  );
}
