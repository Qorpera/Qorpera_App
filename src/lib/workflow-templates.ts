import type { WorkflowGraph } from "./workflow-engine";

export interface WorkflowTemplate {
  slug: string;
  name: string;
  description: string;
  triggerType: string;
  graph: WorkflowGraph;
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    slug: "invoice-chase",
    name: "Invoice Chase",
    description: "Automatically follow up on overdue invoices. Checks invoice status, sends reminders, escalates if needed.",
    triggerType: "schedule",
    graph: {
      nodes: [
        { id: "trigger", type: "trigger", config: { schedule: "daily" } },
        { id: "check-overdue", type: "condition", config: { field: "days_overdue", operator: "gt", value: "30" } },
        { id: "send-reminder", type: "action", config: { actionType: "send_notification", template: "invoice_reminder" } },
        { id: "escalate", type: "action", config: { actionType: "create_proposal", description: "Escalate overdue invoice" } },
        { id: "done", type: "output", config: {} },
      ],
      edges: [
        { from: "trigger", to: "check-overdue" },
        { from: "check-overdue", to: "send-reminder", label: "true" },
        { from: "check-overdue", to: "done", label: "false" },
        { from: "send-reminder", to: "escalate" },
        { from: "escalate", to: "done" },
      ],
    },
  },
  {
    slug: "support-triage",
    name: "Support Triage",
    description: "Route incoming support tickets based on priority and type. Assigns to appropriate team or escalates critical issues.",
    triggerType: "event",
    graph: {
      nodes: [
        { id: "trigger", type: "trigger", config: { event: "ticket_created" } },
        { id: "check-priority", type: "condition", config: { field: "priority", operator: "equals", value: "critical" } },
        { id: "escalate", type: "action", config: { actionType: "create_proposal", description: "Critical ticket requires immediate attention" } },
        { id: "assign", type: "action", config: { actionType: "update_entity", field: "assignee" } },
        { id: "done", type: "output", config: {} },
      ],
      edges: [
        { from: "trigger", to: "check-priority" },
        { from: "check-priority", to: "escalate", label: "true" },
        { from: "check-priority", to: "assign", label: "false" },
        { from: "escalate", to: "done" },
        { from: "assign", to: "done" },
      ],
    },
  },
  {
    slug: "lead-qualification",
    name: "Lead Qualification",
    description: "Score and qualify new leads based on company size, engagement, and fit criteria.",
    triggerType: "event",
    graph: {
      nodes: [
        { id: "trigger", type: "trigger", config: { event: "lead_created" } },
        { id: "check-size", type: "condition", config: { field: "company_size", operator: "gt", value: "50" } },
        { id: "mark-qualified", type: "action", config: { actionType: "update_entity", properties: { status: "qualified" } } },
        { id: "mark-nurture", type: "action", config: { actionType: "update_entity", properties: { status: "nurture" } } },
        { id: "done", type: "output", config: {} },
      ],
      edges: [
        { from: "trigger", to: "check-size" },
        { from: "check-size", to: "mark-qualified", label: "true" },
        { from: "check-size", to: "mark-nurture", label: "false" },
        { from: "mark-qualified", to: "done" },
        { from: "mark-nurture", to: "done" },
      ],
    },
  },
];
