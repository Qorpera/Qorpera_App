import { prisma } from "@/lib/db";
import type { PolicyEffect, PolicyScope } from "./types";

type PolicyEvaluation = {
  effect: PolicyEffect;
  matchedRule: { id: string; name: string } | null;
};

/**
 * Evaluate policies for a given action.
 * Returns the highest-priority matching policy effect.
 * Default: ALLOW if no matching rules.
 */
export async function evaluatePolicy(
  operatorId: string,
  action: string,
  context: {
    entityTypeSlug?: string;
    entityId?: string;
    amount?: number;
  },
): Promise<PolicyEvaluation> {
  const rules = await prisma.policyRule.findMany({
    where: { operatorId, enabled: true },
    orderBy: { priority: "desc" },
  });

  for (const rule of rules) {
    if (!matchesAction(rule.actionType, action)) continue;
    if (!matchesScope(rule, context)) continue;
    if (!matchesConditions(rule.conditions, context)) continue;

    return {
      effect: rule.effect as PolicyEffect,
      matchedRule: { id: rule.id, name: rule.name },
    };
  }

  return { effect: "ALLOW", matchedRule: null };
}

function matchesAction(ruleAction: string, action: string): boolean {
  if (ruleAction === "*") return true;
  return ruleAction === action;
}

function matchesScope(
  rule: { scope: string; scopeTargetId: string | null },
  context: { entityTypeSlug?: string; entityId?: string },
): boolean {
  if (rule.scope === "global") return true;
  if (rule.scope === "entity_type" && rule.scopeTargetId === context.entityTypeSlug) return true;
  if (rule.scope === "entity" && rule.scopeTargetId === context.entityId) return true;
  return false;
}

function matchesConditions(
  conditionsJson: string | null,
  context: { amount?: number },
): boolean {
  if (!conditionsJson) return true;
  try {
    const conditions = JSON.parse(conditionsJson);
    if (conditions.minAmount && context.amount && context.amount < conditions.minAmount) return false;
    if (conditions.maxAmount && context.amount && context.amount > conditions.maxAmount) return false;
    return true;
  } catch {
    return true;
  }
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function listPolicies(operatorId: string) {
  return prisma.policyRule.findMany({
    where: { operatorId },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  });
}

export async function createPolicy(
  operatorId: string,
  input: {
    name: string;
    scope: PolicyScope;
    scopeTargetId?: string;
    actionType: string;
    effect: PolicyEffect;
    conditions?: Record<string, unknown>;
    priority?: number;
  },
) {
  return prisma.policyRule.create({
    data: {
      operatorId,
      name: input.name,
      scope: input.scope,
      scopeTargetId: input.scopeTargetId ?? null,
      actionType: input.actionType,
      effect: input.effect,
      conditions: input.conditions ? JSON.stringify(input.conditions) : null,
      priority: input.priority ?? 0,
    },
  });
}

export async function updatePolicy(
  operatorId: string,
  policyId: string,
  fields: Partial<{
    name: string;
    scope: PolicyScope;
    scopeTargetId: string | null;
    actionType: string;
    effect: PolicyEffect;
    conditions: Record<string, unknown> | null;
    priority: number;
    enabled: boolean;
  }>,
) {
  const existing = await prisma.policyRule.findFirst({ where: { id: policyId, operatorId } });
  if (!existing) return null;
  return prisma.policyRule.update({
    where: { id: policyId },
    data: {
      ...(fields.name !== undefined && { name: fields.name }),
      ...(fields.scope !== undefined && { scope: fields.scope }),
      ...(fields.scopeTargetId !== undefined && { scopeTargetId: fields.scopeTargetId }),
      ...(fields.actionType !== undefined && { actionType: fields.actionType }),
      ...(fields.effect !== undefined && { effect: fields.effect }),
      ...(fields.conditions !== undefined && {
        conditions: fields.conditions ? JSON.stringify(fields.conditions) : null,
      }),
      ...(fields.priority !== undefined && { priority: fields.priority }),
      ...(fields.enabled !== undefined && { enabled: fields.enabled }),
    },
  });
}

export async function deletePolicy(operatorId: string, policyId: string) {
  const existing = await prisma.policyRule.findFirst({ where: { id: policyId, operatorId } });
  if (!existing) return false;
  await prisma.policyRule.delete({ where: { id: policyId } });
  return true;
}
