"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { OnboardingProgress } from "@/components/onboarding/onboarding-progress";
import { StepCompanyInfo } from "@/components/onboarding/step-company-info";
import { StepConnectTools } from "@/components/onboarding/step-connect-tools";
import { StepAnalysis } from "@/components/onboarding/step-analysis";
import { StepConfirmStructure } from "@/components/onboarding/step-confirm-structure";

import type { OnboardingStep } from "@/components/onboarding/types";

/* ------------------------------------------------------------------ */
/*  Page wrapper                                                        */
/* ------------------------------------------------------------------ */

export default function OnboardingPageWrapper() {
  const tc = useTranslations("common");
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[rgba(8,12,16,1)]"><div className="text-white/30 text-sm">{tc("loading")}</div></div>}>
      <OnboardingPage />
    </Suspense>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                           */
/* ------------------------------------------------------------------ */

function OnboardingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<OnboardingStep | null>(null);

  // Shared state for Step 1
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [originalCompanyName, setOriginalCompanyName] = useState("");
  const [originalIndustry, setOriginalIndustry] = useState("");

  /* ---------------------------------------------------------------- */
  /*  On mount — detect progress                                       */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    async function detectStep() {
      const [orientRes, operatorRes, connectorsRes, analysisRes] = await Promise.all([
        fetch("/api/orientation/current"),
        fetch("/api/operator"),
        fetch("/api/connectors"),
        fetch("/api/onboarding/analysis-progress").catch(() => null),
      ]);

      const orientation = orientRes.ok ? await orientRes.json() : {};
      const operator = operatorRes.ok ? await operatorRes.json() : {};
      const connectorsData = connectorsRes.ok ? await connectorsRes.json() : {};
      const analysis = analysisRes && analysisRes.ok ? await analysisRes.json() : null;

      const phase = orientation.session?.phase ?? null;
      const connectors = connectorsData.connectors || [];

      if (operator.companyName) {
        setCompanyName(operator.companyName);
        setOriginalCompanyName(operator.companyName);
      }
      if (operator.industry) {
        setIndustry(operator.industry);
        setOriginalIndustry(operator.industry);
      }

      // OAuth return detection — force Step 2
      const oauthProviders = [
        "workspace", "google", "microsoft", "slack", "hubspot", "stripe",
        "google-ads", "shopify", "linkedin", "meta-ads",
        "pipedrive", "salesforce", "intercom", "zendesk",
      ];
      const isOAuthReturn = oauthProviders.some(p => searchParams.get(p) === "connected");
      if (isOAuthReturn) {
        setStep(2);
        return;
      }

      // Phase-based routing
      if (phase === "orienting") { router.replace("/copilot"); return; }
      if (phase === "active") { router.replace("/map"); return; }

      // Data-state resume detection
      if (analysis?.status === "confirming") { setStep(4); return; }
      if (analysis?.status === "analyzing") { setStep(3); return; }
      if (phase === "analyzing" || phase === "syncing") { setStep(3); return; }
      if (phase === "confirming") { setStep(4); return; }
      if (phase === "connecting") { setStep(2); return; }

      // No session or initial phase — Step 1
      if (!phase || phase === "mapping") { setStep(1); return; }

      // Fallback
      setStep(1);
    }
    detectStep();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  if (step === null) {
    return (
      <div className="min-h-screen bg-[rgba(8,12,16,1)] flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-purple-500/40 border-t-purple-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[rgba(8,12,16,1)] flex flex-col items-center px-4 py-12">
      <OnboardingProgress step={step} />

      <div className={`w-full ${step === 4 ? "max-w-3xl" : "max-w-[600px]"}`}>
        {step === 1 && (
          <StepCompanyInfo
            companyName={companyName}
            setCompanyName={setCompanyName}
            industry={industry}
            setIndustry={setIndustry}
            originalCompanyName={originalCompanyName}
            originalIndustry={originalIndustry}
            onContinue={() => {
              setStep(2);
            }}
          />
        )}

        {step === 2 && (
          <StepConnectTools
            onContinue={() => setStep(3)}
            onBack={() => setStep(1)}
          />
        )}

        {step === 3 && (
          <StepAnalysis
            onComplete={() => setStep(4)}
          />
        )}

        {step === 4 && (
          <StepConfirmStructure />
        )}
      </div>
    </div>
  );
}
