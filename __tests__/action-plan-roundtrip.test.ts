import { describe, it, expect } from "vitest";
import {
  renderActionPlan,
  parseActionPlan,
  type ParsedActionStep,
} from "@/lib/wiki-execution-engine";

describe("renderActionPlan → parseActionPlan round-trip", () => {
  it("preserves all fields through render → parse", () => {
    const steps: ParsedActionStep[] = [
      {
        order: 1,
        title: "Send renewal coordination email to Trine",
        actionType: "api_action",
        status: "pending",
        description:
          "Lars should send Trine a detailed email about the renewal process for EL-2024-48291.",
        capabilityName: "Send Email",
        assignedSlug: "person-lars-nielsen",
        params: {
          to: "trine@boltly.dk",
          subject: "HASTER: Autorisationsfornyelse EL-2024-48291",
          body: "Hej Trine,\n\nSom du ved...",
          previewType: "email",
        },
        previewType: "email",
      },
      {
        order: 2,
        title: "Create employee authorization checklist",
        actionType: "generate",
        status: "pending",
        description:
          "Compile a checklist document tracking each employee's authorization status for Sikkerhedsstyrelsen.",
        params: {
          title: "Autorisationsfornyelse Tjekliste — EL-2024-48291",
          description:
            "Employee authorization status checklist for Sikkerhedsstyrelsen renewal",
          previewType: "spreadsheet",
        },
        previewType: "spreadsheet",
      },
      {
        order: 3,
        title: "Call Tryg insurance to verify coverage",
        actionType: "human_task",
        status: "pending",
        description:
          "Phone Tryg at +45 44 20 20 20 to confirm professional liability coverage remains valid during the renewal period.",
        assignedSlug: "person-mark-jensen",
        previewType: "generic",
      },
    ];

    const rendered = renderActionPlan(steps);
    const parsed = parseActionPlan(rendered);

    expect(parsed.steps).toHaveLength(3);

    // Step 1: api_action with all fields
    const s1 = parsed.steps[0];
    expect(s1.order).toBe(1);
    expect(s1.title).toBe("Send renewal coordination email to Trine");
    expect(s1.actionType).toBe("api_action");
    expect(s1.status).toBe("pending");
    expect(s1.description).toContain("Lars should send Trine");
    expect(s1.capabilityName).toBe("Send Email");
    expect(s1.assignedSlug).toBe("person-lars-nielsen");
    expect(s1.params).toBeDefined();
    expect(s1.params!.to).toBe("trine@boltly.dk");
    expect(s1.params!.subject).toBe(
      "HASTER: Autorisationsfornyelse EL-2024-48291",
    );
    expect(s1.params!.previewType).toBe("email");
    expect(s1.previewType).toBe("email");

    // Step 2: generate
    const s2 = parsed.steps[1];
    expect(s2.order).toBe(2);
    expect(s2.title).toBe("Create employee authorization checklist");
    expect(s2.actionType).toBe("generate");
    expect(s2.status).toBe("pending");
    expect(s2.params).toBeDefined();
    expect(s2.params!.title).toBe(
      "Autorisationsfornyelse Tjekliste — EL-2024-48291",
    );
    expect(s2.previewType).toBe("spreadsheet");

    // Step 3: human_task (no capability, no params)
    const s3 = parsed.steps[2];
    expect(s3.order).toBe(3);
    expect(s3.title).toBe("Call Tryg insurance to verify coverage");
    expect(s3.actionType).toBe("human_task");
    expect(s3.status).toBe("pending");
    expect(s3.assignedSlug).toBe("person-mark-jensen");
    expect(s3.capabilityName).toBeUndefined();
    expect(s3.previewType).toBe("generic");
  });

  it("handles empty steps array", () => {
    const rendered = renderActionPlan([]);
    expect(rendered).toContain("## Action Plan");

    const parsed = parseActionPlan(rendered);
    expect(parsed.steps).toHaveLength(0);
  });

  it("handles params with nested JSON", () => {
    const steps: ParsedActionStep[] = [
      {
        order: 1,
        title: "Update CRM deal stage",
        actionType: "api_action",
        status: "pending",
        description: "Move deal to negotiation stage.",
        capabilityName: "Update HubSpot Deal",
        params: {
          dealId: "deal-123",
          properties: { stage: "negotiation", amount: 150000 },
          previewType: "crm_update",
        },
        previewType: "crm_update",
      },
    ];

    const rendered = renderActionPlan(steps);
    const parsed = parseActionPlan(rendered);

    expect(parsed.steps).toHaveLength(1);
    expect(parsed.steps[0].params!.properties).toEqual({
      stage: "negotiation",
      amount: 150000,
    });
  });
});
