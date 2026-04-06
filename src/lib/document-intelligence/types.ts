export interface DocumentRegistration {
  id: string; // FileUpload ID or synthesized ID for connector docs
  operatorId: string;
  sourceType: string;
  mimeType?: string;
  filename?: string;
  fullText: string;
  textLength: number;
  estimatedTokens: number;
  chunkIds: string[];
  fileUploadId?: string;
  projectId?: string;
}

export interface DocumentProfile {
  documentType: string;
  expertiseDomains: string[];
  structure: {
    hasTOC: boolean;
    sections: Array<{ title: string; startChar: number; endChar: number }>;
    hasFinancialTables: boolean;
    hasLegalClauses: boolean;
    hasAppendices: boolean;
    language: string;
  };
  readingStrategy: "single_pass" | "section_by_section" | "multi_pass";
  estimatedImportance:
    | "critical"
    | "significant"
    | "supporting"
    | "administrative";
}

export interface DocumentUnderstanding {
  purpose: string;
  audience: string;
  authorIntent: string;
  keyNarrative: string;
  keyFindings: string[];
  supportingEvidence: string[];
  unstatedAssumptions: string[];
  redFlags: Array<{
    flag: string;
    location: string;
    severity: "high" | "medium" | "low";
    explanation: string;
  }>;
  internalContradictions: Array<{
    claim1: string;
    claim1Location: string;
    claim2: string;
    claim2Location: string;
    analysis: string;
  }>;
  gaps: Array<{
    topic: string;
    expectedBecause: string;
    significance: string;
  }>;
  criticalSections: Array<{
    title: string;
    startChar: number;
    endChar: number;
    importance: string;
    requiresDeepExtraction: boolean;
  }>;
  expertiseFindings: Record<string, string[]>;
  crossReferenceQueries: string[];
}

export interface AnalyticalClaim {
  claim: string;
  type: "insight" | "discrepancy" | "risk" | "opportunity" | "implication";
  derivedFrom: string[];
  expertiseBasis: string;
  confidence: number;
  reasoning: string;
}
