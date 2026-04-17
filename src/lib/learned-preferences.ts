import { prisma } from "@/lib/db";
import { updatePageWithLock } from "@/lib/wiki-engine";
import { LearnedPreferenceSchema, type LearnedPreference } from "@/lib/deliberation-types";

// ── Slugification ────────────────────────────────────────────────────────────

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

export function buildPreferenceId(dimension: string, scopeSlug: string): string {
  return `pref-${slugify(dimension)}-${scopeSlug}`;
}

// ── EMA math (pure function) ─────────────────────────────────────────────────

export function computeUpdatedPreference(
  existing: LearnedPreference | null,
  newDecision: { choice: string; timestamp: string; isCustomAnswer: boolean },
  preferenceId: string,
  dimension: string,
  scope: { type: "person" | "situation_type"; scopeSlug: string },
): LearnedPreference {
  const nowMs = new Date(newDecision.timestamp).getTime();

  // ── First decision ever ──
  if (!existing) {
    if (newDecision.isCustomAnswer) {
      return {
        id: preferenceId,
        dimension,
        scope,
        preferredChoice: newDecision.choice,
        confidence: 0.3,
        recencyWeightedSample: 0.5,
        lastUpdatedAt: newDecision.timestamp,
        priorCustomAnswers: [newDecision.choice],
        history: [newDecision],
      };
    }
    return {
      id: preferenceId,
      dimension,
      scope,
      preferredChoice: newDecision.choice,
      confidence: 0.5,
      recencyWeightedSample: 1.0,
      lastUpdatedAt: newDecision.timestamp,
      priorCustomAnswers: [],
      history: [newDecision],
    };
  }

  // ── Custom answer: log but don't train ──
  if (newDecision.isCustomAnswer) {
    const priorCustomSet = new Set([newDecision.choice, ...existing.priorCustomAnswers]);
    const priorCustomAnswers = Array.from(priorCustomSet).slice(0, 5);
    const history = [newDecision, ...existing.history].slice(0, 50);
    return {
      ...existing,
      lastUpdatedAt: newDecision.timestamp,
      priorCustomAnswers,
      history,
    };
  }

  // ── Standard option-based decision: full EMA update ──
  const historyWithNew = [newDecision, ...existing.history].slice(0, 50);

  // Recency-weighted sample: only non-custom answers count
  let recencyWeightedSample = 0;
  const choiceWeights = new Map<string, number>();
  for (const h of historyWithNew) {
    if (h.isCustomAnswer) continue;
    const ageDays = (nowMs - new Date(h.timestamp).getTime()) / (1000 * 60 * 60 * 24);
    const weight = Math.exp(-ageDays / 90);
    recencyWeightedSample += weight;
    choiceWeights.set(h.choice, (choiceWeights.get(h.choice) ?? 0) + weight);
  }

  // Preferred choice = highest weighted; break ties by recency (newer history entry wins)
  let preferredChoice = existing.preferredChoice;
  let bestWeight = -1;
  for (const [choice, weight] of choiceWeights) {
    if (weight > bestWeight) {
      bestWeight = weight;
      preferredChoice = choice;
    }
  }

  // EMA confidence update
  const priorHistory = existing.history.filter(h => !h.isCustomAnswer);
  const priorAges = priorHistory.map(h => (nowMs - new Date(h.timestamp).getTime()) / (1000 * 60 * 60 * 24));
  const sortedAges = [...priorAges].sort((a, b) => a - b);
  const medianPriorAgeDays = sortedAges.length === 0
    ? 0
    : sortedAges[Math.floor(sortedAges.length / 2)];
  const decayBuckets = Math.floor(medianPriorAgeDays / 30);
  const alpha = Math.min(0.3 + 0.1 * decayBuckets, 0.9);
  const agree = newDecision.choice === existing.preferredChoice ? 1.0 : 0.0;
  const confidence = alpha * agree + (1 - alpha) * existing.confidence;

  return {
    id: preferenceId,
    dimension,
    scope,
    preferredChoice,
    confidence: Math.max(0, Math.min(1, confidence)),
    recencyWeightedSample,
    lastUpdatedAt: newDecision.timestamp,
    priorCustomAnswers: existing.priorCustomAnswers,
    history: historyWithNew,
  };
}

// ── Auto-apply threshold ─────────────────────────────────────────────────────

