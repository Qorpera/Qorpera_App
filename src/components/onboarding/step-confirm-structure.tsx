"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface SynthesisDepartment {
  name: string;
  headCount: number;
  keyPeople: string[];
  functions: string[];
}

interface SynthesisPerson {
  name: string;
  email?: string;
  department?: string;
  role?: string;
  relationships: string[];
}

interface SynthesisOutput {
  departments: SynthesisDepartment[];
  people: SynthesisPerson[];
  processes: Array<{
    name: string;
    department?: string;
    description: string;
    tools: string[];
  }>;
  relationships: Array<{
    from: string;
    to: string;
    type: string;
    strength: "strong" | "moderate" | "weak";
  }>;
  knowledgeInventory: Array<{
    topic: string;
    sources: string[];
    coverage: "comprehensive" | "partial" | "sparse";
  }>;
  financialBaseline?: {
    revenue?: string;
    keyMetrics: Record<string, string>;
    tools: string[];
  };
  situationRecommendations: Array<{
    name: string;
    description: string;
    department?: string;
    priority: "high" | "medium" | "low";
  }>;
}

interface UncertaintyQuestion {
  question: string;
  context: string;
  possibleAnswers?: string[];
  department?: string;
}

interface AnalysisProgress {
  status: string;
  synthesisOutput?: SynthesisOutput;
  uncertaintyLog?: UncertaintyQuestion[];
}

interface CompanyModelEdits {
  renamedDepartments?: Array<{ oldName: string; newName: string }>;
  deletedDepartments?: string[];
  movedPeople?: Array<{ email: string; toDepartment: string }>;
  deletedPeople?: string[];
  addedDepartments?: Array<{ name: string; description?: string }>;
}

/* ------------------------------------------------------------------ */
/*  Component                                                           */
/* ------------------------------------------------------------------ */

