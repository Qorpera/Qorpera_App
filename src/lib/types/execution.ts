/**
 * Shared types extracted from the legacy execution-engine.
 * Used by internal-capabilities and meeting-coordination.
 */

export type StepOutput =
  | { type: "document"; url: string; title: string; mimeType: string }
  | { type: "email"; threadId: string; recipients: string[]; subject: string }
  | { type: "message"; channelId: string; messageId: string; platform: string }
  | { type: "content"; text: string; format: "markdown" | "plain" | "html" }
  | { type: "data"; payload: Record<string, unknown>; description: string }
  | { type: "system_change"; entityType: string; entityId: string; changeDescription: string }
  | { type: "situation_type"; situationTypeId: string; name: string; detectionLogic: object }
  | { type: "calendar_event"; eventId: string; platform: string; attendees: string[] }
  | { type: "task"; taskId: string; platform: string; assignee: string }
  | { type: "delegation"; delegationId: string; targetType: "ai" | "human"; targetId: string }
  | { type: "follow_up"; followUpId: string; triggerCondition: object; deadline?: string }
  | { type: "human_completion"; notes: string; attachments?: string[] }
  | { type: "situation_resolution"; resolutions: Array<{ situationId: string; resolution: string; resolvedById: string; resolvedAt: string; metadata: Record<string, unknown> }> };
