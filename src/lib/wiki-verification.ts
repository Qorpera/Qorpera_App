/**
 * Wiki verification engine — fact-checks draft KnowledgePages against their cited sources.
 *
 * Uses a different model (Sonnet via "verifier" route) than the synthesizer (Opus)
 * to avoid blind spots. Pages pass through draft → verified or quarantined.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { callLLM, getModel } from "@/lib/ai-provider";
import { extractJSON } from "@/lib/json-helpers";

// ─── Types ──────────────────────────────────────────────

interface VerificationResult {
  passed: boolean;
  checksRun: number;
  checksPassed: number;
  failures: Array<{
    checkType: string;
    claim: string;
    citedSource: string;
    issue: string;
    severity: "critical" | "moderate" | "minor";
  }>;
  confidence: number;
  recommendation: "verify" | "quarantine" | "resynthesize";
}

// ─── Main ───────────────────────────────────────────────

export async function verifyPage(pageId: string): Promise<VerificationResult> {
  const page = await prisma.knowledgePage.findUnique({
    where: { id: pageId },
  });
  if (!page) throw new Error(`Page ${pageId} not found`);

  // Skip verification for system pages (index, log, contradiction_log)
  if (["index", "log", "contradiction_log"].includes(page.pageType)) {
    await prisma.knowledgePage.update({
      where: { id: pageId },
      data: { status: "verified", verifiedAt: new Date(), verifiedByModel: "system", confidence: 1.0 },
    });
    return { passed: true, checksRun: 0, checksPassed: 0, failures: [], confidence: 1.0, recommendation: "verify" };
  }

  // Retrieve cited sources
  const sources = (page.sources as Array<{ type: string; id: string; citation: string }>) ?? [];
  const sourceTexts: Array<{ id: string; type: string; content: string }> = [];

  for (const src of sources.slice(0, 20)) {
    try {
      if (src.type === "chunk") {
        const chunk = await prisma.contentChunk.findUnique({
          where: { id: src.id },
          select: { content: true, sourceType: true, sourceId: true },
        });
        if (chunk) {
          sourceTexts.push({ id: src.id, type: "chunk", content: `[${chunk.sourceType}/${chunk.sourceId}] ${chunk.content.slice(0, 1500)}` });
        }
      } else if (src.type === "signal") {
        const signal = await prisma.activitySignal.findUnique({
          where: { id: src.id },
          select: { signalType: true, metadata: true, occurredAt: true },
        });
        if (signal) {
          sourceTexts.push({ id: src.id, type: "signal", content: `[${signal.signalType} at ${signal.occurredAt.toISOString()}] ${JSON.stringify(signal.metadata ?? {})}` });
        }
      } else if (src.type === "entity") {
        const entity = await prisma.entity.findUnique({
          where: { id: src.id },
          select: { displayName: true, description: true },
        });
        if (entity) {
          sourceTexts.push({ id: src.id, type: "entity", content: `[Entity: ${entity.displayName}] ${entity.description ?? ""}` });
        }
      }
    } catch {
      sourceTexts.push({ id: src.id, type: src.type, content: `[SOURCE NOT FOUND: ${src.id}]` });
    }
  }

  // Build verification prompt
  const verificationPrompt = `You are a fact-checker verifying a knowledge page against its cited sources.

The page claims to be about: "${page.title}" (type: ${page.pageType})

Your job: check each claim in the page against the cited sources provided below. Report:

1. CITATION VALIDITY: For each [src:...] citation, is the claim supported by that source?
2. CLAIM PRECISION: Are specific numbers, dates, and names accurate?
3. INFERENCE BOUNDARIES: Does the page claim more than the evidence supports?
4. CONTRADICTION CONSISTENCY: Are any contradictions between sources noted? Are there contradictions the page missed?
5. SOURCE COVERAGE: Are the cited sources the most relevant available, or might better sources exist?

Respond with ONLY valid JSON (no markdown fences, no commentary before or after):
{"passed":boolean,"checksRun":number,"checksPassed":number,"failures":[{"checkType":"citation_validity"|"claim_precision"|"inference_boundary"|"contradiction_missed"|"source_missing","claim":"short claim (max 80 chars)","citedSource":"source ID","issue":"short issue (max 80 chars)","severity":"critical"|"moderate"|"minor"}],"confidence":number,"recommendation":"verify"|"quarantine"|"resynthesize"}

Rules:
- Include at most 10 failures. Prioritize critical > moderate > minor.
- Keep "claim" and "issue" fields SHORT (under 80 characters each). No full sentences — key phrases only.
- "critical": claim is factually wrong or source says the opposite
- "moderate": claim overstates, generalizes beyond evidence, or misses a contradiction
- "minor": imprecise wording or missing context
- confidence: high source coverage + all checks pass = 0.8-1.0, moderate gaps = 0.5-0.7, significant issues = 0.2-0.4
- "quarantine" if any critical failure exists
- "resynthesize" if moderate failures suggest rewriting needed
- "verify" if the page is sound`;

  const userMessage = `## Page content to verify:

${page.content}

## Cited sources:

${sourceTexts.map((s) => `### Source ${s.id} (${s.type})\n${s.content}`).join("\n\n")}`;

  const model = getModel("verifier");

  const response = await callLLM({
    operatorId: page.operatorId,
    instructions: verificationPrompt,
    messages: [{ role: "user", content: userMessage }],
    model,
    maxTokens: 8192,
    aiFunction: "reasoning",
  });

  const text = response.text;

  let result: VerificationResult;
  try {
    // Try extractJSON first (handles complete markdown fences)
    let parsed = extractJSON(text);

    // Fallback: manually strip fences and extract the JSON object
    if (!parsed || typeof parsed !== "object" || !("passed" in parsed)) {
      const cleaned = text
        .replace(/^```json\s*/m, "")
        .replace(/```\s*$/m, "")
        .trim();
      const objStart = cleaned.indexOf("{");
      const objEnd = cleaned.lastIndexOf("}");
      if (objStart >= 0 && objEnd > objStart) {
        parsed = JSON.parse(cleaned.slice(objStart, objEnd + 1));
      } else {
        throw new Error("No JSON object found");
      }
    }

    if (!parsed || typeof parsed !== "object" || !("passed" in parsed)) {
      throw new Error("Invalid structure");
    }
    result = parsed as unknown as VerificationResult;
  } catch {
    console.error("[wiki-verification] Failed to parse verification response:", text.slice(0, 200));
    result = {
      passed: false,
      checksRun: 0,
      checksPassed: 0,
      failures: [{ checkType: "parse_error", claim: "", citedSource: "", issue: "Verification response could not be parsed", severity: "moderate" }],
      confidence: 0.3,
      recommendation: "resynthesize",
    };
  }

  // Apply decision
  const hasCritical = result.failures.some((f) => f.severity === "critical");
  const moderateCount = result.failures.filter((f) => f.severity === "moderate").length;

  let finalStatus: string;
  if (hasCritical || moderateCount >= 2) {
    finalStatus = "quarantined";
  } else {
    finalStatus = "verified";
  }

  // Override with explicit recommendation if stronger
  if (result.recommendation === "quarantine" && finalStatus === "verified") {
    finalStatus = "quarantined";
  }

  await prisma.knowledgePage.update({
    where: { id: pageId },
    data: {
      status: finalStatus,
      verifiedAt: finalStatus === "verified" ? new Date() : null,
      verifiedByModel: model,
      verificationLog: result as unknown as Prisma.InputJsonValue,
      confidence: result.confidence,
      quarantineReason: finalStatus === "quarantined"
        ? result.failures.filter((f) => f.severity === "critical" || f.severity === "moderate").map((f) => f.issue).join("; ")
        : null,
    },
  });

  console.log(`[wiki-verification] Page "${page.slug}" → ${finalStatus} (confidence: ${result.confidence}, checks: ${result.checksRun}, failures: ${result.failures.length})`);

  return result;
}

// ─── Batch ──────────────────────────────────────────────

export async function verifyDraftPages(operatorId: string, projectId?: string): Promise<{
  verified: number;
  quarantined: number;
  errors: number;
}> {
  const drafts = await prisma.knowledgePage.findMany({
    where: {
      operatorId,
      status: "draft",
      ...(projectId !== undefined ? { projectId } : {}),
    },
    select: { id: true, slug: true },
  });

  const stats = { verified: 0, quarantined: 0, errors: 0 };

  for (const draft of drafts) {
    try {
      const result = await verifyPage(draft.id);
      if (result.passed) stats.verified++;
      else stats.quarantined++;
    } catch (err) {
      console.error(`[wiki-verification] Failed to verify ${draft.slug}:`, err);
      stats.errors++;
    }
  }

  return stats;
}
