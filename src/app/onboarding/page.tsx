"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { OnboardingProgress } from "@/components/onboarding/onboarding-progress";
import { StepCompanyInfo } from "@/components/onboarding/step-company-info";
import { StepDepartments } from "@/components/onboarding/step-departments";
import { StepTeam } from "@/components/onboarding/step-team";
import { StepDocuments } from "@/components/onboarding/step-documents";
import { StepConnectors } from "@/components/onboarding/step-connectors";
import { StepSync } from "@/components/onboarding/step-sync";

import type { OnboardingStep, Department } from "@/components/onboarding/types";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function defaultPosition(index: number, total: number) {
  const radius = 180;
  const angle = (index / Math.max(total, 1)) * 2 * Math.PI - Math.PI / 2;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function OnboardingPageWrapper() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[rgba(8,12,16,1)]"><div className="text-white/30 text-sm">Loading...</div></div>}>
      <OnboardingPage />
    </Suspense>
  );
}

function OnboardingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<OnboardingStep | null>(null);

  // Shared state
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [originalCompanyName, setOriginalCompanyName] = useState("");
  const [originalIndustry, setOriginalIndustry] = useState("");
  const [departments, setDepartments] = useState<Department[]>([]);
  const positionsRef = useRef<Record<string, { x: number; y: number }>>({});

  /* ---------------------------------------------------------------- */
  /*  Position helpers                                                  */
  /* ---------------------------------------------------------------- */

  function initPositions(depts: Department[]) {
    const nonHQ = depts.filter(d => d.entityType?.slug === "department");
    depts.forEach(d => {
      const isHQ = d.entityType?.slug === "organization";
      if (isHQ) {
        positionsRef.current[d.id] = d.mapX != null && d.mapY != null
          ? { x: d.mapX, y: d.mapY }
          : { x: 0, y: 0 };
      } else {
        const idx = nonHQ.indexOf(d);
        positionsRef.current[d.id] = d.mapX != null && d.mapY != null
          ? { x: d.mapX, y: d.mapY }
          : defaultPosition(idx, nonHQ.length);
      }
    });
  }

  /* ---------------------------------------------------------------- */
  /*  On mount — detect progress                                       */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    async function detectStep() {
      const [deptRes, orientRes, operatorRes] = await Promise.all([
        fetch("/api/departments"),
        fetch("/api/orientation/current"),
        fetch("/api/operator"),
      ]);
      const allDepts: Department[] = deptRes.ok ? await deptRes.json() : [];
      const orientation = orientRes.ok ? await orientRes.json() : {};
      const operator = operatorRes.ok ? await operatorRes.json() : {};
      const phase = orientation.session?.phase ?? "mapping";

      if (operator.companyName) {
        setCompanyName(operator.companyName);
        setOriginalCompanyName(operator.companyName);
      }
      if (operator.industry) {
        setIndustry(operator.industry);
        setOriginalIndustry(operator.industry);
      }

      setDepartments(allDepts);
      initPositions(allDepts);

      // If returning from OAuth, force step 5
      const oauthProviders = ["hubspot", "stripe", "google-ads", "shopify", "linkedin", "meta-ads", "google", "microsoft"];
      const isOAuthReturn = oauthProviders.some(p => searchParams.get(p) === "connected");
      if (isOAuthReturn) {
        setStep(5);
        return;
      }

      const depts = allDepts.filter(d => d.entityType?.slug === "department");

      if (depts.length < 2) { setStep(1); return; }

      const allHavePeople = depts.every(d => d.memberCount > 0);
      if (!allHavePeople) { setStep(3); return; }

      if (phase === "mapping" || phase === "populating") { setStep(4); return; }
      if (phase === "connecting" || phase === "syncing") { setStep(6); return; }
      if (phase === "orienting") { router.replace("/copilot"); return; }
      if (phase === "active") { router.replace("/map"); return; }

      setStep(4);
    }
    detectStep();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Shared department loader                                          */
  /* ---------------------------------------------------------------- */

  const loadDepartments = useCallback(async () => {
    const res = await fetch("/api/departments");
    if (res.ok) {
      const data: Department[] = await res.json();
      setDepartments(data);
      const nonHQ = data.filter(d => d.entityType?.slug === "department");
      data.forEach(d => {
        if (!positionsRef.current[d.id]) {
          const isHQ = d.entityType?.slug === "organization";
          if (isHQ) {
            positionsRef.current[d.id] = d.mapX != null && d.mapY != null
              ? { x: d.mapX, y: d.mapY }
              : { x: 0, y: 0 };
          } else {
            const idx = nonHQ.indexOf(d);
            positionsRef.current[d.id] = d.mapX != null && d.mapY != null
              ? { x: d.mapX, y: d.mapY }
              : defaultPosition(idx, nonHQ.length);
          }
        }
      });
    }
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

      <div className="w-full max-w-[600px]">
        {step === 1 && (
          <StepCompanyInfo
            companyName={companyName}
            setCompanyName={setCompanyName}
            industry={industry}
            setIndustry={setIndustry}
            originalCompanyName={originalCompanyName}
            originalIndustry={originalIndustry}
            onContinue={(depts) => {
              setDepartments(depts);
              initPositions(depts);
              setStep(2);
            }}
          />
        )}

        {step === 2 && (
          <StepDepartments
            departments={departments}
            setDepartments={setDepartments}
            positionsRef={positionsRef}
            onContinue={() => setStep(3)}
            onBack={() => setStep(1)}
          />
        )}

        {step === 3 && (
          <StepTeam
            departments={departments}
            loadDepartments={loadDepartments}
            onContinue={() => setStep(4)}
            onBack={() => setStep(2)}
          />
        )}

        {step === 4 && (
          <StepDocuments
            departments={departments}
            onContinue={() => setStep(5)}
            onBack={() => setStep(3)}
          />
        )}

        {step === 5 && (
          <StepConnectors
            onContinue={() => setStep(6)}
            onBack={() => setStep(4)}
          />
        )}

        {step === 6 && (
          <StepSync
            departments={departments}
            setDepartments={setDepartments}
          />
        )}
      </div>
    </div>
  );
}
