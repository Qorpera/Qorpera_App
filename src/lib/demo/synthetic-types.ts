// ── Synthetic Company Type Definitions ─────────────────────────────────
// Defines the shape of data needed to simulate a real company that goes
// through the full onboarding pipeline. No pre-built org structure —
// the multi-agent intelligence system discovers it from this data.

export interface SyntheticCompany {
  // ── Company identity ──────────────────────────────────────────────
  slug: string;               // e.g. "boltly" — used in URLs and DB lookups
  name: string;               // e.g. "Boltly ApS"
  industry: string;           // e.g. "Electrical Installation & Service"
  domain: string;             // e.g. "boltly.dk"

  // ── Employees ─────────────────────────────────────────────────────
  // Every employee gets a User account with demo1234 password.
  // The onboarding agents discover org structure from the data below,
  // NOT from this list. This list is purely for creating login accounts.
  employees: SyntheticEmployee[];

  // ── Connectors ────────────────────────────────────────────────────
  // SourceConnectors created in "active" status with dummy encrypted config.
  // No OAuth, no real sync. The data goes directly into ContentChunks etc.
  connectors: SyntheticConnector[];

  // ── External entities ─────────────────────────────────────────────
  // Companies, contacts, deals, invoices, tickets that the CRM/accounting
  // connectors would have materialized.
  companies: SyntheticExternalCompany[];
  contacts: SyntheticContact[];
  deals: SyntheticDeal[];
  invoices: SyntheticInvoice[];
  tickets?: SyntheticTicket[];

  // ── Content ───────────────────────────────────────────────────────
  // The richest signal source. Emails, docs, Slack messages, calendar notes.
  // These get embedded and are what search_content queries.
  content: SyntheticContent[];

  // ── Activity signals ──────────────────────────────────────────────
  // Lightweight temporal records: email_sent, meeting_held, slack_mentions, etc.
  // These are what get_email_patterns and get_calendar_patterns query.
  activitySignals: SyntheticActivitySignal[];

  // ── Slack channels (optional) ─────────────────────────────────────
  slackChannels?: SyntheticSlackChannel[];
}

export interface SyntheticEmployee {
  name: string;
  email: string;             // must be @{company.domain}
  role: "admin" | "member";  // first admin is the "CEO" who runs onboarding
  locale?: "da" | "en";
}

export interface SyntheticConnector {
  provider: string;          // gmail, google-calendar, google-drive, slack, hubspot, e-conomic, etc.
  name: string;              // Display name
  assignedToEmployee?: string; // Employee email for personal connectors (Gmail, Calendar, Drive)
}

export interface SyntheticExternalCompany {
  name: string;
  domain: string;
  industry?: string;
  relationship: "client" | "partner" | "vendor";
}

export interface SyntheticContact {
  name: string;
  email: string;
  company: string;           // Must match a SyntheticExternalCompany.name
  title?: string;
  phone?: string;
}

export interface SyntheticDeal {
  name: string;
  company: string;           // Must match a SyntheticExternalCompany.name
  contact?: string;          // Must match a SyntheticContact.name
  stage: string;             // "qualification" | "proposal" | "negotiation" | "closed-won" | "closed-lost"
  amount: number;            // DKK
  currency?: string;         // default "DKK"
  createdDaysAgo: number;
  lastActivityDaysAgo: number;
}

export interface SyntheticInvoice {
  number: string;            // e.g. "INV-2026-001"
  company: string;           // Must match a SyntheticExternalCompany.name
  amount: number;            // DKK
  currency?: string;
  status: "draft" | "sent" | "paid" | "overdue";
  issuedDaysAgo: number;
  dueDaysAgo?: number;       // negative = due in the future
  daysOverdue?: number;      // only if status is "overdue"
}

export interface SyntheticTicket {
  title: string;
  company: string;
  contact?: string;
  priority: "low" | "medium" | "high" | "critical";
  status: "open" | "pending" | "resolved" | "closed";
  createdDaysAgo: number;
}

export interface SyntheticContent {
  sourceType: "email" | "slack_message" | "drive_doc" | "calendar_note";
  content: string;           // The actual text content — this is what gets embedded
  connectorProvider: string; // Must match a SyntheticConnector.provider
  metadata: Record<string, unknown>; // Source-specific: from, to, subject, channel, etc.
  daysAgo?: number;          // When this content was created (default 0 = today)
}

export interface SyntheticActivitySignal {
  signalType: string;        // email_sent, email_received, meeting_held, slack_mention, doc_edit
  actorEmail: string;        // Must match an employee or contact email
  targetEmails?: string[];   // Recipients / attendees
  daysAgo: number;           // When the activity occurred
  metadata?: Record<string, unknown>; // meeting title, email subject, etc.
}

export interface SyntheticSlackChannel {
  channelId: string;         // e.g. "C001GEN"
  channelName: string;       // e.g. "#general"
}
