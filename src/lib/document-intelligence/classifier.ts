import { callLLM, getModel } from "@/lib/ai-provider";
import { extractJSON } from "@/lib/json-helpers";
import type { DocumentProfile, DocumentRegistration } from "./types";

const CLASSIFICATION_PROMPT = `You are classifying a business document to determine how it should be analyzed.

Read the document text below. Determine:

1. DOCUMENT TYPE — what kind of document is this?
   financial_report, legal_contract, proposal, policy, project_plan,
   meeting_minutes, client_communication, technical_spec, audit_report,
   due_diligence_report, operational_manual, invoice_collection,
   strategic_plan, board_minutes, regulatory_filing, hr_document,
   spreadsheet_data, presentation, template, unknown

2. EXPERTISE DOMAINS — what analytical knowledge is needed to properly read this?
   Examples: financial_analysis, revenue_recognition, cost_structure_analysis,
   contract_law, liability_assessment, employment_law, operational_efficiency,
   process_mapping, risk_assessment, market_analysis, client_relationship_analysis,
   hr_compliance, regulatory_compliance, strategic_planning, project_management,
   supply_chain, logistics, real_estate, technology_assessment
   List ALL relevant domains — a DD report might need 4-5.

3. STRUCTURE — how is the document organized?
   - Does it have a table of contents or clear section headers?
   - Identify major sections with approximate character positions
   - Does it contain financial tables? Legal clauses? Appendices?
   - What language is it in?

4. IMPORTANCE — how critical is this document to understanding the business?
   critical: contracts, financial statements, DD reports, board minutes — get Opus analysis
   significant: reports, proposals, plans — get Sonnet analysis
   supporting: templates, guides, manuals — get Sonnet analysis
   administrative: routine correspondence, scheduling — minimal analysis

5. READING STRATEGY
   single_pass: short/simple docs, one comprehension call
   section_by_section: structured docs with clear sections
   multi_pass: complex docs needing financial + legal + operational reads

Respond ONLY with JSON:
{
  "documentType": "string",
  "expertiseDomains": ["domain1", "domain2"],
  "structure": {
    "hasTOC": boolean,
    "sections": [{"title": "string", "startChar": number, "endChar": number}],
    "hasFinancialTables": boolean,
    "hasLegalClauses": boolean,
    "hasAppendices": boolean,
    "language": "string"
  },
  "readingStrategy": "single_pass|section_by_section|multi_pass",
  "estimatedImportance": "critical|significant|supporting|administrative"
}`;

export async function classifyDocument(
  registration: DocumentRegistration,
): Promise<DocumentProfile> {
  const model = getModel("documentClassification");

  // For very large documents, send first 40K + last 8K chars (TOC is usually at start, appendices at end)
  let textForClassification = registration.fullText;
  if (registration.textLength > 50000) {
    textForClassification =
      registration.fullText.slice(0, 40000) +
      "\n\n[...middle sections omitted for classification...]\n\n" +
      registration.fullText.slice(-8000);
  }

  const fallback: DocumentProfile = {
    documentType: "unknown",
    expertiseDomains: ["general_analysis"],
    structure: {
      hasTOC: false,
      sections: [],
      hasFinancialTables: false,
      hasLegalClauses: false,
      hasAppendices: false,
      language: "en",
    },
    readingStrategy: "single_pass",
    estimatedImportance: "supporting",
  };

  let response;
  try {
    response = await callLLM({
      operatorId: registration.operatorId,
      instructions: CLASSIFICATION_PROMPT,
      messages: [
        {
          role: "user",
          content: `Filename: ${registration.filename ?? "unknown"}\nMIME type: ${registration.mimeType ?? "unknown"}\n\n${textForClassification}`,
        },
      ],
      model,
      maxTokens: 4000,
    });
  } catch (err) {
    console.error("[document-classification] LLM call failed:", err);
    return fallback;
  }

  const parsed = extractJSON(response.text);
  if (!parsed || !parsed.documentType) {
    return fallback;
  }

  const structure = parsed.structure as Record<string, unknown> | undefined;

  return {
    documentType: parsed.documentType as string,
    expertiseDomains: Array.isArray(parsed.expertiseDomains)
      ? (parsed.expertiseDomains as string[])
      : ["general_analysis"],
    structure: {
      hasTOC: (structure?.hasTOC as boolean) ?? false,
      sections: Array.isArray(structure?.sections)
        ? (structure.sections as DocumentProfile["structure"]["sections"])
        : [],
      hasFinancialTables: (structure?.hasFinancialTables as boolean) ?? false,
      hasLegalClauses: (structure?.hasLegalClauses as boolean) ?? false,
      hasAppendices: (structure?.hasAppendices as boolean) ?? false,
      language: (structure?.language as string) ?? "en",
    },
    readingStrategy:
      (parsed.readingStrategy as DocumentProfile["readingStrategy"]) ??
      "single_pass",
    estimatedImportance:
      (parsed.estimatedImportance as DocumentProfile["estimatedImportance"]) ??
      "supporting",
  };
}