export function meetsAutoApplyThreshold(pref: LearnedPreference, referenceTimestamp: string): boolean {
  if (pref.confidence < 0.8) return false;
  if (pref.recencyWeightedSample < 5.0) return false;
  const mostRecent = pref.history[0];
  if (!mostRecent) return false;
  const ageDays = (new Date(referenceTimestamp).getTime() - new Date(mostRecent.timestamp).getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays > 60) return false;
  return true;
}

// ── Markdown serialization ───────────────────────────────────────────────────

export function renderLearnedPreferencesSection(prefs: LearnedPreference[]): string {
  if (prefs.length === 0) return "";
  const lines: string[] = ["## Learned Preferences", ""];
  for (const p of prefs) {
    lines.push(`### ${p.dimension}`);
    lines.push(`**Preferred choice:** ${p.preferredChoice}`);
    lines.push(`**Confidence:** ${p.confidence.toFixed(2)}`);
    lines.push(`**Recency-weighted sample:** ${p.recencyWeightedSample.toFixed(2)}`);
    lines.push(`**Last updated:** ${p.lastUpdatedAt}`);
    lines.push(`**Prior custom answers:** ${p.priorCustomAnswers.length === 0 ? "none" : JSON.stringify(p.priorCustomAnswers)}`);
    lines.push(`**History:**`);
    for (const h of p.history) {
      lines.push(`- ${h.timestamp} · ${h.choice} · custom: ${h.isCustomAnswer}`);
    }
    lines.push(`<!-- preference-id: ${p.id} -->`);
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}

export function parseLearnedPreferencesSection(
  sectionBody: string,
  scope: { type: "person" | "situation_type"; scopeSlug: string },
): LearnedPreference[] {
  const blocks: Array<{ header: string; body: string }> = [];
  const lines = sectionBody.split("\n");
  let header: string | null = null;
  let body: string[] = [];
  for (const line of lines) {
    const m = /^###\s+(.+)$/.exec(line);
    if (m) {
      if (header !== null) blocks.push({ header, body: body.join("\n").trim() });
      header = m[1].trim();
      body = [];
    } else if (header !== null) {
      body.push(line);
    }
  }
  if (header !== null) blocks.push({ header, body: body.join("\n").trim() });

  const preferences: LearnedPreference[] = [];
  for (const block of blocks) {
    const idMatch = /<!--\s*preference-id:\s*([^\s]+)\s*-->/.exec(block.body);
    const preferredChoiceMatch = /^\*\*Preferred choice:\*\*\s*(.*)$/m.exec(block.body);
    const confidenceMatch = /^\*\*Confidence:\*\*\s*(.*)$/m.exec(block.body);
    const sampleMatch = /^\*\*Recency-weighted sample:\*\*\s*(.*)$/m.exec(block.body);
    const lastUpdatedMatch = /^\*\*Last updated:\*\*\s*(.*)$/m.exec(block.body);
    const priorCustomMatch = /^\*\*Prior custom answers:\*\*\s*(.*)$/m.exec(block.body);
    if (!idMatch || !preferredChoiceMatch || !confidenceMatch || !sampleMatch || !lastUpdatedMatch) continue;

    let priorCustomAnswers: string[] = [];
    if (priorCustomMatch && priorCustomMatch[1].trim() !== "none") {
      try {
        priorCustomAnswers = JSON.parse(priorCustomMatch[1].trim());
      } catch { /* ignore */ }
    }

    // Parse history entries
    const history: LearnedPreference["history"] = [];
    const histRegex = /^-\s+(\S+)\s+·\s+(.+?)\s+·\s+custom:\s+(true|false)$/gm;
    let m;
    while ((m = histRegex.exec(block.body)) !== null) {
      history.push({
        timestamp: m[1],
        choice: m[2].trim(),
        isCustomAnswer: m[3] === "true",
      });
    }

    const candidate: LearnedPreference = {
      id: idMatch[1],
      dimension: block.header,
      scope,
      preferredChoice: preferredChoiceMatch[1].trim(),
      confidence: parseFloat(confidenceMatch[1]),
      recencyWeightedSample: parseFloat(sampleMatch[1]),
      lastUpdatedAt: lastUpdatedMatch[1].trim(),
      priorCustomAnswers,
      history,
    };

    const result = LearnedPreferenceSchema.safeParse(candidate);
    if (result.success) preferences.push(result.data);
    else console.warn(`[learned-preferences] Dropped malformed block: ${result.error.issues.map(i => i.message).join("; ")}`);
  }

  return preferences;
}

// ── Read + write integrated with wiki pages ──────────────────────────────────

export async function readLearnedPreferences(
  operatorId: string,
  personSlug: string | null,
  situationTypeSlug: string,
): Promise<LearnedPreference[]> {
  const preferences: LearnedPreference[] = [];

  // Situation-type-scoped
  const typePage = await prisma.knowledgePage.findFirst({
    where: { operatorId, slug: situationTypeSlug, pageType: "situation_type_playbook" },
    select: { content: true },
  });
  if (typePage) {
    const section = extractSection(typePage.content, "Learned Preferences");
    if (section) preferences.push(...parseLearnedPreferencesSection(section, { type: "situation_type", scopeSlug: situationTypeSlug }));
  }

  // Person-scoped (if we have a slug)
  if (personSlug) {
    const personPage = await prisma.knowledgePage.findFirst({
      where: { operatorId, slug: personSlug, pageType: "communication_pattern" },
      select: { content: true },
    });
    if (personPage) {
      const section = extractSection(personPage.content, "Learned Preferences");
      if (section) preferences.push(...parseLearnedPreferencesSection(section, { type: "person", scopeSlug: personSlug }));
    }
  }

  return preferences;
}

export async function recordDecision(
  operatorId: string,
  decision: {
    dimension: string;
    choice: string;
    timestamp: string;
    isCustomAnswer: boolean;
    scope: { type: "person" | "situation_type"; scopeSlug: string };
  },
): Promise<void> {
  const preferenceId = buildPreferenceId(decision.dimension, decision.scope.scopeSlug);
  const pageType = decision.scope.type === "person" ? "communication_pattern" : "situation_type_playbook";

  // Upsert the wiki page's Learned Preferences section atomically
  await updatePageWithLock(operatorId, decision.scope.scopeSlug, (page) => {
    if (page.pageType !== pageType) {
      console.warn(`[learned-preferences] Skipping recordDecision — scope slug ${decision.scope.scopeSlug} has pageType ${page.pageType}, expected ${pageType}`);
      return {};
    }

    const existingSection = extractSection(page.content, "Learned Preferences");
    const existingPrefs = existingSection
      ? parseLearnedPreferencesSection(existingSection, decision.scope)
      : [];

    const existing = existingPrefs.find(p => p.id === preferenceId) ?? null;
    const updated = computeUpdatedPreference(existing, decision, preferenceId, decision.dimension, decision.scope);

    const merged = existingPrefs.filter(p => p.id !== preferenceId);
    merged.push(updated);

    const newSection = renderLearnedPreferencesSection(merged);
    const newContent = upsertSection(page.content, "Learned Preferences", newSection);
    return { content: newContent };
  });
}

// ── Section helpers (local, not exported) ────────────────────────────────────

function extractSection(pageContent: string, sectionName: string): string | null {
  const headerRegex = new RegExp(`^##\\s+${sectionName.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\s*$`, "m");
  const match = headerRegex.exec(pageContent);
  if (!match) return null;
  const afterHeader = pageContent.slice(match.index + match[0].length);
  const nextSectionMatch = /^##\s/m.exec(afterHeader);
  const body = nextSectionMatch ? afterHeader.slice(0, nextSectionMatch.index) : afterHeader;
  return body.trim();
}

function upsertSection(pageContent: string, sectionName: string, newSectionContent: string): string {
  const headerRegex = new RegExp(`^##\\s+${sectionName.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\s*$`, "m");
  const match = headerRegex.exec(pageContent);

  if (!match) {
    // Section doesn't exist — append at end
    return pageContent.trimEnd() + "\n\n" + newSectionContent.trim() + "\n";
  }

  const before = pageContent.slice(0, match.index);
  const afterHeader = pageContent.slice(match.index + match[0].length);
  const nextSectionMatch = /^##\s/m.exec(afterHeader);
  const after = nextSectionMatch ? afterHeader.slice(nextSectionMatch.index) : "";

  return before.trimEnd() + "\n\n" + newSectionContent.trim() + "\n\n" + after.trimStart();
}
