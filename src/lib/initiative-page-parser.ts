/**
 * Initiative Page Parser
 *
 * Parses an initiative wiki page into structured sections for API responses.
 * The page content follows the template enforced by initiative-reasoning-prompts.ts:
 *   ## Trigger
 *   ## Evidence
 *   ## Dashboard                (JSON payload in fenced json block — see initiative-dashboard-types.ts)
 *   ## Investigation
 *   ## Proposal
 *   ## Primary Deliverable      (narrative — structured version lives in properties.primary_deliverable)
 *   ## Downstream Effects       (narrative — structured version lives in properties.downstream_effects)
 *   ## Impact Assessment
 *   ## Alternatives Considered
 *   ## Timeline
 */

import type { DashboardCard } from "@/lib/initiative-dashboard-types";
import { DashboardCardSchema, InitiativeDashboardSchema } from "@/lib/initiative-dashboard-types";

export interface ParsedInitiativePage {
  sections: {
    trigger?: string;
    evidence?: string;
    dashboard?: string;
    investigation?: string;
    proposal?: string;
    primaryDeliverable?: string;
    downstreamEffects?: string;
    impactAssessment?: string;
    alternativesConsidered?: string;
    timeline?: string;
  };
  evidenceItems: Array<{ slug: string | null; claim: string }>;
  dashboard: ParsedDashboard;
}

export interface ParsedDashboard {
  cards: DashboardCard[];
  failedCards: Array<{
    index: number;
    claim: string | null;
    explanation: string | null;
    error: string;
  }>;
  fallback: "prose_only" | null;
  parseError: string | null;
}

function emptyDashboard(): ParsedDashboard {
  return { cards: [], failedCards: [], fallback: null, parseError: null };
}

function extractSection(content: string, heading: string): string | undefined {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`## ${escaped}\\s*\\n([\\s\\S]*?)(?=\\n## |\\n$|$)`, "i");
  return content.match(re)?.[1]?.trim() || undefined;
}

function parseEvidenceBullets(evidenceSection: string | undefined): Array<{ slug: string | null; claim: string }> {
  if (!evidenceSection) return [];
  const lines = evidenceSection.split("\n").filter(l => l.trim().startsWith("-"));
  return lines
    .map(line => {
      const match = line.match(/-\s*(?:\[\[([^\]]+)\]\]:?\s*)?(.+)$/);
      return {
        slug: match?.[1] ?? null,
        claim: (match?.[2] ?? line.replace(/^-\s*/, "")).trim(),
      };
    })
    .filter(e => e.claim.length > 0);
}

function extractJsonBlock(sectionText: string): string | null {
  const match = sectionText.match(/```json\s*\n([\s\S]*?)\n```/);
  return match?.[1] ?? null;
}

function parseDashboardSection(sectionText: string | undefined): ParsedDashboard {
  if (!sectionText) return emptyDashboard();

  const jsonText = extractJsonBlock(sectionText);
  if (jsonText === null) {
    return {
      cards: [],
      failedCards: [],
      fallback: null,
      parseError: "no json block in dashboard section",
    };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      cards: [],
      failedCards: [],
      fallback: null,
      parseError: `invalid json: ${message}`,
    };
  }

  const whole = InitiativeDashboardSchema.safeParse(raw);
  if (whole.success) {
    return {
      cards: whole.data.cards,
      failedCards: [],
      fallback: whole.data.fallback ?? null,
      parseError: null,
    };
  }

  // Whole-object parse failed — fall back to per-card parsing so valid cards still render.
  const cards: DashboardCard[] = [];
  const failedCards: ParsedDashboard["failedCards"] = [];
  const rawObj = (raw ?? {}) as Record<string, unknown>;
  const rawCards = Array.isArray(rawObj.cards) ? (rawObj.cards as unknown[]) : [];

  rawCards.forEach((entry, index) => {
    const result = DashboardCardSchema.safeParse(entry);
    if (result.success) {
      cards.push(result.data);
      return;
    }
    const entryObj = (entry ?? {}) as Record<string, unknown>;
    failedCards.push({
      index,
      claim: typeof entryObj.claim === "string" ? entryObj.claim : null,
      explanation: typeof entryObj.explanation === "string" ? entryObj.explanation : null,
      error: result.error.issues[0]?.message ?? "schema mismatch",
    });
  });

  const fallback = rawObj.fallback === "prose_only" ? "prose_only" : null;

  return { cards, failedCards, fallback, parseError: null };
}

export function parseInitiativePage(content: string | null | undefined): ParsedInitiativePage {
  if (!content) {
    return { sections: {}, evidenceItems: [], dashboard: emptyDashboard() };
  }

  const sections: ParsedInitiativePage["sections"] = {
    trigger: extractSection(content, "Trigger"),
    evidence: extractSection(content, "Evidence"),
    dashboard: extractSection(content, "Dashboard"),
    investigation: extractSection(content, "Investigation"),
    proposal: extractSection(content, "Proposal"),
    primaryDeliverable: extractSection(content, "Primary Deliverable"),
    downstreamEffects: extractSection(content, "Downstream Effects"),
    impactAssessment: extractSection(content, "Impact Assessment"),
    alternativesConsidered: extractSection(content, "Alternatives Considered"),
    timeline: extractSection(content, "Timeline"),
  };

  return {
    sections,
    evidenceItems: parseEvidenceBullets(sections.evidence),
    dashboard: parseDashboardSection(sections.dashboard),
  };
}