export function StepConfirmStructure() {
  const t = useTranslations("onboarding.confirm");
  const tc = useTranslations("common");
  const router = useRouter();

  const [synthesis, setSynthesis] = useState<SynthesisOutput | null>(null);
  const [questions, setQuestions] = useState<UncertaintyQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [edits, setEdits] = useState<CompanyModelEdits>({});
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"map" | "questions" | "preview">("map");

  // Inline-rename state
  const [renamingDept, setRenamingDept] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/onboarding/analysis-progress");
      if (!res.ok) return;
      const data: AnalysisProgress = await res.json();
      if (data.synthesisOutput) {
        setSynthesis(data.synthesisOutput);
      }
      if (data.uncertaintyLog && Array.isArray(data.uncertaintyLog)) {
        setQuestions(data.uncertaintyLog);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Edit helpers ──

  function renameDepartment(oldName: string, newName: string) {
    setEdits(prev => ({
      ...prev,
      renamedDepartments: [
        ...(prev.renamedDepartments || []).filter(r => r.oldName !== oldName),
        { oldName, newName },
      ],
    }));
    setRenamingDept(null);
  }

  function deleteDepartment(name: string) {
    setEdits(prev => ({
      ...prev,
      deletedDepartments: [...new Set([...(prev.deletedDepartments || []), name])],
    }));
  }

  function undoDeleteDepartment(name: string) {
    setEdits(prev => ({
      ...prev,
      deletedDepartments: (prev.deletedDepartments || []).filter(d => d !== name),
    }));
  }

  function deletePerson(email: string) {
    setEdits(prev => ({
      ...prev,
      deletedPeople: [...new Set([...(prev.deletedPeople || []), email])],
    }));
  }

  function undoDeletePerson(email: string) {
    setEdits(prev => ({
      ...prev,
      deletedPeople: (prev.deletedPeople || []).filter(e => e !== email),
    }));
  }

  function movePerson(email: string, toDepartment: string) {
    setEdits(prev => ({
      ...prev,
      movedPeople: [
        ...(prev.movedPeople || []).filter(m => m.email !== email),
        { email, toDepartment },
      ],
    }));
  }

  // ── Confirm ──

  async function handleConfirm() {
    setConfirming(true);
    try {
      // Submit edits and answers first — if this fails, phase stays at confirming
      const confirmRes = await fetch("/api/onboarding/confirm-structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          edits: hasEdits() ? edits : undefined,
          uncertaintyAnswers: Object.keys(answers).length > 0 ? answers : undefined,
        }),
      });

      if (!confirmRes.ok) {
        setConfirming(false);
        return;
      }

      // Only advance phase after successful confirmation
      await fetch("/api/orientation/advance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetPhase: "orienting" }),
      });

      router.replace("/copilot");
    } finally {
      setConfirming(false);
    }
  }

  function hasEdits() {
    return (
      (edits.renamedDepartments?.length ?? 0) > 0 ||
      (edits.deletedDepartments?.length ?? 0) > 0 ||
      (edits.movedPeople?.length ?? 0) > 0 ||
      (edits.deletedPeople?.length ?? 0) > 0 ||
      (edits.addedDepartments?.length ?? 0) > 0
    );
  }

  // ── Derived data ──

  function getDisplayName(deptName: string) {
    const rename = edits.renamedDepartments?.find(r => r.oldName === deptName);
    return rename ? rename.newName : deptName;
  }

  function isDeptDeleted(deptName: string) {
    return edits.deletedDepartments?.includes(deptName) ?? false;
  }

  function isPersonDeleted(email: string) {
    return edits.deletedPeople?.includes(email) ?? false;
  }

  function getPersonDept(person: SynthesisPerson) {
    const move = edits.movedPeople?.find(m => m.email === person.email);
    return move ? move.toDepartment : person.department;
  }

  if (loading) {
    return (
      <div className="min-h-[300px] flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-purple-500/40 border-t-purple-400 animate-spin" />
      </div>
    );
  }

  if (!synthesis) {
    return (
      <div className="text-center space-y-4 py-12">
        <p className="text-white/50 text-sm">{t("noData")}</p>
        <Button variant="primary" size="md" onClick={loadData}>{t("reload")}</Button>
      </div>
    );
  }

  const departments = synthesis.departments;
  const people = synthesis.people;
  const unassignedPeople = people.filter(p => !p.department);
  const situationCount = synthesis.situationRecommendations.length;
  const atRiskRelationships = synthesis.relationships.filter(r => r.strength === "weak").length;

  return (
    <div className="space-y-6 w-full max-w-3xl mx-auto">
      <div className="text-center space-y-2">
        <p className="text-xs text-white/30 uppercase tracking-wider">Step 4 of 4</p>
        <h1 className="text-2xl font-semibold text-white/90">{t("title")}</h1>
        <p className="text-sm text-white/45">{t("subtitle")}</p>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 p-1 bg-white/[0.04] rounded-lg">
        {(["map", "questions", "preview"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 px-3 py-2 rounded-md text-xs font-medium transition min-h-[44px] ${
              activeTab === tab
                ? "bg-purple-500/20 text-purple-300"
                : "text-white/40 hover:text-white/60"
            }`}
          >
            {tab === "map" ? t("orgMap") : tab === "questions" ? `${t("uncertaintyLog")} (${questions.length})` : t("preview")}
          </button>
        ))}
      </div>

      {/* Section A — Organizational Map */}
      {activeTab === "map" && (
        <div className="space-y-4">
          {departments.map(dept => {
            const deleted = isDeptDeleted(dept.name);
            const displayName = getDisplayName(dept.name);
            const deptPeople = people.filter(p => getPersonDept(p) === dept.name);
            const deptSituations = synthesis.situationRecommendations.filter(s => s.department === dept.name);

            return (
              <div
                key={dept.name}
                className={`wf-soft p-4 space-y-3 transition ${deleted ? "opacity-40" : ""}`}
              >
                {/* Department header */}
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-purple-500 shrink-0" />
                  {renamingDept === dept.name ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        className="bg-white/[0.06] border border-white/[0.12] rounded px-2 py-1 text-base text-white/90 flex-1"
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter" && renameValue.trim()) renameDepartment(dept.name, renameValue.trim());
                          if (e.key === "Escape") setRenamingDept(null);
                        }}
                        autoFocus
                      />
                      <button
                        onClick={() => renameValue.trim() && renameDepartment(dept.name, renameValue.trim())}
                        className="text-xs text-purple-300 hover:text-purple-200"
                      >
                        {t("save")}
                      </button>
                    </div>
                  ) : (
                    <h3
                      className="text-sm font-medium text-white/90 flex-1 cursor-pointer hover:text-purple-300 transition"
                      onClick={() => { setRenamingDept(dept.name); setRenameValue(displayName); }}
                      title={t("clickToRename")}
                    >
                      {displayName}
                    </h3>
                  )}
                  <span className="text-xs text-white/30">{t("people", { count: dept.headCount })}</span>
                  {deleted ? (
                    <button
                      onClick={() => undoDeleteDepartment(dept.name)}
                      className="text-xs text-amber-400 hover:text-amber-300 min-h-[44px] px-2"
                    >
                      {t("undo")}
                    </button>
                  ) : (
                    <button
                      onClick={() => deleteDepartment(dept.name)}
                      className="text-xs text-white/20 hover:text-red-400 transition min-h-[44px] px-2"
                    >
                      {t("remove")}
                    </button>
                  )}
                </div>

                {/* Functions */}
                {dept.functions.length > 0 && (
                  <div className="flex flex-wrap gap-1 pl-5">
                    {dept.functions.map(fn => (
                      <span key={fn} className="px-2 py-0.5 rounded-full bg-white/[0.04] text-[10px] text-white/40">{fn}</span>
                    ))}
                  </div>
                )}

                {/* People in this department */}
                {!deleted && deptPeople.length > 0 && (
                  <div className="pl-5 space-y-1">
                    {deptPeople.map(person => {
                      const personDeleted = person.email ? isPersonDeleted(person.email) : false;
                      return (
                        <div
                          key={person.email || person.name}
                          className={`flex items-center gap-2 py-1 ${personDeleted ? "opacity-40" : ""}`}
                        >
                          <div className="w-5 h-5 rounded-full bg-white/[0.06] flex items-center justify-center text-[9px] text-white/40 shrink-0">
                            {person.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-xs text-white/70">{person.name}</span>
                            {person.role && (
                              <span className="text-[10px] text-white/30 ml-2">{person.role}</span>
                            )}
                          </div>
                          {/* Move dropdown */}
                          {person.email && !personDeleted && departments.length > 1 && (
                            <select
                              className="bg-transparent border-none text-[10px] text-white/20 hover:text-white/40 cursor-pointer"
                              value=""
                              onChange={e => {
                                if (e.target.value && person.email) movePerson(person.email, e.target.value);
                              }}
                              title={t("moveToDepartment")}
                            >
                              <option value="">{t("moveTo")}</option>
                              {departments.filter(d => d.name !== dept.name && !isDeptDeleted(d.name)).map(d => (
                                <option key={d.name} value={d.name}>{getDisplayName(d.name)}</option>
                              ))}
                            </select>
                          )}
                          {person.email && (
                            personDeleted ? (
                              <button
                                onClick={() => person.email && undoDeletePerson(person.email)}
                                className="text-[10px] text-amber-400 hover:text-amber-300 min-h-[44px] px-1"
                              >
                                {t("undo")}
                              </button>
                            ) : (
                              <button
                                onClick={() => person.email && deletePerson(person.email)}
                                className="text-[10px] text-white/15 hover:text-red-400 transition min-h-[44px] px-1"
                              >
                                {t("remove")}
                              </button>
                            )
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Situations badge */}
                {deptSituations.length > 0 && (
                  <div className="pl-5">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-500/10 text-[10px] text-purple-300/70">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                      </svg>
                      {t("situationsBadge", { count: deptSituations.length })}
                    </span>
                  </div>
                )}
              </div>
            );
          })}

          {/* People without department */}
          {unassignedPeople.length > 0 && (
            <div className="wf-soft p-4 space-y-2">
              <h3 className="text-sm font-medium text-white/60">{t("unassigned")}</h3>
              {unassignedPeople.map(person => (
                <div key={person.email || person.name} className="flex items-center gap-2 py-1">
                  <div className="w-5 h-5 rounded-full bg-white/[0.06] flex items-center justify-center text-[9px] text-white/40 shrink-0">
                    {person.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-xs text-white/70 flex-1">{person.name}</span>
                  {person.email && departments.length > 0 && (
                    <select
                      className="bg-transparent border-none text-[10px] text-white/30 cursor-pointer"
                      value=""
                      onChange={e => {
                        if (e.target.value && person.email) movePerson(person.email, e.target.value);
                      }}
                    >
                      <option value="">{t("assignTo")}</option>
                      {departments.filter(d => !isDeptDeleted(d.name)).map(d => (
                        <option key={d.name} value={d.name}>{getDisplayName(d.name)}</option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Section B — Uncertainty Log */}
      {activeTab === "questions" && (
        <div className="space-y-4">
          {questions.length === 0 ? (
            <div className="wf-soft p-6 text-center">
              <p className="text-sm text-white/40">{t("noQuestions")}</p>
            </div>
          ) : (
            questions.map((q, i) => (
              <div key={i} className="wf-soft p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <span className="text-purple-400 shrink-0 mt-0.5">?</span>
                  <p className="text-sm text-white/80">{q.question}</p>
                </div>
                {q.context && (
                  <p className="text-xs text-white/35 pl-5">{q.context}</p>
                )}
                {q.possibleAnswers && q.possibleAnswers.length > 0 ? (
                  <div className="pl-5 flex flex-wrap gap-2">
                    {q.possibleAnswers.map((ans, j) => (
                      <button
                        key={j}
                        onClick={() => setAnswers(prev => ({ ...prev, [i]: ans }))}
                        className={`px-3 py-1.5 rounded-lg text-xs transition min-h-[44px] ${
                          answers[i] === ans
                            ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                            : "bg-white/[0.04] text-white/50 border border-white/[0.08] hover:bg-white/[0.06]"
                        }`}
                      >
                        {ans}
                      </button>
                    ))}
                    {/* Free-text "Other" input */}
                    <input
                      placeholder={t("otherAnswer")}
                      className="px-3 py-1.5 rounded-lg text-xs bg-white/[0.04] border border-white/[0.08] text-white/60 placeholder-white/20 min-w-[120px] text-base"
                      value={answers[i] && !q.possibleAnswers.includes(answers[i]) ? answers[i] : ""}
                      onChange={e => setAnswers(prev => ({ ...prev, [i]: e.target.value }))}
                    />
                  </div>
                ) : (
                  <div className="pl-5">
                    <input
                      placeholder={t("yourAnswer")}
                      className="w-full px-3 py-2 rounded-lg text-xs bg-white/[0.04] border border-white/[0.08] text-white/60 placeholder-white/20 text-base"
                      value={answers[i] || ""}
                      onChange={e => setAnswers(prev => ({ ...prev, [i]: e.target.value }))}
                    />
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Section C — Operational Intelligence Preview */}
      {activeTab === "preview" && (
        <div className="space-y-4">
          {/* Situations summary */}
          <div className="wf-soft p-4 space-y-3">
            <h3 className="text-sm font-medium text-white/70">{t("detectedIntelligence")}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <StatCard
                label={t("situationsDetected", { count: situationCount, departments: departments.length })}
                value={String(situationCount)}
                color="purple"
              />
              <StatCard
                label={t("situationTypes", { count: situationCount })}
                value={String(situationCount)}
                color="purple"
              />
              {atRiskRelationships > 0 && (
                <StatCard
                  label={t("atRiskCustomers", { count: atRiskRelationships })}
                  value={String(atRiskRelationships)}
                  color="amber"
                />
              )}
              {synthesis.financialBaseline?.revenue && (
                <StatCard
                  label={t("estimatedRevenue")}
                  value={synthesis.financialBaseline.revenue}
                  color="emerald"
                />
              )}
            </div>
          </div>

          {/* Situation recommendations preview */}
          {synthesis.situationRecommendations.length > 0 && (
            <div className="wf-soft p-4 space-y-2">
              <h3 className="text-sm font-medium text-white/70">{t("recommendedMonitoring")}</h3>
              {synthesis.situationRecommendations.slice(0, 6).map((rec, i) => (
                <div key={i} className="flex items-start gap-2 py-1">
                  <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                    rec.priority === "high" ? "bg-red-400" : rec.priority === "medium" ? "bg-amber-400" : "bg-white/30"
                  }`} />
                  <div>
                    <p className="text-xs text-white/70">{rec.name}</p>
                    <p className="text-[10px] text-white/30">{rec.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Knowledge coverage */}
          {synthesis.knowledgeInventory.length > 0 && (
            <div className="wf-soft p-4 space-y-2">
              <h3 className="text-sm font-medium text-white/70">{t("knowledgeCoverage")}</h3>
              <div className="flex flex-wrap gap-2">
                {synthesis.knowledgeInventory.map((ki, i) => (
                  <span
                    key={i}
                    className={`px-2 py-1 rounded text-[10px] ${
                      ki.coverage === "comprehensive"
                        ? "bg-emerald-500/10 text-emerald-400/70"
                        : ki.coverage === "partial"
                          ? "bg-amber-500/10 text-amber-400/70"
                          : "bg-white/[0.04] text-white/30"
                    }`}
                  >
                    {ki.topic}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Confirm button */}
      <div className="flex justify-center pt-4">
        <Button
          variant="primary"
          size="lg"
          onClick={handleConfirm}
          disabled={confirming}
          className="min-h-[44px]"
        >
          {confirming ? (
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              {tc("saving")}
            </span>
          ) : t("confirm")}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Stat card                                                           */
/* ------------------------------------------------------------------ */

function StatCard({ label, value, color }: { label: string; value: string; color: "purple" | "amber" | "emerald" }) {
  const colorClasses = {
    purple: "bg-purple-500/10 text-purple-300",
    amber: "bg-amber-500/10 text-amber-300",
    emerald: "bg-emerald-500/10 text-emerald-300",
  };
  return (
    <div className={`rounded-lg p-3 ${colorClasses[color].split(" ")[0]}`}>
      <div className={`text-lg font-semibold ${colorClasses[color].split(" ")[1]}`}>{value}</div>
      <div className="text-[10px] text-white/40 mt-0.5">{label}</div>
    </div>
  );
}
