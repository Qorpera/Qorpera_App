/**
 * Initiative Page Parser
 *
 * Parses an initiative wiki page into structured sections for API responses.
 * The page content follows the template enforced by initiative-reasoning-prompts.ts:
 *   ## Trigger
 *   ## Evidence
 *   ## Investigation
 *   ## Proposal
 *   ## Primary Deliverable      (narrative — structured version lives in properties.primary_deliverable)
 *   ## Downstream Effects       (narrative — structured version lives in properties.downstream_effects)
 *   ## Impact Assessment
 *   ## Alternatives Considered
 *   ## Timeline
 */

export interface ParsedInitiativePage {
  sections: {
    trigger?: string;
    evidence?: string;
    investigation?: string;
    proposal?: string;
    primaryDeliverable?: string;
    downstreamEffects?: string;
    impactAssessment?: string;
    alternativesConsidered?: string;
    timeline?: string;
  };
  evidenceItems: Array<{ slug: string | null; claim: string }>;
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

export function parseInitiativePage(content: string | null | undefined): ParsedInitiativePage {
  if (!content) {
    return { sections: {}, evidenceItems: [] };
  }

  const sections: ParsedInitiativePage["sections"] = {
    trigger: extractSection(content, "Trigger"),
    evidence: extractSection(content, "Evidence"),
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
  };
}
