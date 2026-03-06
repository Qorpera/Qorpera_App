import { prisma } from "@/lib/db";
import { listEntityTypes } from "@/lib/entity-model-store";

// ── Types ────────────────────────────────────────────────────────────────────

type OrientationSession = {
  id: string;
  phase: string;
  context: string | null;
};

// ── Public ───────────────────────────────────────────────────────────────────

export async function buildOrientationSystemPrompt(
  operatorId: string,
  session: OrientationSession,
): Promise<string> {
  if (session.phase === "orienting") {
    return buildOrientingPrompt(operatorId, session);
  }
  if (session.phase === "confirming") {
    return buildConfirmingPrompt(operatorId, session);
  }
  throw new Error(`Unexpected orientation phase: ${session.phase}`);
}

// ── Orienting ────────────────────────────────────────────────────────────────

async function buildOrientingPrompt(
  operatorId: string,
  session: OrientationSession,
): Promise<string> {
  const dataContext = await buildDataContext(operatorId);
  const existingContext = session.context ? safeParseJSON(session.context) : {};

  const learnedSoFar = Object.keys(existingContext).length > 0
    ? `\nWHAT YOU'VE LEARNED SO FAR:\n${JSON.stringify(existingContext, null, 2)}\n`
    : "";

  return `You are Qorpera's AI, conducting an orientation conversation with a new user.
Your goal is to understand their business and what operational situations matter to them.

You are like a smart new hire on your first day — curious, attentive, and eager to understand how things work here.

CONNECTED DATA:
${dataContext}
${learnedSoFar}
Follow this conversation flow naturally (don't be robotic about phases — let the conversation breathe):

1. DATA CONFIRMATION: Start by presenting what you found in their connected data.
   Be specific with numbers. "I see 203 companies and 847 contacts in your data,
   34 customers, and 127 invoices (12 appear overdue)."
   Ask: "Does this look right? Anything missing or surprising?"

2. PAIN POINT DISCOVERY: Ask what operational problems keep them up at night.
   "What falls through the cracks? What do you wish someone was always watching?"
   Listen actively. Ask follow-up questions to understand the specifics.

3. RETROSPECTIVE EXAMPLES: For each pain point, ask for a concrete recent example.
   "Can you walk me through a recent time [pain point] happened? What triggered it,
   what did you do, and how did it turn out?"
   Use the create_retrospective_situation tool to record these as learning examples.

4. SITUATION TYPE CREATION: Based on the pain points and examples, generate
   situation types. For each one, explain what you'll watch for and how you'll respond.
   Use the create_situation_type tool to create each one.

5. TRANSITION: When you've covered all pain points and created situation types,
   call advance_to_confirming to move to the confirmation phase.

Important behavioral notes:
- Be conversational, not formulaic. A real conversation has natural transitions.
- Be specific. Reference actual data you see. "Your average deal cycle is 23 days"
  not "I can see your deal data."
- When the user describes a pain point, reflect it back in operational terms before
  creating a situation type. "So if I understand right, the risk is that invoices go
  14+ days overdue without anyone noticing, and by then the relationship is strained."
- Don't rush. If they have 4 pain points, take time with each one.
- Use their language. If they say "deals go stale" don't call it "pipeline velocity degradation."`;
}

// ── Confirming ───────────────────────────────────────────────────────────────

async function buildConfirmingPrompt(
  operatorId: string,
  session: OrientationSession,
): Promise<string> {
  const situationTypes = await prisma.situationType.findMany({
    where: { operatorId },
    orderBy: { createdAt: "desc" },
  });

  const existingContext = session.context ? safeParseJSON(session.context) : {};

  const typeSummary = situationTypes.length > 0
    ? situationTypes
        .map((t) => `- ${t.name} (${t.slug}): ${t.description} [${t.autonomyLevel}]`)
        .join("\n")
    : "No situation types created yet.";

  return `You've completed the orientation conversation. Present a summary of what you've learned
and what you'll watch for.

BUSINESS CONTEXT:
${JSON.stringify(existingContext, null, 2)}

SITUATION TYPES CREATED:
${typeSummary}

Format it clearly:
1. Brief summary of business understanding
2. For each situation type: what you'll watch for, how you'll respond, and that it starts
   in supervised mode (you'll always ask before acting)
3. Ask if anything should be adjusted — any types to remove, modify, or add?

If they want changes, use create_situation_type for additions and explain you'll adjust
existing ones.

When they confirm everything looks good, call complete_orientation.
End with something like: "Great — I'm now watching your data. You'll see situations
appear in your feed as I detect them. For the first while, I'll always ask before
taking action."`;
}

// ── Data Context Builder ─────────────────────────────────────────────────────

async function buildDataContext(operatorId: string): Promise<string> {
  const [entityTypes, connectors, totalRelationships, relTypes] = await Promise.all([
    listEntityTypes(operatorId),
    prisma.sourceConnector.findMany({
      where: { operatorId, status: "active" },
      select: { provider: true, name: true },
    }),
    prisma.relationship.count({ where: { fromEntity: { operatorId } } }),
    prisma.relationshipType.findMany({
      where: { operatorId },
      select: { name: true, slug: true },
    }),
  ]);

  const lines: string[] = [];

  if (connectors.length > 0) {
    lines.push("Connected sources:");
    for (const c of connectors) {
      lines.push(`- ${c.name || c.provider} (${c.provider})`);
    }
  } else {
    lines.push("No connected sources.");
  }

  if (entityTypes.length > 0) {
    lines.push("\nEntity types discovered:");
    for (const t of entityTypes) {
      const props = t.properties.map((p) => p.name).join(", ");
      lines.push(`- ${t.name} (${t.slug}): ${t._count.entities} entities — properties: ${props || "none"}`);
    }
  } else {
    lines.push("\nNo entity types configured yet.");
  }

  const totalEntities = entityTypes.reduce((sum, t) => sum + t._count.entities, 0);
  lines.push(`\nTotal entities: ${totalEntities}`);
  lines.push(`Total relationships: ${totalRelationships}`);

  if (relTypes.length > 0) {
    lines.push("\nRelationship types:");
    for (const rt of relTypes) {
      lines.push(`- ${rt.name} (${rt.slug})`);
    }
  }

  return lines.join("\n");
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function safeParseJSON(str: string): Record<string, unknown> {
  try {
    return JSON.parse(str);
  } catch {
    return {};
  }
}
