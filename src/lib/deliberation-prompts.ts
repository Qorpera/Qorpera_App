import type { LearnedPreference } from "@/lib/deliberation-types";
import type { ParsedActionStep } from "@/lib/wiki-execution-engine";

// ── Drafting context types ───────────────────────────────────────────────────

export interface DraftingContext {
  /** The full situation page content (markdown) for context. */
  situationPageContent: string;
  /** Sender info — usually derived from operator company data. */
  senderName: string;
  /** Recipient communication_pattern page snippets by recipient slug. Empty if no page exists. */
  recipientPatterns: Array<{ slug: string; title: string; content: string }>;
  /** Last 5 outbound messages from sender to the relevant recipient(s). */
  senderVoiceSamples: Array<{ excerpt: string; recipient: string; timestamp: string }>;
  /** Learned preferences in scope (person + situation_type). */
  learnedPreferences: LearnedPreference[];
  /** Situation type name for context. */
  situationTypeName: string;
}

// ── Fork Identification Prompt ───────────────────────────────────────────────

export function buildForkIdentificationPrompt(input: {
  context: DraftingContext;
  steps: ParsedActionStep[];
}): { system: string; user: string } {
  const system = `You are a senior consultant reviewing drafted content and action plans before they go out. Your job: identify DECISIONS that should go to the operator for input, not mediocre drafts that need polishing.

You return a JSON list of "forks" — decision points that qualify for operator input.

A FORK QUALIFIES ONLY IF ALL OF THESE ARE TRUE:
1. There are 2+ defensible options — genuinely different paths, not just different phrasings.
2. The choice materially changes the recipient's next move OR the situation outcome.
3. The right answer depends on relationship context, organizational judgment, or partner priorities the model cannot infer from the situation alone.

FORKS INCLUDE (positive examples):
- "Offer a payment extension, or insist on original terms" — recipient's next move differs.
- "Loop in the CFO now, or handle direct with the CEO" — outcome (who holds the decision) differs.
- "Lead the memo with operational risk, or with market headwinds" — reader's mental model is shaped differently.

FORKS DO NOT INCLUDE (negative examples — these are NOT forks, handle silently):
- "Formal vs casual tone" — tone is a register choice, not a decision.
- "Short greeting vs long greeting" — phrasing, not material.
- "CC the finance lead or not" — if a prior pattern exists, apply it; if no pattern, pick defensively and log.
- "Which day to schedule the meeting" — operational detail, pick a reasonable default.

CONSTRAINTS:
- Return AT MOST 3 forks. If you identify more, collapse related ones or pick the 2–3 most consequential.
- Each fork must have 2–3 options. Each option: a short label (≤120 chars, NO colons, NO em-dashes) and a hint explaining when to pick it (10–300 chars).
- Affected step orders: list the step orders where this fork changes the drafted content.
- Material rationale: 1–2 sentences explaining why this qualifies. Used for logging, not shown to the operator.

OUTPUT FORMAT (strict JSON):
{
  "forks": [
    {
      "dimension": "short label",
      "question": "the question to ask the operator",
      "options": [
        { "label": "option A", "hint": "when to pick A" },
        { "label": "option B", "hint": "when to pick B" }
      ],
      "affectedStepOrders": [1, 2],
      "preferenceScope": { "type": "person" | "situation_type", "scopeSlug": "..." },
      "materialityRationale": "why this qualifies"
    }
  ]
}

If no forks qualify, return { "forks": [] }. That is the common case — don't manufacture forks.`;

  const userParts: string[] = [];
  userParts.push(`SITUATION TYPE: ${input.context.situationTypeName}`);
  userParts.push(`\nSITUATION PAGE:\n${input.context.situationPageContent}`);

  if (input.context.recipientPatterns.length > 0) {
    const patterns = input.context.recipientPatterns.map(p =>
      `### ${p.title} ([[${p.slug}]])\n${p.content.slice(0, 2000)}`
    ).join("\n\n");
    userParts.push(`\nRECIPIENT COMMUNICATION PATTERNS:\n${patterns}`);
  } else {
    userParts.push(`\nRECIPIENT COMMUNICATION PATTERNS: (none on file — treat as neutral baseline)`);
  }

  if (input.context.senderVoiceSamples.length > 0) {
    const samples = input.context.senderVoiceSamples.map(s =>
      `[${s.timestamp}] to ${s.recipient}:\n${s.excerpt.slice(0, 500)}`
    ).join("\n\n");
    userParts.push(`\nSENDER VOICE SAMPLES (recent outbound from ${input.context.senderName}):\n${samples}`);
  }

  if (input.context.learnedPreferences.length > 0) {
    const prefs = input.context.learnedPreferences.map(p =>
      `- ${p.dimension} [${p.scope.type}]: preferred "${p.preferredChoice}" (conf ${p.confidence.toFixed(2)}, sample ${p.recencyWeightedSample.toFixed(1)})`
    ).join("\n");
    userParts.push(`\nLEARNED PREFERENCES IN SCOPE:\n${prefs}\n\nNote: a fork that aligns with an above preference will be auto-resolved by the system. Surface a fork only if the decision dimension is meaningfully different from any of these, OR if the preference has low confidence (<0.8).`);
  }

  userParts.push(`\nACTION STEPS WITH DRAFTED CONTENT:`);
  for (const step of input.steps) {
    const paramsStr = step.params ? JSON.stringify(step.params, null, 2) : "(no params)";
    userParts.push(`\n### Step ${step.order}: ${step.title}
Type: ${step.actionType}${step.capabilityName ? ` (capability: ${step.capabilityName})` : ""}
Preview type: ${step.previewType ?? "(none)"}
Description: ${step.description}
Params:\n\`\`\`json\n${paramsStr}\n\`\`\``);
  }

  userParts.push(`\nIdentify forks per the criteria above. Return JSON only.`);

  return { system, user: userParts.join("\n") };
}

