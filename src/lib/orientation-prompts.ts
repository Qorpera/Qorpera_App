import { prisma } from "@/lib/db";

// ── Types ────────────────────────────────────────────────────────────────────

type OrientationSession = {
  id: string;
  phase: string;
  context: string | null;
};

// ── Domain Data Context ──────────────────────────────────────────────────────

export async function buildDomainDataContext(operatorId: string, visibleDomains?: string[] | "all"): Promise<string> {
  const departments = await prisma.entity.findMany({
    where: {
      operatorId, category: "foundational", entityType: { slug: "domain" }, status: "active",
      ...(visibleDomains && visibleDomains !== "all" ? { id: { in: visibleDomains } } : {}),
    },
    include: { entityType: { select: { slug: true } } },
  });

  const sections: string[] = [];

  for (const dept of departments) {
    // Load home members
    const homeMembers = await prisma.entity.findMany({
      where: { operatorId, primaryDomainId: dept.id, category: "base", status: "active" },
      include: {
        propertyValues: { include: { property: { select: { slug: true } } } },
      },
    });

    // Load cross-department members via department-member relationship
    const crossRels = await prisma.relationship.findMany({
      where: {
        OR: [
          { toEntityId: dept.id, relationshipType: { slug: "domain-member" }, fromEntity: { category: "base", status: "active" } },
          { fromEntityId: dept.id, relationshipType: { slug: "domain-member" }, toEntity: { category: "base", status: "active" } },
        ],
      },
      select: { fromEntityId: true, toEntityId: true, metadata: true },
    });
    const homeMemberIds = new Set(homeMembers.map(m => m.id));
    const crossIds = crossRels
      .map(r => r.fromEntityId === dept.id ? r.toEntityId : r.fromEntityId)
      .filter(id => !homeMemberIds.has(id));
    const crossMembers = crossIds.length > 0
      ? await prisma.entity.findMany({
          where: { id: { in: crossIds }, status: "active" },
          include: { propertyValues: { include: { property: { select: { slug: true } } } } },
        })
      : [];

    const members = [...homeMembers, ...crossMembers];
    const memberNames = members.map(m => {
      // Use cross-domain role if available
      const crossRel = crossRels.find(r => r.fromEntityId === m.id || r.toEntityId === m.id);
      const crossRole = crossRel?.metadata ? JSON.parse(crossRel.metadata).role : null;
      const role = crossRole || m.propertyValues.find(pv => pv.property.slug === "role")?.value;
      return role ? `${m.displayName} (${role})` : m.displayName;
    });

    // Count digital entities linked via department-member relationships
    const digitalRelationships = await prisma.relationship.findMany({
      where: {
        OR: [
          { fromEntityId: dept.id, relationshipType: { slug: "domain-member" } },
          { toEntityId: dept.id, relationshipType: { slug: "domain-member" } },
        ],
      },
      select: { fromEntityId: true, toEntityId: true },
    });
    const linkedEntityIds = digitalRelationships
      .map(r => r.fromEntityId === dept.id ? r.toEntityId : r.fromEntityId);

    let digitalSummary = "";
    if (linkedEntityIds.length > 0) {
      const digitalEntities = await prisma.entity.findMany({
        where: { id: { in: linkedEntityIds }, category: "digital", status: "active" },
        select: { entityTypeId: true, id: true },
      });

      const countByType = new Map<string, number>();
      for (const e of digitalEntities) {
        countByType.set(e.entityTypeId, (countByType.get(e.entityTypeId) ?? 0) + 1);
      }

      if (countByType.size > 0) {
        const typeIds = [...countByType.keys()];
        const types = await prisma.entityType.findMany({
          where: { id: { in: typeIds } },
          select: { id: true, name: true },
        });
        const typeMap = new Map(types.map(t => [t.id, t.name]));
        digitalSummary = [...countByType.entries()]
          .map(([typeId, count]) => `${count} ${typeMap.get(typeId) || "items"}`)
          .join(", ");
      }
    }

    // Count external entities linked to this domain's members
    const digitalMemberIds = linkedEntityIds.length > 0
      ? (await prisma.entity.findMany({
          where: { id: { in: linkedEntityIds }, category: "digital", status: "active" },
          select: { id: true },
        })).map(e => e.id)
      : [];
    const deptMemberIds = [...members.map(m => m.id), ...digitalMemberIds];

    let externalCount = 0;
    if (deptMemberIds.length > 0) {
      const externalRels = await prisma.relationship.findMany({
        where: {
          OR: [
            { fromEntityId: { in: deptMemberIds }, toEntity: { category: "external", status: "active" } },
            { toEntityId: { in: deptMemberIds }, fromEntity: { category: "external", status: "active" } },
          ],
        },
        select: { fromEntityId: true, toEntityId: true },
      });
      const externalIds = new Set(
        externalRels.flatMap(r => [r.fromEntityId, r.toEntityId])
          .filter(id => !deptMemberIds.includes(id) && id !== dept.id)
      );
      externalCount = externalIds.size;
    }

    // Load documents
    const docs = await prisma.internalDocument.findMany({
      where: { domainId: dept.id, operatorId, status: { not: "replaced" } },
      select: { fileName: true, documentType: true },
    });
    const docNames = docs.map(d => d.fileName);

    // Build section
    let section = `DOMAIN: ${dept.displayName}`;
    if (dept.description) section += ` — ${dept.description}`;
    section += `\n  People (${members.length}): ${memberNames.join(", ") || "none"}`;
    if (digitalSummary) section += `\n  Connected data: ${digitalSummary}`;
    if (externalCount > 0) section += `\n  External entities linked: ${externalCount}`;
    if (docNames.length > 0) section += `\n  Documents: ${docNames.join(", ")}`;

    sections.push(section);
  }

  return sections.join("\n\n");
}

