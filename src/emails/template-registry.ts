import * as React from "react";
import { render } from "@react-email/render";
import { getEmailSubject } from "./email-strings";

import { SituationProposedEmail } from "./situation-proposed";
import { SituationResolvedEmail } from "./situation-resolved";
import { IdeaProposedEmail } from "./idea-proposed";
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
  operatorName: string,
  locale: string = "en"
): Promise<TemplateResult | null> {
  let element: React.ReactElement | null = null;

  switch (type) {
    case "situation_proposed":
      element = React.createElement(SituationProposedEmail, props as any);
      break;
    case "situation_resolved":
      element = React.createElement(SituationResolvedEmail, props as any);
      break;
    case "idea_proposed":
      element = React.createElement(IdeaProposedEmail, props as any);
      break;
    case "step_ready":
      element = React.createElement(StepReadyEmail, props as any);
      break;
    case "delegation_received":
      element = React.createElement(DelegationReceivedEmail, props as any);
      break;
    case "follow_up_triggered":
      element = React.createElement(FollowUpTriggeredEmail, props as any);
      break;
    case "plan_auto_executed":
      element = React.createElement(PlanAutoExecutedEmail, props as any);
      break;
    case "plan_failed":
      element = React.createElement(PlanFailedEmail, props as any);
      break;
    case "peer_signal":
      element = React.createElement(PeerSignalEmail, props as any);
      break;
    case "insight_discovered":
      element = React.createElement(InsightDiscoveredEmail, props as any);
      break;
    case "system_alert":
      element = React.createElement(SystemAlertEmail, props as any);
      break;
    default:
      if (props.content) {
        element = React.createElement(GenericNotificationEmail, {
          content: props.content,
          viewUrl: props.viewUrl,
        });
      }
      break;
  }

  const subject = getEmailSubject(locale, element ? type : "generic", props);

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
