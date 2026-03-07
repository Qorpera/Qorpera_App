import { z } from "zod";
import { prisma } from "@/lib/db";
import { callLLM } from "@/lib/ai-provider";
import { assembleSituationContext } from "@/lib/context-assembly";
import { evaluateActionPolicies, getEffectiveAutonomy } from "@/lib/policy-evaluator";
import { buildReasoningSystemPrompt, buildReasoningUserPrompt, type ReasoningInput } from "@/lib/reasoning-prompts";
import { getBusinessContext, formatBusinessContext } from "@/lib/business-context";

// ── Zod Schema ───────────────────────────────────────────────────────────────

const ReasoningOutputSchema = z.object({
  analysis: z.string().min(10),
  consideredActions: z.array(z.object({
    action: z.string(),
    pros: z.array(z.string()),
    cons: z.array(z.string()),
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
    const businessCtx = await getBusinessContext(situation.operatorId);
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
        properties: context.triggerEntity.properties,
      },
      neighborhood: context.neighborhood.entities.map((n) => ({
        displayName: n.displayName,
        entityType: n.type,
        relationship: n.relationshipType,
        properties: n.properties,
      })),
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
    };

    const systemPrompt = buildReasoningSystemPrompt(businessContextStr);
    const userPrompt = buildReasoningUserPrompt(reasoningInput);

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
        const response = await callLLM(messages, { temperature: 0.2, maxTokens: 4096 });
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

    // 9. Store reasoning
    const updates: Record<string, unknown> = {
      reasoning: JSON.stringify(reasoning),
    };

    if (reasoning.chosenAction) {
      updates.proposedAction = JSON.stringify(reasoning.chosenAction);
    }

    // 10. Advance status
    if (reasoning.chosenAction === null) {
      // No action recommended — human should review
      updates.status = "proposed";
      await createNotification(
        situation.operatorId,
        situationId,
        `Review needed: ${situation.situationType.name}`,
        `AI analyzed the situation but recommends no action. Please review the reasoning.`,
      );
    } else if (effectiveAutonomy === "supervised") {
      updates.status = "proposed";
      await createNotification(
        situation.operatorId,
        situationId,
        `Action proposed: ${situation.situationType.name}`,
        `AI proposes: ${reasoning.chosenAction.action} — ${reasoning.chosenAction.justification.slice(0, 100)}`,
      );
    } else if (effectiveAutonomy === "notify") {
      updates.status = "auto_executing";
      await createNotification(
        situation.operatorId,
        situationId,
        `Auto-executing: ${situation.situationType.name}`,
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