// ── Public ───────────────────────────────────────────────────────────────────

export async function buildOrientationSystemPrompt(
  operatorId: string,
  session: OrientationSession,
): Promise<string> {
  const deptContext = await buildDomainDataContext(operatorId);
  const existingContext = session.context ? safeParseJSON(session.context) : {};

  const operator = await prisma.operator.findUnique({
    where: { id: operatorId },
    select: { companyName: true },
  });
  const companyName = operator?.companyName || "the company";

  // Check for completed onboarding intelligence analysis
  const analysis = await prisma.onboardingAnalysis.findUnique({
    where: { operatorId },
    select: { status: true, synthesisOutput: true, uncertaintyLog: true },
  });

  const hasIntelligence = analysis &&
    (analysis.status === "confirming" || analysis.status === "complete") &&
    analysis.synthesisOutput;

  if (hasIntelligence) {
    return buildPostIntelligencePrompt(
      companyName,
      deptContext,
      existingContext,
      analysis.synthesisOutput as Record<string, unknown>,
      (analysis.uncertaintyLog as Array<Record<string, unknown>>) || [],
      operatorId,
    );
  }

  return buildManualSetupPrompt(companyName, deptContext, existingContext);
}

// ── Post-intelligence prompt (after multi-agent analysis) ────────────────────

