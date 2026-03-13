import type { SyncEvent } from "./types";

// Content to be chunked, embedded, and stored in ContentChunk
type ContentEvent = {
  sourceType: string; // "email" | "slack_message" | "drive_doc" | "uploaded_doc" | "calendar_note"
  sourceId: string; // external ID for dedup
  content: string; // raw text to chunk + embed
  entityId?: string; // entity this content is about (if known)
  metadata?: Record<string, unknown>; // subject, sender, timestamp, etc.
  participantEmails?: string[]; // for department routing resolution
};

// Lightweight temporal signal for pattern detection
type ActivityEvent = {
  signalType: string; // "email_sent" | "email_received" | "slack_message" | "doc_edit" | "meeting_held" | "doc_created" | "doc_shared"
  actorEmail?: string; // resolved to entity after ingestion
  targetEmails?: string[]; // resolved to entities after ingestion
  metadata?: Record<string, unknown>; // response_time_ms, thread_id, channel, etc.
  occurredAt: Date;
};

// The union type every connector yields
export type SyncYield =
  | { kind: "event"; data: SyncEvent }
  | { kind: "content"; data: ContentEvent }
  | { kind: "activity"; data: ActivityEvent };
