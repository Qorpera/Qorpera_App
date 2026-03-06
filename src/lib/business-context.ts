import { prisma } from "@/lib/db";

// ── Types ────────────────────────────────────────────────────────────────────

export type BusinessContext = {
  businessSummary?: string;
  painPoints?: string[];
  teamStructure?: string;
  communicationPreferences?: string;
  businessRules?: string[];
  situationTypes?: Array<{ name: string; description: string }>;
  [key: string]: unknown;
};

// ── Core ─────────────────────────────────────────────────────────────────────

export async function getBusinessContext(operatorId: string): Promise<BusinessContext | null> {
  const session = await prisma.orientationSession.findFirst({
    where: { operatorId, phase: "active" },
    orderBy: { createdAt: "desc" },
  });

  if (!session?.context) return null;

  try {
    return JSON.parse(session.context) as BusinessContext;
  } catch {
    return null;
  }
}

export function formatBusinessContext(ctx: BusinessContext): string {
  const lines: string[] = [];

  if (ctx.businessSummary) {
    lines.push(`Company: ${ctx.businessSummary}`);
  }

  if (ctx.painPoints?.length) {
    lines.push(`Key pain points:\n${ctx.painPoints.map((p) => `- ${p}`).join("\n")}`);
  }

  if (ctx.teamStructure) {
    lines.push(`Team: ${ctx.teamStructure}`);
  }

  if (ctx.communicationPreferences) {
    lines.push(`Communication: ${ctx.communicationPreferences}`);
  }

  if (ctx.businessRules?.length) {
    lines.push(`Business rules:\n${ctx.businessRules.map((r) => `- ${r}`).join("\n")}`);
  }

  if (ctx.situationTypes?.length) {
    lines.push(`Watching for:\n${ctx.situationTypes.map((s) => `- ${s.name}: ${s.description}`).join("\n")}`);
  }

  // Include any other top-level keys not already handled
  const knownKeys = new Set(["businessSummary", "painPoints", "teamStructure", "communicationPreferences", "businessRules", "situationTypes"]);
  for (const [key, value] of Object.entries(ctx)) {
    if (knownKeys.has(key) || value === undefined || value === null) continue;
    if (typeof value === "string") {
      lines.push(`${key}: ${value}`);
    } else if (Array.isArray(value)) {
      lines.push(`${key}:\n${value.map((v) => `- ${typeof v === "string" ? v : JSON.stringify(v)}`).join("\n")}`);
    }
  }

  return lines.join("\n\n");
}
