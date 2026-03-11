import { prisma } from "@/lib/db";

// ── Types ────────────────────────────────────────────────────────────────────

type OrientationSession = {
  id: string;
  phase: string;
  context: string | null;
};

// ── Department Data Context ─────────────────────────────────────────────────

export async function buildDepartmentDataContext(operatorId: string, visibleDepts?: string[] | "all"): Promise<string> {
  const departments = await prisma.entity.findMany({
    where: {
      operatorId, category: "foundational", entityType: { slug: "department" }, status: "active",
      ...(visibleDepts && visibleDepts !== "all" ? { id: { in: visibleDepts } } : {}),
    },
    include: { entityType: { select: { slug: true } } },
  });

  const sections: string[] = [];

  for (const dept of departments) {
    // Load home members
    const homeMembers = await prisma.entity.findMany({
      where: { operatorId, parentDepartmentId: dept.id, category: "base", status: "active" },
      include: {
        propertyValues: { include: { property: { select: { slug: true } } } },
      },
    });

    // Load cross-department members via department-member relationship
    const crossRels = await prisma.relationship.findMany({
      where: {
        OR: [
          { toEntityId: dept.id, relationshipType: { slug: "department-member" }, fromEntity: { category: "base", status: "active" } },
          { fromEntityId: dept.id, relationshipType: { slug: "department-member" }, toEntity: { category: "base", status: "active" } },
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
      // Use cross-department role if available
      const crossRel = crossRels.find(r => r.fromEntityId === m.id || r.toEntityId === m.id);
      const crossRole = crossRel?.metadata ? JSON.parse(crossRel.metadata).role : null;
      const role = crossRole || m.propertyValues.find(pv => pv.property.slug === "role")?.value;
      return role ? `${m.displayName} (${role})` : m.displayName;
    });

    // Count digital entities linked via department-member relationships
    const digitalRelationships = await prisma.relationship.findMany({
      where: {
        OR: [
          { fromEntityId: dept.id, relationshipType: { slug: "department-member" } },
          { toEntityId: dept.id, relationshipType: { slug: "department-member" } },
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

    // Count external entities linked to this department's members
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
