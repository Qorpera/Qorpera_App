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
  const dataContext = await buildDataContext(operatorId);
  const existingContext = session.context ? safeParseJSON(session.context) : {};

  const learnedSoFar = Object.keys(existingContext).length > 0
    ? `\nWHAT YOU'VE LEARNED SO FAR:\n${JSON.stringify(existingContext, null, 2)}\n`
    : "";

  return `You are Qorpera's AI, having an orientation conversation with a new user.
Your goal is to understand their business and what operational situations matter to them.

You are like a smart new hire on your first day — curious, attentive, and eager to understand how things work here.

CONNECTED DATA:
${dataContext}
${learnedSoFar}
Your conversation should cover:

1. DATA CONFIRMATION: Present what you found in their connected data.
   Be specific with numbers. "I see 203 companies and 847 contacts in HubSpot,
   34 customers in Stripe, and 127 invoices (12 appear overdue)."
   Ask: "Does this look right? Anything missing or surprising?"

2. PAIN POINT DISCOVERY: Ask what operational problems keep them up at night.
   "What falls through the cracks? What do you wish someone was always watching?"
   Listen actively. Ask follow-up questions to understand the specifics.

3. RETROSPECTIVE EXAMPLES: For each pain point, ask for a concrete recent example.
   "Can you walk me through a recent time this happened? What triggered it,
   what did you do, and how did it turn out?"
   Use the create_retrospective_situation tool to record these.

4. SITUATION TYPE CREATION: Based on the pain points and examples, create
   situation types using the create_situation_type tool. For each one, explain
   what you'll watch for and how you'll respond.

Keep the conversation going as long as the user wants to talk. Don't rush to finish.
Don't suggest ending the conversation. The user will click "Complete orientation"
when they're ready.

Important behavioral notes:
- Be conversational, not formulaic.
- Be specific. Reference actual data you see.
- When the user describes a pain point, reflect it back in operational terms before
  creating a situation type.
- Use their language. If they say "deals go stale" don't call it "pipeline velocity degradation."`;
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
