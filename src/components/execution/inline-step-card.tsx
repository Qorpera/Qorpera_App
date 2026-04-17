"use client";

import type { ReactNode } from "react";
import type { ExecutionStepForPreview } from "./previews/get-preview-component";

// ── Icons (same SVGs as existing preview components) ────────────────────────

function MailIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

function DocIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" /><line x1="16" x2="8" y1="13" y2="13" /><line x1="16" x2="8" y1="17" y2="17" /><line x1="10" x2="8" y1="9" y2="9" />
    </svg>
  );
}

function GridIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="3" rx="2" /><path d="M3 9h18" /><path d="M3 15h18" /><path d="M9 3v18" /><path d="M15 3v18" />
    </svg>
  );
}

function CalendarIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2v4M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" />
    </svg>
  );
}

function HashIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" x2="20" y1="9" y2="9" /><line x1="4" x2="20" y1="15" y2="15" /><line x1="10" x2="8" y1="3" y2="21" /><line x1="16" x2="14" y1="3" y2="21" />
    </svg>
  );
}

function DatabaseIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5V19A9 3 0 0 0 21 19V5" /><path d="M3 12A9 3 0 0 0 21 12" />
    </svg>
  );
}

function GearIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function PersonIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function ArrowRightIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

// ── Card type resolution ────────────────────────────────────────────────────

type CardType = "email" | "document" | "spreadsheet" | "calendar" | "slack" | "crm" | "ticket" | "presentation" | "generic";

const EXACT_CARD_MAP: Record<string, CardType> = {
  reply_to_thread: "email", reply_email: "email", create_draft: "email",
  send_with_attachment: "email", send_email_via_salesforce: "email",
  send_channel_message: "slack", reply_to_teams_thread: "slack", reply_in_thread: "slack",
  update_deal_stage: "crm", update_contact: "crm", update_opportunity: "crm",
  create_task: "crm", log_activity: "crm", create_deal: "crm",
  create_contact: "crm", create_note: "crm", create_opportunity: "crm",
  update_deal: "crm", create_activity: "crm", create_person: "crm",
  create_organization: "crm", create_lead: "crm", create_case: "crm",
  reply_to_ticket: "ticket", add_internal_note: "ticket", update_ticket_status: "ticket",
  reply_to_conversation: "ticket", add_note: "ticket", tag_conversation: "ticket",
  create_ticket: "ticket", add_tags: "ticket", update_ticket_type: "ticket",
  create_note_on_contact: "ticket",
  create_document: "document", append_to_document: "document",
  create_spreadsheet: "spreadsheet", update_spreadsheet_cells: "spreadsheet",
  append_rows: "spreadsheet", create_sheet_tab: "spreadsheet", create_worksheet: "spreadsheet",
  create_presentation: "presentation",
};

const PREFIX_CARD_MAP: Array<{ prefixes: string[]; type: CardType }> = [
  { prefixes: ["email"], type: "email" },
  { prefixes: ["calendar"], type: "calendar" },
  { prefixes: ["slack"], type: "slack" },
  { prefixes: ["crm"], type: "crm" },
  { prefixes: ["document"], type: "document" },
  { prefixes: ["spreadsheet", "sheet", "excel"], type: "spreadsheet" },
  { prefixes: ["presentation", "slides"], type: "presentation" },
];

const PREVIEW_TYPE_TO_CARD: Record<string, CardType> = {
  email: "email", document: "document", spreadsheet: "spreadsheet",
  calendar_event: "calendar", slack_message: "slack", crm_update: "crm",
  ticket: "ticket", presentation: "presentation",
};

function getCardType(step: ExecutionStepForPreview): CardType {
  const slug = step.actionCapability?.slug;
  if (slug) {
    if (EXACT_CARD_MAP[slug]) return EXACT_CARD_MAP[slug];
    for (const { prefixes, type } of PREFIX_CARD_MAP) {
      for (const prefix of prefixes) {
        if (slug === prefix || slug.startsWith(prefix + ".") || slug.startsWith(prefix + "_")) {
          return type;
        }
      }
    }
  }

  // Check previewType in parameters
  const previewType = (step.parameters as Record<string, unknown> | null)?.previewType as string | undefined;
  if (previewType && PREVIEW_TYPE_TO_CARD[previewType]) return PREVIEW_TYPE_TO_CARD[previewType];

  return "generic";
}

// ── Card data extraction ────────────────────────────────────────────────────

interface CardData {
  icon: ReactNode;
  title: string;
  subtitle: string;
  badge: string;
}

function truncate(s: string, len: number): string {
  return s.length > len ? s.slice(0, len) + "…" : s;
}

// ── Title cleanup ───────────────────────────────────────────────────────────

const LEADING_ACTION_VERBS = new Set([
  "generate", "schedule", "compile", "send", "draft", "create", "update",
  "review", "monitor", "flag", "request", "notify", "prepare", "respond",
  "reply", "escalate", "investigate", "approve", "verify", "check", "contact",
  "follow", "email", "post", "document", "publish", "propose", "submit",
  "assign", "remind",
]);

/**
 * Strip a leading imperative verb (Generate/Schedule/Compile/…) from an action
 * step title so the action-card heading reads as the noun phrase being acted
 * on. Returns the original title if the first word isn't a known verb or if
 * stripping would leave nothing behind.
 */
