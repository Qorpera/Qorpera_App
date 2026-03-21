import * as React from "react";
import { render } from "@react-email/render";

import { SituationProposedEmail } from "./situation-proposed";
import { SituationResolvedEmail } from "./situation-resolved";
import { InitiativeProposedEmail } from "./initiative-proposed";
import { StepReadyEmail } from "./step-ready";
import { DelegationReceivedEmail } from "./delegation-received";
import { FollowUpTriggeredEmail } from "./follow-up-triggered";
import { PlanAutoExecutedEmail } from "./plan-auto-executed";
import { PlanFailedEmail } from "./plan-failed";
import { PeerSignalEmail } from "./peer-signal";
import { InsightDiscoveredEmail } from "./insight-discovered";
import { SystemAlertEmail } from "./system-alert";
import { GenericNotificationEmail } from "./generic-notification";
import { InviteEmail } from "./invite";
import { PasswordResetEmail } from "./password-reset";
import { EmailVerificationEmail } from "./email-verification";
import { WeeklyDigestEmail } from "./weekly-digest";

type TemplateResult = { subject: string; html: string };

export async function renderNotificationEmail(
  type: string,
  props: Record<string, any>,
  operatorName: string
): Promise<TemplateResult | null> {
  let element: React.ReactElement | null = null;
  let subject = "";

  switch (type) {
    case "situation_proposed":
      subject = `[Qorpera] New situation: ${props.situationTitle || "Review needed"}`;
      element = React.createElement(SituationProposedEmail, props as any);
      break;
    case "situation_resolved":
      subject = `[Qorpera] Resolved: ${props.situationTitle || "Situation resolved"}`;
      element = React.createElement(SituationResolvedEmail, props as any);
      break;
    case "initiative_proposed":
      subject = `[Qorpera] New initiative: ${props.initiativeTitle || "Review needed"}`;
      element = React.createElement(InitiativeProposedEmail, props as any);
      break;
    case "step_ready":
      subject = `[Qorpera] Action needed: ${props.stepTitle || "Step ready"}`;
      element = React.createElement(StepReadyEmail, props as any);
      break;
    case "delegation_received":
      subject = `[Qorpera] New task: ${props.taskTitle || "Task assigned"}`;
      element = React.createElement(DelegationReceivedEmail, props as any);
      break;
    case "follow_up_triggered":
      subject = `[Qorpera] Follow-up: ${props.followUpTitle || "Condition met"}`;
      element = React.createElement(FollowUpTriggeredEmail, props as any);
      break;
    case "plan_auto_executed":
      subject = `[Qorpera] Auto-executed: ${props.planTitle || "Plan completed"}`;
      element = React.createElement(PlanAutoExecutedEmail, props as any);
      break;
    case "plan_failed":
      subject = `[Qorpera] Plan failed: ${props.planTitle || "Execution error"}`;
      element = React.createElement(PlanFailedEmail, props as any);
      break;
    case "peer_signal":
      subject = `[Qorpera] Signal from ${props.fromDepartment || "department"}`;
      element = React.createElement(PeerSignalEmail, props as any);
      break;
    case "insight_discovered":
      subject = `[Qorpera] Insight: ${props.insightTitle || "New insight"}`;
      element = React.createElement(InsightDiscoveredEmail, props as any);
      break;
    case "system_alert":
      subject = `[Qorpera] ${props.severity === "critical" ? "CRITICAL: " : ""}${props.alertTitle || "System alert"}`;
      element = React.createElement(SystemAlertEmail, props as any);
      break;
    default:
      // Fall back to generic notification
      if (props.content) {
        subject = "[Qorpera] Notification";
        element = React.createElement(GenericNotificationEmail, {
          content: props.content,
          viewUrl: props.viewUrl,
        });
      }
      break;
  }

  if (!element) return null;

  const html = await render(element);
  return { subject, html };
}

export async function renderTransactionalEmail(
  template: "invite" | "password-reset" | "email-verification",
  props: Record<string, any>
): Promise<TemplateResult> {
  let element: React.ReactElement;
  let subject: string;

  switch (template) {
    case "invite":
      subject = `[Qorpera] ${props.inviterName || "Someone"} invited you to join ${props.operatorName || "their team"}`;
      element = React.createElement(InviteEmail, props as any);
      break;
    case "password-reset":
      subject = "[Qorpera] Reset your password";
      element = React.createElement(PasswordResetEmail, props as any);
      break;
    case "email-verification":
      subject = "[Qorpera] Verify your email address";
      element = React.createElement(EmailVerificationEmail, props as any);
      break;
    default:
      throw new Error(`Unknown transactional template: ${template}`);
  }

  const html = await render(element);
  return { subject, html };
}

export async function renderDigestEmail(
  props: Record<string, any>
): Promise<TemplateResult> {
  const subject = `[Qorpera] Your digest — ${props.periodStart || "recent activity"}`;
  const element = React.createElement(WeeklyDigestEmail, props as any);
  const html = await render(element);
  return { subject, html };
}
