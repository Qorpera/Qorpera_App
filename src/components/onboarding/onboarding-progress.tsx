"use client";

import type { OnboardingStep } from "./types";

const STEP_LABELS = ["Name", "Depts", "Team", "Docs", "Tools", "Sync"];

interface OnboardingProgressProps {
  step: OnboardingStep;
}

export function OnboardingProgress({ step }: OnboardingProgressProps) {
  return (
    <div className="w-full max-w-[600px] mb-12">
      <div className="flex items-center justify-between">
        {STEP_LABELS.map((label, i) => {
          const stepNum = (i + 1) as OnboardingStep;
          const isComplete = step > stepNum;
          const isCurrent = step === stepNum;
          return (
            <div key={label} className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-all ${
                  isComplete
                    ? "bg-purple-500 text-white"
                    : isCurrent
                      ? "bg-purple-500/20 text-purple-300 ring-2 ring-purple-500/40"
                      : "bg-white/[0.06] text-white/30"
                }`}
              >
                {isComplete ? (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  stepNum
                )}
              </div>
              {i < STEP_LABELS.length - 1 && (
                <div className={`hidden sm:block w-8 lg:w-14 h-px ${isComplete ? "bg-purple-500/40" : "bg-white/[0.06]"}`} />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-2">
        {STEP_LABELS.map((label, i) => {
          const stepNum = (i + 1) as OnboardingStep;
          return (
            <span
              key={label}
              className={`text-[10px] ${
                step === stepNum
                  ? "text-white/70"
                  : step > stepNum
                    ? "text-purple-400/60"
                    : "text-white/25"
              }`}
            >
              {label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
