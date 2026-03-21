import { describe, it, expect } from "vitest";
import { render } from "@react-email/render";
import * as React from "react";

import { InviteEmail } from "@/emails/invite";
import { PasswordResetEmail } from "@/emails/password-reset";
import { EmailVerificationEmail } from "@/emails/email-verification";
import { GenericNotificationEmail } from "@/emails/generic-notification";
import { SituationProposedEmail } from "@/emails/situation-proposed";
import { SituationResolvedEmail } from "@/emails/situation-resolved";
import { InitiativeProposedEmail } from "@/emails/initiative-proposed";
import { StepReadyEmail } from "@/emails/step-ready";
import { DelegationReceivedEmail } from "@/emails/delegation-received";
import { FollowUpTriggeredEmail } from "@/emails/follow-up-triggered";
import { PlanAutoExecutedEmail } from "@/emails/plan-auto-executed";
import { PlanFailedEmail } from "@/emails/plan-failed";
import { PeerSignalEmail } from "@/emails/peer-signal";
import { InsightDiscoveredEmail } from "@/emails/insight-discovered";
import { SystemAlertEmail } from "@/emails/system-alert";
import { WeeklyDigestEmail } from "@/emails/weekly-digest";
import {
  renderNotificationEmail,
  renderTransactionalEmail,
  renderDigestEmail,
} from "@/emails/template-registry";

// ── Template rendering tests ─────────────────────────────────────────────────

const templates = [
  {
    name: "InviteEmail",
    element: React.createElement(InviteEmail, {
      inviterName: "Jonas",
      operatorName: "Acme Corp",
      inviteUrl: "https://app.qorpera.com/invite/abc",
    }),
  },
  {
    name: "PasswordResetEmail",
    element: React.createElement(PasswordResetEmail, {
      resetUrl: "https://app.qorpera.com/reset/xyz",
      expiresInMinutes: 30,
    }),
  },
  {
    name: "EmailVerificationEmail",
    element: React.createElement(EmailVerificationEmail, {
      verifyUrl: "https://app.qorpera.com/verify/123",
      userName: "Alice",
    }),
  },
  {
    name: "GenericNotificationEmail",
    element: React.createElement(GenericNotificationEmail, {
      content: "Something happened.",
      viewUrl: "https://app.qorpera.com/",
    }),
  },
  {
    name: "SituationProposedEmail",
    element: React.createElement(SituationProposedEmail, {
      situationTitle: "Invoice overdue",
      entityName: "Acme Inc",
      summary: "Invoice #1234 is 15 days overdue.",
      viewUrl: "https://app.qorpera.com/situations/1",
    }),
  },
  {
    name: "SituationResolvedEmail",
    element: React.createElement(SituationResolvedEmail, {
      situationTitle: "Invoice overdue",
      entityName: "Acme Inc",
      resolution: "Payment received.",
      viewUrl: "https://app.qorpera.com/situations/1",
    }),
  },
  {
    name: "InitiativeProposedEmail",
    element: React.createElement(InitiativeProposedEmail, {
      initiativeTitle: "Improve response time",
      departmentName: "Customer Support",
      rationale: "Average response time has increased by 40%.",
      viewUrl: "https://app.qorpera.com/initiatives/1",
    }),
  },
  {
    name: "StepReadyEmail",
    element: React.createElement(StepReadyEmail, {
      stepTitle: "Send follow-up email",
      planSource: "Invoice overdue situation",
      description: "Draft and send a follow-up email to the client.",
      viewUrl: "https://app.qorpera.com/plans/1",
    }),
  },
  {
    name: "DelegationReceivedEmail",
    element: React.createElement(DelegationReceivedEmail, {
      taskTitle: "Review contract terms",
      fromAiName: "Legal Analyst",
      description: "Review the updated contract terms before signing.",
      dueDate: "2026-03-25",
      viewUrl: "https://app.qorpera.com/delegations/1",
    }),
  },
  {
    name: "FollowUpTriggeredEmail",
    element: React.createElement(FollowUpTriggeredEmail, {
      followUpTitle: "Payment still pending",
      triggerReason: "7 days passed since initial reminder.",
      originalSituation: "Invoice overdue",
      viewUrl: "https://app.qorpera.com/situations/1",
    }),
  },
  {
    name: "PlanAutoExecutedEmail",
    element: React.createElement(PlanAutoExecutedEmail, {
      planTitle: "Send payment reminder",
      stepsCompleted: 3,
      source: "Invoice overdue",
      summary: "Reminder sent to client successfully.",
      viewUrl: "https://app.qorpera.com/plans/1",
    }),
  },
  {
    name: "PlanFailedEmail",
    element: React.createElement(PlanFailedEmail, {
      planTitle: "Data sync plan",
      failureReason: "API rate limit exceeded.",
      source: "Connector sync",
      viewUrl: "https://app.qorpera.com/plans/2",
      isLoopBreaker: false,
    }),
  },
  {
    name: "PlanFailedEmail (loop breaker)",
    element: React.createElement(PlanFailedEmail, {
      planTitle: "Recursive plan",
      failureReason: "Loop detected.",
      source: "Situation response",
      viewUrl: "https://app.qorpera.com/plans/3",
      isLoopBreaker: true,
    }),
  },
  {
    name: "PeerSignalEmail",
    element: React.createElement(PeerSignalEmail, {
      fromDepartment: "Sales",
      toDepartment: "Operations",
      signalSummary: "Large order expected next week — prepare capacity.",
      viewUrl: "https://app.qorpera.com/signals/1",
    }),
  },
  {
    name: "InsightDiscoveredEmail",
    element: React.createElement(InsightDiscoveredEmail, {
      insightTitle: "Response time trend",
      description: "Response times have improved 20% since policy change.",
      department: "Customer Support",
      viewUrl: "https://app.qorpera.com/insights/1",
    }),
  },
  {
    name: "SystemAlertEmail",
    element: React.createElement(SystemAlertEmail, {
      alertTitle: "Connector disconnected",
      message: "Google connector lost authentication.",
      severity: "warning",
      viewUrl: "https://app.qorpera.com/settings",
    }),
  },
  {
    name: "WeeklyDigestEmail",
    element: React.createElement(WeeklyDigestEmail, {
      userName: "Alice",
      notifications: [
        {
          type: "situation_proposed",
          title: "Invoice overdue",
          summary: "Invoice #1234 is 15 days overdue.",
          viewUrl: "https://app.qorpera.com/situations/1",
          createdAt: "2026-03-20T10:00:00Z",
        },
        {
          type: "situation_proposed",
          title: "Contract expiring",
          summary: "Contract with Acme expires in 30 days.",
          viewUrl: "https://app.qorpera.com/situations/2",
          createdAt: "2026-03-20T11:00:00Z",
        },
        {
          type: "system_alert",
          title: "Sync error",
          summary: "Google connector failed to sync.",
          viewUrl: "https://app.qorpera.com/settings",
          createdAt: "2026-03-20T12:00:00Z",
        },
      ],
      periodStart: "2026-03-19",
      periodEnd: "2026-03-20",
    }),
  },
];

