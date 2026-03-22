"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function RegisterPage() {
  const router = useRouter();
  const t = useTranslations("auth.register");
  const tc = useTranslations("common");
  const [companyName, setCompanyName] = useState("");
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
      setError(data.error || t("registrationFailed"));
    } catch {
      setError(tc("connectionError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0e1418]">
      <div className="w-full max-w-sm mx-auto px-4">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <svg viewBox="0 0 40 40" className="w-14 h-14" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.5 23 C17 21, 9 12, 3 5" stroke="white" strokeWidth="1.1" strokeLinecap="round" />
            <circle cx="27" cy="27" r="6.5" stroke="white" strokeWidth="1.1" />
          </svg>
        </div>

        <h1 className="font-heading text-2xl font-semibold tracking-[-0.02em] text-white/90 text-center mb-2">
          {t("title")}
        </h1>
        <p className="text-sm text-white/40 text-center mb-6">
          {t("subtitle")}
        </p>

        {checking ? (
          <p className="text-sm text-white/40 text-center">{tc("loading")}</p>
        ) : registrationClosed ? (
          <div className="text-center space-y-4">
            <p className="text-sm text-white/50">{t("registrationClosed")}</p>
            <p className="text-sm text-white/30">
              {t("contactAdmin")}{" "}
              <a href="/login" className="text-purple-400 hover:text-purple-300">{t("signIn")}</a>.
            </p>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label={t("companyName")}
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder={t("companyPlaceholder")}
            required
          />
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
              className="absolute right-3 top-[34px] text-white/30 hover:text-white/60 transition"
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
            <p className="text-sm text-red-400 text-center">{error}</p>
          )}

          <label className="flex items-start gap-2.5 text-sm text-white/60 cursor-pointer">
            <input
              type="checkbox"
              checked={tosAccepted}
              onChange={(e) => setTosAccepted(e.target.checked)}
              className="mt-0.5 accent-purple-500"
            />
            <span>
              {t("tosAgree")}{" "}
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300 underline">{t("termsOfService")}</a>
              {" "}{t("and")}{" "}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300 underline">{t("privacyPolicy")}</a>
            </span>
          </label>

          <Button
            variant="primary"
            size="lg"
            type="submit"
            disabled={loading || !companyName || !name || !email || password.length < 8 || !tosAccepted}
            className="w-full min-h-[44px]"
          >
            {loading ? t("submitting") : t("submit")}
          </Button>
        </form>
        )}

        {!registrationClosed && !checking && (
        <p className="text-center text-sm text-white/30 mt-6">
          {t("alreadyHaveAccount")}{" "}
          <a href="/login" className="text-purple-400 hover:text-purple-300">
            {t("signIn")}
          </a>
        </p>
        )}
      </div>
      <div className="text-center text-xs text-white/30 pb-8">
        <a href="/terms" className="hover:text-white/50">{tc("terms")}</a>
        {" · "}
        <a href="/privacy" className="hover:text-white/50">{tc("privacy")}</a>
        {" · "}
        <a href="/dpa" className="hover:text-white/50">{tc("dpa")}</a>
      </div>
    </div>
  );
}
