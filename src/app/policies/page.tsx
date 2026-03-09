"use client";

import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { useUser } from "@/components/user-provider";
import type { PolicyEffect, PolicyScope } from "@/lib/types";

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

const BASE_ACTION_TYPES = [
  { value: "*", label: "All Actions" },
  { value: "create", label: "Create" },
  { value: "update", label: "Update" },
  { value: "delete", label: "Delete" },
  { value: "read", label: "Read" },
];

type ActionCapability = {
  id: string;
  name: string;
  description: string;
  connectorProvider: string | null;
  connectorName: string | null;
};

type PolicyLogItem = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
};

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

export default function PoliciesPage() {
  const { isAdmin } = useUser();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formScope, setFormScope] = useState<PolicyScope>("global");
  const [formScopeTarget, setFormScopeTarget] = useState("");
  const [formActionType, setFormActionType] = useState("*");
  const [formEffect, setFormEffect] = useState<PolicyEffect>("ALLOW");
  const [formPriority, setFormPriority] = useState("0");

  const [actionCapabilities, setActionCapabilities] = useState<ActionCapability[]>([]);
  const [policyLogs, setPolicyLogs] = useState<PolicyLogItem[]>([]);

  // Load action capabilities + policy evaluation logs
  useEffect(() => {
    fetch("/api/action-capabilities")
      .then((r) => r.json())
      .then((data) => setActionCapabilities(Array.isArray(data) ? data : []))
      .catch(() => {});
    fetch("/api/notifications?sourceType=policy&unreadOnly=false&limit=20")
      .then((r) => r.json())
      .then((data) => setPolicyLogs(data.items || []))
      .catch(() => {});
  }, []);

  const ACTION_TYPES = [
    ...BASE_ACTION_TYPES,
    ...actionCapabilities.map((c) => ({
      value: c.name,
      label: `${c.name}${c.connectorName ? ` (${c.connectorName})` : ""}`,
    })),
  ];

  const fetchPolicies = useCallback(async () => {
    try {
      const res = await fetch("/api/policies");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPolicies(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load policies");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPolicies();
  }, [fetchPolicies]);

  const handleCreate = async () => {
    if (!formName.trim()) return;
    setSaving(true);
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
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setShowNew(false);
      resetForm();
      fetchPolicies();
    } catch {
      // Error handled silently
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (policy: Policy) => {
    try {
      await fetch("/api/policies", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: policy.id, enabled: !policy.enabled }),
      });
      setPolicies((prev) =>
        prev.map((p) =>
          p.id === policy.id ? { ...p, enabled: !p.enabled } : p,
        ),
      );
    } catch {
      // Error handled silently
    }
  };

  const resetForm = () => {
    setFormName("");
    setFormScope("global");
    setFormScopeTarget("");
    setFormActionType("*");
    setFormEffect("ALLOW");
    setFormPriority("0");
  };

  return (
    <AppShell>
      <div className="p-8 max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-white/90">Policies</h1>
          {isAdmin && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowNew(true)}
            >
              New Policy
            </Button>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-purple-400" />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="text-sm text-red-400 text-center py-8">{error}</div>
        )}

        {/* Policy list */}
        {!loading && !error && policies.length === 0 && (
          <div className="wf-soft p-10 text-center">
            <p className="text-sm text-white/40">
              No policies configured. Create one to control data governance.
            </p>
          </div>
        )}

        {!loading && !error && policies.length > 0 && (
          <div className="space-y-2">
            {policies.map((policy) => (
              <div
                key={policy.id}
                className={`wf-soft px-5 py-4 flex items-center gap-4 ${!policy.enabled ? "opacity-50" : ""}`}
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
                {/* Toggle switch (admin only) */}
                {isAdmin && (
                  <button
                    onClick={() => handleToggle(policy)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      policy.enabled ? "bg-purple-500" : "bg-white/10"
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                        policy.enabled ? "translate-x-4.5" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Recent Evaluations */}
        {!loading && policyLogs.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-white/50">Recent Evaluations</h2>
            <div className="wf-soft divide-y divide-white/[0.06]">
              {policyLogs.map((log) => (
                <div key={log.id} className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-white/30">{new Date(log.createdAt).toLocaleString()}</span>
                    <span className="text-xs font-medium text-white/60">{log.title}</span>
                  </div>
                  <p className="text-xs text-white/40 mt-0.5">{log.body}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* New Policy Modal */}
        <Modal
          open={showNew}
          onClose={() => {
            setShowNew(false);
            resetForm();
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
                  formScope === "entity_type"
                    ? "Entity Type Slug"
                    : "Entity ID"
                }
                value={formScopeTarget}
                onChange={(e) => setFormScopeTarget(e.target.value)}
                placeholder={
                  formScope === "entity_type"
                    ? "e.g. customer"
                    : "e.g. abc123"
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
                  setShowNew(false);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleCreate}
                disabled={saving || !formName.trim()}
              >
                {saving ? "Creating..." : "Create Policy"}
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </AppShell>
  );
}