// ── Draft Refinement Prompt ──────────────────────────────────────────────────

export function buildDraftRefinementPrompt(input: {
  context: DraftingContext;
  steps: ParsedActionStep[];
  resolvedDecisions: Array<{
    dimension: string;
    choice: string;
    affectedStepOrders: number[];
  }>;
  stepsToRefine: number[];
}): { system: string; user: string } {
  const system = `You are refining drafted content for an action plan so it reads as if it were written by the actual sender, to the actual recipient, in their real relationship context.

Your job is NOT to second-guess the plan. The action plan, recipient, and capabilities are fixed. You adjust the drafted content (params) so it:
1. Matches the register evident in the recipient's communication pattern (if one exists).
2. Matches the sender's voice (if samples are provided).
3. Applies the resolved decisions — tone, framing, scope — as chosen.
4. Stays factually identical to the original draft. Do not invent details, do not change recipients, do not add or remove recipients, do not change amounts or dates.

Output format (strict JSON):
{
  "refinedSteps": [
    { "order": 1, "params": { ... refined params for this step ... } },
    { "order": 3, "params": { ... } }
  ]
}

Return only the steps in "stepsToRefine". For each, return the complete refined params object — not a diff. Preserve all field keys (to, cc, subject, body, etc.); you only change the VALUES. Fields unrelated to drafted content (like entityId, amounts, recipient addresses) must be preserved verbatim.

If a step's original draft is already fine, return the original params unchanged. If it needs refinement, rewrite only the text content fields (body, message, subject if improvable).`;

  const userParts: string[] = [];
  userParts.push(`SITUATION TYPE: ${input.context.situationTypeName}`);
  userParts.push(`\nSITUATION PAGE:\n${input.context.situationPageContent}`);

  if (input.context.recipientPatterns.length > 0) {
    const patterns = input.context.recipientPatterns.map(p =>
      `### ${p.title}\n${p.content.slice(0, 2000)}`
    ).join("\n\n");
    userParts.push(`\nRECIPIENT COMMUNICATION PATTERNS:\n${patterns}`);
  }

  if (input.context.senderVoiceSamples.length > 0) {
    const samples = input.context.senderVoiceSamples.map(s =>
      `[${s.timestamp}] to ${s.recipient}:\n${s.excerpt.slice(0, 500)}`
    ).join("\n\n");
    userParts.push(`\nSENDER VOICE SAMPLES:\n${samples}`);
  }

  if (input.resolvedDecisions.length > 0) {
    const decisions = input.resolvedDecisions.map(d =>
      `- ${d.dimension}: ${d.choice} (apply to steps ${d.affectedStepOrders.join(", ")})`
    ).join("\n");
    userParts.push(`\nRESOLVED DECISIONS (apply these to the refined drafts):\n${decisions}`);
  }

  userParts.push(`\nALL STEPS (for full context):`);
  for (const step of input.steps) {
    const paramsStr = step.params ? JSON.stringify(step.params, null, 2) : "(no params)";
    userParts.push(`\n### Step ${step.order}: ${step.title} [${input.stepsToRefine.includes(step.order) ? "REFINE" : "context only"}]
Type: ${step.actionType}
Preview type: ${step.previewType ?? "(none)"}
Params:\n\`\`\`json\n${paramsStr}\n\`\`\``);
  }

  userParts.push(`\nSTEPS TO REFINE: ${input.stepsToRefine.join(", ")}\n\nReturn refined params for these steps only. JSON only.`);

  return { system, user: userParts.join("\n") };
}
