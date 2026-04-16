import { PAGE_SCHEMAS, WIKI_STYLE_RULES, buildPropertyPrompt, buildSectionPrompt } from "@/lib/wiki/page-schemas";
import type { InitiativePrimaryDeliverable, InitiativeDownstreamEffect } from "@/lib/reasoning-types";

export interface DownstreamInvestigationInput {
  initiativeTitle: string;
  initiativePageContent: string;
  primary: InitiativePrimaryDeliverable;
  effect: InitiativeDownstreamEffect;
  targetPageCurrentContent: string | null;
  targetPageCurrentProperties: Record<string, unknown> | null;
  businessContext: string | null;
  companyName: string | null;
}

export function buildDownstreamSystemPrompt(input: DownstreamInvestigationInput): string {
  const { effect } = input;
  const targetType = effect.targetPageType;

  const parts: string[] = [];
  parts.push(`You are investigating a downstream effect of a primary initiative change, and producing the concrete content the downstream page needs.

The primary change has already been approved by a user. Your job:
1. Read the downstream target page and any cross-references needed to understand context
2. Produce the complete new content for the downstream target that reflects the primary change
3. Flag concerns if the downstream change would break something

**You are NOT regenerating the primary deliverable.** The primary is already decided and approved.`);

  if (input.companyName) parts.push(`Company: ${input.companyName}`);
  if (input.businessContext) parts.push(`\nBUSINESS CONTEXT:\n${input.businessContext}`);

  parts.push(`\n## Investigation Budget

You have up to 6 tool calls. Use them efficiently:
- read_wiki_page for the target page (already provided in seed context — skip if you have what you need)
- read_wiki_page for any page referenced as critical context
- search_wiki for related concepts if needed

Stop investigating as soon as you have enough to write the proposedContent confidently.`);

  if (effect.changeType === "update" && targetType && PAGE_SCHEMAS[targetType]) {
    parts.push(`\n## Task: update

Produce the COMPLETE new content for this existing page. The user will see a diff.

${buildSectionPrompt(targetType)}

${buildPropertyPrompt(targetType)}

${WIKI_STYLE_RULES}`);
  } else if (effect.changeType === "create" && targetType && PAGE_SCHEMAS[targetType]) {
    parts.push(`\n## Task: create

Produce the COMPLETE new page content from scratch following the template.

${buildSectionPrompt(targetType)}

${buildPropertyPrompt(targetType)}

${WIKI_STYLE_RULES}`);
  } else if (effect.changeType === "review") {
    parts.push(`\n## Task: review

This is a review-only effect — no content change is required. Return the current page content unchanged in proposedContent, and flag any concerns you discover during investigation. If review reveals that an update IS actually needed, return updated content AND flag a warning that the reasoning-engine scope may have been incorrect.`);
  }

  parts.push(`\n## Output format

Return ONLY this JSON (no prose, no markdown fence):

{
  "proposedContent": "...",
  "proposedProperties": { ... } | null,
  "concerns": [
    { "description": "...", "severity": "warning" | "blocking", "recommendation": "..." }
  ]
}

## Concern guidelines

Flag as "blocking":
- Your proposed change would contradict a specific fact on another wiki page you investigated
- The primary deliverable's targetPageSlug doesn't exist and it was supposed to be an update
- Your proposed change breaks cross-references that point to pages that no longer exist
- The reasoning engine told you to update this page but the effect doesn't actually apply given current state (e.g., the person you're supposed to reassign has already left)

Flag as "warning":
- The downstream effect has multiple reasonable interpretations and you picked one
- You're overwriting content that was last edited by a human within a week
- You're uncertain about a cross-reference you included

Empty concerns array is correct when nothing is amiss.`);

  return parts.join("\n");
}

export function buildDownstreamSeedContext(input: DownstreamInvestigationInput): string {
  const { effect, primary, targetPageCurrentContent, targetPageCurrentProperties } = input;

  const parts: string[] = [];

  parts.push(`## INITIATIVE BEING IMPLEMENTED
${input.initiativeTitle}

Investigation / proposal:
${input.initiativePageContent}`);

  parts.push(`\n## PRIMARY DELIVERABLE (already approved by user)

Type: ${primary.type}
Target: ${primary.targetPageSlug ?? "(new)"}${primary.targetPageType ? ` (${primary.targetPageType})` : ""}
Title: ${primary.title}

Description:
${primary.description}

Proposed content (first 2000 chars):
${(primary.proposedContent ?? "").slice(0, 2000)}`);

  parts.push(`\n## THIS DOWNSTREAM EFFECT

Target page: [[${effect.targetPageSlug}]] (${effect.targetPageType})
Change type: ${effect.changeType}
Summary from reasoning engine: ${effect.summary}`);

  if (targetPageCurrentContent !== null) {
    parts.push(`\n## CURRENT TARGET PAGE CONTENT

${targetPageCurrentContent}`);

    if (targetPageCurrentProperties) {
      parts.push(`\n## CURRENT TARGET PAGE PROPERTIES

${JSON.stringify(targetPageCurrentProperties, null, 2)}`);
    }
  } else if (effect.changeType !== "create") {
    parts.push(`\n## TARGET PAGE NOT FOUND

The target page [[${effect.targetPageSlug}]] does not exist. If changeType is "update", this is a blocking concern — the reasoning engine referenced a page that isn't here. If changeType is "create", proceed to generate new content.`);
  }

  parts.push(`\n## Your task

Investigate and produce the JSON output described in the system prompt. Budget: 6 tool calls maximum.`);

  return parts.join("\n");
}
