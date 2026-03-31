import { describe, it, expect } from "vitest";
import { getPreviewComponent, type ExecutionStepForPreview } from "@/components/execution/previews/get-preview-component";
import { EmailPreview } from "@/components/execution/previews/email-preview";
import { CalendarEventPreview } from "@/components/execution/previews/calendar-event-preview";
import { SlackMessagePreview } from "@/components/execution/previews/slack-message-preview";
import { CrmUpdatePreview } from "@/components/execution/previews/crm-update-preview";
import { TicketReplyPreview } from "@/components/execution/previews/ticket-reply-preview";
import { DocumentPreview } from "@/components/execution/previews/document-preview";
import { SpreadsheetPreview } from "@/components/execution/previews/spreadsheet-preview";
import { PresentationPreview } from "@/components/execution/previews/presentation-preview";
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

  // Email — additional exact matches
  it("returns EmailPreview for reply_to_thread", () => {
    expect(getPreviewComponent(makeStep("reply_to_thread"))).toBe(EmailPreview);
  });

  it("returns EmailPreview for reply_email", () => {
    expect(getPreviewComponent(makeStep("reply_email"))).toBe(EmailPreview);
  });

  it("returns EmailPreview for create_draft", () => {
    expect(getPreviewComponent(makeStep("create_draft"))).toBe(EmailPreview);
  });

  it("returns EmailPreview for send_with_attachment", () => {
    expect(getPreviewComponent(makeStep("send_with_attachment"))).toBe(EmailPreview);
  });

  it("returns EmailPreview for send_email_via_salesforce", () => {
    expect(getPreviewComponent(makeStep("send_email_via_salesforce"))).toBe(EmailPreview);
  });

  // Messaging — additional exact matches
  it("returns SlackMessagePreview for send_channel_message", () => {
    expect(getPreviewComponent(makeStep("send_channel_message"))).toBe(SlackMessagePreview);
  });

  it("returns SlackMessagePreview for reply_to_teams_thread", () => {
    expect(getPreviewComponent(makeStep("reply_to_teams_thread"))).toBe(SlackMessagePreview);
  });

  it("returns SlackMessagePreview for reply_in_thread", () => {
    expect(getPreviewComponent(makeStep("reply_in_thread"))).toBe(SlackMessagePreview);
  });

  // CRM — additional exact matches
  it("returns CrmUpdatePreview for create_deal", () => {
    expect(getPreviewComponent(makeStep("create_deal"))).toBe(CrmUpdatePreview);
  });

  it("returns CrmUpdatePreview for create_contact", () => {
    expect(getPreviewComponent(makeStep("create_contact"))).toBe(CrmUpdatePreview);
  });

  it("returns CrmUpdatePreview for create_lead", () => {
    expect(getPreviewComponent(makeStep("create_lead"))).toBe(CrmUpdatePreview);
  });

  // Ticket — additional exact matches
  it("returns TicketReplyPreview for create_ticket", () => {
    expect(getPreviewComponent(makeStep("create_ticket"))).toBe(TicketReplyPreview);
  });

  it("returns TicketReplyPreview for add_tags", () => {
    expect(getPreviewComponent(makeStep("add_tags"))).toBe(TicketReplyPreview);
  });

  it("returns TicketReplyPreview for update_ticket_type", () => {
    expect(getPreviewComponent(makeStep("update_ticket_type"))).toBe(TicketReplyPreview);
  });

  // Document
  it("returns DocumentPreview for create_document", () => {
    expect(getPreviewComponent(makeStep("create_document"))).toBe(DocumentPreview);
  });

  it("returns DocumentPreview for append_to_document", () => {
    expect(getPreviewComponent(makeStep("append_to_document"))).toBe(DocumentPreview);
  });

  it("returns DocumentPreview for document_ prefix", () => {
    expect(getPreviewComponent(makeStep("document_export"))).toBe(DocumentPreview);
  });

  it("returns GenericStepPreview for short doc_ prefix (no false match)", () => {
    expect(getPreviewComponent(makeStep("doc_create"))).toBe(GenericStepPreview);
  });

  // Spreadsheet
  it("returns SpreadsheetPreview for create_spreadsheet", () => {
    expect(getPreviewComponent(makeStep("create_spreadsheet"))).toBe(SpreadsheetPreview);
  });

  it("returns SpreadsheetPreview for update_spreadsheet_cells", () => {
    expect(getPreviewComponent(makeStep("update_spreadsheet_cells"))).toBe(SpreadsheetPreview);
  });

  it("returns SpreadsheetPreview for append_rows", () => {
    expect(getPreviewComponent(makeStep("append_rows"))).toBe(SpreadsheetPreview);
  });

  it("returns SpreadsheetPreview for spreadsheet_ prefix", () => {
    expect(getPreviewComponent(makeStep("spreadsheet_update"))).toBe(SpreadsheetPreview);
  });

  it("returns SpreadsheetPreview for sheet_ prefix", () => {
    expect(getPreviewComponent(makeStep("sheet_create"))).toBe(SpreadsheetPreview);
  });

  it("returns SpreadsheetPreview for excel_ prefix", () => {
    expect(getPreviewComponent(makeStep("excel_export"))).toBe(SpreadsheetPreview);
  });

  // Presentation
  it("returns PresentationPreview for create_presentation", () => {
    expect(getPreviewComponent(makeStep("create_presentation"))).toBe(PresentationPreview);
  });

  it("returns PresentationPreview for presentation_ prefix", () => {
    expect(getPreviewComponent(makeStep("presentation_update"))).toBe(PresentationPreview);
  });

  it("returns PresentationPreview for slides_ prefix", () => {
    expect(getPreviewComponent(makeStep("slides_create"))).toBe(PresentationPreview);
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
