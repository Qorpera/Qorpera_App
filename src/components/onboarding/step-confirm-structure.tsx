"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
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
  domains: SynthesisDepartment[];
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
  wikiStats?: {
    totalPages: number;
    verifiedPages: number;
    byType: Record<string, number>;
    avgConfidence: number;
  };
  initiativeCount?: number;
}

interface CompanyModelEdits {
  renamedDepartments?: Array<{ oldName: string; newName: string }>;
  deletedDepartments?: string[];
  movedPeople?: Array<{ email: string; toDepartment: string }>;
  deletedPeople?: string[];
  addedDepartments?: Array<{ name: string; description?: string }>;
}

interface WikiPageSummary {
  id: string;
  slug: string;
  title: string;
  pageType: string;
  status: string;
  confidence: number;
  sourceCount: number;
  contentTokens: number;
  lastSynthesizedAt: string;
}

interface WikiPageDetail {
  title: string;
  pageType: string;
  status: string;
  confidence: number;
  content: string;
  sourceCount: number;
  version: number;
  lastSynthesizedAt: string;
  synthesisPath: string;
}

const PAGE_TYPE_LABELS: Record<string, string> = {
  company_overview: "Company",
  domain_hub: "Domain",
  domain_overview: "Domain",
  person_profile: "Person",
  entity_profile: "Entity",
  process: "Process",
  process_description: "Process",
  project: "Project",
  situation_type: "Situation Type",
  external_relationship: "External",
  tool_system: "Tool",
  financial_pattern: "Financial",
  communication_pattern: "Communication",
  topic_synthesis: "Topic",
  relationship_map: "Relationship",
  contradiction_log: "Contradiction",
};

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
  const [activeTab, setActiveTab] = useState<"map" | "questions" | "knowledge" | "preview">("map");

  // Wiki browser state
  const [wikiPages, setWikiPages] = useState<WikiPageSummary[]>([]);
  const [wikiStats, setWikiStats] = useState<{ totalPages: number; verifiedPages: number; byType: Record<string, number>; avgConfidence: number } | null>(null);
  const [wikiLoading, setWikiLoading] = useState(false);
  const [selectedWikiSlug, setSelectedWikiSlug] = useState<string | null>(null);
  const [selectedWikiPage, setSelectedWikiPage] = useState<WikiPageDetail | null>(null);
  const [wikiPageLoading, setWikiPageLoading] = useState(false);
  const [wikiTypeFilter, setWikiTypeFilter] = useState<string>("");
  const [wikiInitialized, setWikiInitialized] = useState(false);
  const [initiatives, setInitiatives] = useState<Array<{
    id: string;
    status: string;
    rationale: string;
    proposedProjectConfig: {
      title: string;
      description: string;
      deliverables: Array<{ title: string; description: string }>;
      members: Array<{ name: string; email: string; role: string }>;
    } | null;
  }>>([]);

  // Detection loading screen state
  const [detectingPhase, setDetectingPhase] = useState(false);
  const [detectMsgIndex, setDetectMsgIndex] = useState(0);
  const [detectMessages, setDetectMessages] = useState<string[]>([]);
  const [detectResult, setDetectResult] = useState<{ count: number; message: string } | null>(null);

  // Inline-rename state
  const [renamingDept, setRenamingDept] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Chat state
  const [chatMessages, setChatMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatStreaming, setChatStreaming] = useState(false);
  const animationRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [chatInitialized, setChatInitialized] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (demoMode) {
        setSynthesis(DEMO_SYNTHESIS_OUTPUT as unknown as SynthesisOutput);
        setQuestions(DEMO_UNCERTAINTY_LOG as unknown as UncertaintyQuestion[]);
        setWikiStats({ totalPages: 42, verifiedPages: 38, byType: { entity_profile: 12, domain_overview: 5, financial_pattern: 8, communication_pattern: 7, process_description: 6, topic_synthesis: 4 }, avgConfidence: 0.78 });
        setInitiatives([
          {
            id: "demo-1",
            status: "proposed",
            rationale: "[Wiki Scanner] Cash Flow Concentration Risk\n\nTop 3 clients account for 78% of revenue. Loss of any single client would create severe cash flow impact.",
            proposedProjectConfig: {
              title: "Revenue Diversification Assessment",
              description: "Assess client concentration risk and develop mitigation strategies",
              deliverables: [{ title: "Client Risk Matrix", description: "Revenue dependency analysis per client" }, { title: "Diversification Strategy", description: "12-month plan to reduce concentration" }],
              members: [],
            },
          },
        ]);
        return;
      }
      const res = await fetch("/api/onboarding/analysis-progress");
      if (!res.ok) return;
      const data: AnalysisProgress = await res.json();
      if (data.synthesisOutput) {
        const s = data.synthesisOutput;
        setSynthesis({
          ...s,
          domains: s.domains ?? [],
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
      if (data.wikiStats) setWikiStats(data.wikiStats);

      // Fetch initiatives for preview tab
      try {
        const initRes = await fetch("/api/initiatives?status=proposed");
        if (initRes.ok) {
          const initData = await initRes.json();
          setInitiatives(initData.items ?? []);
        }
      } catch {}
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

  function deleteDomain(name: string) {
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

  // Clean up typing animation on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) clearTimeout(animationRef.current);
    };
  }, []);

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

  // Fetch wiki pages when Knowledge tab is first activated
  useEffect(() => {
    if (activeTab === "knowledge" && !wikiInitialized) {
      setWikiInitialized(true);
      fetchWikiPages();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, wikiInitialized]);

  // Re-fetch when type filter changes
  useEffect(() => {
    if (wikiInitialized) fetchWikiPages();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wikiTypeFilter]);

  // Fetch individual wiki page when selected
  useEffect(() => {
    if (!selectedWikiSlug) {
      setSelectedWikiPage(null);
      return;
    }
    setWikiPageLoading(true);
    fetch(`/api/wiki/${encodeURIComponent(selectedWikiSlug)}`)
      .then(r => r.json())
      .then(data => setSelectedWikiPage(data.page ?? null))
      .catch(console.error)
      .finally(() => setWikiPageLoading(false));
  }, [selectedWikiSlug]);

  const fetchWikiPages = async () => {
    setWikiLoading(true);
    try {
      const params = new URLSearchParams();
      if (wikiTypeFilter) params.set("pageType", wikiTypeFilter);
      const res = await fetch(`/api/wiki?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setWikiPages(data.pages ?? []);
        if (data.stats || data.byType) {
          setWikiStats(prev => ({
            totalPages: data.stats?.total ?? prev?.totalPages ?? 0,
            verifiedPages: data.stats?.verified ?? prev?.verifiedPages ?? 0,
            byType: data.byType ?? prev?.byType ?? {},
            avgConfidence: data.stats?.avgConfidence ?? prev?.avgConfidence ?? 0,
          }));
        }
      }
    } catch (err) {
      console.error("Failed to load wiki pages:", err);
    } finally {
      setWikiLoading(false);
    }
  };

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

  function renderMarkdown(text: string): string {
    let html = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/__(.+?)__/g, "<strong>$1</strong>");
    html = html.replace(/(?<!\w)\*([^*]+?)\*(?!\w)/g, "<em>$1</em>");
    html = html.replace(/(?<!\w)_([^_]+?)_(?!\w)/g, "<em>$1</em>");
    html = html.replace(/\n/g, "<br>");
    html = html.replace(/<br>---<br>/g, '<hr style="border: none; border-top: 1px solid var(--border); margin: 12px 0;">');
    return html;
  }

  function animateTyping(content: string) {
    let charIndex = 0;
    const CHARS_PER_FRAME = 3;
    const TICK_MS = 12;
    const PARAGRAPH_PAUSE_MS = 1500;

    function tick() {
      if (charIndex >= content.length) {
        setChatMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content };
          return updated;
        });
        return;
      }

      const paragraphBreak = content.indexOf("\n\n", charIndex);
      const hitParagraph = paragraphBreak >= charIndex && paragraphBreak < charIndex + CHARS_PER_FRAME;

      if (hitParagraph) {
        charIndex = paragraphBreak + 2;
      } else {
        charIndex += CHARS_PER_FRAME;
      }

      const revealed = content.slice(0, charIndex);
      setChatMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: revealed };
        return updated;
      });
      animationRef.current = setTimeout(tick, hitParagraph ? PARAGRAPH_PAUSE_MS : TICK_MS);
    }

    tick();
  }

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
      }

      // Stream is complete — animate the reveal
      animateTyping(assistantContent);
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

      const confirmData = await confirmRes.json();
      const stNames: string[] = confirmData.situationTypeNames ?? [];

      // Build progress messages from situation type names
      const msgs = stNames.length > 0
        ? stNames.map((n: string) => t("detectingScanning", { name: n.toLowerCase() }))
        : [
            "Analyzing payment patterns and overdue invoices...",
            "Checking client communication frequency...",
            "Reviewing upcoming deadlines and compliance dates...",
            "Identifying resource bottlenecks...",
            "Scanning for operational risks...",
          ];
      setDetectMessages(msgs);
      setDetectMsgIndex(0);
      setConfirming(false);
      setDetectingPhase(true);

      // Rotate messages every 3.5s
      const msgInterval = setInterval(() => {
        setDetectMsgIndex(prev => (prev + 1) % msgs.length);
      }, 3500);

      // Poll for situations every 2s, timeout after 90s
      const pollStart = Date.now();
      const pollInterval = setInterval(async () => {
        try {
          const res = await fetch("/api/situations?limit=1");
          if (res.ok) {
            const data = await res.json();
            const count = data.total ?? data.situations?.length ?? 0;
            if (count > 0) {
              clearInterval(pollInterval);
              clearInterval(msgInterval);
              setDetectResult({ count, message: t("detectingComplete", { count }) });
              setTimeout(() => { window.location.href = "/situations"; }, 1500);
              return;
            }
          }
        } catch {}
        if (Date.now() - pollStart > 90_000) {
          clearInterval(pollInterval);
          clearInterval(msgInterval);
          setDetectResult({ count: 0, message: t("detectingTimeout") });
          setTimeout(() => { window.location.href = "/map"; }, 2000);
        }
      }, 2000);

      return; // Don't fall through to finally
    } catch {
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

  if (detectingPhase) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center space-y-8 w-full max-w-md mx-auto">
        {/* Logo mark */}
        <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center">
          <div className="w-6 h-6 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
        </div>

        {detectResult ? (
          <div className="text-center space-y-2 animate-in fade-in duration-500">
            {detectResult.count > 0 && (
              <div className="text-3xl font-semibold text-accent">{detectResult.count}</div>
            )}
            <p className="text-sm text-foreground">{detectResult.message}</p>
          </div>
        ) : (
          <>
            <div className="text-center space-y-2">
              <p className="text-base font-medium text-foreground">{t("detectingTitle")}</p>
              <p
                key={detectMsgIndex}
                className="text-sm text-[var(--fg2)] transition-opacity duration-500"
              >
                {detectMessages[detectMsgIndex] ?? "Analyzing..."}
              </p>
            </div>

            {/* Progress bar */}
            <div className="w-full space-y-2">
              <div className="h-1 w-full rounded-full bg-hover overflow-hidden">
                <div className="h-full bg-accent/60 rounded-full animate-pulse" style={{ width: "60%" }} />
              </div>
              <p className="text-[10px] text-[var(--fg3)] text-center">{t("detectingSubtitle")}</p>
            </div>
          </>
        )}
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

  const departments = synthesis.domains;
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
        {(["map", "questions", "knowledge", "preview"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 px-3 py-2 rounded-md text-xs font-medium transition min-h-[44px] ${
              activeTab === tab
                ? "bg-accent-light text-accent"
                : "text-[var(--fg2)] hover:text-foreground"
            }`}
          >
            {tab === "map" ? t("orgMap")
              : tab === "questions" ? t("clarifications")
              : tab === "knowledge" ? `Knowledge${wikiStats ? ` (${wikiStats.totalPages})` : ""}`
              : t("preview")}
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
                      onClick={() => deleteDomain(dept.name)}
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
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                style={msg.role === "assistant" ? { animation: "fadeSlideIn 0.3s ease-out" } : undefined}>
                <div className={`max-w-[85%] text-sm ${
                  msg.role === "user"
                    ? "text-[var(--fg2)] px-1 py-1"
                    : "text-foreground px-1 py-1"
                }`}>
                  {msg.role === "assistant" && msg.content ? (
                    <div className="whitespace-normal [&_strong]:font-semibold [&_em]:italic [&_hr]:my-3">
                      <span dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                      {chatStreaming && i === chatMessages.length - 1 && (
                        <span className="inline-block w-[2px] h-[1em] bg-foreground animate-pulse ml-[1px] align-text-bottom" />
                      )}
                    </div>
                  ) : (
                    <span className="whitespace-pre-wrap">
                      {msg.content || (chatStreaming && i === chatMessages.length - 1 ? (
                        <span className="inline-block w-2 h-4 bg-[var(--fg3)] animate-pulse rounded-sm" />
                      ) : null)}
                    </span>
                  )}
                </div>
              </div>
            ))}

            {chatStreaming && chatMessages.length > 0 && chatMessages[chatMessages.length - 1].role === "user" && (
              <div className="flex justify-start">
                <div className="px-1 py-1">
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
              className="shrink-0 w-10 h-10 rounded-xl bg-white text-black flex items-center justify-center disabled:opacity-50 transition"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2L11 13" /><path d="M22 2L15 22L11 13L2 9L22 2Z" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Section C — Knowledge */}
      {activeTab === "knowledge" && (
        <div className="space-y-4">
          {/* Wiki stats header */}
          {wikiStats && wikiStats.totalPages > 0 && (
            <div className="wf-soft p-4">
              <h3 className="text-sm font-medium text-foreground mb-3">What we learned about your business</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="text-center">
                  <div className="text-lg font-semibold text-accent">{wikiStats.totalPages}</div>
                  <div className="text-[10px] text-[var(--fg3)]">Knowledge pages</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-semibold text-[var(--ok)]">{wikiStats.verifiedPages}</div>
                  <div className="text-[10px] text-[var(--fg3)]">Verified</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-semibold text-foreground">{Object.keys(wikiStats.byType ?? {}).length}</div>
                  <div className="text-[10px] text-[var(--fg3)]">Categories</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-semibold text-foreground">{Math.round((wikiStats.avgConfidence ?? 0) * 100)}%</div>
                  <div className="text-[10px] text-[var(--fg3)]">Avg confidence</div>
                </div>
              </div>
            </div>
          )}

          {/* Type filter pills */}
          {wikiStats && Object.keys(wikiStats.byType ?? {}).length > 1 && (
            <div className="flex gap-1.5 flex-wrap">
              <button
                onClick={() => setWikiTypeFilter("")}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                  !wikiTypeFilter
                    ? "bg-accent-light text-accent"
                    : "bg-hover text-[var(--fg2)] hover:text-foreground"
                }`}
              >
                All
              </button>
              {Object.entries(PAGE_TYPE_LABELS).map(([type, label]) => {
                const count = wikiStats.byType?.[type] ?? 0;
                if (!count) return null;
                return (
                  <button
                    key={type}
                    onClick={() => setWikiTypeFilter(wikiTypeFilter === type ? "" : type)}
                    className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                      wikiTypeFilter === type
                        ? "bg-accent-light text-accent"
                        : "bg-hover text-[var(--fg2)] hover:text-foreground"
                    }`}
                  >
                    {label} ({count})
                  </button>
                );
              })}
            </div>
          )}

          {/* Wiki page list */}
          {wikiLoading ? (
            <div className="flex justify-center py-8">
              <div className="w-5 h-5 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
            </div>
          ) : wikiPages.length === 0 ? (
            <div className="wf-soft p-6 text-center">
              <p className="text-sm text-[var(--fg3)]">
                No knowledge pages synthesized yet. The system will build your knowledge base as more data flows in.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {wikiPages.map(page => (
                <button
                  key={page.slug}
                  onClick={() => setSelectedWikiSlug(selectedWikiSlug === page.slug ? null : page.slug)}
                  className={`w-full text-left rounded-lg transition ${
                    selectedWikiSlug === page.slug
                      ? "bg-accent-light ring-1 ring-accent/20"
                      : "wf-soft hover:bg-hover"
                  }`}
                >
                  {/* Page header row — always visible */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      page.status === "verified" ? "bg-[var(--ok)]"
                      : page.status === "stale" ? "bg-[var(--warn)]"
                      : page.status === "quarantined" ? "bg-[var(--danger)]"
                      : "bg-[var(--fg3)]"
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-foreground truncate">{page.title}</div>
                      <div className="text-[10px] text-[var(--fg3)]">
                        {PAGE_TYPE_LABELS[page.pageType] ?? page.pageType}
                        {" · "}
                        {Math.round(page.confidence * 100)}% confidence
                        {" · "}
                        {page.sourceCount} sources
                      </div>
                    </div>
                    <svg
                      className={`w-3.5 h-3.5 text-[var(--fg3)] transition-transform ${
                        selectedWikiSlug === page.slug ? "rotate-180" : ""
                      }`}
                      viewBox="0 0 20 20" fill="currentColor"
                    >
                      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                    </svg>
                  </div>

                  {/* Expanded content — wiki page body */}
                  {selectedWikiSlug === page.slug && (
                    <div className="px-4 pb-4 border-t border-[var(--border)]" onClick={e => e.stopPropagation()}>
                      {wikiPageLoading ? (
                        <div className="flex justify-center py-6">
                          <div className="w-4 h-4 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
                        </div>
                      ) : selectedWikiPage ? (
                        <div className="pt-3 wiki-content text-xs text-[var(--fg2)] leading-relaxed max-h-[400px] overflow-y-auto">
                          <ReactMarkdown
                            components={{
                              p: ({ children }) => <p style={{ marginBottom: 8 }}>{children}</p>,
                              h1: ({ children }) => <h1 className="text-sm font-semibold text-foreground mt-4 mb-2">{children}</h1>,
                              h2: ({ children }) => <h2 className="text-xs font-semibold text-foreground mt-3 mb-1.5">{children}</h2>,
                              h3: ({ children }) => <h3 className="text-xs font-medium text-foreground mt-2 mb-1">{children}</h3>,
                              ul: ({ children }) => <ul className="pl-4 mb-2 list-disc">{children}</ul>,
                              ol: ({ children }) => <ol className="pl-4 mb-2 list-decimal">{children}</ol>,
                              li: ({ children }) => <li className="mb-0.5 text-[var(--fg2)]">{children}</li>,
                              strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                              hr: () => <hr className="border-[var(--border)] my-3" />,
                              code: ({ children }) => (
                                <code className="px-1 py-0.5 rounded bg-hover text-[10px] font-mono">{children}</code>
                              ),
                            }}
                          >
                            {selectedWikiPage.content.replace(/\[src:[a-zA-Z0-9_-]+\]/g, "")}
                          </ReactMarkdown>
                          <div className="mt-3 pt-2 border-t border-[var(--border)] flex items-center gap-4 text-[10px] text-[var(--fg3)]">
                            <span>v{selectedWikiPage.version}</span>
                            <span>{selectedWikiPage.synthesisPath}</span>
                            <span>{selectedWikiPage.sourceCount} sources</span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[10px] text-[var(--fg3)] py-4">Failed to load page content.</p>
                      )}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Section D — Operational Intelligence Preview */}
      {activeTab === "preview" && (
        <div className="space-y-4">
          {/* Initiatives with proposals */}
          {initiatives.length > 0 && (
            <div className="wf-soft p-4 space-y-3">
              <h3 className="text-sm font-medium text-foreground">
                Strategic Initiatives ({initiatives.length})
              </h3>
              <p className="text-xs text-[var(--fg2)]">
                The system detected patterns in your data that may warrant structured projects.
                You can create projects from these after completing setup, or from the Initiatives page.
              </p>
              {initiatives.slice(0, 5).map(init => (
                <div
                  key={init.id}
                  className="rounded-lg p-3"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                >
                  <p className="text-xs font-medium text-foreground">
                    {init.proposedProjectConfig?.title ?? init.rationale.split(/[.!?\n]/)[0]}
                  </p>
                  {init.proposedProjectConfig?.description && (
                    <p className="text-[11px] text-[var(--fg3)] mt-1">
                      {init.proposedProjectConfig.description}
                    </p>
                  )}
                  {init.proposedProjectConfig?.deliverables && init.proposedProjectConfig.deliverables.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {init.proposedProjectConfig.deliverables.map((d, i) => (
                        <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-accent-light text-accent">
                          {d.title}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Situations summary */}
          <div className="wf-soft p-4 space-y-3">
            <h3 className="text-sm font-medium text-[var(--fg2)]">{t("detectedIntelligence")}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <StatCard
                label={t("situationsDetected", { count: situationCount, domains: departments.length })}
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