async function buildPostIntelligencePrompt(
  companyName: string,
  deptContext: string,
  existingContext: Record<string, unknown>,
  synthesisOutput: Record<string, unknown>,
  uncertaintyLog: Array<Record<string, unknown>>,
  operatorId: string,
): Promise<string> {
  // Load situation types created by the pipeline
  const situationTypes = await prisma.situationType.findMany({
    where: { operatorId, enabled: true },
    select: { name: true, description: true, autonomyLevel: true, scopeEntityId: true },
    orderBy: { name: "asc" },
  });

  const sitTypeSummary = situationTypes.length > 0
    ? situationTypes.map((st) => `- ${st.name}: ${st.description}`).join("\n")
    : "No situation types configured yet.";

  const uncertaintySection = uncertaintyLog.length > 0
    ? uncertaintyLog.map((q, i) => {
        const question = q.question || "Unknown question";
        const context = q.context || "";
        const dept = q.domain ? ` (${q.domain})` : "";
        return `${i + 1}. ${question}${dept}${context ? `\n   Context: ${context}` : ""}`;
      }).join("\n")
    : "";

  const domains = (synthesisOutput.domains || []) as Array<Record<string, unknown>>;
  const findingsSummary = domains.map((dept) => {
    const name = dept.name || "Unknown";
    const completeness = dept.confidence || "unknown";
    return `- ${name} (data completeness: ${completeness})`;
  }).join("\n");

  const learnedSoFar = Object.keys(existingContext).length > 0
    ? `\nCONVERSATION CONTEXT FROM PRIOR TURNS:\n${JSON.stringify(existingContext, null, 2)}\n`
    : "";

  return `You are the AI operations assistant for ${companyName}. You have just completed an extensive multi-agent analysis of ${companyName}'s connected tools and data.

ORGANIZATIONAL STRUCTURE (from your analysis):
${deptContext || "No domains configured yet."}

DOMAIN DATA COVERAGE:
${findingsSummary || "No domain analysis available."}

SITUATION TYPES YOU'VE SET UP:
${sitTypeSummary}
All situation types start at "observe" — you will monitor and propose actions, but not act until the CEO promotes them.

${uncertaintySection ? `QUESTIONS YOUR ANALYSIS COULDN'T RESOLVE:\n${uncertaintySection}\n` : ""}${learnedSoFar}
YOUR GOALS IN THIS CONVERSATION:
1. Present your findings: Briefly summarize what you learned about the company — domains, team structure, key relationships. Ask if it matches reality.${uncertaintySection ? `
2. Resolve uncertainties: Work through the unresolved questions above one at a time. These are things your analysis flagged as ambiguous — the CEO's answers will improve your understanding.` : ""}
3. Validate situation types: Walk through the situation types you've set up. For each, explain what it detects and why you recommended it. Ask: "Is this something you want me to watch for? Should I adjust the scope?"
4. Discover gaps: Ask what operational challenges your analysis may have missed. "Are there problems that wouldn't show up in your emails or calendar — things that happen in hallway conversations or ad-hoc Slack threads?"
5. Set priorities: Help the CEO decide which 3-5 situation types matter most right now. These will be the first ones you actively monitor.

IMPORTANT RULES:
- Reference specific findings from your analysis when possible. "I noticed [specific pattern] in your [data source]" is better than generic questions.
- When creating NEW situation types (beyond what the analysis recommended), ALWAYS scope them to a specific domain using the scopeDomainName parameter.
- Don't repeat information the CEO has already confirmed. Build on what you know.
- Keep the conversation practical and forward-looking — the analysis is done, now you're calibrating.
- The user will click "Complete Orientation" when they're done. Don't try to end the conversation yourself.`;
}

// ── Manual setup prompt (no onboarding intelligence) ─────────────────────────

function buildManualSetupPrompt(
  companyName: string,
  deptContext: string,
  existingContext: Record<string, unknown>,
): string {
  const businessContext = existingContext.industry
    ? `Industry: ${existingContext.industry}`
    : "";

  const learnedSoFar = Object.keys(existingContext).length > 0
    ? `\nWHAT YOU'VE LEARNED SO FAR:\n${JSON.stringify(existingContext, null, 2)}\n`
    : "";

  return `You are the AI operations assistant for ${companyName}. You are in orientation mode — learning how this business works so you can help manage its operations.

ORGANIZATIONAL STRUCTURE:
${deptContext || "No domains configured yet."}

${businessContext ? `BUSINESS CONTEXT:\n${businessContext}\n` : ""}${learnedSoFar}
YOUR GOALS IN THIS CONVERSATION:
1. Confirm the data looks correct: "Here's what I see in your domains — does this look right?"
2. Understand pain points: "What operational problems keep you up at night?" Ask which domain each problem mostly affects.
3. Understand processes: "Walk me through what happens when [situation] occurs — who handles it, what tools do they use?"
4. Create situation types: For each pain point, create a situation type with detection logic, scoped to the relevant domain.
5. Reference documents: If a domain has uploaded documents, mention them. "I've read your [document name] — I see [relevant detail]."

IMPORTANT RULES:
- When creating situation types, ALWAYS scope them to a specific domain using the scopeDomainName parameter.
- Ask about each domain's specific challenges — don't treat the company as monolithic.
- When the user describes a problem, ask: "Which domain does this mostly affect?"
- Keep the conversation focused and practical. You're learning how to help, not conducting an interview.
- The user will click "Complete Orientation" when they're done. Don't try to end the conversation yourself.`;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function safeParseJSON(str: string): Record<string, unknown> {
  try {
    return JSON.parse(str);
  } catch {
    return {};
  }
}
