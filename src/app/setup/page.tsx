"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type Step = 0 | 1 | 2 | 3;

const PROVIDER_OPTIONS = [
  { value: "ollama", label: "Ollama (Local)" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
];

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step | null>(null);

  // Step 0 state (account creation)
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [registerError, setRegisterError] = useState("");
  const [registering, setRegistering] = useState(false);

  // Step 2 state
  const [provider, setProvider] = useState("ollama");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("http://localhost:11434");
  const [model, setModel] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);

  // Step 3 state
  const [seedData, setSeedData] = useState(true);
  const [finishing, setFinishing] = useState(false);

  // On mount, check if an operator already exists
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/check");
        const data = await res.json();
        setStep(data.firstRun ? 0 : 1);
      } catch {
        setStep(0);
      }
    })();
  }, []);

  const handleRegister = async () => {
    setRegisterError("");
    setRegistering(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, email, password }),
      });

      if (res.status === 409) {
        // Operator already exists — skip to step 1
        setStep(1);
        return;
      }

      if (!res.ok) {
        const data = await res.json();
        setRegisterError(data.error || "Registration failed");
        return;
      }

      // Success — move to step 1
      setStep(1);
    } catch {
      setRegisterError("Connection error");
    } finally {
      setRegistering(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Hello, respond with OK" }),
      });
      setTestResult(res.ok ? "success" : "error");
    } catch {
      setTestResult("error");
    } finally {
      setTesting(false);
    }
  };

  const handleFinish = async () => {
    setFinishing(true);
    try {
      // Save AI settings
      const settings = [
        { key: "ai_provider", value: provider },
        ...(apiKey ? [{ key: "ai_api_key", value: apiKey }] : []),
        ...(provider === "ollama" ? [{ key: "ai_base_url", value: baseUrl }] : []),
        ...(model ? [{ key: "ai_model", value: model }] : []),
        { key: "setup_complete", value: "true" },
      ];

      for (const s of settings) {
        await fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(s),
        });
      }

      // Seed demo data if requested
      if (seedData) {
        await fetch("/api/data/seed", { method: "POST" });
      }

      router.push("/dashboard");
    } catch {
      setFinishing(false);
    }
  };

  // Show nothing while checking if operator exists
  if (step === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0e1418]">
        <div className="text-white/30 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0e1418]">
      <div className="w-full max-w-lg px-6">
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-10">
          {[0, 1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all ${
                s === step
                  ? "w-8 bg-purple-500"
                  : s < step
                    ? "w-6 bg-purple-500/40"
                    : "w-6 bg-white/10"
              }`}
            />
          ))}
        </div>

        {/* Step 0: Account Creation */}
        {step === 0 && (
          <div className="space-y-6">
            <div className="text-center">
              {/* Logo */}
              <div className="flex justify-center mb-6">
                <svg viewBox="0 0 40 40" className="w-16 h-16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.5 23 C17 21, 9 12, 3 5" stroke="white" strokeWidth="1.1" strokeLinecap="round" />
                  <circle cx="27" cy="27" r="6.5" stroke="white" strokeWidth="1.1" />
                </svg>
              </div>

              <h1 className="font-heading text-3xl font-semibold tracking-[-0.02em] text-white/90 mb-2">
                Create Your Account
              </h1>
              <p className="text-sm text-white/50 max-w-sm mx-auto">
                Set up the operator account for your Qorpera workspace.
              </p>
            </div>

            <div className="wf-soft p-6 space-y-5">
              <Input
                label="Display Name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
              />
              <Input
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
              />
              <Input
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />

              {registerError && (
                <p className="text-sm text-red-400 text-center">{registerError}</p>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <Button
                variant="primary"
                size="lg"
                onClick={handleRegister}
                disabled={registering || !displayName || !email || !password}
              >
                {registering ? "Creating..." : "Create Account"}
              </Button>
            </div>

            <p className="text-center text-sm text-white/30">
              Already set up?{" "}
              <a href="/login" className="text-purple-400 hover:text-purple-300">
                Sign in
              </a>
            </p>
          </div>
        )}

        {/* Step 1: Welcome */}
        {step === 1 && (
          <div className="text-center space-y-6">
            {/* Logo */}
            <div className="flex justify-center">
              <svg viewBox="0 0 40 40" className="w-16 h-16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.5 23 C17 21, 9 12, 3 5" stroke="white" strokeWidth="1.1" strokeLinecap="round" />
                <circle cx="27" cy="27" r="6.5" stroke="white" strokeWidth="1.1" />
              </svg>
            </div>

            <div>
              <h1 className="font-heading text-3xl font-semibold tracking-[-0.02em] text-white/90 mb-2">
                Welcome to Qorpera
              </h1>
              <p className="text-sm text-white/50 max-w-sm mx-auto">
                Your governed AI workflow engine. Let us set up your workspace
                in a few quick steps.
              </p>
            </div>

            <Button variant="primary" size="lg" onClick={() => setStep(2)}>
              Get Started
            </Button>
          </div>
        )}

        {/* Step 2: AI Provider */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="text-center mb-2">
              <h2 className="text-xl font-semibold text-white/90">
                Configure AI Provider
              </h2>
              <p className="text-sm text-white/40 mt-1">
                Choose how Qorpera connects to an AI model.
              </p>
            </div>

            <div className="wf-soft p-6 space-y-5">
              <Select
                label="Provider"
                options={PROVIDER_OPTIONS}
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value);
                  setTestResult(null);
                }}
              />

              {provider !== "ollama" && (
                <Input
                  label="API Key"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                />
              )}

              {provider === "ollama" && (
                <Input
                  label="Base URL"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="http://localhost:11434"
                />
              )}

              <Input
                label="Model (optional)"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={
                  provider === "openai"
                    ? "gpt-4o"
                    : provider === "anthropic"
                      ? "claude-sonnet-4-20250514"
                      : "llama3.2"
                }
              />

              <div className="flex items-center gap-3">
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleTestConnection}
                  disabled={testing}
                >
                  {testing ? "Testing..." : "Test Connection"}
                </Button>
                {testResult === "success" && (
                  <span className="text-xs text-emerald-400">Connected</span>
                )}
                {testResult === "error" && (
                  <span className="text-xs text-red-400">
                    Connection failed
                  </span>
                )}
              </div>
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button variant="primary" onClick={() => setStep(3)}>
                Continue
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Seed + Finish */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="text-center mb-2">
              <h2 className="text-xl font-semibold text-white/90">
                Ready to Go
              </h2>
              <p className="text-sm text-white/40 mt-1">
                One last step before you dive in.
              </p>
            </div>

            <div className="wf-soft p-6">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={seedData}
                  onChange={(e) => setSeedData(e.target.checked)}
                  className="mt-1 rounded border-white/20 bg-white/5 text-purple-500 focus:ring-purple-500/30"
                />
                <div>
                  <div className="text-sm text-white/80 font-medium">
                    Seed demo data
                  </div>
                  <p className="text-xs text-white/40 mt-0.5">
                    Populate your workspace with sample entities, relationships,
                    and policies so you can explore the features right away.
                  </p>
                </div>
              </label>
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button
                variant="primary"
                size="lg"
                onClick={handleFinish}
                disabled={finishing}
              >
                {finishing ? "Setting up..." : "Get Started"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
