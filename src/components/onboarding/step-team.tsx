"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { Department, Member } from "./types";

interface StepTeamProps {
  departments: Department[];
  loadDepartments: () => Promise<void>;
  onContinue: () => void;
  onBack: () => void;
}

export function StepTeam({
  departments,
  loadDepartments,
  onContinue,
  onBack,
}: StepTeamProps) {
  const t = useTranslations("onboarding.team");
  const tc = useTranslations("common");
  const realDepts = departments.filter(d => d.entityType?.slug === "department");
  const [deptMembers, setDeptMembers] = useState<Record<string, Member[]>>({});
  const [expandedDept, setExpandedDept] = useState<string | null>(null);
  const [memberName, setMemberName] = useState("");
  const [memberRole, setMemberRole] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberError, setMemberError] = useState("");
  const [savingMember, setSavingMember] = useState(false);
  const [removingMember, setRemovingMember] = useState<string | null>(null);
  const [memberHints, setMemberHints] = useState<Record<string, string>>({});
  const [savingStep, setSavingStep] = useState(false);

  const loadMembers = useCallback(async (deptId: string) => {
    const res = await fetch(`/api/departments/${deptId}/members`);
    if (res.ok) {
      const data: Member[] = await res.json();
      setDeptMembers(prev => ({ ...prev, [deptId]: data }));
    }
  }, []);

  useEffect(() => {
    realDepts.forEach(d => loadMembers(d.id));
    if (realDepts.length > 0 && !expandedDept) {
      setExpandedDept(realDepts[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAddMember(deptId: string) {
    if (!memberName.trim() || !memberRole.trim() || !memberEmail.trim()) {
      setMemberError("All fields are required");
      return;
    }
    setSavingMember(true);
    setMemberError("");

    try {
      const res = await fetch(`/api/departments/${deptId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: memberName.trim(),
          role: memberRole.trim(),
          email: memberEmail.trim(),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setMemberError(err?.error ?? "Failed to add member");
        return;
      }

      const emailNorm = memberEmail.trim().toLowerCase();
      const userCheck = await fetch(`/api/users/invite`);
      if (userCheck.ok) {
        const data = await userCheck.json();
        const users = data.users || [];
        const found = users.some((u: { email: string }) => u.email.toLowerCase() === emailNorm);
        if (!found) {
          setMemberHints(prev => ({
            ...prev,
            [emailNorm]: t("inviteHint"),
          }));
        }
      }

      setMemberName("");
      setMemberRole("");
      setMemberEmail("");
      await loadMembers(deptId);
      await loadDepartments();
    } finally {
      setSavingMember(false);
    }
  }

  const allDeptsHaveMembers = realDepts.length > 0 && realDepts.every(d => {
    const members = deptMembers[d.id];
    return (members && members.length > 0) || d.memberCount > 0;
  });

  async function handleContinue() {
    setSavingStep(true);
    try {
      await fetch("/api/orientation/advance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      onContinue();
    } finally {
      setSavingStep(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <p className="text-xs text-white/30 uppercase tracking-wider">Step 3 of 6</p>
        <h1 className="text-2xl font-semibold text-white/90">{t("title")}</h1>
        <p className="text-sm text-white/45">
          Add at least one person to each department.
        </p>
      </div>

      <div className="space-y-4">
        {realDepts.map(dept => {
          const members = deptMembers[dept.id] ?? [];
          const hasMember = members.length > 0 || dept.memberCount > 0;
          const isExpanded = expandedDept === dept.id;

          return (
            <div key={dept.id} className="wf-soft overflow-hidden">
              <button
                onClick={() => setExpandedDept(isExpanded ? null : dept.id)}
                className="w-full flex items-center justify-between px-5 py-4 text-left"
              >
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-white/90">{dept.displayName}</h3>
                  {dept.description && (
                    <p className="text-xs text-white/40 mt-0.5">{dept.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 ml-3">
                  <span className="text-xs text-white/30">{members.length} {members.length === 1 ? "person" : "people"}</span>
                  <CheckCircle done={hasMember} />
                  <ChevronDown open={isExpanded} />
                </div>
              </button>

              {isExpanded && (
                <div className="px-5 pb-5 space-y-3 border-t border-white/[0.06] pt-3">
                  {members.length > 0 ? (
                    <div className="space-y-2">
                      {members.map(m => {
                        const isCross = !!m.crossDepartment;
                        const homeDept = m.homeDepartment;
                        const role = m.departmentRole || m.propertyValues.find(pv => pv.property.slug === "role")?.value || "";
                        const email = m.propertyValues.find(pv => pv.property.slug === "email")?.value ?? "";
                        return (
                          <div key={m.id} className="flex items-center gap-2 text-sm">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isCross ? "bg-amber-400" : "bg-purple-400"}`} />
                            <span className="text-white/80">{m.displayName}</span>
                            {role && <span className="text-white/30">— {role}</span>}
                            {email && <span className="text-white/20">— {email}</span>}
                            {isCross && homeDept && (
                              <span className="text-[10px] text-amber-400/60 px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/15">
                                Home: {homeDept}
                              </span>
                            )}
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                setRemovingMember(m.id);
                                try {
                                  await fetch(`/api/departments/${dept.id}/members/${m.id}`, { method: "DELETE" });
                                  await loadMembers(dept.id);
                                  await loadDepartments();
                                } finally {
                                  setRemovingMember(null);
                                }
                              }}
                              disabled={removingMember === m.id}
                              className="ml-auto text-white/20 hover:text-red-400 transition shrink-0"
                              title="Remove"
                            >
                              {removingMember === m.id ? (
                                <div className="w-3 h-3 rounded-full border border-white/20 border-t-white/40 animate-spin" />
                              ) : (
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              )}
                            </button>
                          </div>
                        );
                      })}
                      {members.map(m => {
                        const email = m.propertyValues.find(pv => pv.property.slug === "email")?.value ?? "";
                        const hint = memberHints[email.toLowerCase()];
                        if (!hint) return null;
                        return (
                          <p key={`hint-${m.id}`} className="text-[11px] text-amber-400/60 italic pl-3.5">
                            {hint}
                          </p>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-white/25 italic">(no team members yet)</p>
                  )}

                  <div className="pt-2 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={memberName}
                        onChange={e => { setMemberName(e.target.value); setMemberError(""); }}
                        placeholder={t("name")}
                        className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white/80 placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-purple-500/40"
                      />
                      <input
                        type="text"
                        value={memberRole}
                        onChange={e => { setMemberRole(e.target.value); setMemberError(""); }}
                        placeholder={t("role")}
                        className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white/80 placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-purple-500/40"
                      />
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="email"
                        value={memberEmail}
                        onChange={e => { setMemberEmail(e.target.value); setMemberError(""); }}
                        placeholder={t("email")}
                        className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white/80 placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-purple-500/40"
                      />
                      <Button variant="primary" size="sm" onClick={() => handleAddMember(dept.id)} disabled={savingMember}>
                        {savingMember ? "..." : tc("add")}
                      </Button>
                    </div>
                    {memberError && <p className="text-xs text-red-400">{memberError}</p>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <svg className={`w-4 h-4 ${allDeptsHaveMembers ? "text-emerald-400" : "text-white/20"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className={`text-xs ${allDeptsHaveMembers ? "text-white/50" : "text-white/30"}`}>
          {t("minMembers")}
        </span>
      </div>

      <div className="flex items-center justify-between pt-2">
        <button
          onClick={onBack}
          className="text-sm text-white/40 hover:text-white/60 transition"
        >
          &larr; {tc("back")}
        </button>
        <Button
          variant="primary"
          size="md"
          onClick={handleContinue}
          disabled={!allDeptsHaveMembers || savingStep}
        >
          {savingStep ? tc("saving") : tc("continue")}
        </Button>
      </div>
    </div>
  );
}

function CheckCircle({ done }: { done: boolean }) {
  return (
    <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
      done ? "bg-emerald-500/20" : "bg-white/[0.06]"
    }`}>
      {done ? (
        <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <div className="w-2 h-2 rounded-full bg-white/20" />
      )}
    </div>
  );
}

function ChevronDown({ open }: { open: boolean }) {
  return (
    <svg className={`w-4 h-4 text-white/30 transition ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}
