import { z } from "zod";
import { prisma } from "@/lib/db";
import { callLLM } from "@/lib/ai-provider";
import { assembleSituationContext } from "@/lib/context-assembly";
import { evaluateActionPolicies, getEffectiveAutonomy } from "@/lib/policy-evaluator";
import { buildReasoningSystemPrompt, buildReasoningUserPrompt, type ReasoningInput } from "@/lib/reasoning-prompts";
import { getBusinessContext, formatBusinessContext } from "@/lib/business-context";
import { executeSituationAction } from "@/lib/situation-executor";

// ── Zod Schema ───────────────────────────────────────────────────────────────

const ReasoningOutputSchema = z.object({
  analysis: z.string().min(10),
  evidenceSummary: z.string().min(10),
  consideredActions: z.array(z.object({
    action: z.string(),
    evidenceFor: z.array(z.string()),
    evidenceAgainst: z.array(z.string()),
    expectedOutcome: z.string(),
  })),
  chosenAction: z.object({
    action: z.string(),
    connector: z.string(),
    params: z.record(z.any()),
    justification: z.string().min(10),
  }).nullable(),
  confidence: z.number().min(0).max(1),
  missingContext: z.array(z.string()).nullable(),
});

type ReasoningOutput = z.infer<typeof ReasoningOutputSchema>;

// ── Main ─────────────────────────────────────────────────────────────────────

