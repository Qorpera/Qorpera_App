"use client";

import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

interface Workflow {
  id: string;
  name: string;
  description: string;
  triggerType: string;
  status: string;
  lastRunAt: string | null;
  createdAt: string;
  _count?: { runs: number };
}

interface Template {
  slug: string;
  name: string;
  description: string;
  triggerType: string;
}

const TRIGGER_TYPES = [
  { value: "manual", label: "Manual" },
  { value: "schedule", label: "Schedule" },
  { value: "event", label: "Event" },
  { value: "webhook", label: "Webhook" },
];

const SCHEDULE_OPTIONS = [
  { value: "every_15m", label: "Every 15 minutes" },
  { value: "hourly", label: "Every hour" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const triggerBadgeVariant: Record<string, "purple" | "blue" | "amber" | "default"> = {
  manual: "default",
  schedule: "blue",
  event: "purple",
  webhook: "amber",
};

const statusBadgeVariant: Record<string, "green" | "red" | "default"> = {
  active: "green",
  draft: "default",
  paused: "red",
};

const TEMPLATE_ICONS: Record<string, string> = {
  "invoice-chase": "\uD83D\uDCB0",
  "support-triage": "\uD83C\uDFAF",
  "lead-qualification": "\u2B50",
};

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formTrigger, setFormTrigger] = useState("manual");
  const [formSchedule, setFormSchedule] = useState("daily");
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchWorkflows = useCallback(async () => {
    try {
      const res = await fetch("/api/workflows");
      if (!res.ok) return;
      const data = await res.json();
      setWorkflows(data.workflows ?? []);
      setTemplates(data.templates ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  const handleCreateFromTemplate = async (template: Template) => {
    const res = await fetch("/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateSlug: template.slug }),
    });
    if (res.ok) fetchWorkflows();
  };

  const handleCreate = async () => {
    if (!formName.trim()) return;
    const res = await fetch("/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: formName.trim(),
        description: formDescription.trim(),
        triggerType: formTrigger,
      }),
    });
    if (res.ok) {
      fetchWorkflows();
      setShowNew(false);
      setFormName("");
      setFormDescription("");
      setFormTrigger("manual");
      setFormSchedule("daily");
    }
  };

  const handleToggle = async (workflow: Workflow) => {
    const newStatus = workflow.status === "active" ? "paused" : "active";
    setWorkflows((prev) =>
      prev.map((w) => (w.id === workflow.id ? { ...w, status: newStatus } : w)),
    );
    await fetch("/api/workflows", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: workflow.id, status: newStatus }),
    });
  };

  const handleDelete = async (id: string) => {
    setDeleting(null);
    setWorkflows((prev) => prev.filter((w) => w.id !== id));
    await fetch("/api/workflows", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  };

  return (
    <AppShell>
      <div className="p-8 max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-white/90">Workflows</h1>
          <Button variant="primary" size="sm" onClick={() => setShowNew(true)}>
            New Workflow
          </Button>
        </div>

        {/* Template picker */}
        {templates.length > 0 && (
          <section>
            <h2 className="text-sm font-medium text-white/50 uppercase tracking-wider mb-3">
              Quick Start Templates
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {templates.map((template) => (
                <button
                  key={template.slug}
                  onClick={() => handleCreateFromTemplate(template)}
                  className="wf-soft p-4 text-left hover:bg-white/[0.04] transition-colors group"
                >
                  <div className="text-2xl mb-2">
                    {TEMPLATE_ICONS[template.slug] ?? "\u2699\uFE0F"}
                  </div>
                  <div className="text-sm font-medium text-white/80 group-hover:text-white/90">
                    {template.name}
                  </div>
                  <p className="text-xs text-white/40 mt-1 line-clamp-2">
                    {template.description}
                  </p>
                  <Badge
                    variant={triggerBadgeVariant[template.triggerType] ?? "default"}
                    className="mt-2"
                  >
                    {template.triggerType}
                  </Badge>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Workflow list */}
        {loading ? (
          <div className="wf-soft p-10 text-center">
            <p className="text-sm text-white/40">Loading workflows...</p>
          </div>
        ) : workflows.length === 0 ? (
          <div className="wf-soft p-10 text-center">
            <p className="text-sm text-white/40">
              No workflows yet. Create one or use a template above to get started.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {workflows.map((workflow) => (
              <div key={workflow.id} className="wf-soft p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-white/90">
                      {workflow.name}
                    </div>
                    {workflow.description && (
                      <p className="text-xs text-white/40 mt-1 line-clamp-2">
                        {workflow.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    {/* Toggle switch */}
                    <button
                      onClick={() => handleToggle(workflow)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        workflow.status === "active"
                          ? "bg-emerald-500"
                          : "bg-white/10"
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                          workflow.status === "active"
                            ? "translate-x-4.5"
                            : "translate-x-0.5"
                        }`}
                      />
                    </button>
                    {/* Delete button */}
                    <button
                      onClick={() => setDeleting(workflow.id)}
                      className="text-white/20 hover:text-red-400 transition-colors p-0.5"
                      title="Delete workflow"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={triggerBadgeVariant[workflow.triggerType] ?? "default"}>
                    {workflow.triggerType}
                  </Badge>
                  <Badge variant={statusBadgeVariant[workflow.status] ?? "default"}>
                    {workflow.status}
                  </Badge>
                  {workflow.lastRunAt && (
                    <span className="text-xs text-white/30">
                      Last run: {new Date(workflow.lastRunAt).toLocaleDateString()}
                    </span>
                  )}
                  {(workflow._count?.runs ?? 0) > 0 && (
                    <span className="text-xs text-white/30">
                      {workflow._count!.runs} runs
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Delete confirmation */}
        <Modal
          open={!!deleting}
          onClose={() => setDeleting(null)}
          title="Delete Workflow"
        >
          <div className="space-y-4">
            <p className="text-sm text-white/60">
              Are you sure you want to delete this workflow? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setDeleting(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => deleting && handleDelete(deleting)}>
                Delete
              </Button>
            </div>
          </div>
        </Modal>

        {/* New Workflow Modal */}
        <Modal
          open={showNew}
          onClose={() => setShowNew(false)}
          title="New Workflow"
        >
          <div className="space-y-4">
            <Input
              label="Name"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g. Weekly Report Generator"
            />
            <Input
              label="Description"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="What does this workflow do?"
            />
            <Select
              label="Trigger Type"
              options={TRIGGER_TYPES}
              value={formTrigger}
              onChange={(e) => setFormTrigger(e.target.value)}
            />
            {formTrigger === "schedule" && (
              <Select
                label="Schedule"
                options={SCHEDULE_OPTIONS}
                value={formSchedule}
                onChange={(e) => setFormSchedule(e.target.value)}
              />
            )}
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={() => setShowNew(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleCreate}
                disabled={!formName.trim()}
              >
                Create Workflow
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </AppShell>
  );
}
