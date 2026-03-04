"use client";

import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";

interface ActionRule {
  id: string;
  name: string;
  description: string;
  entityTypeSlug: string;
  triggerOn: string;
  conditions: string;
  actionType: string;
  actionConfig: string;
  priority: number;
  enabled: boolean;
  lastEvaluatedAt: string | null;
}

interface EntityType {
  id: string;
  name: string;
  slug: string;
  properties: { id: string; name: string; slug: string; dataType: string }[];
}

interface ConditionRow {
  field: string;
  operator: string;
  value: string;
}

const TRIGGER_OPTIONS = [
  { value: "mutation", label: "On entity change" },
  { value: "tick", label: "On schedule" },
];

const ACTION_TYPE_OPTIONS = [
  { value: "create_proposal", label: "Create Proposal" },
  { value: "update_entity", label: "Update Entity" },
  { value: "flag_for_review", label: "Flag for Review" },
  { value: "send_notification", label: "Send Notification" },
];

const CONDITION_OPERATORS = [
  { value: "equals", label: "equals" },
  { value: "not_equals", label: "not equals" },
  { value: "contains", label: "contains" },
  { value: "gt", label: "greater than" },
  { value: "lt", label: "less than" },
  { value: "is_empty", label: "is empty" },
  { value: "is_not_empty", label: "is not empty" },
];

const triggerBadgeVariant: Record<string, "blue" | "amber"> = {
  mutation: "blue",
  tick: "amber",
};

const actionBadgeVariant: Record<string, "purple" | "green" | "red" | "default"> = {
  create_proposal: "purple",
  update_entity: "green",
  flag_for_review: "red",
  send_notification: "default",
};

