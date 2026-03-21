/**
 * Simple exact-match citation parser for reasoning output.
 *
 * Checks if reasoning text references known context section names.
 * Deliberately simple — Day 19 hardens with fuzzy matching for paraphrased references.
 */

const KNOWN_SECTIONS = [
  "entity_properties",
  "activity_timeline",
  "communication_context",
  "cross_department_signals",
  "operational_knowledge",
  "learned_behaviors",
  "governance_policies",
  "entity_relationships",
] as const;

export type KnownSection = (typeof KNOWN_SECTIONS)[number];

export function parseCitedSections(reasoningText: string): string[] {
  const cited: string[] = [];
  const lowerText = reasoningText.toLowerCase();

  for (const section of KNOWN_SECTIONS) {
    const underscoreForm = section.toLowerCase();
    const spaceForm = section.replace(/_/g, " ").toLowerCase();

    if (lowerText.includes(underscoreForm) || lowerText.includes(spaceForm)) {
      cited.push(section);
    }
  }

  return cited;
}
