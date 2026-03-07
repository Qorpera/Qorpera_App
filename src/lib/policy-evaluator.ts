import { prisma } from "@/lib/db";

// ── Types ────────────────────────────────────────────────────────────────────

export type PermittedAction = {
  name: string;
  description: string;
  connector: string;
  inputSchema: unknown;
};

export type BlockedAction = {
  name: string;
  reason: string;
};

export type PolicyEvaluationResult = {
  permitted: PermittedAction[];
  blocked: BlockedAction[];
  hasRequireApproval: boolean;
};

// ── Policy Evaluation ────────────────────────────────────────────────────────

export async function evaluateActionPolicies(
  operatorId: string,
  actions: Array<{
    name: string;
    description: string;
    connectorId: string | null;
    connectorProvider: string | null;
    inputSchema: string | null;
  }>,
  triggerEntityTypeSlug: string,
  triggerEntityId: string,
): Promise<PolicyEvaluationResult> {
  const policies = await prisma.policyRule.findMany({
    where: { operatorId, enabled: true },
  });

  const permitted: PermittedAction[] = [];
  const blocked: BlockedAction[] = [];
  let hasRequireApproval = false;

  for (const action of actions) {
    const matching = policies.filter((p) => {
      // Scope match
      const scopeMatch =
        p.scope === "global" ||
        (p.scope === "entity_type" && p.scopeTargetId === triggerEntityTypeSlug) ||
        (p.scope === "entity" && p.scopeTargetId === triggerEntityId);
      if (!scopeMatch) return false;

      // Action type match — if policy specifies an actionType, it must match
      // "execute" applies to all executable actions
      if (p.actionType && p.actionType !== "execute" && p.actionType !== action.name) {
        return false;
      }

      return true;
    });

    if (matching.length === 0) {
      // No policies match → default ALLOW
      permitted.push({
        name: action.name,
        description: action.description,
        connector: action.connectorProvider ?? action.connectorId ?? "system",
        inputSchema: action.inputSchema ? safeParseJSON(action.inputSchema) : null,
      });
      continue;
    }

    // Most restrictive wins: DENY > REQUIRE_APPROVAL > ALLOW
    const denyPolicy = matching.find((p) => p.effect === "DENY");
    if (denyPolicy) {
      blocked.push({
        name: action.name,
        reason: denyPolicy.name,
      });
      continue;
    }

    const requireApproval = matching.some((p) => p.effect === "REQUIRE_APPROVAL");
    if (requireApproval) {
      hasRequireApproval = true;
    }

    permitted.push({
      name: action.name,
      description: action.description,
      connector: action.connectorProvider ?? action.connectorId ?? "system",
      inputSchema: action.inputSchema ? safeParseJSON(action.inputSchema) : null,
    });
  }

  // Day 14: log policy evaluations as notifications
  if (blocked.length > 0 || hasRequireApproval) {
    const body = blocked.length > 0
      ? `Blocked: ${blocked.map((b) => b.name).join(", ")} — ${blocked.map((b) => b.reason).join(", ")}`
      : `Require approval enforced for: ${permitted.filter((p) => policies.some((pol) => pol.effect === "REQUIRE_APPROVAL")).map((p) => p.name).join(", ")}`;

    await prisma.notification.create({
      data: {
        operatorId,
        title: "Policy applied",
        body,
        sourceType: "policy",
      },
    }).catch(() => {});
  }

  return { permitted, blocked, hasRequireApproval };
}

// ── Effective Autonomy ───────────────────────────────────────────────────────

export function getEffectiveAutonomy(
  situationType: { autonomyLevel: string },
  policyResult: PolicyEvaluationResult,
): "supervised" | "notify" | "autonomous" {
  const base = situationType.autonomyLevel as "supervised" | "notify" | "autonomous";

  if (base === "supervised") return "supervised";

  // Downgrade if any REQUIRE_APPROVAL policy matched
  if (policyResult.hasRequireApproval) return "supervised";

  return base;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function safeParseJSON(str: string): unknown {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}
