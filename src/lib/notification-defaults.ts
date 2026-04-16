/**
 * Notification type definitions and default channel mappings.
 */

export const NOTIFICATION_TYPES = [
  "situation_proposed",
  "situation_resolved",
  "initiative_proposed",
  "initiative_dismissed",
  "step_ready",
  "delegation_received",
  "follow_up_triggered",
  "plan_auto_executed",
  "plan_failed",
  "peer_signal",
  "insight_discovered",
  "system_alert",
  "graduation_proposal",
  "policy_applied",
  "awareness_informational",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type NotificationChannel = "in_app" | "email" | "both" | "none";

const DEFAULT_CHANNELS: Record<NotificationType, NotificationChannel> = {
  situation_proposed: "both",
  situation_resolved: "in_app",
  initiative_proposed: "both",
  initiative_dismissed: "in_app",
  step_ready: "both",
  delegation_received: "both",
  follow_up_triggered: "email",
  plan_auto_executed: "in_app",
  plan_failed: "both",
  peer_signal: "in_app",
  insight_discovered: "in_app",
  system_alert: "both",
  graduation_proposal: "both",
  policy_applied: "in_app",
  awareness_informational: "in_app",
};

export function getDefaultChannel(type: NotificationType): NotificationChannel {
  return DEFAULT_CHANNELS[type] ?? "both";
}
