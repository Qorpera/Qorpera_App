import type {
  Fork,
  OpenQuestion,
  Decision,
} from "@/lib/deliberation-types";
import {
  DecisionSchema,
  OpenQuestionSchema,
} from "@/lib/deliberation-types";

// ── Render ───────────────────────────────────────────────────────────────────

export function renderDecisionsSection(decisions: Decision[]): string {
  if (decisions.length === 0) return "";
  const lines: string[] = ["## Decisions", ""];
  for (const d of decisions) {
    lines.push(`### ${d.dimension}`);
    if (d.kind === "answered") {
      lines.push(`**Tag:** answered`);
      lines.push(`**Question:** ${d.question}`);
      lines.push(`**Raised at:** ${d.raisedAt}`);
      lines.push(`**Answered at:** ${d.answeredAt}`);
      lines.push(`**Answered by:** ${d.answeredBySlug ?? d.answeredByUserId}`);
      lines.push(`**Choice:** ${d.choice}`);
      lines.push(`**Custom answer:** ${d.isCustomAnswer}`);
      lines.push(`**Affects steps:** ${d.affectedStepOrders.join(", ")}`);
      lines.push(`**Preference scope:** ${d.preferenceScope.type} · ${d.preferenceScope.scopeSlug}`);
    } else {
      lines.push(`**Tag:** auto-applied`);
      lines.push(`**Basis:** ${d.basis}`);
      lines.push(`**Choice:** ${d.choice}`);
      lines.push(`**Affects steps:** ${d.affectedStepOrders.join(", ")}`);
      lines.push(`**Preference scope:** ${d.preferenceScope.type} · ${d.preferenceScope.scopeSlug}`);
      lines.push(`**Preference ID:** ${d.preferenceId}`);
      lines.push(`**Confidence at application:** ${d.confidenceAtApplication.toFixed(2)}`);
      lines.push(`**Applied at:** ${d.appliedAt}`);
    }
    lines.push(`<!-- decision-id: ${d.id} -->`);
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}

export function renderOpenQuestionsSection(questions: OpenQuestion[]): string {
  if (questions.length === 0) return "";
  const lines: string[] = ["## Open Questions", ""];
  for (const q of questions) {
    lines.push(`### ${q.dimension}`);
    lines.push(`**Question:** ${q.question}`);
    lines.push(`**Options:**`);
    for (const opt of q.options) {
      lines.push(`- ${opt.label} — ${opt.hint}`);
    }
    lines.push(`**Affects steps:** ${q.affectedStepOrders.join(", ")}`);
    lines.push(`**Raised at:** ${q.raisedAt}`);
    lines.push(`**Preference scope:** ${q.preferenceScope.type} · ${q.preferenceScope.scopeSlug}`);
    if (q.priorCustomAnswer) {
      lines.push(`**Prior custom answer:** ${q.priorCustomAnswer}`);
    }
    lines.push(`<!-- question-id: ${q.id} -->`);
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}

// ── Parse ────────────────────────────────────────────────────────────────────
// Parsers tolerate extra blank lines and minor whitespace variance.
// They assume the input is a well-formed section body (the `## Decisions` or
// `## Open Questions` header has already been stripped by the section parser).

interface RawBlock {
  header: string;
  body: string;
}

function splitBlocks(sectionBody: string): RawBlock[] {
  const blocks: RawBlock[] = [];
  const lines = sectionBody.split("\n");
  let currentHeader: string | null = null;
  let currentBody: string[] = [];
  for (const line of lines) {
    const headerMatch = /^###\s+(.+)$/.exec(line);
    if (headerMatch) {
      if (currentHeader !== null) {
        blocks.push({ header: currentHeader, body: currentBody.join("\n").trim() });
      }
      currentHeader = headerMatch[1].trim();
      currentBody = [];
    } else if (currentHeader !== null) {
      currentBody.push(line);
    }
  }
  if (currentHeader !== null) {
    blocks.push({ header: currentHeader, body: currentBody.join("\n").trim() });
  }
  return blocks;
}

function extractLabeled(body: string, label: string): string | null {
  const regex = new RegExp(`^\\*\\*${label}:\\*\\*\\s*(.*)$`, "m");
  const match = regex.exec(body);
  return match ? match[1].trim() : null;
}

function extractIdComment(body: string, commentKey: string): string | null {
  const regex = new RegExp(`<!--\\s*${commentKey}:\\s*([^\\s]+)\\s*-->`);
  const match = regex.exec(body);
  return match ? match[1] : null;
}

function parseStepOrders(raw: string | null): number[] {
  if (!raw) return [];
  return raw.split(",").map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);
}

function parsePreferenceScope(raw: string | null): { type: "person" | "situation_type"; scopeSlug: string } | null {
  if (!raw) return null;
  const parts = raw.split("·").map(s => s.trim());
  if (parts.length !== 2) return null;
  const type = parts[0];
  if (type !== "person" && type !== "situation_type") return null;
  return { type, scopeSlug: parts[1] };
}

export function parseDecisionsSection(sectionBody: string): Decision[] {
  const blocks = splitBlocks(sectionBody);
  const decisions: Decision[] = [];

  for (const block of blocks) {
    const tag = extractLabeled(block.body, "Tag");
    const id = extractIdComment(block.body, "decision-id");
    const choice = extractLabeled(block.body, "Choice");
    const affectsStepsRaw = extractLabeled(block.body, "Affects steps");
    const scopeRaw = extractLabeled(block.body, "Preference scope");

    if (!tag || !id || !choice) continue;

    const affectedStepOrders = parseStepOrders(affectsStepsRaw);
    const preferenceScope = parsePreferenceScope(scopeRaw);
    if (!preferenceScope || affectedStepOrders.length === 0) continue;

    if (tag === "answered") {
      const question = extractLabeled(block.body, "Question");
      const raisedAt = extractLabeled(block.body, "Raised at");
      const answeredAt = extractLabeled(block.body, "Answered at");
      const answeredBy = extractLabeled(block.body, "Answered by");
      const customAnswerRaw = extractLabeled(block.body, "Custom answer");
      if (!question || !raisedAt || !answeredAt || !answeredBy) continue;

      decisions.push({
        kind: "answered",
        id,
        dimension: block.header,
        question,
        raisedAt,
        answeredAt,
        answeredByUserId: answeredBy,
        answeredBySlug: null,
        choice,
        isCustomAnswer: customAnswerRaw === "true",
        affectedStepOrders,
        preferenceScope,
      });
    } else if (tag === "auto-applied") {
      const basis = extractLabeled(block.body, "Basis");
      const preferenceId = extractLabeled(block.body, "Preference ID");
      const confidenceRaw = extractLabeled(block.body, "Confidence at application");
      const appliedAt = extractLabeled(block.body, "Applied at");
      if (!basis || !preferenceId || !confidenceRaw || !appliedAt) continue;

      const confidence = parseFloat(confidenceRaw);
      if (isNaN(confidence)) continue;

      decisions.push({
        kind: "auto_applied",
        id,
        dimension: block.header,
        choice,
        basis,
        affectedStepOrders,
        preferenceScope,
        preferenceId,
        confidenceAtApplication: confidence,
        appliedAt,
      });
    }
  }

  // Defensive validation — drop blocks that don't match the schema (hand-edited wiki pages).
  const validated: Decision[] = [];
  for (const d of decisions) {
    const result = DecisionSchema.safeParse(d);
    if (result.success) {
      validated.push(result.data);
    } else {
      console.warn(`[clarification-helpers] Dropped malformed decision block: ${result.error.issues.map(i => i.message).join("; ")}`);
    }
  }
  return validated;
}

export function parseOpenQuestionsSection(sectionBody: string): OpenQuestion[] {
  const blocks = splitBlocks(sectionBody);
  const questions: OpenQuestion[] = [];

  for (const block of blocks) {
    const id = extractIdComment(block.body, "question-id");
    const question = extractLabeled(block.body, "Question");
    const affectsStepsRaw = extractLabeled(block.body, "Affects steps");
    const raisedAt = extractLabeled(block.body, "Raised at");
    const scopeRaw = extractLabeled(block.body, "Preference scope");
    const priorCustom = extractLabeled(block.body, "Prior custom answer");

    if (!id || !question || !raisedAt) continue;

    const affectedStepOrders = parseStepOrders(affectsStepsRaw);
    const preferenceScope = parsePreferenceScope(scopeRaw);
    if (!preferenceScope || affectedStepOrders.length === 0) continue;

    const optionsStart = block.body.indexOf("**Options:**");
    const options: Array<{ label: string; hint: string }> = [];
    if (optionsStart !== -1) {
      const afterOptions = block.body.slice(optionsStart);
      const optionLineRegex = /^-\s+(.+?)\s+—\s+(.+)$/gm;
      let match;
      while ((match = optionLineRegex.exec(afterOptions)) !== null) {
        options.push({ label: match[1].trim(), hint: match[2].trim() });
      }
    }
    if (options.length < 2 || options.length > 3) continue;

    questions.push({
      id,
      dimension: block.header,
      question,
      options,
      affectedStepOrders,
      preferenceScope,
      raisedAt,
      priorCustomAnswer: priorCustom,
      materialityRationale: "(not persisted to wiki)",
    });
  }

  // Defensive validation — drop blocks that don't match the schema (hand-edited wiki pages).
  const validated: OpenQuestion[] = [];
  for (const q of questions) {
    const result = OpenQuestionSchema.safeParse(q);
    if (result.success) {
      validated.push(result.data);
    } else {
      console.warn(`[clarification-helpers] Dropped malformed open question block: ${result.error.issues.map(i => i.message).join("; ")}`);
    }
  }
  return validated;
}

// ── Fork → OpenQuestion conversion ───────────────────────────────────────────

export function forkToOpenQuestion(
  fork: Fork,
  raisedAt: string,
  priorCustomAnswer: string | null,
): OpenQuestion {
  return {
    ...fork,
    raisedAt,
    priorCustomAnswer,
  };
}
