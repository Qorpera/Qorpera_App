import { prisma } from "@/lib/db";
import { callLLM, getModel } from "@/lib/ai-provider";
import { extractJSON } from "@/lib/json-helpers";
import { sendNotificationToAdmins } from "@/lib/notification-dispatch";

// ── Types ────────────────────────────────────────────────

interface DetectedPattern {
  patternType: string;
  title: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  confidence: number;
  routing: "initiative" | "situation";
  evidence: Array<{ pageSlug: string; claim: string }>;
  proposedProject?: {
    title: string;
    description: string;
    members: Array<{ name: string; email: string; role: string }>;
    deliverables: Array<{ title: string; description: string }>;
  };
  situationConfig?: {
    triggerEntityId: string;
    situationTypeSlug: string;
    assigneeEntityId?: string;
  };
}

interface WikiScanReport {
  pagesScanned: number;
  patternsDetected: number;
  initiativesCreated: number;
  situationsCreated: number;
  skippedDuplicates: number;
  durationMs: number;
}

// ── Main ─────────────────────────────────────────────────

export async function runWikiStrategicScan(
  operatorId: string,
): Promise<WikiScanReport> {
  const startTime = performance.now();
  const report: WikiScanReport = {
    pagesScanned: 0,
    patternsDetected: 0,
    initiativesCreated: 0,
    situationsCreated: 0,
    skippedDuplicates: 0,
    durationMs: 0,
  };

  // Load verified + stale wiki pages (operator-level only)
  const pages = await prisma.knowledgePage.findMany({
    where: {
      operatorId,
      scope: "operator",
      projectId: null,
      status: { in: ["verified", "stale"] },
      pageType: { notIn: ["index", "log", "contradiction_log"] },
    },
    select: {
      slug: true,
      title: true,
      pageType: true,
      content: true,
      confidence: true,
      subjectEntityId: true,
    },
  });

  report.pagesScanned = pages.length;
  if (pages.length === 0) {
    console.log("[wiki-scanner] No wiki pages to scan");
    return report;
  }

  // Group pages by type for focused analysis
  const pagesByType = new Map<string, typeof pages>();
  for (const p of pages) {
    const group = pagesByType.get(p.pageType) ?? [];
    group.push(p);
    pagesByType.set(p.pageType, group);
  }

  // Run pattern detection
  const patterns = await detectPatterns(operatorId, pagesByType);
  report.patternsDetected = patterns.length;

  // Route each pattern
  for (const pattern of patterns) {
    const isDuplicate = await checkDuplicate(operatorId, pattern);
    if (isDuplicate) {
      report.skippedDuplicates++;
      continue;
    }

    try {
      if (pattern.routing === "initiative") {
        await createInitiativeFromPattern(operatorId, pattern);
        report.initiativesCreated++;
      } else {
        await createSituationFromPattern(operatorId, pattern);
        report.situationsCreated++;
      }
    } catch (err) {
      console.error(
        `[wiki-scanner] Failed to create ${pattern.routing} for "${pattern.title}":`,
        err,
      );
    }
  }

  report.durationMs = Math.round(performance.now() - startTime);
  console.log(`[wiki-scanner] Scan complete: ${JSON.stringify(report)}`);
  return report;
}

// ── Pattern Detection ────────────────────────────────────