export default function ActionRulesPage() {
  const [rules, setRules] = useState<ActionRule[]>([]);
  const [entityTypes, setEntityTypes] = useState<EntityType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formEntityType, setFormEntityType] = useState("");
  const [formTrigger, setFormTrigger] = useState("mutation");
  const [formActionType, setFormActionType] = useState("flag_for_review");
  const [formActionConfig, setFormActionConfig] = useState("{}");
  const [formPriority, setFormPriority] = useState("0");
  const [formConditions, setFormConditions] = useState<ConditionRow[]>([]);

  const fetchRules = useCallback(async () => {
    try {
      const res = await fetch("/api/action-rules");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRules(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load action rules");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchEntityTypes = useCallback(async () => {
    try {
      const res = await fetch("/api/entity-types");
      if (!res.ok) return;
      setEntityTypes(await res.json());
    } catch {
      // Silently fail — entity types are for dropdowns
    }
  }, []);

  useEffect(() => {
    fetchRules();
    fetchEntityTypes();
  }, [fetchRules, fetchEntityTypes]);

  const selectedTypeProps = entityTypes.find((t) => t.slug === formEntityType)?.properties ?? [];

  const handleCreate = async () => {
    if (!formName.trim() || !formEntityType) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: formName.trim(),
        entityTypeSlug: formEntityType,
        triggerOn: formTrigger,
        conditions: formConditions.filter((c) => c.field),
        actionType: formActionType,
        priority: parseInt(formPriority) || 0,
      };
      if (formActionType === "update_entity" || formActionType === "send_notification") {
        try { body.actionConfig = JSON.parse(formActionConfig); } catch { /* ignore */ }
      }
      const res = await fetch("/api/action-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setShowNew(false);
      resetForm();
      fetchRules();
    } catch {
      // Error handled silently
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (rule: ActionRule) => {
    try {
      await fetch("/api/action-rules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rule.id, enabled: !rule.enabled }),
      });
      setRules((prev) =>
        prev.map((r) =>
          r.id === rule.id ? { ...r, enabled: !r.enabled } : r,
        ),
      );
    } catch {
      // Error handled silently
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch("/api/action-rules", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setRules((prev) => prev.filter((r) => r.id !== id));
    } catch {
      // Error handled silently
    }
  };

  const addCondition = () => {
    setFormConditions([...formConditions, { field: "", operator: "equals", value: "" }]);
  };

  const updateCondition = (idx: number, patch: Partial<ConditionRow>) => {
    setFormConditions((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    );
  };

  const removeCondition = (idx: number) => {
    setFormConditions((prev) => prev.filter((_, i) => i !== idx));
  };

  const resetForm = () => {
    setFormName("");
    setFormEntityType("");
    setFormTrigger("mutation");
    setFormActionType("flag_for_review");
    setFormActionConfig("{}");
    setFormPriority("0");
    setFormConditions([]);
  };

  return (
    <AppShell>
      <div className="p-8 max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-white/90">Action Rules</h1>
          <Button variant="primary" size="sm" onClick={() => setShowNew(true)}>
            New Action Rule
          </Button>
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

        {/* Empty state */}
        {!loading && !error && rules.length === 0 && (
          <div className="wf-soft p-10 text-center">
            <p className="text-sm text-white/40">
              No action rules configured. Create one to automate entity-driven actions.
            </p>
          </div>
        )}

        {/* Rule list */}
        {!loading && !error && rules.length > 0 && (
          <div className="space-y-2">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className={`wf-soft px-5 py-4 flex items-center gap-4 ${!rule.enabled ? "opacity-50" : ""}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white/90">
                    {rule.name}
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge variant="purple">{rule.entityTypeSlug}</Badge>
                    <Badge variant={triggerBadgeVariant[rule.triggerOn] ?? "default"}>
                      {rule.triggerOn === "mutation" ? "on change" : "scheduled"}
                    </Badge>
                    <Badge variant={actionBadgeVariant[rule.actionType] ?? "default"}>
                      {rule.actionType.replace(/_/g, " ")}
                    </Badge>
                    <span className="text-xs text-white/30">
                      Priority: {rule.priority}
                    </span>
                  </div>
                </div>

                {/* Delete button */}
                <button
                  onClick={() => handleDelete(rule.id)}
                  className="text-white/20 hover:text-red-400 transition text-xs"
                  title="Delete rule"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                </button>

                {/* Toggle switch */}
                <button
                  onClick={() => handleToggle(rule)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    rule.enabled ? "bg-purple-500" : "bg-white/10"
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                      rule.enabled ? "translate-x-4.5" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* New Action Rule Modal */}
        <Modal
          open={showNew}
          onClose={() => {
            setShowNew(false);
            resetForm();
          }}
          title="New Action Rule"
        >
          <div className="space-y-4">
            <Input
              label="Name"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g. Flag overdue invoices"
            />

            <Select
              label="Entity Type"
              options={entityTypes.map((t) => ({ value: t.slug, label: t.name }))}
              value={formEntityType}
              onChange={(e) => {
                setFormEntityType(e.target.value);
                setFormConditions([]);
              }}
            />

            <Select
              label="Trigger"
              options={TRIGGER_OPTIONS}
              value={formTrigger}
              onChange={(e) => setFormTrigger(e.target.value)}
            />

            {/* Conditions */}
            <div>
              <label className="text-sm text-white/60 font-medium mb-2 block">
                Conditions
              </label>
              <div className="space-y-2">
                {formConditions.map((cond, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select
                      className="flex-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white/80"
                      value={cond.field}
                      onChange={(e) => updateCondition(i, { field: e.target.value })}
                    >
                      <option value="">Select property</option>
                      {selectedTypeProps.map((p) => (
                        <option key={p.slug} value={p.slug}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <select
                      className="w-36 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white/80"
                      value={cond.operator}
                      onChange={(e) => updateCondition(i, { operator: e.target.value })}
                    >
                      {CONDITION_OPERATORS.map((op) => (
                        <option key={op.value} value={op.value}>
                          {op.label}
                        </option>
                      ))}
                    </select>
                    {cond.operator !== "is_empty" && cond.operator !== "is_not_empty" && (
                      <input
                        className="flex-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white/80"
                        value={cond.value}
                        onChange={(e) => updateCondition(i, { value: e.target.value })}
                        placeholder="Value"
                      />
                    )}
                    <button
                      onClick={() => removeCondition(i)}
                      className="text-white/30 hover:text-red-400 transition"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
                <button
                  onClick={addCondition}
                  className="text-xs text-purple-400 hover:text-purple-300 transition"
                  disabled={!formEntityType}
                >
                  + Add condition
                </button>
              </div>
            </div>

            <Select
              label="Action Type"
              options={ACTION_TYPE_OPTIONS}
              value={formActionType}
              onChange={(e) => setFormActionType(e.target.value)}
            />

            {(formActionType === "update_entity" || formActionType === "send_notification") && (
              <div>
                <label className="text-sm text-white/60 font-medium mb-2 block">
                  Action Config (JSON)
                </label>
                <textarea
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white/80 font-mono h-24 resize-none"
                  value={formActionConfig}
                  onChange={(e) => setFormActionConfig(e.target.value)}
                  placeholder='{"properties": {"status": "flagged"}}'
                />
              </div>
            )}

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
                disabled={saving || !formName.trim() || !formEntityType}
              >
                {saving ? "Creating..." : "Create Rule"}
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </AppShell>
  );
}
