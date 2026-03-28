"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DEMO_SYNTHESIS_OUTPUT, DEMO_UNCERTAINTY_LOG } from "@/lib/demo/company-model";

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

interface StepConfirmStructureProps {
  demoMode?: boolean;
}

export function StepConfirmStructure({ demoMode }: StepConfirmStructureProps) {
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

  // Chat state
  const [chatMessages, setChatMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatStreaming, setChatStreaming] = useState(false);
  const [chatInitialized, setChatInitialized] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (demoMode) {
        setSynthesis(DEMO_SYNTHESIS_OUTPUT as unknown as SynthesisOutput);
        setQuestions(DEMO_UNCERTAINTY_LOG as unknown as UncertaintyQuestion[]);
        return;
      }
      const res = await fetch("/api/onboarding/analysis-progress");
      if (!res.ok) return;
      const data: AnalysisProgress = await res.json();
      if (data.synthesisOutput) {
        const s = data.synthesisOutput;
        setSynthesis({
          ...s,
          departments: s.departments ?? [],
          people: s.people ?? [],
          processes: s.processes ?? [],
          relationships: s.relationships ?? [],
          knowledgeInventory: s.knowledgeInventory ?? [],
          situationRecommendations: s.situationRecommendations ?? [],
        });
      }
      if (data.uncertaintyLog && Array.isArray(data.uncertaintyLog)) {
        setQuestions(data.uncertaintyLog);
      }
    } finally {
      setLoading(false);
    }
  }, [demoMode]);

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

  // Chat auto-scroll
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // Initialize chat when questions tab is selected
  useEffect(() => {
    if (activeTab === "questions" && !chatInitialized && questions.length > 0) {
      setChatInitialized(true);
      initializeChat();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, chatInitialized, questions]);

  const initializeChat = async () => {
    setChatStreaming(true);
    try {
      const res = await fetch("/api/onboarding/questions-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: null, history: [] }),
      });

      if (!res.ok || !res.body) {
        setChatMessages([{ role: "assistant", content: t("chatInitError") }]);
        return;
      }

      let assistantContent = "";
      setChatMessages([{ role: "assistant", content: "" }]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        assistantContent += decoder.decode(value, { stream: true });
        setChatMessages([{ role: "assistant", content: assistantContent }]);
      }
    } catch (err) {
      console.error("Chat init failed:", err);
      setChatMessages([{ role: "assistant", content: t("chatInitError") }]);
    } finally {
      setChatStreaming(false);
    }
  };

  const sendChatMessage = async () => {
    const text = chatInput.trim();
    if (!text || chatStreaming) return;

    const userMsg = { role: "user" as const, content: text };
    const newMessages = [...chatMessages, userMsg];
    setChatMessages(newMessages);
    setChatInput("");
    setChatStreaming(true);

    try {
      const res = await fetch("/api/onboarding/questions-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: newMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok || !res.body) return;

      let assistantContent = "";
      setChatMessages(prev => [...prev, { role: "assistant", content: "" }]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        assistantContent += decoder.decode(value, { stream: true });
        setChatMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: assistantContent };
          return updated;
        });
      }
    } catch (err) {
      console.error("Chat send failed:", err);
    } finally {
      setChatStreaming(false);
      chatInputRef.current?.focus();
    }
  };

  async function handleConfirm() {
    setConfirming(true);
    try {
      if (demoMode) {
        // Call test company generator instead of confirm-structure
        const res = await fetch("/api/admin/create-test-company", { method: "POST" });
        if (!res.ok) {
          console.error("Failed to create test company");
          setConfirming(false);
          return;
        }
        // Advance orientation to active
        await fetch("/api/orientation/advance", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetPhase: "active" }),
        });
        router.replace("/situations");
        return;
      }

      // Extract answers from chat conversation
      let uncertaintyAnswers: Record<number, string> = {};
      if (chatMessages.length > 1) {
        try {
          const extractRes = await fetch("/api/onboarding/extract-answers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ history: chatMessages }),
          });
          if (extractRes.ok) {
            const extractData = await extractRes.json();
            uncertaintyAnswers = extractData.answers ?? {};
          }
        } catch {
          console.warn("Answer extraction failed — proceeding");
        }
      }

      const finalAnswers = Object.keys(uncertaintyAnswers).length > 0
        ? uncertaintyAnswers
        : Object.keys(answers).length > 0 ? answers : undefined;

      const confirmRes = await fetch("/api/onboarding/confirm-structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          edits: hasEdits() ? edits : undefined,
          uncertaintyAnswers: finalAnswers,
        }),
      });

      if (!confirmRes.ok) {
        setConfirming(false);
        return;
      }

      window.location.href = "/map";
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
        <div className="w-6 h-6 rounded-full border-2 border-accent/40 border-t-accent animate-spin" />
      </div>
    );
  }

  if (!synthesis) {
    return (
      <div className="text-center space-y-4 py-12">
        <p className="text-[var(--fg2)] text-sm">{t("noData")}</p>
        <Button variant="primary" size="md" onClick={loadData}>{t("reload")}</Button>
      </div>
    );
  }

  const departments = synthesis.departments;
  const people = synthesis.people;
  const unassignedPeople = people.filter(p => !p.department);
  const situationCount = (synthesis.situationRecommendations ?? []).length;
  const atRiskRelationships = (synthesis.relationships ?? []).filter(r => r.strength === "weak").length;

  return (
    <div className="space-y-6 w-full max-w-3xl mx-auto">
      <div className="text-center space-y-2">
        <p className="text-xs text-[var(--fg3)] uppercase tracking-wider">Step 4 of 4</p>
        <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
        <p className="text-sm text-[var(--fg2)]">{t("subtitle")}</p>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 p-1 bg-hover rounded-lg">
        {(["map", "questions", "preview"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 px-3 py-2 rounded-md text-xs font-medium transition min-h-[44px] ${
              activeTab === tab
                ? "bg-accent-light text-accent"
                : "text-[var(--fg2)] hover:text-foreground"
            }`}
          >
            {tab === "map" ? t("orgMap") : tab === "questions" ? t("clarifications") : t("preview")}
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
            const deptSituations = (synthesis.situationRecommendations ?? []).filter(s => s.department === dept.name);

            return (
              <div
                key={dept.name}
                className={`wf-soft p-4 space-y-3 transition ${deleted ? "opacity-40" : ""}`}
              >
                {/* Department header */}
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-accent shrink-0" />
                  {renamingDept === dept.name ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        className="text-base font-medium text-foreground bg-hover border border-accent rounded-lg px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-accent flex-1"
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter" && renameValue.trim()) renameDepartment(dept.name, renameValue.trim());
                          if (e.key === "Escape") setRenamingDept(null);
                        }}
                        onBlur={() => renameValue.trim() && renameDepartment(dept.name, renameValue.trim())}
                        autoFocus
                      />
                    </div>
                  ) : (
                    <div
                      className="flex items-center gap-2 cursor-pointer group flex-1"
                      onClick={() => { setRenamingDept(dept.name); setRenameValue(displayName); }}
                    >
                      <h3 className="text-base font-medium text-foreground border-b border-dashed border-[var(--fg3)] group-hover:border-accent transition pb-0.5">
                        {displayName}
                      </h3>
                      <svg
                        className="w-3.5 h-3.5 text-[var(--fg3)] group-hover:text-accent transition opacity-60 group-hover:opacity-100"
                        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      >
                        <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                      </svg>
                    </div>
                  )}
                  <span className="text-xs text-[var(--fg3)]">{t("people", { count: dept.headCount })}</span>
                  {deleted ? (
                    <button
                      onClick={() => undoDeleteDepartment(dept.name)}
                      className="text-xs text-warn hover:text-warn min-h-[44px] px-2"
                    >
                      {t("undo")}
                    </button>
                  ) : (
                    <button
                      onClick={() => deleteDepartment(dept.name)}
                      className="text-xs text-[var(--fg3)] hover:text-danger transition min-h-[44px] px-2"
                    >
                      {t("remove")}
                    </button>
                  )}
                </div>

                {/* Functions */}
                {dept.functions.length > 0 && (
                  <div className="flex flex-wrap gap-1 pl-5">
                    {dept.functions.map(fn => (
                      <span key={fn} className="px-2 py-0.5 rounded-full bg-hover text-[10px] text-[var(--fg2)]">{fn}</span>
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
                          <div className="w-5 h-5 rounded-full bg-skeleton flex items-center justify-center text-[9px] text-[var(--fg2)] shrink-0">
                            {person.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-xs text-[var(--fg2)]">{person.name}</span>
                            {person.role && (
                              <span className="text-[10px] text-[var(--fg3)] ml-2">{person.role}</span>
                            )}
                          </div>
                          {/* Move dropdown */}
                          {person.email && !personDeleted && departments.length > 1 && (
                            <select
                              className="bg-transparent border-none text-[10px] text-[var(--fg3)] hover:text-[var(--fg2)] cursor-pointer"
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
                                className="text-[10px] text-warn hover:text-warn min-h-[44px] px-1"
                              >
                                {t("undo")}
                              </button>
                            ) : (
                              <button
                                onClick={() => person.email && deletePerson(person.email)}
                                className="text-[10px] text-[var(--fg3)] hover:text-danger transition min-h-[44px] px-1"
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
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent-light text-[10px] text-accent/70">
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
              <h3 className="text-sm font-medium text-[var(--fg2)]">{t("unassigned")}</h3>
              {unassignedPeople.map(person => (
                <div key={person.email || person.name} className="flex items-center gap-2 py-1">
                  <div className="w-5 h-5 rounded-full bg-skeleton flex items-center justify-center text-[9px] text-[var(--fg2)] shrink-0">
                    {person.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-xs text-[var(--fg2)] flex-1">{person.name}</span>
                  {person.email && departments.length > 0 && (
                    <select
                      className="bg-transparent border-none text-[10px] text-[var(--fg3)] cursor-pointer"
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
        <div className="wf-soft flex flex-col" style={{ height: "500px" }}>
          {/* Chat messages area */}
          <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {chatMessages.length === 0 && !chatStreaming && (
              <div className="text-center py-8">
                <p className="text-sm text-[var(--fg2)]">
                  {questions.length > 0 ? t("chatLoading") : t("noQuestions")}
                </p>
              </div>
            )}

            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-accent text-white rounded-br-md"
                    : "bg-hover text-foreground rounded-bl-md"
                }`}>
                  {msg.content || (chatStreaming && i === chatMessages.length - 1 ? (
                    <span className="inline-block w-2 h-4 bg-[var(--fg3)] animate-pulse rounded-sm" />
                  ) : null)}
                </div>
              </div>
            ))}

            {chatStreaming && chatMessages.length > 0 && chatMessages[chatMessages.length - 1].role === "user" && (
              <div className="flex justify-start">
                <div className="bg-hover rounded-2xl rounded-bl-md px-4 py-3">
                  <span className="inline-block w-2 h-4 bg-[var(--fg3)] animate-pulse rounded-sm" />
                </div>
              </div>
            )}
          </div>

          {/* Input area */}
          <div className="border-t border-border p-3 flex gap-2 items-end">
            <textarea
              ref={chatInputRef}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendChatMessage();
                }
              }}
              placeholder={t("chatPlaceholder")}
              rows={1}
              className="flex-1 resize-none rounded-xl border border-border bg-hover px-4 py-2.5 text-sm text-foreground placeholder-[var(--fg3)] focus:outline-none focus:ring-1 focus:ring-accent text-base"
              disabled={chatStreaming}
              style={{ minHeight: "44px", maxHeight: "120px" }}
            />
            <button
              onClick={sendChatMessage}
              disabled={chatStreaming || !chatInput.trim()}
              className="shrink-0 w-10 h-10 rounded-xl bg-accent text-white flex items-center justify-center disabled:opacity-50 transition"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2L11 13" /><path d="M22 2L15 22L11 13L2 9L22 2Z" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Section C — Operational Intelligence Preview */}
      {activeTab === "preview" && (
        <div className="space-y-4">
          {/* Situations summary */}
          <div className="wf-soft p-4 space-y-3">
            <h3 className="text-sm font-medium text-[var(--fg2)]">{t("detectedIntelligence")}</h3>
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
          {(synthesis.situationRecommendations ?? []).length > 0 && (
            <div className="wf-soft p-4 space-y-2">
              <h3 className="text-sm font-medium text-[var(--fg2)]">{t("recommendedMonitoring")}</h3>
              {(synthesis.situationRecommendations ?? []).slice(0, 6).map((rec, i) => (
                <div key={i} className="flex items-start gap-2 py-1">
                  <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                    rec.priority === "high" ? "bg-danger" : rec.priority === "medium" ? "bg-warn" : "bg-[var(--fg3)]"
                  }`} />
                  <div>
                    <p className="text-xs text-[var(--fg2)]">{rec.name}</p>
                    <p className="text-[10px] text-[var(--fg3)]">{rec.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Knowledge coverage */}
          {(synthesis.knowledgeInventory ?? []).length > 0 && (
            <div className="wf-soft p-4 space-y-2">
              <h3 className="text-sm font-medium text-[var(--fg2)]">{t("knowledgeCoverage")}</h3>
              <div className="flex flex-wrap gap-2">
                {(synthesis.knowledgeInventory ?? []).map((ki, i) => (
                  <span
                    key={i}
                    className={`px-2 py-1 rounded text-[10px] ${
                      ki.coverage === "comprehensive"
                        ? "bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] text-ok/70"
                        : ki.coverage === "partial"
                          ? "bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] text-warn/70"
                          : "bg-hover text-[var(--fg3)]"
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
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-foreground/30 border-t-foreground" />
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
    purple: "bg-accent-light text-accent",
    amber: "bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] text-warn",
    emerald: "bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] text-ok",
  };
  return (
    <div className={`rounded-lg p-3 ${colorClasses[color].split(" ")[0]}`}>
      <div className={`text-lg font-semibold ${colorClasses[color].split(" ")[1]}`}>{value}</div>
      <div className="text-[10px] text-[var(--fg2)] mt-0.5">{label}</div>
    </div>
  );
}