async function detectPatterns(
  operatorId: string,
  pagesByType: Map<
    string,
    Array<{
      slug: string;
      title: string;
      pageType: string;
      content: string;
      confidence: number;
      subjectEntityId: string | null;
    }>
  >,
): Promise<DetectedPattern[]> {
  // Build condensed wiki summary
  let wikiSummary = "";
  for (const [type, pgs] of pagesByType) {
    wikiSummary += `\n## ${type.replace(/_/g, " ")} (${pgs.length} pages)\n\n`;
    for (const page of pgs) {
      const maxLen = pgs.length > 50 ? 800 : 2000;
      wikiSummary += `### ${page.title} [${page.slug}] (confidence: ${page.confidence.toFixed(2)})\n${page.content.slice(0, maxLen)}\n\n`;
    }
  }

  const operator = await prisma.operator.findUnique({
    where: { id: operatorId },
    select: { companyName: true },
  });

  const systemPrompt = `You are a strategic analyst scanning an organization's knowledge wiki to identify patterns that require coordinated action.

Company: ${operator?.companyName ?? "Unknown"}

You are looking for patterns in two categories:

**INITIATIVES** (coordinated multi-person work -> becomes a project):
- Financial risks requiring policy changes + client communication + process updates
- Declining relationships that need account review across teams
- Process bottlenecks affecting multiple departments
- Compliance gaps requiring documentation + training + system changes
- Resource mismatches requiring hiring + redistribution + planning
- Any pattern where 3+ people need to produce distinct deliverables toward a shared goal

**SITUATIONS** (single-person action required):
- A specific overdue task needing follow-up
- A single client interaction requiring response
- A document needing review by one person
- A straightforward approval or decision

Routing rule: coordinated work across multiple people with distinct deliverables -> initiative. One person can handle it -> situation.

For each pattern, provide:
- patternType: financial_risk | relationship_decline | process_bottleneck | compliance_gap | resource_mismatch | client_escalation | operational_risk | strategic_opportunity
- title: specific descriptive title
- description: what the pattern is and why it matters
- severity: low | medium | high | critical
- confidence: 0-1 (only report >= 0.6)
- routing: "initiative" or "situation"
- evidence: [{pageSlug, claim}] — which wiki pages support this
- For initiatives: proposedProject with title, description, members [{name, email, role}], deliverables [{title, description}]
- For situations: situationConfig with triggerEntityId, situationTypeSlug

Focus on systemic issues, not individual incidents. Empty array if nothing found.

Respond with ONLY valid JSON (no markdown fences): an array of detected patterns.`;

  const model = getModel("verifier");

  try {
    const response = await callLLM({
      operatorId,
      instructions: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Scan the following organizational wiki for actionable patterns:\n\n${wikiSummary}`,
        },
      ],
      model,
      maxTokens: 6000,
    });

    const text = response.text;
    // Try extractJSON for objects, fall back to manual array parse
    const cleaned = text
      .replace(/^```json\s*/m, "")
      .replace(/```\s*$/m, "")
      .trim();

    const arrStart = cleaned.indexOf("[");
    const arrEnd = cleaned.lastIndexOf("]");
    if (arrStart >= 0 && arrEnd > arrStart) {
      const patterns = JSON.parse(
        cleaned.slice(arrStart, arrEnd + 1),
      ) as DetectedPattern[];
      return Array.isArray(patterns)
        ? patterns.filter((p) => p.confidence >= 0.6)
        : [];
    }

    // Maybe it returned a single object
    const obj = extractJSON(text);
    if (obj && "patternType" in obj) {
      return (obj as unknown as DetectedPattern).confidence >= 0.6
        ? [obj as unknown as DetectedPattern]
        : [];
    }

    return [];
  } catch (err) {
    console.error("[wiki-scanner] Pattern detection failed:", err);
    return [];
  }
}

// ── Deduplication ────────────────────────────────────────

async function checkDuplicate(
  operatorId: string,
  pattern: DetectedPattern,
): Promise<boolean> {
  // Check existing initiatives with similar titles
  if (pattern.routing === "initiative") {
    const existing = await prisma.initiative.findFirst({
      where: {
        operatorId,
        status: { in: ["proposed", "approved", "executing"] },
        rationale: { contains: pattern.title, mode: "insensitive" },
      },
    });
    if (existing) return true;
  }

  // Check existing active situations with similar trigger
  if (
    pattern.routing === "situation" &&
    pattern.situationConfig?.triggerEntityId
  ) {
    const existing = await prisma.situation.findFirst({
      where: {
        operatorId,
        status: { in: ["detected", "investigating", "active", "monitoring"] },
        triggerEntityId: pattern.situationConfig.triggerEntityId,
        triggerSummary: {
          contains: pattern.title.slice(0, 50),
          mode: "insensitive",
        },
      },
    });
    if (existing) return true;
  }

  // Check evaluation log for recently scanned patterns (within 7 days)
  const recent = await prisma.evaluationLog.findFirst({
    where: {
      operatorId,
      sourceType: "wiki_scanner",
      evaluatedAt: { gte: new Date(Date.now() - 7 * 86_400_000) },
      metadata: {
        path: ["patternTitle"],
        string_contains: pattern.title.slice(0, 50),
      },
    },
  });

  return !!recent;
}

// ── Initiative Creation ──────────────────────────────────

async function createInitiativeFromPattern(
  operatorId: string,
  pattern: DetectedPattern,
): Promise<void> {
  // Resolve AI entity for attribution
  const aiEntity = await prisma.entity.findFirst({
    where: {
      operatorId,
      entityType: { slug: "ai-agent" },
      status: "active",
    },
    select: { id: true },
  });

  if (!aiEntity) {
    console.warn(
      "[wiki-scanner] Cannot create initiative — no AI entity found",
    );
    return;
  }

  // Find highest-priority active goal (optional)
  const goal = await prisma.goal.findFirst({
    where: { operatorId, status: "active" },
    orderBy: { priority: "asc" },
    select: { id: true },
  });

  const initiative = await prisma.initiative.create({
    data: {
      operatorId,
      goalId: goal?.id ?? null,
      aiEntityId: aiEntity.id,
      status: "proposed",
      rationale: `[Wiki Scanner] ${pattern.title}\n\n${pattern.description}`,
      impactAssessment: `Severity: ${pattern.severity}, Confidence: ${(pattern.confidence * 100).toFixed(0)}%\n\nEvidence:\n${pattern.evidence.map((e) => `- ${e.pageSlug}: ${e.claim}`).join("\n")}`,
      proposedProjectConfig: pattern.proposedProject
        ? {
            title: pattern.proposedProject.title,
            description: pattern.proposedProject.description,
            members: pattern.proposedProject.members,
            deliverables: pattern.proposedProject.deliverables.map((d) => ({
              title: d.title,
              description: d.description,
              assignedToEmail: "",
              format: "report",
              suggestedDeadline: null,
            })),
          }
        : undefined,
    },
  });

  // Log
  await prisma.evaluationLog.create({
    data: {
      operatorId,
      sourceType: "wiki_scanner",
      sourceId: initiative.id,
      classification: "initiative_created",
      metadata: {
        patternTitle: pattern.title,
        patternType: pattern.patternType,
        initiativeId: initiative.id,
        routing: pattern.routing,
        confidence: pattern.confidence,
      },
    },
  });

  // Notify admins
  sendNotificationToAdmins({
    operatorId,
    type: "initiative_proposed",
    title: `New initiative proposed: ${pattern.title}`,
    body: pattern.description,
    sourceType: "wiki_scanner",
    sourceId: initiative.id,
  }).catch(() => {});
}

// ── Situation Creation ───────────────────────────────────

async function createSituationFromPattern(
  operatorId: string,
  pattern: DetectedPattern,
): Promise<void> {
  if (!pattern.situationConfig) return;

  // Find matching situation type
  let situationType = await prisma.situationType.findFirst({
    where: {
      operatorId,
      archetypeSlug: pattern.situationConfig.situationTypeSlug,
    },
  });

  if (!situationType) {
    situationType = await prisma.situationType.findFirst({
      where: { operatorId, name: { contains: "Action Required" } },
    });
  }

  if (!situationType) return;

  const severityMap: Record<string, number> = {
    critical: 1.0,
    high: 0.8,
    medium: 0.5,
    low: 0.3,
  };

  const situation = await prisma.situation.create({
    data: {
      operatorId,
      situationTypeId: situationType.id,
      triggerEntityId: pattern.situationConfig.triggerEntityId,
      triggerSummary: pattern.title,
      status: "detected",
      severity: severityMap[pattern.severity] ?? 0.5,
      confidence: pattern.confidence,
      source: "wiki_scanner",
    },
  });

  // Log
  await prisma.evaluationLog.create({
    data: {
      operatorId,
      sourceType: "wiki_scanner",
      sourceId: situation.id,
      classification: "situation_created",
      metadata: {
        patternTitle: pattern.title,
        patternType: pattern.patternType,
        situationId: situation.id,
        confidence: pattern.confidence,
      },
    },
  });
}