export async function reasonAboutSituation(situationId: string): Promise<void> {
  // 1. Load situation
  const situation = await prisma.situation.findUnique({
    where: { id: situationId },
    include: {
      situationType: true,
    },
  });

  if (!situation) {
    console.warn(`[reasoning-engine] Situation ${situationId} not found`);
    return;
  }

  // 2. Guard — skip if not detected (idempotent)
  if (situation.status !== "detected") {
    return;
  }

  // 3. Update status to reasoning (optimistic lock)
  const lockResult = await prisma.situation.updateMany({
    where: { id: situationId, status: "detected" },
    data: { status: "reasoning" },
  });
  if (lockResult.count === 0) {
    return;
  }

  try {
    // 4. Load context
    const context = await assembleSituationContext(
      situation.operatorId,
      situation.situationTypeId,
      situation.triggerEntityId ?? "",
      situation.triggerEventId ?? undefined,
    );

    // 5. Resolve governance
    // Get trigger entity type slug
    let triggerEntityTypeSlug = "unknown";
    if (situation.triggerEntityId) {
      const entity = await prisma.entity.findUnique({
        where: { id: situation.triggerEntityId },
        include: { entityType: { select: { slug: true } } },
      });
      if (entity) {
        triggerEntityTypeSlug = entity.entityType.slug;
      }
    }

    // Load action capabilities with connector info
    const capabilities = await prisma.actionCapability.findMany({
      where: { operatorId: situation.operatorId, enabled: true },
      include: { connector: { select: { provider: true } } },
    });

    const actionsForEval = capabilities.map((c) => ({
      name: c.name,
      description: c.description,
      connectorId: c.connectorId,
      connectorProvider: c.connector?.provider ?? null,
      inputSchema: c.inputSchema,
    }));

    const policyResult = await evaluateActionPolicies(
      situation.operatorId,
      actionsForEval,
      triggerEntityTypeSlug,
      situation.triggerEntityId ?? "",
    );

    const effectiveAutonomy = getEffectiveAutonomy(situation.situationType, policyResult);

    // 6. Build prompt
    const [businessCtx, operator] = await Promise.all([
      getBusinessContext(situation.operatorId),
      prisma.operator.findUnique({
        where: { id: situation.operatorId },
        select: { companyName: true },
      }),
    ]);
    const businessContextStr = businessCtx ? formatBusinessContext(businessCtx) : null;

    const reasoningInput: ReasoningInput = {
      situationType: {
        name: situation.situationType.name,
        description: situation.situationType.description,
        autonomyLevel: effectiveAutonomy,
      },
      severity: situation.severity,
      confidence: situation.confidence,
      triggerEntity: {
        displayName: context.triggerEntity.displayName,
        type: context.triggerEntity.type,
        category: context.triggerEntity.category,
        properties: context.triggerEntity.properties,
      },
      departments: context.departments,
      departmentKnowledge: context.departmentKnowledge,
      relatedEntities: context.relatedEntities,
      recentEvents: context.recentEvents.map((e) => ({
        type: e.eventType,
        timestamp: e.createdAt,
        payload: e.payload,
      })),
      priorSituations: await enrichPriorSituations(context.priorSituations),
      autonomyLevel: effectiveAutonomy,
      permittedActions: policyResult.permitted,
      blockedActions: policyResult.blocked,
      businessContext: businessContextStr,
      activityTimeline: context.activityTimeline,
      communicationContext: context.communicationContext,
      crossDepartmentSignals: context.crossDepartmentSignals,
    };

    const systemPrompt = buildReasoningSystemPrompt(businessContextStr, operator?.companyName ?? undefined);
    let userPrompt = buildReasoningUserPrompt(reasoningInput);

    // 6b. Edit instruction injection
    if (situation.editInstruction) {
      let originalProposal = "null";
      if (situation.proposedAction) {
        try { originalProposal = JSON.stringify(JSON.parse(situation.proposedAction), null, 2); } catch { originalProposal = situation.proposedAction; }
      }
      userPrompt += `\n\nEDIT REQUEST:\nThe human reviewed the original proposal and requested changes. Incorporate their instruction into your revised action.\n\nORIGINAL PROPOSAL:\n${originalProposal}\n\nHUMAN'S EDIT INSTRUCTION:\n"${situation.editInstruction}"\n\nRevise your chosenAction to incorporate this feedback. Keep the same situation analysis but adjust the action parameters and justification accordingly.`;
    }

    // 6c. Prior feedback injection
    const priorFeedback = await prisma.situation.findMany({
      where: {
        situationTypeId: situation.situationTypeId,
        feedback: { not: null },
        id: { not: situationId },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { feedback: true, feedbackCategory: true },
    });
    if (priorFeedback.length > 0) {
      const feedbackLines = priorFeedback
        .map((f) => `  - ${f.feedback}${f.feedbackCategory ? ` [${f.feedbackCategory}]` : ""}`)
        .join("\n");
      userPrompt += `\n\nHUMAN FEEDBACK ON SIMILAR SITUATIONS:\n${feedbackLines}\nIncorporate this feedback into your reasoning.`;
    }

    // 7. Call LLM
    let reasoning: ReasoningOutput | null = null;
    let rawResponse = "";
    let parseError = "";

    for (let attempt = 0; attempt < 2; attempt++) {
      const messages = [
        { role: "system" as const, content: systemPrompt },
        { role: "user" as const, content: attempt === 0
          ? userPrompt
          : `${userPrompt}\n\nPREVIOUS ATTEMPT FAILED VALIDATION: ${parseError}\nPlease fix the JSON output to match the required schema exactly.`
        },
      ];

      try {
        const response = await callLLM(messages, { temperature: 0.2, maxTokens: 4096, aiFunction: "reasoning" });
        rawResponse = response.content;

        // 8. Validate response
        const parsed = extractJSON(rawResponse);
        if (!parsed) {
          parseError = "Could not parse JSON from response";
          if (attempt === 0) continue;
          break;
        }

        const result = ReasoningOutputSchema.safeParse(parsed);
        if (!result.success) {
          parseError = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
          if (attempt === 0) continue;
          break;
        }

        reasoning = result.data;
        break;
      } catch (err) {
        console.error(`[reasoning-engine] LLM call failed for situation ${situationId}:`, err);
        // Leave at detected status for retry
        await prisma.situation.update({
          where: { id: situationId },
          data: { status: "detected" },
        });
        return;
      }
    }

    // If validation failed after both attempts
    if (!reasoning) {
      console.warn(`[reasoning-engine] Validation failed for situation ${situationId}: ${parseError}`);
      await prisma.situation.update({
        where: { id: situationId },
        data: {
          status: "detected",
          reasoning: JSON.stringify({ raw: rawResponse, parseError }),
        },
      });
      return;
    }

    // 8b. Post-reasoning policy verification — catch LLM ignoring BLOCKED instructions
    if (reasoning!.chosenAction) {
      const chosenName = reasoning!.chosenAction.action;
      const isPermitted = policyResult.permitted.some(
        (p) => p.name === chosenName,
      );
      const isBlocked = policyResult.blocked.some(
        (b) => b.name === chosenName,
      );

      if (!isPermitted || isBlocked) {
        console.warn(
          `[reasoning-engine] AI proposed blocked/unpermitted action "${reasoning.chosenAction.action}" for situation ${situationId}. Overriding to null.`,
        );
        reasoning = {
          ...reasoning,
          chosenAction: null,
          analysis: reasoning.analysis + "\n\n[SYSTEM: Proposed action was overridden — it violates governance policy.]",
        };
      }
    }

    // 9. Store reasoning
    const updates: Record<string, unknown> = {
      reasoning: JSON.stringify(reasoning),
    };

    if (reasoning.chosenAction) {
      updates.proposedAction = JSON.stringify(reasoning.chosenAction);
    }

    // 10. Advance status
    const revised = situation.editInstruction ? " (Revised)" : "";
    if (reasoning.chosenAction === null) {
      updates.status = "proposed";
      await createNotification(
        situation.operatorId,
        situationId,
        `Review needed${revised}: ${situation.situationType.name}`,
        `AI analyzed the situation but recommends no action. Please review the reasoning.`,
      );
    } else if (effectiveAutonomy === "supervised") {
      updates.status = "proposed";
      await createNotification(
        situation.operatorId,
        situationId,
        `Action proposed${revised}: ${situation.situationType.name}`,
        `AI proposes: ${reasoning.chosenAction.action} — ${reasoning.chosenAction.justification.slice(0, 100)}`,
      );
    } else if (effectiveAutonomy === "notify") {
      updates.status = "auto_executing";
      await createNotification(
        situation.operatorId,
        situationId,
        `Auto-executing${revised}: ${situation.situationType.name}`,
        `AI is executing: ${reasoning.chosenAction.action}. Review and reverse if needed.`,
      );
    } else {
      // autonomous
      updates.status = "auto_executing";
    }

    await prisma.situation.update({
      where: { id: situationId },
      data: updates,
    });

    // Day 14: fire-and-forget execution for auto_executing situations
    if (updates.status === "auto_executing") {
      executeSituationAction(situationId).catch((err) =>
        console.error(`[reasoning-engine] Execution failed for ${situationId}:`, err),
      );
    }

  } catch (err) {
    console.error(`[reasoning-engine] Error reasoning about situation ${situationId}:`, err);
    // Reset to detected so it can be retried
    await prisma.situation.update({
      where: { id: situationId },
      data: { status: "detected" },
    }).catch(() => {});
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function createNotification(
  operatorId: string,
  situationId: string,
  title: string,
  body: string,
): Promise<void> {
  await prisma.notification.create({
    data: {
      operatorId,
      title,
      body,
      sourceType: "situation",
      sourceId: situationId,
    },
  }).catch(() => {});
}

async function enrichPriorSituations(
  priors: Array<{ id: string; outcome: string | null; feedback: string | null; actionTaken: unknown; createdAt: string }>,
) {
  if (priors.length === 0) return [];

  // Fetch reasoning field for prior situations to extract analysis
  const priorRecords = await prisma.situation.findMany({
    where: { id: { in: priors.map((p) => p.id) } },
    select: { id: true, reasoning: true },
  });
  const reasoningMap = new Map(priorRecords.map((r) => [r.id, r.reasoning]));

  return priors.map((p) => {
    let analysis: string | undefined;
    const raw = reasoningMap.get(p.id);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (typeof parsed.analysis === "string") analysis = parsed.analysis;
      } catch {}
    }
    return {
      analysis,
      outcome: p.outcome ?? undefined,
      feedback: p.feedback ?? undefined,
      actionTaken: p.actionTaken,
      createdAt: p.createdAt,
    };
  });
}

function extractJSON(text: string): Record<string, unknown> | null {
  // Strip markdown fences
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = fenceMatch ? fenceMatch[1].trim() : text.trim();
  try {
    const parsed = JSON.parse(jsonStr);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}
