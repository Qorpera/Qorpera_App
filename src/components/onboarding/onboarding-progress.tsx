"use client";

import type { OnboardingStep } from "./types";

const STEP_LABELS = ["Company", "Tools", "Analysis", "Confirm"];

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
            <div key={label} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-all ${
                    isComplete
                      ? "bg-green-500 text-white"
                      : isCurrent
                        ? "bg-accent text-white ring-2 ring-[color-mix(in_srgb,var(--accent)_40%,transparent)]"
                        : "bg-skeleton text-[var(--fg3)]"
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
                <span
                  className={`text-[10px] mt-1.5 ${
                    isCurrent
                      ? "text-white"
                      : isComplete
                        ? "text-white/60"
                        : "text-[var(--fg3)]"
                  }`}
                >
                  {label}
                </span>
              </div>
              {i < STEP_LABELS.length - 1 && (
                <div className={`hidden sm:block w-8 lg:w-14 h-px mx-2 ${isComplete ? "bg-green-500/40" : "bg-skeleton"}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
