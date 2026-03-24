"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type RegistrationMode = "choose" | "organisation" | "user";

function validateCVR(cvr: string): boolean {
  const digits = cvr.replace(/\s/g, "");
  return /^\d{8}$/.test(digits);
}

export default function RegisterPage() {
  const router = useRouter();
  const t = useTranslations("auth.register");
  const tc = useTranslations("common");
  const [mode, setMode] = useState<RegistrationMode>("choose");
  const [companyName, setCompanyName] = useState("");
  const [cvr, setCvr] = useState("");
  const [cvrError, setCvrError] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [registrationClosed, setRegistrationClosed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [tosAccepted, setTosAccepted] = useState(false);

  useEffect(() => {
    fetch("/api/auth/registration-status")
      .then((r) => r.json())
      .then((data) => {
        if (!data.enabled) setRegistrationClosed(true);
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  const handleCvrBlur = () => {
    if (cvr && !validateCVR(cvr)) {
      setCvrError("CVR must be exactly 8 digits");
    } else {
      setCvrError("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (mode === "organisation" && !validateCVR(cvr)) {
      setCvrError("CVR must be exactly 8 digits");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName,
          name,
          email,
          password,
          ...(mode === "organisation" ? { cvr: cvr.replace(/\s/g, "") } : {}),
        }),
      });

      if (res.ok) {
        router.push("/onboarding");
        return;
      }

      const data = await res.json();
      setError(data.error || t("registrationFailed"));
    } catch {
      setError(tc("connectionError"));
    } finally {
      setLoading(false);
    }
  };

  const isOrgMode = mode === "organisation";
  const canSubmit = isOrgMode
    ? companyName && name && email && password.length >= 8 && tosAccepted && validateCVR(cvr)
    : companyName && name && email && password.length >= 8 && tosAccepted;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background">
      <div className="w-full max-w-sm mx-auto px-4">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-mark.png"
            alt="Qorpera"
            width={72}
            height={54}
            className="dark:invert-0"
            style={{ filter: "brightness(0)" }}
          />
          <span className="font-heading text-lg font-semibold tracking-[-0.02em] text-foreground mt-2">
            qorpera
          </span>
        </div>

        {checking ? (
          <p className="text-sm text-[var(--fg2)] text-center">{tc("loading")}</p>
        ) : registrationClosed ? (
          <div className="text-center space-y-4">
            <h1 className="font-heading text-2xl font-semibold text-foreground">{t("registrationClosed")}</h1>
            <p className="text-sm text-[var(--fg2)]">
              {t("contactAdmin")}{" "}
              <a href="/login" className="text-accent hover:text-accent font-medium">{t("signIn")}</a>.
            </p>
          </div>
        ) : mode === "choose" ? (
          /* ── Mode selector ── */
          <div>
            <h1 className="font-heading text-2xl font-semibold tracking-[-0.02em] text-foreground text-center mb-2">
              Get started
            </h1>
            <p className="text-sm text-[var(--fg2)] text-center mb-6">
              How would you like to use Qorpera?
            </p>

            <div className="space-y-3">
              <button
                onClick={() => setMode("organisation")}
                className="w-full text-left rounded-lg border border-border bg-surface hover:bg-hover p-4 transition group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-accent-light flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21" />
                    </svg>
                  </div>
                  <div>
                    <span className="text-[15px] font-semibold text-foreground">Register Organisation</span>
                    <p className="text-xs text-[var(--fg2)] mt-0.5">Set up a new Qorpera workspace for your company</p>
                  </div>
                  <svg className="w-4 h-4 text-[var(--fg3)] ml-auto group-hover:text-accent transition" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </div>
              </button>

              <button
                onClick={() => setMode("user")}
                className="w-full text-left rounded-lg border border-border bg-surface hover:bg-hover p-4 transition group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[color-mix(in_srgb,var(--info)_12%,transparent)] flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-info" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                    </svg>
                  </div>
                  <div>
                    <span className="text-[15px] font-semibold text-foreground">Register User</span>
                    <p className="text-xs text-[var(--fg2)] mt-0.5">Join an existing organisation with an invite</p>
                  </div>
                  <svg className="w-4 h-4 text-[var(--fg3)] ml-auto group-hover:text-info transition" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </div>
              </button>
            </div>

            <p className="text-center text-sm text-[var(--fg3)] mt-6">
              {t("alreadyHaveAccount")}{" "}
              <a href="/login" className="text-accent hover:text-accent font-medium">
                {t("signIn")}
              </a>
            </p>
          </div>
        ) : (
          /* ── Registration form ── */
          <div>
            <button
              onClick={() => setMode("choose")}
              className="flex items-center gap-1 text-xs text-[var(--fg3)] hover:text-[var(--fg2)] transition mb-4"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
              Back
            </button>

            <h1 className="font-heading text-2xl font-semibold tracking-[-0.02em] text-foreground text-center mb-2">
              {isOrgMode ? "Register Organisation" : "Register User"}
            </h1>
            <p className="text-sm text-[var(--fg2)] text-center mb-6">
              {isOrgMode ? "Set up a new Qorpera workspace for your company." : "Create your account to join an existing workspace."}
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label={t("companyName")}
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder={t("companyPlaceholder")}
                required
              />

              {isOrgMode && (
                <div>
                  <Input
                    label="CVR Number"
                    value={cvr}
                    onChange={(e) => { setCvr(e.target.value); setCvrError(""); }}
                    onBlur={handleCvrBlur}
                    placeholder="e.g. 12345678"
                    required
                    error={cvrError}
                  />
                  <p className="text-[10px] text-[var(--fg3)] mt-1">Danish company registration number (8 digits)</p>
                </div>
              )}

              <Input
                label={t("yourName")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("namePlaceholder")}
                required
              />
              <Input
                label={t("email")}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("emailPlaceholder")}
                required
              />
              <div className="relative">
                <Input
                  label={t("password")}
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("passwordPlaceholder")}
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

              {error && (
                <p className="text-sm text-danger text-center">{error}</p>
              )}

              <label className="flex items-start gap-2.5 text-sm text-[var(--fg2)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={tosAccepted}
                  onChange={(e) => setTosAccepted(e.target.checked)}
                  className="mt-0.5 accent-[var(--accent)]"
                />
                <span>
                  {t("tosAgree")}{" "}
                  <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent underline">{t("termsOfService")}</a>
                  {" "}{t("and")}{" "}
                  <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent underline">{t("privacyPolicy")}</a>
                </span>
              </label>

              <Button
                variant="primary"
                size="lg"
                type="submit"
                disabled={loading || !canSubmit}
                className="w-full min-h-[44px]"
              >
                {loading ? t("submitting") : isOrgMode ? "Register Organisation" : "Create Account"}
              </Button>
            </form>

            <p className="text-center text-sm text-[var(--fg3)] mt-6">
              {t("alreadyHaveAccount")}{" "}
              <a href="/login" className="text-accent hover:text-accent font-medium">
                {t("signIn")}
              </a>
            </p>
          </div>
        )}
      </div>
      <div className="fixed bottom-4 right-4 text-xs text-[var(--fg3)]">
        <a href="/terms" className="hover:text-[var(--fg2)]">{tc("terms")}</a>
        {" · "}
        <a href="/privacy" className="hover:text-[var(--fg2)]">{tc("privacy")}</a>
        {" · "}
        <a href="/dpa" className="hover:text-[var(--fg2)]">{tc("dpa")}</a>
      </div>
    </div>
  );
}
