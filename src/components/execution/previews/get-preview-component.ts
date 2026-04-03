import { ComponentType } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ExecutionStepForPreview {
  id: string;
  sequenceOrder: number;
  title: string;
  description: string;
  executionMode: string;
  status: string;
  assignedUserId: string | null;
  parameters: Record<string, unknown> | null;
  actionCapability?: { id: string; slug: string | null; name: string } | null;
  plan?: {
    sourceType: string;
    situation?: { situationType?: { autonomyLevel?: string } } | null;
  } | null;
}

export interface PreviewProps {
  step: ExecutionStepForPreview;
  isEditable: boolean;
  onParametersUpdate?: (params: Record<string, unknown>) => void;
  locale: string;
  inPanel?: boolean;
  onOpenAttachment?: (attachment: Record<string, unknown>, index: number) => void;
}

// ── Lazy imports (code-split per preview) ────────────────────────────────────

type PreviewComponent = ComponentType<PreviewProps>;

// We use dynamic imports resolved at call-site; for SSR/client bundle we import eagerly
// since these are small leaf components.
import { EmailPreview } from "./email-preview";
import { CalendarEventPreview } from "./calendar-event-preview";
import { SlackMessagePreview } from "./slack-message-preview";
import { CrmUpdatePreview } from "./crm-update-preview";
import { TicketReplyPreview } from "./ticket-reply-preview";
import { DocumentPreview } from "./document-preview";
import { SpreadsheetPreview } from "./spreadsheet-preview";
import { PresentationPreview } from "./presentation-preview";
import { GenericStepPreview } from "./generic-step-preview";

// ── Prefix → Component mapping ──────────────────────────────────────────────

const EXACT_MATCHES: Record<string, PreviewComponent> = {
  // Email actions that don't start with "email"
  reply_to_thread: EmailPreview,
  reply_email: EmailPreview,
  create_draft: EmailPreview,
  send_with_attachment: EmailPreview,
  send_email_via_salesforce: EmailPreview,
  // Messaging actions that don't start with "slack"
  send_channel_message: SlackMessagePreview,
  reply_to_teams_thread: SlackMessagePreview,
  reply_in_thread: SlackMessagePreview,
  // CRM capabilities (exact slug matches from write-back infrastructure)
  update_deal_stage: CrmUpdatePreview,
  update_contact: CrmUpdatePreview,
  update_opportunity: CrmUpdatePreview,
  create_task: CrmUpdatePreview,
  log_activity: CrmUpdatePreview,
  create_deal: CrmUpdatePreview,
  create_contact: CrmUpdatePreview,
  create_note: CrmUpdatePreview,
  create_opportunity: CrmUpdatePreview,
  update_deal: CrmUpdatePreview,
  create_activity: CrmUpdatePreview,
  create_person: CrmUpdatePreview,
  create_organization: CrmUpdatePreview,
  create_lead: CrmUpdatePreview,
  create_case: CrmUpdatePreview,
  // Ticket/conversation capabilities
  reply_to_ticket: TicketReplyPreview,
  add_internal_note: TicketReplyPreview,
  update_ticket_status: TicketReplyPreview,
  reply_to_conversation: TicketReplyPreview,
  add_note: TicketReplyPreview,
  tag_conversation: TicketReplyPreview,
  create_ticket: TicketReplyPreview,
  add_tags: TicketReplyPreview,
  update_ticket_type: TicketReplyPreview,
  create_note_on_contact: TicketReplyPreview,
  // Document actions
  create_document: DocumentPreview,
  append_to_document: DocumentPreview,
  // Spreadsheet actions
  create_spreadsheet: SpreadsheetPreview,
  update_spreadsheet_cells: SpreadsheetPreview,
  append_rows: SpreadsheetPreview,
  create_sheet_tab: SpreadsheetPreview,
  create_worksheet: SpreadsheetPreview,
  // Presentation actions
  create_presentation: PresentationPreview,
};

const PREFIX_MATCHES: Array<{ prefixes: string[]; component: PreviewComponent }> = [
  { prefixes: ["email"], component: EmailPreview },
  { prefixes: ["calendar"], component: CalendarEventPreview },
  { prefixes: ["slack"], component: SlackMessagePreview },
  { prefixes: ["crm"], component: CrmUpdatePreview },
  { prefixes: ["document"], component: DocumentPreview },
  { prefixes: ["spreadsheet", "sheet", "excel"], component: SpreadsheetPreview },
  { prefixes: ["presentation", "slides"], component: PresentationPreview },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

export function isActMode(step: ExecutionStepForPreview): boolean {
  return step.plan?.sourceType === "situation" &&
    step.plan?.situation?.situationType?.autonomyLevel === "autonomous";
}

// ── previewType → Component mapping ─────────────────────────────────────────

const PREVIEW_TYPE_MAP: Record<string, PreviewComponent> = {
  email: EmailPreview,
  document: DocumentPreview,
  spreadsheet: SpreadsheetPreview,
  calendar_event: CalendarEventPreview,
  slack_message: SlackMessagePreview,
  crm_update: CrmUpdatePreview,
  ticket: TicketReplyPreview,
  presentation: PresentationPreview,
};

// ── Resolver ─────────────────────────────────────────────────────────────────

export function getPreviewComponent(step: ExecutionStepForPreview): PreviewComponent {
  const slug = step.actionCapability?.slug;

  // 1. Exact slug match
  if (slug && EXACT_MATCHES[slug]) return EXACT_MATCHES[slug];

  // 2. Prefix slug match
  if (slug) {
    for (const { prefixes, component } of PREFIX_MATCHES) {
      for (const prefix of prefixes) {
        if (slug === prefix || slug.startsWith(prefix + ".") || slug.startsWith(prefix + "_")) {
          return component;
        }
      }
    }
  }

  // 3. Check previewType in parameters
  const previewType = (step.parameters as Record<string, unknown> | null)?.previewType as string | undefined;
  if (previewType && PREVIEW_TYPE_MAP[previewType]) {
    return PREVIEW_TYPE_MAP[previewType];
  }

  // 4. Fallback
  return GenericStepPreview;
}
