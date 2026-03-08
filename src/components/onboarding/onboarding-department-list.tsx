"use client";

import { type ReactNode } from "react";
import type { Department } from "./types";

interface OnboardingDepartmentListProps {
  departments: Department[];
  expandedDeptId: string | null;
  onExpand: (id: string) => void;
  getStatus: (dept: Department) => "complete" | "incomplete";
  renderContent: (dept: Department) => ReactNode;
}

export function OnboardingDepartmentList({
  departments,
  expandedDeptId,
  onExpand,
  getStatus,
  renderContent,
}: OnboardingDepartmentListProps) {
  return (
    <div className="space-y-3">
      {departments.map(dept => {
        const isExpanded = expandedDeptId === dept.id;
        const status = getStatus(dept);
        return (
          <div
            key={dept.id}
            className={`rounded-xl border transition ${
              isExpanded
                ? "border-purple-500/20 bg-white/[0.02]"
                : "border-white/[0.06] hover:border-white/[0.1]"
            }`}
          >
            <button
              onClick={() => onExpand(dept.id)}
              className="w-full flex items-center justify-between p-4 text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                    status === "complete"
                      ? "bg-emerald-500/20"
                      : "bg-white/[0.06]"
                  }`}
                >
                  {status === "complete" ? (
                    <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-white/20" />
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-white/90 truncate">{dept.displayName}</h3>
                  {dept.description && (
                    <p className="text-xs text-white/35 truncate">{dept.description}</p>
                  )}
                </div>
              </div>
              <svg
                className={`w-4 h-4 text-white/30 flex-shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isExpanded && (
              <div className="px-4 pb-4 border-t border-white/[0.04] pt-4">
                {renderContent(dept)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
