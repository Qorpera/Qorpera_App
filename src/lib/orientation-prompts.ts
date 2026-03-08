import { prisma } from "@/lib/db";

// ── Types ────────────────────────────────────────────────────────────────────

type OrientationSession = {
  id: string;
  phase: string;
  context: string | null;
};

// ── Department Data Context ─────────────────────────────────────────────────

export async function buildDepartmentDataContext(operatorId: string): Promise<string> {
  const departments = await prisma.entity.findMany({
    where: { operatorId, category: "foundational", entityType: { slug: "department" }, status: "active" },
    include: { entityType: { select: { slug: true } } },
  });

  const sections: string[] = [];

  for (const dept of departments) {
    // Load members
    const members = await prisma.entity.findMany({
      where: { operatorId, parentDepartmentId: dept.id, category: "base", status: "active" },
      include: {
        propertyValues: { include: { property: { select: { slug: true } } } },
      },
    });
    const memberNames = members.map(m => {
      const role = m.propertyValues.find(pv => pv.property.slug === "role")?.value;
      return role ? `${m.displayName} (${role})` : m.displayName;
    });

    // Count digital entities by type
    const digitalCounts = await prisma.entity.groupBy({
      by: ["entityTypeId"],
      where: { operatorId, parentDepartmentId: dept.id, category: "digital", status: "active" },
      _count: true,
    });
    const typeIds = digitalCounts.map(c => c.entityTypeId);
    const types = typeIds.length > 0
      ? await prisma.entityType.findMany({ where: { id: { in: typeIds } }, select: { id: true, name: true } })
      : [];
    const typeMap = new Map(types.map(t => [t.id, t.name]));
    const digitalSummary = digitalCounts
      .map(c => `${c._count} ${typeMap.get(c.entityTypeId) || "items"}`)
      .join(", ");

    // Count external entities linked to this department
    const externalCount = await prisma.relationship.count({
      where: {
        toEntityId: dept.id,
        relationshipType: { slug: "department-member" },
        fromEntity: { category: "external" },
      },
    });

    // Load documents
    const docs = await prisma.internalDocument.findMany({
      where: { departmentId: dept.id, operatorId, status: { not: "replaced" } },
      select: { fileName: true, documentType: true },
    });
    const docNames = docs.map(d => d.fileName);

    // Build section
    let section = `DEPARTMENT: ${dept.displayName}`;
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
  const deptContext = await buildDepartmentDataContext(operatorId);
  const existingContext = session.context ? safeParseJSON(session.context) : {};

  // Get company name
  const operator = await prisma.operator.findUnique({
    where: { id: operatorId },
    select: { companyName: true },
  });
  const companyName = operator?.companyName || "the company";

  const businessContext = existingContext.industry
    ? `Industry: ${existingContext.industry}`
    : "";

  const learnedSoFar = Object.keys(existingContext).length > 0
    ? `\nWHAT YOU'VE LEARNED SO FAR:\n${JSON.stringify(existingContext, null, 2)}\n`
    : "";

  return `You are the AI operations assistant for ${companyName}. You are in orientation mode — learning how this business works so you can help manage its operations.

ORGANIZATIONAL STRUCTURE:
${deptContext || "No departments configured yet."}

${businessContext ? `BUSINESS CONTEXT:\n${businessContext}\n` : ""}${learnedSoFar}
YOUR GOALS IN THIS CONVERSATION:
1. Confirm the data looks correct: "Here's what I see in your departments — does this look right?"
2. Understand pain points: "What operational problems keep you up at night?" Ask which department each problem mostly affects.
3. Understand processes: "Walk me through what happens when [situation] occurs — who handles it, what tools do they use?"
4. Create situation types: For each pain point, create a situation type with detection logic, scoped to the relevant department.
5. Reference documents: If a department has uploaded documents, mention them. "I've read your [document name] — I see [relevant detail]."

IMPORTANT RULES:
- When creating situation types, ALWAYS scope them to a specific department using the scopeDepartmentName parameter.
- Ask about each department's specific challenges — don't treat the company as monolithic.
- When the user describes a problem, ask: "Which department does this mostly affect?"
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
