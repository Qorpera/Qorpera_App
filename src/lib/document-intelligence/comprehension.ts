import { prisma } from "@/lib/db";
import { callLLM, getModel } from "@/lib/ai-provider";
import { extractJSON } from "@/lib/json-helpers";
import type {
  DocumentRegistration,
  DocumentProfile,
  DocumentUnderstanding,
} from "./types";

/**
 * Full-document comprehension pass.
 *
 * Reads the entire document with assembled domain expertise.
 * Builds understanding: purpose, narrative, red flags, gaps, cross-reference queries.
 * This is what separates analysis from summarization.
 *
 * Model selection:
 *   critical documents -> Opus (contracts, financials, DD reports)
 *   everything else -> Sonnet
 */
export async function comprehendDocument(
  registration: DocumentRegistration,
  profile: DocumentProfile,
  assembledExpertise: string,
): Promise<{ understanding: DocumentUnderstanding; costCents: number }> {
  const isCritical = profile.estimatedImportance === "critical";
  const model = isCritical
    ? getModel("documentComprehensionDeep")
    : getModel("documentComprehensionStandard");

  // Check for an active versioned prompt (from the quality loop)
  const versionedPrompt = await prisma.analysisPromptVersion
    .findFirst({
      where: { promptType: "comprehension", status: "active" },
      orderBy: { version: "desc" },
      select: { content: true },
    })
    .catch(() => null);

  const systemPrompt = versionedPrompt
    ? versionedPrompt.content
        .replace(/\{assembledExpertise\}/g, assembledExpertise)
        .replace(/\{documentType\}/g, profile.documentType)
        .replace(
          /\{estimatedImportance\}/g,
          profile.estimatedImportance,
        )
        .replace(
          /\{sectionCount\}/g,
          String(profile.structure.sections.length),
        )
        .replace(
          /\{hasFinancialTables\}/g,
          profile.structure.hasFinancialTables
            ? "contains financial tables"
            : "no financial tables",
        )
        .replace(
          /\{hasLegalClauses\}/g,
          profile.structure.hasLegalClauses
            ? "contains legal clauses"
            : "no legal clauses",
        )
        .replace(/\{language\}/g, profile.structure.language)
    : buildComprehensionPrompt(profile, assembledExpertise);

  // For large documents with section_by_section strategy:
  // Run comprehension on the full document first (or first ~150K chars),
  // then deep-dive sections individually with the full-doc understanding as context.
  let documentText = registration.fullText;

  // If document exceeds model context limits (very rare — >150K tokens),
  // use first 80% + last 10% with a note about omission
  if (registration.estimatedTokens > 37500) {
    const cutoff = Math.floor(registration.fullText.length * 0.8);
    const tailStart = Math.floor(registration.fullText.length * 0.9);
    documentText =
      registration.fullText.slice(0, cutoff) +
      "\n\n[...section omitted due to length — approximately " +
      Math.round((tailStart - cutoff) / 4) +
      " tokens of middle content...]\n\n" +
      registration.fullText.slice(tailStart);
  }

  const fallbackUnderstanding: DocumentUnderstanding = {
    purpose:
      "Classification and comprehension partially failed — raw text analysis only",
    audience: "unknown",
    authorIntent: "unknown",
    keyNarrative: "",
    keyFindings: [],
    supportingEvidence: [],
    unstatedAssumptions: [],
    redFlags: [],
    internalContradictions: [],
    gaps: [],
    criticalSections: profile.structure.sections.map((s) => ({
      ...s,
      importance: "unknown",
      requiresDeepExtraction: true,
    })),
    expertiseFindings: {},
    crossReferenceQueries: [],
  };

  let response;
  try {
    response = await callLLM({
      operatorId: registration.operatorId,
      instructions: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Document: ${registration.filename ?? "untitled"}\n\n${documentText}`,
        },
      ],
      model,
      // CRITICAL: maxTokens MUST be 65,536 when thinking is enabled (Anthropic API requirement)
      maxTokens: isCritical ? 65_536 : 16_000,
      thinking: isCritical,
      thinkingBudget: isCritical ? 16_000 : undefined,
    });
  } catch (err) {
    console.error("[document-comprehension] LLM call failed:", err);
    return { understanding: fallbackUnderstanding, costCents: 0 };
  }

  const parsed = extractJSON(response.text);

  if (!parsed) {
    // If JSON parsing fails, extract what we can from the text
    return {
      understanding: {
        ...fallbackUnderstanding,
        keyNarrative: response.text.slice(0, 500),
      },
      costCents: response.apiCostCents,
    };
  }

  const understanding: DocumentUnderstanding = {
    purpose: (parsed.purpose as string) ?? "",
    audience: (parsed.audience as string) ?? "",
    authorIntent: (parsed.authorIntent as string) ?? "",
    keyNarrative: (parsed.keyNarrative as string) ?? "",
    keyFindings: Array.isArray(parsed.keyFindings)
      ? (parsed.keyFindings as string[])
      : [],
    supportingEvidence: Array.isArray(parsed.supportingEvidence)
      ? (parsed.supportingEvidence as string[])
      : [],
    unstatedAssumptions: Array.isArray(parsed.unstatedAssumptions)
      ? (parsed.unstatedAssumptions as string[])
      : [],
    redFlags: Array.isArray(parsed.redFlags)
      ? (parsed.redFlags as DocumentUnderstanding["redFlags"])
      : [],
    internalContradictions: Array.isArray(parsed.internalContradictions)
      ? (parsed.internalContradictions as DocumentUnderstanding["internalContradictions"])
      : [],
    gaps: Array.isArray(parsed.gaps)
      ? (parsed.gaps as DocumentUnderstanding["gaps"])
      : [],
    criticalSections: Array.isArray(parsed.criticalSections)
      ? (parsed.criticalSections as DocumentUnderstanding["criticalSections"])
      : [],
    expertiseFindings:
      typeof parsed.expertiseFindings === "object" && parsed.expertiseFindings
        ? (parsed.expertiseFindings as Record<string, string[]>)
        : {},
    crossReferenceQueries: Array.isArray(parsed.crossReferenceQueries)
      ? (parsed.crossReferenceQueries as string[])
      : [],
  };

  return { understanding, costCents: response.apiCostCents };
}

function buildComprehensionPrompt(
  profile: DocumentProfile,
  assembledExpertise: string,
): string {
  return `You are conducting a thorough analysis of a business document.

${assembledExpertise}

## Document Classification
Type: ${profile.documentType}
Structure: ${profile.structure.sections.length} sections identified, ${profile.structure.hasFinancialTables ? "contains financial tables" : "no financial tables"}, ${profile.structure.hasLegalClauses ? "contains legal clauses" : "no legal clauses"}
Language: ${profile.structure.language}
Importance: ${profile.estimatedImportance}

## Your Task

Read the complete document. Your assembled expertise tells you WHAT to look for and HOW to interpret what you find.

Build a deep understanding of:

1. **PURPOSE AND AUDIENCE**
   Why was this written? For whom? What conclusion does the author want?

2. **KEY NARRATIVE**
   What story does this document tell? What is the through-line?

3. **KEY FINDINGS AND THEIR EVIDENCE**
   What are the main claims? What evidence supports each?
   Rate each: well-supported, partially supported, or unsupported.

4. **UNSTATED ASSUMPTIONS**
   What does the document assume without saying? What context is taken for granted?

5. **RED FLAGS** (informed by your domain expertise)
   Claims that don't add up. Metrics that look good but aren't.
   Numbers without context. Commitments without evidence of follow-through.
   For each: location in the document, severity, explanation.

6. **INTERNAL CONTRADICTIONS**
   Where does the document disagree with itself? Where does the narrative
   in one section conflict with data in another?

7. **CONSPICUOUS GAPS**
   What SHOULD be in a document of this type that isn't here?
   What topics are avoided? What questions aren't addressed?
   Your expertise tells you what "normal" looks like — deviations are insights.

8. **EXPERTISE-SPECIFIC FINDINGS**
   For each expertise domain you have, what does that lens reveal?
   A financial lens sees different things than a legal lens.

9. **CROSS-REFERENCE QUERIES**
   What claims should be checked against other data sources?
   Be specific: "Verify the 97% delivery rate against customer complaint data"
   not "Check delivery metrics."

10. **CRITICAL SECTIONS**
    Which sections of this document need the deepest extraction?
    Which contain the most consequential claims?

Respond with JSON matching this structure:
{
  "purpose": "string",
  "audience": "string",
  "authorIntent": "string",
  "keyNarrative": "string",
  "keyFindings": ["string"],
  "supportingEvidence": ["string"],
  "unstatedAssumptions": ["string"],
  "redFlags": [{"flag": "string", "location": "string", "severity": "high|medium|low", "explanation": "string"}],
  "internalContradictions": [{"claim1": "string", "claim1Location": "string", "claim2": "string", "claim2Location": "string", "analysis": "string"}],
  "gaps": [{"topic": "string", "expectedBecause": "string", "significance": "string"}],
  "criticalSections": [{"title": "string", "startChar": number, "endChar": number, "importance": "string", "requiresDeepExtraction": boolean}],
  "expertiseFindings": {"domain_name": ["finding1", "finding2"]},
  "crossReferenceQueries": ["specific query string"]
}`;
}
