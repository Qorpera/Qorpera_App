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

const effectBadgeVariant: Record<PolicyEffect, "green" | "red" | "amber"> = {
  ALLOW: "green",
  DENY: "red",
  REQUIRE_APPROVAL: "amber",
};

const scopeBadgeVariant: Record<PolicyScope, "purple" | "blue" | "default"> = {
  global: "purple",
  entity_type: "blue",
  entity: "default",
};

const LEVEL_COLORS: Record<string, string> = {
  supervised: "bg-amber-500/15 text-amber-400 border-amber-500/25",
  notify: "bg-blue-500/15 text-blue-400 border-blue-500/25",
  autonomous: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
};

// ── Component ────────────────────────────────────────────

export default function GovernancePage() {
  const { toast } = useToast();
  const { isAdmin } = useUser();

  // Autonomy state
  const [situationTypes, setSituationTypes] = useState<SituationTypeItem[]>([]);
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoSupervisedConsecutive, setAutoSupervisedConsecutive] = useState("10");
  const [autoSupervisedRate, setAutoSupervisedRate] = useState("90");
  const [autoNotifyConsecutive, setAutoNotifyConsecutive] = useState("20");
  const [autoNotifyRate, setAutoNotifyRate] = useState("95");
  const [autoSaving, setAutoSaving] = useState(false);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [demotingId, setDemotingId] = useState<string | null>(null);

  // Policies state
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

  // Governance settings state
  const [govApprovalThreshold, setGovApprovalThreshold] = useState("");
  const [govAutoApproveReads, setGovAutoApproveReads] = useState(true);
  const [govMaxPending, setGovMaxPending] = useState("50");
  const [govExpiryHours, setGovExpiryHours] = useState("72");
  const [govSaving, setGovSaving] = useState(false);

  // ── Data fetching ──────────────────────────────────────

  const loadSituationTypes = useCallback(() => {
    fetch("/api/situation-types")
      .then((r) => r.json())
      .then((data) => setSituationTypes(data))
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
    // Load autonomy data
    setAutoLoading(true);
    Promise.all([
      fetch("/api/autonomy/settings").then((r) => r.json()),
      fetch("/api/situation-types").then((r) => r.json()),
    ])
      .then(([settings, types]) => {
        setAutoSupervisedConsecutive(String(settings.supervisedToNotifyConsecutive));
        setAutoSupervisedRate(String(Math.round(settings.supervisedToNotifyRate * 100)));
        setAutoNotifyConsecutive(String(settings.notifyToAutonomousConsecutive));
        setAutoNotifyRate(String(Math.round(settings.notifyToAutonomousRate * 100)));
        setSituationTypes(types);
      })
      .catch(() => {})
      .finally(() => setAutoLoading(false));

    // Load policies
    loadPolicies();
  }, [loadPolicies]);

  // ── Handlers ───────────────────────────────────────────

  const handleSaveAutonomy = async () => {
    setAutoSaving(true);
    try {
      await fetch("/api/autonomy/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          graduation_supervised_to_notify_consecutive: parseInt(autoSupervisedConsecutive) || 10,
          graduation_supervised_to_notify_rate: (parseInt(autoSupervisedRate) || 90) / 100,
          graduation_notify_to_autonomous_consecutive: parseInt(autoNotifyConsecutive) || 20,
          graduation_notify_to_autonomous_rate: (parseInt(autoNotifyRate) || 95) / 100,
        }),
      });
      toast("Autonomy thresholds saved", "success");
    } catch {
      toast("Failed to save thresholds", "error");
    } finally {
      setAutoSaving(false);
    }
  };

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
      setPolicies((prev) =>
        prev.map((p) => (p.id === policy.id ? { ...p, enabled: !p.enabled } : p)),
      );
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

  const handleSaveGovernance = async () => {
    setGovSaving(true);
    try {
      const res = await fetch("/api/governance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requireApprovalAboveAmount: govApprovalThreshold
            ? parseFloat(govApprovalThreshold)
            : null,
          autoApproveReadActions: govAutoApproveReads,
          maxPendingProposals: parseInt(govMaxPending) || 50,
          approvalExpiryHours: parseInt(govExpiryHours) || 72,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast("Governance settings saved", "success");
    } catch {
      toast("Failed to save governance settings", "error");
    } finally {
      setGovSaving(false);
    }
  };

  // ── Render ─────────────────────────────────────────────

  return (
    <AppShell>
      <div className="p-8 max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold text-white/90">Governance</h1>
          <p className="text-sm text-white/40 mt-2 max-w-2xl">
            Control how much independence Qorpera&apos;s AI has in each area. The AI earns
            autonomy by demonstrating consistent good judgment &mdash; you always have full
            control to revoke it.
          </p>
        </div>

        {/* ── Autonomy Levels ──────────────────────────── */}
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-medium text-white/80">Autonomy Levels</h2>
            <p className="text-xs text-white/35 mt-1 max-w-2xl">
              The AI starts supervised &mdash; every action needs your approval. As it builds a
              track record of good decisions, it can graduate to notify (acts then tells you) and
              eventually autonomous (handles it independently).
            </p>
          </div>

          {/* Situation Type Cards */}
          <div className="wf-soft p-6 space-y-4">
            <h3 className="text-sm font-medium text-white/60">Situation Types</h3>
            {autoLoading && (
              <div className="flex justify-center py-4">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-purple-400" />
              </div>
            )}
            {!autoLoading && situationTypes.length === 0 && (
              <p className="text-sm text-white/35">No situation types configured yet.</p>
            )}
            {!autoLoading &&
              situationTypes.map((st) => (
                <div
                  key={st.id}
                  className="py-3 border-b border-white/[0.06] last:border-0"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white/80">
                        {st.name}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                          LEVEL_COLORS[st.autonomyLevel] || "bg-white/10 text-white/50 border-white/10"
                        }`}
                      >
                        {st.autonomyLevel}
                      </span>
                    </div>
                    {isAdmin && (
                      <div className="flex gap-2">
                        {st.autonomyLevel !== "autonomous" && (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handlePromote(st.id)}
                            disabled={promotingId !== null}
                          >
                            {promotingId === st.id ? "..." : "Promote"}
                          </Button>
                        )}
                        {st.autonomyLevel !== "supervised" && (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleDemote(st.id)}
                            disabled={demotingId !== null}
                          >
                            {demotingId === st.id ? "..." : "Demote"}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-4 text-xs text-white/40">
                    <span>
                      Consecutive:{" "}
                      <span className="text-white/60">{st.consecutiveApprovals}</span>
                    </span>
                    <span>
                      Approved:{" "}
                      <span className="text-white/60">
                        {st.totalApproved}/{st.totalProposed}
                      </span>
                    </span>
                    <span>
                      Rate:{" "}
                      <span className="text-white/60">
                        {(st.approvalRate * 100).toFixed(0)}%
                      </span>
                    </span>
                  </div>
                </div>
              ))}
          </div>

          {/* Graduation Thresholds */}
          {isAdmin && (
            <div className="wf-soft p-6 space-y-5">
              <h3 className="text-sm font-medium text-white/60">
                Graduation Thresholds
              </h3>
              {autoLoading ? (
                <div className="flex justify-center py-4">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-purple-400" />
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    <p className="text-xs text-white/40 uppercase tracking-wider font-semibold">
                      Supervised &rarr; Notify
                    </p>
                    <Input
                      label="Consecutive approvals required"
                      type="number"
                      value={autoSupervisedConsecutive}
                      onChange={(e) =>
                        setAutoSupervisedConsecutive(e.target.value)
                      }
                    />
                    <Input
                      label="Minimum approval rate (%)"
                      type="number"
                      value={autoSupervisedRate}
                      onChange={(e) => setAutoSupervisedRate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-3 pt-2">
                    <p className="text-xs text-white/40 uppercase tracking-wider font-semibold">
                      Notify &rarr; Autonomous
                    </p>
                    <Input
                      label="Consecutive approvals required"
                      type="number"
                      value={autoNotifyConsecutive}
                      onChange={(e) => setAutoNotifyConsecutive(e.target.value)}
                    />
                    <Input
                      label="Minimum approval rate (%)"
                      type="number"
                      value={autoNotifyRate}
                      onChange={(e) => setAutoNotifyRate(e.target.value)}
                    />
                  </div>
                  <div className="pt-2">
                    <Button
                      variant="primary"
                      onClick={handleSaveAutonomy}
                      disabled={autoSaving}
                    >
                      {autoSaving ? "Saving..." : "Save Thresholds"}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </section>

        {/* ── Policies ─────────────────────────────────── */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium text-white/80">Policies</h2>
              <p className="text-xs text-white/35 mt-1 max-w-2xl">
                Policies are hard limits the AI cannot override. Use these for compliance
                requirements, approval thresholds, or any rule the AI must always follow.
              </p>
            </div>
            {isAdmin && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowNewPolicy(true)}
              >
                New Policy
              </Button>
            )}
          </div>

          {policiesLoading && (
            <div className="flex justify-center py-8">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-purple-400" />
            </div>
          )}

          {!policiesLoading && policies.length === 0 && (
            <div className="wf-soft p-10 text-center">
              <p className="text-sm text-white/40">
                No policies configured. Create one to control data governance.
              </p>
            </div>
          )}

          {!policiesLoading && policies.length > 0 && (
            <div className="space-y-2">
              {policies.map((policy) => (
                <div
                  key={policy.id}
                  className={`wf-soft px-5 py-4 flex items-center gap-4 ${
                    !policy.enabled ? "opacity-50" : ""
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white/90">
                      {policy.name}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant={scopeBadgeVariant[policy.scope]}>
                        {policy.scope}
                      </Badge>
                      <span className="text-xs text-white/40">
                        {policy.actionType === "*"
                          ? "All actions"
                          : policy.actionType}
                      </span>
                      <span className="text-xs text-white/30">
                        Priority: {policy.priority}
                      </span>
                    </div>
                  </div>
                  <Badge variant={effectBadgeVariant[policy.effect]}>
                    {policy.effect}
                  </Badge>
                  {isAdmin && (
                    <button
                      onClick={() => handleTogglePolicy(policy)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        policy.enabled ? "bg-purple-500" : "bg-white/10"
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                          policy.enabled
                            ? "translate-x-4.5"
                            : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Governance Settings ──────────────────────── */}
        {isAdmin && (
          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-medium text-white/80">
                Governance Settings
              </h2>
              <p className="text-xs text-white/35 mt-1 max-w-2xl">
                General settings that apply across all governance areas.
              </p>
            </div>

            <div className="wf-soft p-6 space-y-5">
              <Input
                label="Approval Threshold (amount)"
                type="number"
                value={govApprovalThreshold}
                onChange={(e) => setGovApprovalThreshold(e.target.value)}
                placeholder="Leave empty for no threshold"
              />
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-white/70">
                    Auto-approve read actions
                  </div>
                  <div className="text-xs text-white/35">
                    Allow read operations without policy checks
                  </div>
                </div>
                <button
                  onClick={() => setGovAutoApproveReads(!govAutoApproveReads)}
                  className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors ${
                    govAutoApproveReads ? "bg-purple-500" : "bg-white/10"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                      govAutoApproveReads ? "translate-x-5" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
              <Input
                label="Max Pending Proposals"
                type="number"
                value={govMaxPending}
                onChange={(e) => setGovMaxPending(e.target.value)}
              />
              <Input
                label="Approval Expiry (hours)"
                type="number"
                value={govExpiryHours}
                onChange={(e) => setGovExpiryHours(e.target.value)}
              />
              <div className="flex gap-3 pt-2">
                <Button
                  variant="primary"
                  onClick={handleSaveGovernance}
                  disabled={govSaving}
                >
                  {govSaving ? "Saving..." : "Save Settings"}
                </Button>
              </div>
            </div>
          </section>
        )}

        {/* ── New Policy Modal ─────────────────────────── */}
        <Modal
          open={showNewPolicy}
          onClose={() => {
            setShowNewPolicy(false);
            resetPolicyForm();
          }}
          title="New Policy"
        >
          <div className="space-y-4">
            <Input
              label="Name"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g. Require approval for deletions"
            />
            <Select
              label="Scope"
              options={SCOPES}
              value={formScope}
              onChange={(e) => setFormScope(e.target.value as PolicyScope)}
            />
            {formScope !== "global" && (
              <Input
                label={
                  formScope === "entity_type" ? "Entity Type Slug" : "Entity ID"
                }
                value={formScopeTarget}
                onChange={(e) => setFormScopeTarget(e.target.value)}
                placeholder={
                  formScope === "entity_type" ? "e.g. customer" : "e.g. abc123"
                }
              />
            )}
            <Select
              label="Action Type"
              options={ACTION_TYPES}
              value={formActionType}
              onChange={(e) => setFormActionType(e.target.value)}
            />
            <div>
              <label className="text-sm text-white/60 font-medium mb-2 block">
                Effect
              </label>
              <div className="flex gap-2">
                {EFFECTS.map((eff) => (
                  <button
                    key={eff.value}
                    onClick={() => setFormEffect(eff.value)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition ${
                      formEffect === eff.value
                        ? "border-purple-500/50 bg-purple-500/15 text-purple-300"
                        : "border-white/10 bg-white/5 text-white/50 hover:bg-white/10"
                    }`}
                  >
                    {eff.label}
                  </button>
                ))}
              </div>
            </div>
            <Input
              label="Priority"
              type="number"
              value={formPriority}
              onChange={(e) => setFormPriority(e.target.value)}
              placeholder="0"
            />
            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setShowNewPolicy(false);
                  resetPolicyForm();
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleCreatePolicy}
                disabled={policySaving || !formName.trim()}
              >
                {policySaving ? "Creating..." : "Create Policy"}
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </AppShell>
  );
}
