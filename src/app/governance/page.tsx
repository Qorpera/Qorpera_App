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

  // ── New UI state ────────────────────────────────────────
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());
  const [expandedPolicies, setExpandedPolicies] = useState<Set<string>>(new Set());
  const [chatInput, setChatInput] = useState("");

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

  const handleDeletePolicy = async (policyId: string) => {
    try {
      const res = await fetch("/api/policies", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: policyId }),
      });
      if (res.ok) {
        setPolicies(prev => prev.filter(p => p.id !== policyId));
        toast("Policy deleted", "success");
      } else {
        toast("Failed to delete policy", "error");
      }
    } catch {
      toast("Failed to delete policy", "error");
    }
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

  const toggleTypeExpanded = (id: string) => {
    setExpandedTypes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePolicyExpanded = (id: string) => {
    setExpandedPolicies(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleChatSend = () => {
    if (!chatInput.trim()) return;
    toast("Governance AI coming soon", "success");
    setChatInput("");
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
        <h1 className="text-xl font-semibold text-foreground">{t("title")}</h1>

        {/* ── Section 1: Trust Gradient ── */}
        <section className="bg-surface border border-border rounded-lg overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-hover">
            <svg className="w-4 h-4 text-[var(--fg2)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
            <h2 className="text-[13px] font-semibold text-foreground">{t("trustGradient")}</h2>
          </div>

          <div className="p-5">
            {autoLoading ? (
              <div className="flex justify-center py-4">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-[var(--fg3)]" />
              </div>
            ) : (
              <>
                {/* Progress bar */}
                <div className="flex rounded-full overflow-hidden h-4 mb-4 bg-elevated border border-border">
                  {supervisedCount > 0 && (
                    <div className="bg-[color-mix(in_srgb,var(--fg2)_20%,transparent)]" style={{ flex: supervisedCount }} />
                  )}
                  {notifyCount > 0 && (
                    <div className="bg-[color-mix(in_srgb,var(--warn)_40%,transparent)]" style={{ flex: notifyCount }} />
                  )}
                  {autonomousCount > 0 && (
                    <div className="bg-[color-mix(in_srgb,var(--ok)_40%,transparent)]" style={{ flex: autonomousCount }} />
                  )}
                </div>

                {/* Labels */}
                <div className="flex justify-between text-[10px] text-[var(--fg2)]">
                  <span>{t("supervised")}</span>
                  <span>{t("notify")}</span>
                  <span>{t("autonomous")}</span>
                </div>

                {/* Counts */}
                <div className="flex gap-6 mt-3 text-xs">
                  <span className="text-foreground font-medium">{supervisedCount}</span>
                  <span className="text-foreground font-medium">{notifyCount}</span>
                  <span className="text-foreground font-medium">{autonomousCount}</span>
                </div>
              </>
            )}
          </div>
        </section>

        {/* ── Section 2: Rules ── */}
        <section className="bg-surface border border-border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-hover">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-[var(--fg2)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
              <h2 className="text-[13px] font-semibold text-foreground">{t("rules")}</h2>
            </div>
            {isAdmin && (
              <Button variant="default" size="sm" onClick={() => setShowNewPolicy(true)}>
                {t("addRule")}
              </Button>
            )}
          </div>

          <div className="p-5">
            {policiesLoading && (
              <div className="flex justify-center py-4">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-[var(--fg3)]" />
              </div>
            )}

            {!policiesLoading && policies.length === 0 && (
              <div className="text-center py-6">
                <p className="text-[13px] text-[var(--fg2)] mb-3">{t("noRules")}</p>
                {isAdmin && (
                  <Button variant="default" size="sm" onClick={() => setShowNewPolicy(true)}>
                    {t("addRule")}
                  </Button>
                )}
              </div>
            )}

            {!policiesLoading && policies.length > 0 && (
              <div className="space-y-1.5">
                {policies.map(policy => {
                  const effectLabel = policy.effect === "REQUIRE_APPROVAL" ? "Approval" : policy.effect === "DENY" ? "Block" : "Allow";
                  const effectVariant = policy.effect === "REQUIRE_APPROVAL" ? "blue" : policy.effect === "DENY" ? "red" : "green";
                  const isExpanded = expandedPolicies.has(policy.id);
                  return (
                    <div
                      key={policy.id}
                      className={`rounded-md border border-border transition ${!policy.enabled ? "opacity-50" : ""}`}
                    >
                      <button
                        type="button"
                        onClick={() => togglePolicyExpanded(policy.id)}
                        className="flex items-center gap-3 w-full text-left px-3 py-2.5 hover:bg-hover rounded-md transition"
                      >
                        <svg
                          className={`w-3 h-3 text-[var(--fg3)] flex-shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                        <Badge variant={effectVariant as "blue" | "red" | "green"}>{effectLabel}</Badge>
                        <div className="flex-1 min-w-0">
                          <span className="text-[13px] font-medium text-foreground">{policy.name}</span>
                        </div>
                        {isAdmin && (
                          <div
                            onClick={e => { e.stopPropagation(); handleTogglePolicy(policy); }}
                            className="flex-shrink-0 relative inline-flex h-5 w-9 items-center rounded-full cursor-pointer transition-colors"
                            style={{ background: policy.enabled ? "var(--accent)" : "var(--border)" }}
                            role="switch"
                            aria-checked={policy.enabled}
                          >
                            <span
                              className={`inline-block h-3.5 w-3.5 rounded-full bg-[var(--accent-ink)] transition-transform ${
                                policy.enabled ? "translate-x-[18px]" : "translate-x-[2px]"
                              }`}
                            />
                          </div>
                        )}
                      </button>

                      {isExpanded && (
                        <div className="px-3 pb-3 pt-1 border-t border-border mx-3 mb-1">
                          <div className="grid grid-cols-3 gap-4 text-[11px] mt-2">
                            <div>
                              <span className="text-[var(--fg3)] block mb-0.5">Scope</span>
                              <span className="text-[var(--fg2)] font-medium capitalize">{policy.scope}</span>
                              {policy.scopeTargetId && (
                                <span className="text-[var(--fg3)] ml-1">({policy.scopeTargetId})</span>
                              )}
                            </div>
                            <div>
                              <span className="text-[var(--fg3)] block mb-0.5">Action</span>
                              <span className="text-[var(--fg2)] font-medium">{policy.actionType === "*" ? "All actions" : policy.actionType}</span>
                            </div>
                            <div>
                              <span className="text-[var(--fg3)] block mb-0.5">Priority</span>
                              <span className="text-[var(--fg2)] font-medium">{policy.priority}</span>
                            </div>
                          </div>
                          {policy.conditions && (
                            <div className="mt-2 text-[11px]">
                              <span className="text-[var(--fg3)] block mb-0.5">Conditions</span>
                              <span className="text-[var(--fg2)]">{policy.conditions}</span>
                            </div>
                          )}
                          {isAdmin && (
                            <div className="mt-3 flex justify-end">
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => handleDeletePolicy(policy.id)}
                              >
                                Delete
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* ── Section 3: Trust Progression ── */}
        <section className="bg-surface border border-border rounded-lg overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-hover">
            <svg className="w-4 h-4 text-[var(--fg2)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
            </svg>
            <h2 className="text-[13px] font-semibold text-foreground">{t("trustProgression")}</h2>
          </div>

          <div className="p-5">
            {autoLoading ? (
              <div className="flex justify-center py-4">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-[var(--fg3)]" />
              </div>
            ) : sortedTypes.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-[13px] text-[var(--fg2)]">No situation types configured yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {sortedTypes.map(st => {
                  const ready = isReadyForPromotion(st);
                  const isExpanded = expandedTypes.has(st.id);
                  const levelLabel = st.autonomyLevel === "supervised" ? "supervised" : st.autonomyLevel === "notify" ? "notify" : "autonomous";

                  return (
                    <div
                      key={st.id}
                      className={`rounded-md border transition overflow-hidden ${
                        ready
                          ? "border-l-[3px] border-l-accent border-t-border border-r-border border-b-border bg-[var(--accent-light)]"
                          : "border-border bg-surface"
                      }`}
                    >
                      {/* Collapsed row — always visible */}
                      <button
                        type="button"
                        onClick={() => toggleTypeExpanded(st.id)}
                        className="flex items-center justify-between w-full text-left px-3.5 py-2.5 hover:bg-hover transition"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <svg
                            className={`w-3 h-3 text-[var(--fg3)] flex-shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                          </svg>
                          <span className="text-[13px] font-medium text-foreground truncate">{st.name}</span>
                        </div>
                        <div className="flex items-center gap-2.5 flex-shrink-0">
                          <span className="text-[11px] text-[var(--fg2)]">
                            {(st.approvalRate * 100).toFixed(0)}% approved
                          </span>
                          <span
                            className={`text-[11px] font-medium rounded-full px-2.5 py-0.5 ${
                              st.autonomyLevel === "supervised"
                                ? "bg-[var(--elevated)] text-[var(--fg2)]"
                                : st.autonomyLevel === "notify"
                                  ? "bg-[color-mix(in_srgb,var(--warn)_15%,transparent)] text-warn"
                                  : "bg-[color-mix(in_srgb,var(--ok)_15%,transparent)] text-ok"
                            }`}
                          >
                            {levelLabel}
                          </span>
                        </div>
                      </button>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div className="px-3.5 pb-3 border-t border-border">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-3">
                            <div>
                              <span className="text-[10px] text-[var(--fg3)] uppercase tracking-wide block mb-0.5">Proposed</span>
                              <span className="text-sm font-medium text-foreground">{st.totalProposed}</span>
                            </div>
                            <div>
                              <span className="text-[10px] text-[var(--fg3)] uppercase tracking-wide block mb-0.5">Approved</span>
                              <span className="text-sm font-medium text-foreground">{st.totalApproved}</span>
                            </div>
                            <div>
                              <span className="text-[10px] text-[var(--fg3)] uppercase tracking-wide block mb-0.5">Streak</span>
                              <span className="text-sm font-medium text-foreground">{st.consecutiveApprovals}</span>
                            </div>
                            <div>
                              <span className="text-[10px] text-[var(--fg3)] uppercase tracking-wide block mb-0.5">Approval Rate</span>
                              <span className="text-sm font-medium text-foreground">{(st.approvalRate * 100).toFixed(1)}%</span>
                            </div>
                          </div>

                          {/* Thresholds needed */}
                          {thresholds && st.autonomyLevel !== "autonomous" && (
                            <div className="mt-3 text-[11px] text-[var(--fg3)] bg-elevated rounded px-3 py-2">
                              {st.autonomyLevel === "supervised" ? (
                                <span>
                                  Needs {thresholds.supervisedToNotifyConsecutive} consecutive approvals (have {st.consecutiveApprovals}) and {(thresholds.supervisedToNotifyRate * 100).toFixed(0)}% rate (have {(st.approvalRate * 100).toFixed(0)}%) to promote to <span className="text-warn font-medium">notify</span>
                                </span>
                              ) : (
                                <span>
                                  Needs {thresholds.notifyToAutonomousConsecutive} consecutive approvals (have {st.consecutiveApprovals}) and {(thresholds.notifyToAutonomousRate * 100).toFixed(0)}% rate (have {(st.approvalRate * 100).toFixed(0)}%) to promote to <span className="text-ok font-medium">autonomous</span>
                                </span>
                              )}
                            </div>
                          )}

                          {/* Action buttons */}
                          {isAdmin && (
                            <div className="flex items-center gap-2 mt-3">
                              {ready && (
                                <Button
                                  variant="primary"
                                  size="sm"
                                  onClick={() => handlePromote(st.id)}
                                  disabled={promotingId !== null}
                                >
                                  {promotingId === st.id ? "..." : t("promote")}
                                </Button>
                              )}
                              {st.autonomyLevel !== "supervised" && (
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
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* ── Section 4: AI Knowledge ── */}
        <InsightsSection isAdmin={isAdmin} toast={toast} />

        {/* ── Section 5: Goals ── */}
        <GoalsSection isAdmin={isAdmin} toast={toast} />

        {/* ── Governance AI Chat Bar ── */}
        <div className="mt-8 border-t border-border pt-4">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
            </svg>
            <span className="text-[13px] font-semibold text-foreground">Governance AI</span>
            <span className="text-[11px] text-[var(--fg3)]">Ask questions or request changes to your governance configuration</span>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleChatSend(); }}
              placeholder="e.g. 'Promote all situation types with >95% approval rate'"
              className="flex-1 px-4 py-2.5 rounded-xl bg-elevated border border-border text-foreground placeholder:text-[var(--fg3)] focus:outline-none focus:border-accent text-sm"
            />
            <button
              onClick={handleChatSend}
              className="px-4 py-2.5 rounded-xl bg-accent text-[var(--accent-ink)] text-sm font-medium hover:opacity-90 transition"
            >
              Send
            </button>
          </div>
        </div>

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
              <label className="text-sm font-medium mb-2 block text-[var(--fg3)]">Effect</label>
              <div className="flex gap-2">
                {EFFECTS.map(eff => (
                  <button
                    key={eff.value}
                    onClick={() => setFormEffect(eff.value)}
                    className={`px-4 py-2 rounded text-sm font-medium border transition ${
                      formEffect === eff.value
                        ? "border-[rgba(255,255,255,0.4)] bg-[var(--accent-light)] text-accent"
                        : "border-border bg-elevated text-[var(--fg3)]"
                    }`}
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
  personal: { bg: "var(--accent-light)", color: "var(--accent)" },
  department: { bg: "rgba(59,130,246,0.1)", color: "var(--info)" },
  operator: { bg: "rgba(34,197,94,0.1)", color: "var(--ok)" },
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
    <section className="bg-surface border border-border rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-hover">
        <svg className="w-4 h-4 text-[var(--fg2)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
        </svg>
        <h2 className="text-[13px] font-semibold text-foreground">{t("aiKnowledge")}</h2>
      </div>

      <div className="p-5">
        {loading ? (
          <div className="flex justify-center py-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-[var(--fg3)]" />
          </div>
        ) : insights.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-[13px] text-[var(--fg2)]">
              {t("noInsights")}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {insights.map(insight => {
              const scopeStyle = SCOPE_STYLES[insight.shareScope] ?? SCOPE_STYLES.personal;
              return (
                <div key={insight.id} className="bg-elevated border border-border rounded-md p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[13px] leading-relaxed text-[var(--fg2)] flex-1">{insight.description}</p>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                        style={{ background: scopeStyle.bg, color: scopeStyle.color }}
                      >
                        {insight.shareScope}
                      </span>
                      {insight.status !== "active" && (
                        <Badge variant={insight.status === "superseded" ? "amber" : "red"}>{insight.status}</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-[11px] text-[var(--fg2)]">
                    {insight.evidence?.sampleSize && <span>Sample: {insight.evidence.sampleSize}</span>}
                    {insight.evidence?.successRate != null && <span>Success: {(insight.evidence.successRate * 100).toFixed(0)}%</span>}
                    <span>Confidence: {(insight.confidence * 100).toFixed(0)}%</span>
                    {insight.aiEntityName && <span>{insight.aiEntityName}</span>}
                  </div>
                  {isAdmin && insight.status === "active" && (
                    <div className="flex items-center gap-2 mt-2">
                      {insight.shareScope !== "operator" && (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => handlePromote(insight.id, insight.shareScope)}
                        >
                          Promote
                        </Button>
                      )}
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleInvalidate(insight.id)}
                      >
                        Invalidate
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
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
    <section className="bg-surface border border-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-hover">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-[var(--fg2)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
          </svg>
          <h2 className="text-[13px] font-semibold text-foreground">{t("goals")}</h2>
        </div>
        {isAdmin && !showForm && (
          <Button variant="default" size="sm" onClick={() => setShowForm(true)}>
            {t("addGoal")}
          </Button>
        )}
      </div>

      <div className="p-5">
        {/* Add goal form */}
        {showForm && (
          <div className="mb-4 space-y-3 bg-elevated border border-border rounded-md p-3.5">
            <Input label="Title" value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder={t("goalTitle")} />
            <Input label="Description" value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder={t("goalDescription")} />
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs text-[var(--fg2)] mb-1 block">{t("priority")} (1-5)</label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={formPriority}
                  onChange={e => setFormPriority(e.target.value)}
                  className="w-full outline-none text-sm bg-surface border border-border rounded px-2.5 py-1.5 text-foreground"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-[var(--fg2)] mb-1 block">{t("department")}</label>
                <select
                  value={formDeptId}
                  onChange={e => setFormDeptId(e.target.value)}
                  className="w-full outline-none text-sm bg-surface border border-border rounded px-2.5 py-1.5 text-foreground"
                >
                  <option value="" className="bg-surface">HQ-level (none)</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id} className="bg-surface">{d.displayName}</option>
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
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-[var(--fg3)]" />
          </div>
        ) : goals.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-[13px] text-[var(--fg2)] mb-3">No goals configured yet.</p>
            {isAdmin && (
              <Button variant="default" size="sm" onClick={() => setShowForm(true)}>
                {t("addGoal")}
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {goals.map(goal => (
              <div key={goal.id} className="bg-elevated border border-border rounded-md px-3.5 py-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-foreground">{goal.title}</span>
                    <span
                      className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                        goal.status === "achieved"
                          ? "bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] text-ok"
                          : goal.status === "paused"
                            ? "bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] text-warn"
                            : "bg-[var(--accent-light)] text-accent"
                      }`}
                    >
                      {goal.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-[var(--fg2)]">P{goal.priority}</span>
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(goal.id)}
                        className="text-[11px] text-[var(--fg3)] hover:text-danger"
                      >
                        {tc("delete")}
                      </Button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-[var(--fg3)] mt-0.5">{goal.description}</p>
                <div className="text-[11px] text-[var(--fg2)] mt-1">
                  {goal._count.initiatives} initiative{goal._count.initiatives !== 1 ? "s" : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
