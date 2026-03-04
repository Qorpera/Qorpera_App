import { prisma } from "@/lib/db";
import { logAction } from "@/lib/audit-logger";

// ── Types ────────────────────────────────────────────────────────────────────

type Condition = {
  field: string;
  operator: string;
  value: string;
};

type ActionRuleInput = {
  name: string;
  description?: string;
  entityTypeSlug: string;
  triggerOn?: string;
  conditions?: Condition[];
  actionType: string;
  actionConfig?: Record<string, unknown>;
  priority?: number;
  enabled?: boolean;
};

type ActionRuleUpdate = {
  name?: string;
  description?: string;
  entityTypeSlug?: string;
  triggerOn?: string;
  conditions?: Condition[];
  actionType?: string;
  actionConfig?: Record<string, unknown>;
  priority?: number;
  enabled?: boolean;
};

type EntityForEval = {
  id: string;
  typeSlug: string;
};

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function listActionRules(
  operatorId: string,
  filters?: { entityTypeSlug?: string; triggerOn?: string; enabled?: boolean },
) {
  const where: Record<string, unknown> = { operatorId };
  if (filters?.entityTypeSlug) where.entityTypeSlug = filters.entityTypeSlug;
  if (filters?.triggerOn) where.triggerOn = filters.triggerOn;
  if (filters?.enabled !== undefined) where.enabled = filters.enabled;

  return prisma.actionRule.findMany({
    where,
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
  });
}

export async function createActionRule(operatorId: string, input: ActionRuleInput) {
  return prisma.actionRule.create({
    data: {
      operatorId,
      name: input.name,
      description: input.description ?? "",
      entityTypeSlug: input.entityTypeSlug,
      triggerOn: input.triggerOn ?? "mutation",
      conditions: JSON.stringify(input.conditions ?? []),
      actionType: input.actionType,
      actionConfig: JSON.stringify(input.actionConfig ?? {}),
      priority: input.priority ?? 0,
      enabled: input.enabled ?? true,
    },
  });
}

export async function updateActionRule(
  operatorId: string,
  id: string,
  fields: ActionRuleUpdate,
) {
  const existing = await prisma.actionRule.findFirst({
    where: { id, operatorId },
  });
  if (!existing) return null;

  return prisma.actionRule.update({
    where: { id },
    data: {
      ...(fields.name !== undefined && { name: fields.name }),
      ...(fields.description !== undefined && { description: fields.description }),
      ...(fields.entityTypeSlug !== undefined && { entityTypeSlug: fields.entityTypeSlug }),
      ...(fields.triggerOn !== undefined && { triggerOn: fields.triggerOn }),
      ...(fields.conditions !== undefined && { conditions: JSON.stringify(fields.conditions) }),
      ...(fields.actionType !== undefined && { actionType: fields.actionType }),
      ...(fields.actionConfig !== undefined && { actionConfig: JSON.stringify(fields.actionConfig) }),
      ...(fields.priority !== undefined && { priority: fields.priority }),
      ...(fields.enabled !== undefined && { enabled: fields.enabled }),
    },
  });
}

export async function deleteActionRule(operatorId: string, id: string) {
  const existing = await prisma.actionRule.findFirst({
    where: { id, operatorId },
  });
  if (!existing) return false;
  await prisma.actionRule.delete({ where: { id } });
  return true;
}

// ── Condition Matching ───────────────────────────────────────────────────────

function matchesConditions(
  conditionsJson: string,
  propertyValues: Map<string, string>,
): boolean {
  let conditions: Condition[];
  try {
    conditions = JSON.parse(conditionsJson);
  } catch {
    return false;
  }

  if (!Array.isArray(conditions) || conditions.length === 0) return true;

  return conditions.every((cond) => {
    const actual = propertyValues.get(cond.field) ?? "";
    const expected = cond.value ?? "";

    switch (cond.operator) {
      case "equals":
        return actual === expected;
      case "not_equals":
        return actual !== expected;
      case "contains":
        return actual.toLowerCase().includes(expected.toLowerCase());
      case "gt":
        return parseFloat(actual) > parseFloat(expected);
      case "lt":
        return parseFloat(actual) < parseFloat(expected);
      case "is_empty":
        return actual === "";
      case "is_not_empty":
        return actual !== "";
      default:
        return false;
    }
  });
}

// ── Action Dispatch ──────────────────────────────────────────────────────────

