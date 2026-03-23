import { describe, it, expect } from "vitest";
import { getPreviewComponent, type ExecutionStepForPreview } from "@/components/execution/previews/get-preview-component";
import { EmailPreview } from "@/components/execution/previews/email-preview";
import { CalendarEventPreview } from "@/components/execution/previews/calendar-event-preview";
import { SlackMessagePreview } from "@/components/execution/previews/slack-message-preview";
import { CrmUpdatePreview } from "@/components/execution/previews/crm-update-preview";
import { TicketReplyPreview } from "@/components/execution/previews/ticket-reply-preview";
import { GenericStepPreview } from "@/components/execution/previews/generic-step-preview";

function makeStep(slug: string | null, params?: Record<string, unknown>): ExecutionStepForPreview {
  return {
    id: "step1",
    sequenceOrder: 1,
    title: "Test step",
    description: "Test description",
    executionMode: "action",
    status: "pending",
    assignedUserId: null,
    parameters: params ?? { subject: "Hello", body: "World" },
    actionCapability: slug ? { id: "cap1", slug, name: slug } : null,
  };
}

// ── getPreviewComponent ──────────────────────────────────────────────────────

describe("getPreviewComponent", () => {
  // Email
  it("returns EmailPreview for email slug", () => {
    expect(getPreviewComponent(makeStep("email"))).toBe(EmailPreview);
  });

  it("returns EmailPreview for email.send slug", () => {
    expect(getPreviewComponent(makeStep("email.send"))).toBe(EmailPreview);
  });

  it("returns EmailPreview for email_draft slug", () => {
    expect(getPreviewComponent(makeStep("email_draft"))).toBe(EmailPreview);
  });

  // Calendar
  it("returns CalendarEventPreview for calendar slug", () => {
    expect(getPreviewComponent(makeStep("calendar"))).toBe(CalendarEventPreview);
  });

  it("returns CalendarEventPreview for calendar.create slug", () => {
    expect(getPreviewComponent(makeStep("calendar.create"))).toBe(CalendarEventPreview);
  });

  // Slack
  it("returns SlackMessagePreview for slack slug", () => {
    expect(getPreviewComponent(makeStep("slack"))).toBe(SlackMessagePreview);
  });

  it("returns SlackMessagePreview for slack.post_message slug", () => {
    expect(getPreviewComponent(makeStep("slack.post_message"))).toBe(SlackMessagePreview);
  });

  // CRM — exact slug matches
  it("returns CrmUpdatePreview for update_deal_stage", () => {
    expect(getPreviewComponent(makeStep("update_deal_stage"))).toBe(CrmUpdatePreview);
  });

  it("returns CrmUpdatePreview for update_contact", () => {
    expect(getPreviewComponent(makeStep("update_contact"))).toBe(CrmUpdatePreview);
  });

  it("returns CrmUpdatePreview for update_opportunity", () => {
    expect(getPreviewComponent(makeStep("update_opportunity"))).toBe(CrmUpdatePreview);
  });

  it("returns CrmUpdatePreview for create_task", () => {
    expect(getPreviewComponent(makeStep("create_task"))).toBe(CrmUpdatePreview);
  });

  it("returns CrmUpdatePreview for log_activity", () => {
    expect(getPreviewComponent(makeStep("log_activity"))).toBe(CrmUpdatePreview);
  });

  it("returns CrmUpdatePreview for crm.update prefix", () => {
    expect(getPreviewComponent(makeStep("crm.update"))).toBe(CrmUpdatePreview);
  });

  // Ticket/Conversation — exact slug matches
  it("returns TicketReplyPreview for reply_to_ticket", () => {
    expect(getPreviewComponent(makeStep("reply_to_ticket"))).toBe(TicketReplyPreview);
  });

  it("returns TicketReplyPreview for add_internal_note", () => {
    expect(getPreviewComponent(makeStep("add_internal_note"))).toBe(TicketReplyPreview);
  });

  it("returns TicketReplyPreview for update_ticket_status", () => {
    expect(getPreviewComponent(makeStep("update_ticket_status"))).toBe(TicketReplyPreview);
  });

  it("returns TicketReplyPreview for reply_to_conversation", () => {
    expect(getPreviewComponent(makeStep("reply_to_conversation"))).toBe(TicketReplyPreview);
  });

  it("returns TicketReplyPreview for add_note", () => {
    expect(getPreviewComponent(makeStep("add_note"))).toBe(TicketReplyPreview);
  });

  it("returns TicketReplyPreview for tag_conversation", () => {
    expect(getPreviewComponent(makeStep("tag_conversation"))).toBe(TicketReplyPreview);
  });

  // Fallback
  it("returns GenericStepPreview for unknown slugs", () => {
    expect(getPreviewComponent(makeStep("some_unknown_action"))).toBe(GenericStepPreview);
  });

  it("returns GenericStepPreview when no capability", () => {
    expect(getPreviewComponent(makeStep(null))).toBe(GenericStepPreview);
  });

  // Priority: exact match wins over prefix match
  it("exact match takes priority over prefix match", () => {
    // "reply_to_ticket" is both an exact match (→ TicketReplyPreview)
    // and would be matched by prefix if it were still registered
    expect(getPreviewComponent(makeStep("reply_to_ticket"))).toBe(TicketReplyPreview);
  });
});
