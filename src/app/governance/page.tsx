"use client";

import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useUser } from "@/components/user-provider";
import { useTranslations } from "next-intl";
import type { PolicyEffect, PolicyScope } from "@/lib/types";

// ── Types ────────────────────────────────────────────────

type SituationTypeItem = {
  id: string;
  name: string;
  slug: string;
  autonomyLevel: string;
  consecutiveApprovals: number;
  totalApproved: number;
  totalProposed: number;
  approvalRate: number;
};

interface Policy {
  id: string;
  name: string;
  scope: PolicyScope;
  scopeTargetId: string | null;
  actionType: string;
  effect: PolicyEffect;
  conditions: string | null;
  priority: number;
  enabled: boolean;
}

interface AutonSettings {
  supervisedToNotifyConsecutive: number;
  supervisedToNotifyRate: number;
  notifyToAutonomousConsecutive: number;
  notifyToAutonomousRate: number;
}

// ── Constants ────────────────────────────────────────────

const SCOPES: { value: PolicyScope; label: string }[] = [
  { value: "global", label: "Global" },
  { value: "entity_type", label: "Entity Type" },
  { value: "entity", label: "Entity" },
];

const EFFECTS: { value: PolicyEffect; label: string }[] = [
  { value: "ALLOW", label: "Allow" },
  { value: "DENY", label: "Deny" },
  { value: "REQUIRE_APPROVAL", label: "Require Approval" },
];

const ACTION_TYPES = [
  { value: "*", label: "All Actions" },
  { value: "create", label: "Create" },
  { value: "update", label: "Update" },
  { value: "delete", label: "Delete" },
  { value: "read", label: "Read" },
];

// ── Component ────────────────────────────────────────────

