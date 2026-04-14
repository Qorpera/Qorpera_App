/**
 * Situation Page Parser
 *
 * Parses a situation_instance wiki page into structured sections
 * for API responses. The page content follows a known markdown format:
 *   # Title
 *   | Property | Value |  (property table)
 *   ## Trigger
 *   ## Context
 *   ## Investigation
 *   ## Action Plan
 *   ... etc.
 */

export interface ParsedSituationPage {
  title: string;
  properties: Record<string, unknown>;
  sections: {
    trigger?: string;
    context?: string;
    investigation?: string;
    actionPlan?: string;
    deliverables?: string;
    timeline?: string;
    playbookReference?: string;
    monitoringNotes?: string;
    learnings?: string;
    outcomeSummary?: string;
  };
}

const SECTION_MAP: Record<string, keyof ParsedSituationPage["sections"]> = {
  "Trigger": "trigger",
  "Context": "context",
  "Investigation": "investigation",
  "Action Plan": "actionPlan",
  "Deliverables": "deliverables",
  "Timeline": "timeline",
  "Playbook Reference": "playbookReference",
  "Monitoring Notes": "monitoringNotes",
  "Learnings": "learnings",
  "Outcome Summary": "outcomeSummary",
};

export function parseSituationPage(
  pageContent: string,
  pageProperties: Record<string, unknown> | null,
): ParsedSituationPage {
  // Extract title from first line (# Title)
  const titleMatch = pageContent.match(/^# (.+)$/m);
  const title = titleMatch?.[1] ?? "Untitled Situation";

  // Extract all ## sections
  const sectionRegex = /^## (.+)$/gm;
  const sectionHeaders: Array<{ name: string; index: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = sectionRegex.exec(pageContent)) !== null) {
    sectionHeaders.push({ name: match[1].trim(), index: match.index });
  }

  const sections: ParsedSituationPage["sections"] = {};

  for (let i = 0; i < sectionHeaders.length; i++) {
    const header = sectionHeaders[i];
    const nextIndex = i + 1 < sectionHeaders.length
      ? sectionHeaders[i + 1].index
      : pageContent.length;

    // Slice content after the "## Header\n" line
    const headerLineEnd = pageContent.indexOf("\n", header.index);
    const contentStart = headerLineEnd !== -1 ? headerLineEnd + 1 : header.index + `## ${header.name}`.length;
    const sectionContent = pageContent.slice(contentStart, nextIndex).trim();

    const key = SECTION_MAP[header.name];
    if (key && sectionContent.length > 0) {
      sections[key] = sectionContent;
    }
  }

  return {
    title,
    properties: (pageProperties ?? {}) as Record<string, unknown>,
    sections,
  };
}