describe("Email templates", () => {
  for (const { name, element } of templates) {
    it(`${name} renders without error`, async () => {
      const html = await render(element);
      expect(html).toBeTruthy();
      expect(html.length).toBeGreaterThan(0);
    });

    it(`${name} contains Qorpera branding`, async () => {
      const html = await render(element);
      expect(html).toContain("Qorpera");
    });
  }
});

// ── Template registry tests ──────────────────────────────────────────────────

describe("Template registry", () => {
  it("renderNotificationEmail returns correct subject for situation_proposed", async () => {
    const result = await renderNotificationEmail(
      "situation_proposed",
      { situationTitle: "Test Situation", viewUrl: "/test" },
      "Test Co"
    );
    expect(result).not.toBeNull();
    expect(result!.subject).toContain("Test Situation");
    expect(result!.html).toContain("Qorpera");
  });

  it("renderNotificationEmail returns null for unknown type without content", async () => {
    const result = await renderNotificationEmail(
      "unknown_type",
      {},
      "Test Co"
    );
    expect(result).toBeNull();
  });

  it("renderNotificationEmail falls back to generic for unknown type with content", async () => {
    const result = await renderNotificationEmail(
      "unknown_type",
      { content: "Something happened" },
      "Test Co"
    );
    expect(result).not.toBeNull();
    expect(result!.subject).toBe("[Qorpera] Notification");
  });

  it("renderTransactionalEmail renders invite", async () => {
    const result = await renderTransactionalEmail("invite", {
      inviterName: "Jonas",
      operatorName: "Acme",
      inviteUrl: "https://test.com/invite/abc",
    });
    expect(result.subject).toContain("Jonas");
    expect(result.html).toContain("Acme");
  });

  it("renderTransactionalEmail renders password-reset", async () => {
    const result = await renderTransactionalEmail("password-reset", {
      resetUrl: "https://test.com/reset/xyz",
      expiresInMinutes: 30,
    });
    expect(result.subject).toContain("Reset");
    expect(result.html.length).toBeGreaterThan(0);
  });

  it("renderTransactionalEmail renders email-verification", async () => {
    const result = await renderTransactionalEmail("email-verification", {
      verifyUrl: "https://test.com/verify/123",
      userName: "Alice",
    });
    expect(result.subject).toContain("Verify");
    expect(result.html).toContain("Alice");
  });

  it("renderDigestEmail renders with notifications", async () => {
    const result = await renderDigestEmail({
      userName: "Alice",
      notifications: [
        {
          type: "situation_proposed",
          title: "Test",
          summary: "Summary",
          viewUrl: "/test",
          createdAt: "2026-03-20T10:00:00Z",
        },
      ],
      periodStart: "2026-03-19",
      periodEnd: "2026-03-20",
    });
    expect(result.subject).toContain("digest");
    expect(result.html).toContain("Alice");
  });
});