async function executeRuleAction(
  operatorId: string,
  rule: { id: string; name: string; actionType: string; actionConfig: string; entityTypeSlug: string },
  entity: { id: string; displayName: string },
) {
  switch (rule.actionType) {
    case "create_proposal": {
      let config: Record<string, unknown> = {};
      try { config = JSON.parse(rule.actionConfig); } catch { /* empty */ }
      await prisma.actionProposal.create({
        data: {
          operatorId,
          actionType: (config.proposalAction as string) ?? "review",
          description: `[Action Rule: ${rule.name}] ${config.description ?? `Triggered for ${entity.displayName}`}`,
          entityId: entity.id,
          entityTypeSlug: rule.entityTypeSlug,
          sourceAgent: "action-rule",
          inputData: JSON.stringify({ ruleId: rule.id, ruleName: rule.name }),
          expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
        },
      });
      break;
    }

    case "update_entity": {
      let config: Record<string, unknown> = {};
      try { config = JSON.parse(rule.actionConfig); } catch { /* empty */ }
      const properties = config.properties as Record<string, string> | undefined;
      if (properties) {
        const { updateEntityGoverned } = await import("@/lib/oem-policy-gateway");
        await updateEntityGoverned(
          operatorId,
          entity.id,
          { properties },
          { type: "system", id: `action-rule:${rule.id}` },
        );
      }
      break;
    }

    case "flag_for_review": {
      await prisma.actionProposal.create({
        data: {
          operatorId,
          actionType: "review",
          description: `[Action Rule: ${rule.name}] Flagged for review: ${entity.displayName}`,
          entityId: entity.id,
          entityTypeSlug: rule.entityTypeSlug,
          sourceAgent: "action-rule",
          inputData: JSON.stringify({ ruleId: rule.id, ruleName: rule.name }),
          expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
        },
      });
      break;
    }

    case "send_notification": {
      // Stub: logs to audit for now
      await logAction(operatorId, {
        action: "action_rule_notification",
        actorType: "system",
        actorId: `action-rule:${rule.id}`,
        entityId: entity.id,
        entityTypeSlug: rule.entityTypeSlug,
        inputSnapshot: { ruleName: rule.name, ruleConfig: rule.actionConfig },
        outcome: "success",
      });
      break;
    }
  }
}

// ── Evaluation ───────────────────────────────────────────────────────────────

export async function evaluateRulesForEntity(
  operatorId: string,
  entity: EntityForEval,
  triggerType: "mutation" | "tick",
) {
  const rules = await prisma.actionRule.findMany({
    where: {
      operatorId,
      entityTypeSlug: entity.typeSlug,
      triggerOn: triggerType,
      enabled: true,
    },
    orderBy: { priority: "desc" },
  });

  if (rules.length === 0) return;

  // Load full entity with property values
  const fullEntity = await prisma.oemEntity.findFirst({
    where: { id: entity.id, operatorId },
    include: {
      propertyValues: {
        include: { property: { select: { slug: true } } },
      },
    },
  });
  if (!fullEntity) return;

  const propMap = new Map(
    fullEntity.propertyValues.map((pv) => [pv.property.slug, pv.value]),
  );

  for (const rule of rules) {
    const matched = matchesConditions(rule.conditions, propMap);

    await logAction(operatorId, {
      action: "evaluate_action_rule",
      actorType: "system",
      actorId: `action-rule:${rule.id}`,
      entityId: entity.id,
      entityTypeSlug: entity.typeSlug,
      inputSnapshot: { ruleName: rule.name, triggerType, matched },
      outcome: matched ? "success" : "skipped",
    });

    if (matched) {
      await executeRuleAction(operatorId, rule, {
        id: fullEntity.id,
        displayName: fullEntity.displayName,
      });
      await prisma.actionRule.update({
        where: { id: rule.id },
        data: { lastEvaluatedAt: new Date() },
      });
    }
  }
}

export async function evaluateTickRules(operatorId: string) {
  const rules = await prisma.actionRule.findMany({
    where: { operatorId, triggerOn: "tick", enabled: true },
    orderBy: { priority: "desc" },
  });

  if (rules.length === 0) return { evaluated: 0, matched: 0 };

  let evaluated = 0;
  let matched = 0;

  for (const rule of rules) {
    // Load entities of the matching type
    const entities = await prisma.oemEntity.findMany({
      where: { operatorId, entityType: { slug: rule.entityTypeSlug }, status: "active" },
      include: {
        propertyValues: {
          include: { property: { select: { slug: true } } },
        },
      },
    });

    for (const entity of entities) {
      evaluated++;
      const propMap = new Map(
        entity.propertyValues.map((pv) => [pv.property.slug, pv.value]),
      );

      if (matchesConditions(rule.conditions, propMap)) {
        matched++;
        await executeRuleAction(operatorId, rule, {
          id: entity.id,
          displayName: entity.displayName,
        });

        await logAction(operatorId, {
          action: "evaluate_action_rule",
          actorType: "system",
          actorId: `action-rule:${rule.id}`,
          entityId: entity.id,
          entityTypeSlug: rule.entityTypeSlug,
          inputSnapshot: { ruleName: rule.name, triggerType: "tick", matched: true },
          outcome: "success",
        });
      }
    }

    await prisma.actionRule.update({
      where: { id: rule.id },
      data: { lastEvaluatedAt: new Date() },
    });
  }

  return { evaluated, matched };
}