export function stripLeadingActionVerb(title: string): string {
  if (!title) return title;
  const trimmed = title.trim();
  const parts = trimmed.split(/\s+/);
  if (parts.length <= 1) return trimmed;
  const firstWord = parts[0].toLowerCase().replace(/[^a-z]/g, "");
  if (!LEADING_ACTION_VERBS.has(firstWord)) return trimmed;
  const rest = parts.slice(1).join(" ");
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

function extractCardData(step: ExecutionStepForPreview, cardType: CardType): CardData {
  const p = step.parameters ?? {};
  // Action-verb-free fallback title for every card type.
  const stepTitle = stripLeadingActionVerb(step.title);

  switch (cardType) {
    case "email": {
      const to = (p.to ?? p.recipient ?? "") as string;
      const subject = (p.subject ?? "") as string;
      return {
        icon: <MailIcon />,
        title: to ? `Til: ${to}` : stepTitle,
        subtitle: truncate(subject, 60),
        badge: "E-mail",
      };
    }
    case "document": {
      const title = (p.title ?? stepTitle) as string;
      const sections = Array.isArray(p.sections) ? p.sections.length : null;
      return {
        icon: <DocIcon />,
        title,
        subtitle: sections ? `Dokument · ${sections} sektioner` : "Dokument",
        badge: "Dokument",
      };
    }
    case "spreadsheet": {
      const title = (p.title ?? stepTitle) as string;
      const rows = Array.isArray(p.rows) ? p.rows.length : Array.isArray(p.newRows) ? p.newRows.length : null;
      return {
        icon: <GridIcon />,
        title,
        subtitle: rows ? `Regneark · ${rows} rækker` : "Regneark",
        badge: "Regneark",
      };
    }
    case "calendar": {
      const title = (p.summary ?? p.title ?? stepTitle) as string;
      const date = (p.startDateTime ?? p.startTime ?? p.date ?? "") as string;
      const attendees = Array.isArray(p.attendees) ? p.attendees.length : 0;
      const parts: string[] = [];
      if (date) parts.push(date.slice(0, 10));
      if (attendees) parts.push(`${attendees} deltagere`);
      return {
        icon: <CalendarIcon />,
        title,
        subtitle: parts.join(" · ") || "Kalender",
        badge: "Kalender",
      };
    }
    case "slack": {
      const channel = (p.channel ?? p.channelName ?? "") as string;
      const message = (p.message ?? p.text ?? "") as string;
      return {
        icon: <HashIcon />,
        title: channel ? `#${channel}` : stepTitle,
        subtitle: truncate(message, 50),
        badge: "Besked",
      };
    }
    case "crm": {
      const entityName = (p.entity_name ?? p.entityName ?? "CRM record") as string;
      const updates = p.updates as Record<string, unknown> | undefined;
      const fieldCount = updates ? Object.keys(updates).length : 0;
      return {
        icon: <DatabaseIcon />,
        title: entityName,
        subtitle: fieldCount ? `Opdater · ${fieldCount} felter` : "CRM",
        badge: "CRM",
      };
    }
    case "ticket": {
      const subject = (p.subject ?? p.title ?? stepTitle) as string;
      return {
        icon: <MailIcon />,
        title: subject,
        subtitle: truncate((p.body ?? p.message ?? step.description ?? "") as string, 60),
        badge: "Ticket",
      };
    }
    case "presentation": {
      const title = (p.title ?? stepTitle) as string;
      const slides = Array.isArray(p.slides) ? p.slides.length : null;
      return {
        icon: <DocIcon />,
        title,
        subtitle: slides ? `Præsentation · ${slides} slides` : "Præsentation",
        badge: "Slides",
      };
    }
    default: {
      const isHuman = step.executionMode === "human_task";
      return {
        icon: isHuman ? <PersonIcon /> : <GearIcon />,
        title: stepTitle,
        subtitle: truncate(step.description, 60),
        badge: isHuman ? "Human Task" : step.executionMode,
      };
    }
  }
}

// ── Exported: get icon + badge for panel header ─────────────────────────────

export function getStepCardMeta(step: ExecutionStepForPreview): { icon: ReactNode; badge: string } {
  const cardType = getCardType(step);
  const data = extractCardData(step, cardType);
  return { icon: data.icon, badge: data.badge };
}

// ── Component ───────────────────────────────────────────────────────────────

interface InlineStepCardProps {
  step: ExecutionStepForPreview;
  onClick: () => void;
  isActive: boolean;
}

export function InlineStepCard({ step, onClick, isActive }: InlineStepCardProps) {
  const cardType = getCardType(step);
  const { icon, title, subtitle, badge } = extractCardData(step, cardType);

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 12px",
        borderRadius: 6,
        background: "var(--elevated)",
        border: isActive ? "2px solid var(--accent)" : "1.5px solid var(--border-strong)",
        cursor: "pointer",
        transition: "border-color 0.15s, background 0.15s, filter 0.15s",
      }}
      className="hover:brightness-110 hover:border-[var(--fg4)]"
    >
      {/* Icon */}
      <span style={{ color: isActive ? "var(--accent)" : "var(--fg3)", flexShrink: 0, display: "flex" }}>
        {icon}
      </span>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
        <div style={{
          fontSize: 13,
          fontWeight: 500,
          color: "var(--foreground)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}>
          {title}
        </div>
        {subtitle && (
          <div style={{
            fontSize: 11,
            color: "var(--fg3)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            marginTop: 1,
          }}>
            <span style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              color: "var(--fg3)",
              marginRight: 6,
            }}>
              {badge}
            </span>
            {subtitle}
          </div>
        )}
      </div>

      {/* Arrow */}
      <span style={{ color: isActive ? "var(--accent)" : "var(--fg3)", flexShrink: 0, display: "flex", transition: "color 0.15s" }}>
        <ArrowRightIcon />
      </span>
    </div>
  );
}