export default function GovernancePage() {
  const { toast } = useToast();
  const { isAdmin } = useUser();
  const t = useTranslations("governance");
  const tc = useTranslations("common");

  const [situationTypes, setSituationTypes] = useState<SituationTypeItem[]>([]);
  const [autoLoading, setAutoLoading] = useState(true);
  const [thresholds, setThresholds] = useState<AutonSettings | null>(null);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [demotingId, setDemotingId] = useState<string | null>(null);

  const [policies, setPolicies] = useState<Policy[]>([]);
  const [policiesLoading, setPoliciesLoading] = useState(true);
  const [showNewPolicy, setShowNewPolicy] = useState(false);
  const [policySaving, setPolicySaving] = useState(false);
  const [formName, setFormName] = useState("");
  const [formScope, setFormScope] = useState<PolicyScope>("global");
  const [formScopeTarget, setFormScopeTarget] = useState("");
  const [formActionType, setFormActionType] = useState("*");
  const [formEffect, setFormEffect] = useState<PolicyEffect>("ALLOW");
  const [formPriority, setFormPriority] = useState("0");

  // ── Data fetching ──────────────────────────────────────

  const loadSituationTypes = useCallback(() => {
    fetch("/api/situation-types")
      .then(r => r.json())
      .then(data => setSituationTypes(data))
      .catch(() => {});
  }, []);

  const loadPolicies = useCallback(async () => {
    try {
      const res = await fetch("/api/policies");
      if (res.ok) setPolicies(await res.json());
    } catch {}
    setPoliciesLoading(false);
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/autonomy/settings").then(r => r.json()),
      fetch("/api/situation-types").then(r => r.json()),
    ])
      .then(([settings, types]) => {
        setThresholds({
          supervisedToNotifyConsecutive: settings.supervisedToNotifyConsecutive ?? 10,
          supervisedToNotifyRate: settings.supervisedToNotifyRate ?? 0.9,
          notifyToAutonomousConsecutive: settings.notifyToAutonomousConsecutive ?? 20,
          notifyToAutonomousRate: settings.notifyToAutonomousRate ?? 0.95,
        });
        setSituationTypes(types);
      })
      .catch(() => {})
      .finally(() => setAutoLoading(false));

    loadPolicies();
  }, [loadPolicies]);

  // ── Handlers ───────────────────────────────────────────

  const handlePromote = async (stId: string) => {
    setPromotingId(stId);
    try {
      await fetch("/api/autonomy/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ situationTypeId: stId }),
      });
      toast("Promoted successfully", "success");
      loadSituationTypes();
    } catch {
      toast("Promotion failed", "error");
    } finally {
      setPromotingId(null);
    }
  };

  const handleDemote = async (stId: string) => {
    setDemotingId(stId);
    try {
      await fetch("/api/autonomy/demote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ situationTypeId: stId }),
      });
      toast("Demoted successfully", "success");
      loadSituationTypes();
    } catch {
      toast("Demotion failed", "error");
    } finally {
      setDemotingId(null);
    }
  };

  const handleTogglePolicy = async (policy: Policy) => {
    try {
      await fetch("/api/policies", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: policy.id, enabled: !policy.enabled }),
      });
      setPolicies(prev => prev.map(p => (p.id === policy.id ? { ...p, enabled: !p.enabled } : p)));
    } catch {}
  };

  const handleCreatePolicy = async () => {
    if (!formName.trim()) return;
    setPolicySaving(true);
    try {
      const res = await fetch("/api/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          scope: formScope,
          scopeTargetId: formScopeTarget || undefined,
          actionType: formActionType,
          effect: formEffect,
          priority: parseInt(formPriority) || 0,
        }),
      });
      if (!res.ok) throw new Error();
      setShowNewPolicy(false);
      resetPolicyForm();
      loadPolicies();
      toast("Policy created", "success");
    } catch {
      toast("Failed to create policy", "error");
    } finally {
      setPolicySaving(false);
    }
  };

  const resetPolicyForm = () => {
    setFormName("");
    setFormScope("global");
    setFormScopeTarget("");
    setFormActionType("*");
    setFormEffect("ALLOW");
    setFormPriority("0");
  };

  // ── Derived ────────────────────────────────────────────

  const supervisedCount = situationTypes.filter(st => st.autonomyLevel === "supervised").length;
  const notifyCount = situationTypes.filter(st => st.autonomyLevel === "notify").length;
  const autonomousCount = situationTypes.filter(st => st.autonomyLevel === "autonomous").length;
  const total = situationTypes.length || 1;

  const sortedTypes = [...situationTypes].sort((a, b) => b.approvalRate - a.approvalRate);

  function isReadyForPromotion(st: SituationTypeItem): boolean {
    if (!thresholds) return false;
    if (st.autonomyLevel === "autonomous") return false;
    if (st.autonomyLevel === "supervised") {
      return st.consecutiveApprovals >= thresholds.supervisedToNotifyConsecutive
        && st.approvalRate >= thresholds.supervisedToNotifyRate;
    }
    if (st.autonomyLevel === "notify") {
      return st.consecutiveApprovals >= thresholds.notifyToAutonomousConsecutive
        && st.approvalRate >= thresholds.notifyToAutonomousRate;
    }
    return false;
  }

  // ── Render ─────────────────────────────────────────────

  return (
    <AppShell>
      <div className="p-8 max-w-4xl mx-auto space-y-6">
        <h1 style={{ fontSize: 20, fontWeight: 600, color: "#e8e8e8" }}>{t("title")}</h1>

        {/* ── Section 1: Trust Gradient ── */}
        <section style={{ background: "#161616", border: "1px solid #2a2a2a", borderRadius: 6, padding: 20 }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "#484848", textTransform: "uppercase" }} className="mb-4">
            {t("trustGradient")}
          </div>

          {autoLoading ? (
            <div className="flex justify-center py-4">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#2a2a2a] border-t-[#707070]" />
            </div>
          ) : (
            <>
              {/* Progress bar */}
              <div className="flex rounded overflow-hidden h-3 mb-4" style={{ background: "#1c1c1c" }}>
                {supervisedCount > 0 && (
                  <div style={{ flex: supervisedCount, background: "#222" }} />
                )}
                {notifyCount > 0 && (
                  <div style={{ flex: notifyCount, background: "rgba(245,158,11,0.25)" }} />
                )}
                {autonomousCount > 0 && (
                  <div style={{ flex: autonomousCount, background: "rgba(34,197,94,0.25)" }} />
                )}
              </div>

              {/* Labels */}
              <div className="flex justify-between" style={{ fontSize: 10, color: "#484848" }}>
                <span>{t("supervised")}</span>
                <span>{t("notify")}</span>
                <span>{t("autonomous")}</span>
              </div>

              {/* Counts */}
              <div className="flex gap-6 mt-3" style={{ fontSize: 12 }}>
                <span>Supervised: <span style={{ color: "#b0b0b0" }}>{supervisedCount}</span></span>
                <span>Notify: <span style={{ color: "#fbbf24" }}>{notifyCount}</span></span>
                <span>Autonomous: <span style={{ color: "#4ade80" }}>{autonomousCount}</span></span>
              </div>
            </>
          )}
        </section>

        {/* ── Section 2: Rules ── */}
        <section style={{ background: "#161616", border: "1px solid #2a2a2a", borderRadius: 6, padding: 20 }}>
          <div className="flex items-center justify-between mb-4">
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "#484848", textTransform: "uppercase" }}>
              {t("rules")}
            </div>
            {isAdmin && (
              <button
                onClick={() => setShowNewPolicy(true)}
                style={{ fontSize: 11, color: "#b0b0b0", background: "#222", border: "1px solid #333", borderRadius: 4, padding: "3px 10px" }}
                className="hover:bg-[#2a2a2a] transition"
              >
                {t("addRule")}
              </button>
            )}
          </div>

          {policiesLoading && (
            <div className="flex justify-center py-4">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#2a2a2a] border-t-[#707070]" />
            </div>
          )}

          {!policiesLoading && policies.length === 0 && (
            <p style={{ fontSize: 13, color: "#484848" }}>{t("noRules")}</p>
          )}

          {!policiesLoading && policies.length > 0 && (
            <div className="space-y-1.5">
              {policies.map(policy => {
                const effectLabel = policy.effect === "REQUIRE_APPROVAL" ? "Approval" : policy.effect === "DENY" ? "Block" : "Allow";
                const effectVariant = policy.effect === "REQUIRE_APPROVAL" ? "amber" : policy.effect === "DENY" ? "red" : "green";
                return (
                  <div
                    key={policy.id}
                    className={`flex items-center gap-3 ${!policy.enabled ? "opacity-50" : ""}`}
                    style={{ background: "#161616", borderRadius: 4, padding: "10px 12px" }}
                  >
                    <Badge variant={effectVariant as "amber" | "red" | "green"}>{effectLabel}</Badge>
                    <div className="flex-1 min-w-0">
                      <div style={{ fontSize: 13, fontWeight: 500, color: "#e8e8e8" }}>{policy.name}</div>
                      <div style={{ fontSize: 11, color: "#484848" }}>
                        {policy.scope} &middot; {policy.actionType === "*" ? "All actions" : policy.actionType}
                      </div>
                    </div>
                    {isAdmin && (
                      <button
                        onClick={() => handleTogglePolicy(policy)}
                        className="flex-shrink-0"
                        style={{
                          position: "relative",
                          display: "inline-flex",
                          height: 20,
                          width: 36,
                          alignItems: "center",
                          borderRadius: 10,
                          background: policy.enabled ? "#a855f7" : "#222",
                          transition: "background 150ms",
                        }}
                      >
                        <span style={{
                          display: "inline-block",
                          height: 14,
                          width: 14,
                          borderRadius: 7,
                          background: "#fff",
                          transition: "transform 150ms",
                          transform: policy.enabled ? "translateX(18px)" : "translateX(2px)",
                        }} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Section 3: Trust Progression ── */}
        <section style={{ background: "#161616", border: "1px solid #2a2a2a", borderRadius: 6, padding: 20 }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "#484848", textTransform: "uppercase" }} className="mb-4">
            {t("trustProgression")}
          </div>

          {autoLoading ? (
            <div className="flex justify-center py-4">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#2a2a2a] border-t-[#707070]" />
            </div>
          ) : sortedTypes.length === 0 ? (
            <p style={{ fontSize: 13, color: "#484848" }}>No situation types configured yet.</p>
          ) : (
            <div className="space-y-2">
              {sortedTypes.map(st => {
                const ready = isReadyForPromotion(st);
                const levelLabel = st.autonomyLevel === "supervised" ? "supervised" : st.autonomyLevel === "notify" ? "notify" : "autonomous";
                const levelColor = st.autonomyLevel === "supervised" ? "#b0b0b0" : st.autonomyLevel === "notify" ? "#fbbf24" : "#4ade80";
                return (
                  <div
                    key={st.id}
                    style={{
                      background: ready ? "rgba(168,85,247,0.06)" : "#161616",
                      border: ready ? "1px solid rgba(168,85,247,0.2)" : "1px solid #222",
                      borderRadius: 4,
                      padding: "10px 14px",
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span style={{ fontSize: 13, fontWeight: 500, color: "#e8e8e8" }}>{st.name}</span>
                      <div className="flex items-center gap-2">
                        <span style={{ fontSize: 11, fontWeight: 500, color: levelColor, border: `1px solid ${levelColor}33`, borderRadius: 9999, padding: "1px 8px" }}>
                          {levelLabel}
                        </span>
                        {isAdmin && ready && (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handlePromote(st.id)}
                            disabled={promotingId !== null}
                          >
                            {promotingId === st.id ? "..." : t("promote")}
                          </Button>
                        )}
                        {isAdmin && st.autonomyLevel !== "supervised" && (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleDemote(st.id)}
                            disabled={demotingId !== null}
                          >
                            {demotingId === st.id ? "..." : t("demote")}
                          </Button>
                        )}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: "#484848" }} className="mt-1">
                      {st.totalProposed} proposed &middot; {(st.approvalRate * 100).toFixed(0)}% approved &middot; {st.consecutiveApprovals} streak
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Section 4: AI Knowledge ── */}
        <InsightsSection isAdmin={isAdmin} toast={toast} />

        {/* ── Section 5: Goals ── */}
        <GoalsSection isAdmin={isAdmin} toast={toast} />

        {/* ── New Policy Modal ── */}
        <Modal open={showNewPolicy} onClose={() => { setShowNewPolicy(false); resetPolicyForm(); }} title="New Rule">
          <div className="space-y-4">
            <Input label="Name" value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. Require approval for deletions" />
            <Select label="Scope" options={SCOPES} value={formScope} onChange={e => setFormScope(e.target.value as PolicyScope)} />
            {formScope !== "global" && (
              <Input
                label={formScope === "entity_type" ? "Entity Type Slug" : "Entity ID"}
                value={formScopeTarget}
                onChange={e => setFormScopeTarget(e.target.value)}
                placeholder={formScope === "entity_type" ? "e.g. customer" : "e.g. abc123"}
              />
            )}
            <Select label="Action Type" options={ACTION_TYPES} value={formActionType} onChange={e => setFormActionType(e.target.value)} />
            <div>
              <label className="text-sm font-medium mb-2 block" style={{ color: "#707070" }}>Effect</label>
              <div className="flex gap-2">
                {EFFECTS.map(eff => (
                  <button
                    key={eff.value}
                    onClick={() => setFormEffect(eff.value)}
                    className="px-4 py-2 rounded text-sm font-medium border transition"
                    style={{
                      borderColor: formEffect === eff.value ? "rgba(168,85,247,0.4)" : "#2a2a2a",
                      background: formEffect === eff.value ? "rgba(168,85,247,0.1)" : "#1c1c1c",
                      color: formEffect === eff.value ? "#c084fc" : "#707070",
                    }}
                  >
                    {eff.label}
                  </button>
                ))}
              </div>
            </div>
            <Input label="Priority" type="number" value={formPriority} onChange={e => setFormPriority(e.target.value)} placeholder="0" />
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={() => { setShowNewPolicy(false); resetPolicyForm(); }}>{tc("cancel")}</Button>
              <Button variant="primary" onClick={handleCreatePolicy} disabled={policySaving || !formName.trim()}>
                {policySaving ? "Creating..." : "Create Rule"}
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </AppShell>
  );
}

// ── Insights Section ────────────────────────────────────────────────────────

interface InsightItem {
  id: string;
  description: string;
  evidence: { sampleSize?: number; successRate?: number } | null;
  confidence: number;
  shareScope: string;
  status: string;
  aiEntityName: string | null;
}

const SCOPE_STYLES: Record<string, { bg: string; color: string }> = {
  personal: { bg: "rgba(168,85,247,0.1)", color: "#c084fc" },
  department: { bg: "rgba(59,130,246,0.1)", color: "#60a5fa" },
  operator: { bg: "rgba(34,197,94,0.1)", color: "#22c55e" },
};

function InsightsSection({ isAdmin, toast }: { isAdmin: boolean; toast: (msg: string, type: "success" | "error") => void }) {
  const t = useTranslations("governance");
  const [insights, setInsights] = useState<InsightItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadInsights = useCallback(async () => {
    try {
      const res = await fetch("/api/insights");
      if (res.ok) {
        const data = await res.json();
        setInsights(data.items ?? []);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadInsights(); }, [loadInsights]);

  const handlePromote = async (id: string, currentScope: string) => {
    const targetScope = currentScope === "personal" ? "department" : "operator";
    try {
      await fetch(`/api/insights/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "promote", targetScope }),
      });
      toast("Insight promoted", "success");
      loadInsights();
    } catch {
      toast("Promotion failed", "error");
    }
  };

  const handleInvalidate = async (id: string) => {
    try {
      await fetch(`/api/insights/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "invalidate" }),
      });
      toast("Insight invalidated", "success");
      loadInsights();
    } catch {
      toast("Action failed", "error");
    }
  };

  return (
    <section style={{ background: "#161616", border: "1px solid #2a2a2a", borderRadius: 6, padding: 20 }}>
      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "#484848", textTransform: "uppercase" }} className="mb-4">
        {t("aiKnowledge")}
      </div>

      {loading ? (
        <div className="flex justify-center py-4">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#2a2a2a] border-t-[#707070]" />
        </div>
      ) : insights.length === 0 ? (
        <p style={{ fontSize: 13, color: "#484848" }}>
          {t("noInsights")}
        </p>
      ) : (
        <div className="space-y-2">
          {insights.map(insight => {
            const scopeStyle = SCOPE_STYLES[insight.shareScope] ?? SCOPE_STYLES.personal;
            return (
              <div key={insight.id} style={{ background: "#1c1c1c", border: "1px solid #222", borderRadius: 4, padding: "12px 14px" }}>
                <div className="flex items-start justify-between gap-3">
                  <p style={{ fontSize: 13, lineHeight: 1.6, color: "#b0b0b0", flex: 1 }}>{insight.description}</p>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span style={{ fontSize: 10, fontWeight: 500, padding: "1px 6px", borderRadius: 3, background: scopeStyle.bg, color: scopeStyle.color }}>
                      {insight.shareScope}
                    </span>
                    {insight.status !== "active" && (
                      <Badge variant={insight.status === "superseded" ? "amber" : "red"}>{insight.status}</Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-2" style={{ fontSize: 11, color: "#484848" }}>
                  {insight.evidence?.sampleSize && <span>Sample: {insight.evidence.sampleSize}</span>}
                  {insight.evidence?.successRate != null && <span>Success: {(insight.evidence.successRate * 100).toFixed(0)}%</span>}
                  <span>Confidence: {(insight.confidence * 100).toFixed(0)}%</span>
                  {insight.aiEntityName && <span>{insight.aiEntityName}</span>}
                </div>
                {isAdmin && insight.status === "active" && (
                  <div className="flex items-center gap-2 mt-2">
                    {insight.shareScope !== "operator" && (
                      <button
                        onClick={() => handlePromote(insight.id, insight.shareScope)}
                        className="text-[11px] px-2 py-0.5 rounded transition"
                        style={{ background: "rgba(168,85,247,0.1)", color: "#c084fc" }}
                      >
                        Promote
                      </button>
                    )}
                    <button
                      onClick={() => handleInvalidate(insight.id)}
                      className="text-[11px] px-2 py-0.5 rounded transition"
                      style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}
                    >
                      Invalidate
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ── Goals Section ───────────────────────────────────────────────────────────

interface GoalItem {
  id: string;
  title: string;
  description: string;
  priority: number;
  status: string;
  departmentId: string | null;
  deadline: string | null;
  _count: { initiatives: number };
}

function GoalsSection({ isAdmin, toast }: { isAdmin: boolean; toast: (msg: string, type: "success" | "error") => void }) {
  const t = useTranslations("governance");
  const tc = useTranslations("common");
  const [goals, setGoals] = useState<GoalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formPriority, setFormPriority] = useState("3");
  const [saving, setSaving] = useState(false);
  const [departments, setDepartments] = useState<Array<{ id: string; displayName: string }>>([]);
  const [formDeptId, setFormDeptId] = useState("");

  const loadGoals = useCallback(async () => {
    try {
      const res = await fetch("/api/goals");
      if (res.ok) setGoals(await res.json());
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadGoals(); }, [loadGoals]);

  useEffect(() => {
    if (!showForm || departments.length > 0) return;
    fetch("/api/departments")
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        const depts = Array.isArray(data) ? data : (data.departments ?? []);
        setDepartments(depts);
      })
      .catch(() => {});
  }, [showForm, departments.length]);

  const handleCreate = async () => {
    if (!formTitle.trim() || !formDescription.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formTitle.trim(),
          description: formDescription.trim(),
          priority: parseInt(formPriority) || 3,
          departmentId: formDeptId || undefined,
        }),
      });
      if (res.ok) {
        setShowForm(false);
        setFormTitle("");
        setFormDescription("");
        setFormPriority("3");
        setFormDeptId("");
        loadGoals();
        toast("Goal created", "success");
      } else {
        const data = await res.json().catch(() => ({}));
        toast(data.error || "Failed", "error");
      }
    } catch {
      toast("Failed to create goal", "error");
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this goal?")) return;
    try {
      const res = await fetch(`/api/goals/${id}`, { method: "DELETE" });
      if (res.ok) {
        loadGoals();
        toast("Goal deleted", "success");
      } else {
        const data = await res.json().catch(() => ({}));
        toast(data.error || "Cannot delete", "error");
      }
    } catch {
      toast("Delete failed", "error");
    }
  };

  return (
    <section style={{ background: "#161616", border: "1px solid #2a2a2a", borderRadius: 6, padding: 20 }}>
      <div className="flex items-center justify-between mb-4">
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", color: "#484848", textTransform: "uppercase" }}>
          {t("goals")}
        </div>
        {isAdmin && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            style={{ fontSize: 11, color: "#b0b0b0", background: "#222", border: "1px solid #333", borderRadius: 4, padding: "3px 10px" }}
            className="hover:bg-[#2a2a2a] transition"
          >
            {t("addGoal")}
          </button>
        )}
      </div>

      {/* Add goal form */}
      {showForm && (
        <div className="mb-4 space-y-3" style={{ background: "#1c1c1c", border: "1px solid #333", borderRadius: 4, padding: 14 }}>
          <Input label="Title" value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder={t("goalTitle")} />
          <Input label="Description" value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder={t("goalDescription")} />
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-white/40 mb-1 block">{t("priority")} (1-5)</label>
              <input
                type="number"
                min={1}
                max={5}
                value={formPriority}
                onChange={e => setFormPriority(e.target.value)}
                className="w-full outline-none text-sm"
                style={{ background: "#161616", border: "1px solid #333", borderRadius: 4, padding: "6px 10px", color: "#e8e8e8" }}
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-white/40 mb-1 block">{t("department")}</label>
              <select
                value={formDeptId}
                onChange={e => setFormDeptId(e.target.value)}
                className="w-full outline-none text-sm"
                style={{ background: "#161616", border: "1px solid #333", borderRadius: 4, padding: "6px 10px", color: "#e8e8e8" }}
              >
                <option value="" style={{ background: "#161616" }}>HQ-level (none)</option>
                {departments.map(d => (
                  <option key={d.id} value={d.id} style={{ background: "#161616" }}>{d.displayName}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="primary" size="sm" onClick={handleCreate} disabled={saving || !formTitle.trim()}>
              {saving ? "Creating..." : t("createGoal")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>{tc("cancel")}</Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-4">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#2a2a2a] border-t-[#707070]" />
        </div>
      ) : goals.length === 0 ? (
        <p style={{ fontSize: 13, color: "#484848" }}>No goals configured yet.</p>
      ) : (
        <div className="space-y-2">
          {goals.map(goal => (
            <div key={goal.id} style={{ background: "#1c1c1c", border: "1px solid #222", borderRadius: 4, padding: "10px 14px" }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 13, fontWeight: 500, color: "#e8e8e8" }}>{goal.title}</span>
                  <span style={{
                    fontSize: 10,
                    fontWeight: 500,
                    padding: "1px 6px",
                    borderRadius: 3,
                    background: goal.status === "achieved" ? "rgba(34,197,94,0.1)" : goal.status === "paused" ? "rgba(245,158,11,0.1)" : "rgba(168,85,247,0.1)",
                    color: goal.status === "achieved" ? "#22c55e" : goal.status === "paused" ? "#f59e0b" : "#c084fc",
                  }}>
                    {goal.status}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 11, color: "#484848" }}>P{goal.priority}</span>
                  {isAdmin && (
                    <button
                      onClick={() => handleDelete(goal.id)}
                      className="text-[11px] transition hover:text-red-400"
                      style={{ color: "#484848" }}
                    >
                      {tc("delete")}
                    </button>
                  )}
                </div>
              </div>
              <p style={{ fontSize: 12, color: "#707070", marginTop: 2 }}>{goal.description}</p>
              <div style={{ fontSize: 11, color: "#484848", marginTop: 4 }}>
                {goal._count.initiatives} initiative{goal._count.initiatives !== 1 ? "s" : ""}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
