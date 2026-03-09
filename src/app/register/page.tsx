"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function RegisterPage() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [registrationClosed, setRegistrationClosed] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetch("/api/auth/registration-status")
      .then((r) => r.json())
      .then((data) => {
        if (!data.enabled) setRegistrationClosed(true);
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName, name, email, password }),
      });

      if (res.ok) {
        router.push("/onboarding");
        return;
      }

      const data = await res.json();
      setError(data.error || "Registration failed");
    } catch {
      setError("Connection error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0e1418]">
      <div className="w-full max-w-sm px-6">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <svg viewBox="0 0 40 40" className="w-14 h-14" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.5 23 C17 21, 9 12, 3 5" stroke="white" strokeWidth="1.1" strokeLinecap="round" />
            <circle cx="27" cy="27" r="6.5" stroke="white" strokeWidth="1.1" />
          </svg>
        </div>

        <h1 className="font-heading text-2xl font-semibold tracking-[-0.02em] text-white/90 text-center mb-2">
          Create Your Account
        </h1>
        <p className="text-sm text-white/40 text-center mb-6">
          Set up a new Qorpera workspace for your company.
        </p>

        {checking ? (
          <p className="text-sm text-white/40 text-center">Loading...</p>
        ) : registrationClosed ? (
          <div className="text-center space-y-4">
            <p className="text-sm text-white/50">Registration is currently closed.</p>
            <p className="text-sm text-white/30">
              Contact your administrator for an invite link, or{" "}
              <a href="/login" className="text-purple-400 hover:text-purple-300">sign in</a>.
            </p>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Company Name"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Acme Corp"
            required
          />
          <Input
            label="Your Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Smith"
            required
          />
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            required
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Min 8 characters"
            required
          />

          {error && (
            <p className="text-sm text-red-400 text-center">{error}</p>
          )}

          <Button
            variant="primary"
            size="lg"
            type="submit"
            disabled={loading || !companyName || !name || !email || password.length < 8}
            className="w-full"
          >
            {loading ? "Creating..." : "Create Account"}
          </Button>
        </form>
        )}

        {!registrationClosed && !checking && (
        <p className="text-center text-sm text-white/30 mt-6">
          Already have an account?{" "}
          <a href="/login" className="text-purple-400 hover:text-purple-300">
            Sign in
          </a>
        </p>
        )}
      </div>
    </div>
  );
}
