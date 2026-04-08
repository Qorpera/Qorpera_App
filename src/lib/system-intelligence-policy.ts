/**
 * System Intelligence Update Policy
 *
 * Defines how aggressively each system wiki page type can be updated
 * by the curator process. Higher-stability knowledge requires more
 * evidence and human approval before changes.
 */

export type SystemPageType =
  | "fundamentals"    // Near-permanent knowledge (accounting principles, legal frameworks)
  | "methodology"     // Analytical frameworks and approaches (DD methodology, risk assessment)
  | "theory"          // Models that reference statistics and practices (escalation timing models)
  | "practices"       // How things are done in an industry (common contract structures)
  | "statistics"      // Empirical data (median payment delays, churn benchmarks, margin ranges)
  | "ontology_index"  // Meta-knowledge about what the wiki should contain
  | "topic_synthesis" // General knowledge articles (legacy/default)
  | "process_description" // Process knowledge (legacy/default)
  | "financial_pattern";  // Financial knowledge (legacy/default)

export interface UpdatePolicy {
  /** Minimum number of signals before the curator even considers an update */
  minSignalCount: number;
  /** Minimum number of distinct operators contributing signals */
  minOperatorCount: number;
  /** Whether the curator can auto-execute the update or must propose for admin review */
  requiresAdminApproval: boolean;
  /** Minimum confidence threshold for auto-updates (ignored if requiresAdminApproval) */
  minAutoConfidence: number;
  /** Description for logging */
  description: string;
}

export const UPDATE_POLICIES: Record<string, UpdatePolicy> = {
  // ── Governance-protected: curator proposes, admin approves ──
  fundamentals: {
    minSignalCount: 999,     // Effectively: manual only
    minOperatorCount: 999,
    requiresAdminApproval: true,
    minAutoConfidence: 1.0,  // Never auto-approve
    description: "Near-permanent knowledge. Manual admin updates only. Curator can flag but never edit.",
  },
  methodology: {
    minSignalCount: 50,
    minOperatorCount: 10,
    requiresAdminApproval: true,
    minAutoConfidence: 1.0,  // Never auto-approve
    description: "Analytical frameworks. Curator proposes edits from strong cross-operator evidence. Admin approves.",
  },
  ontology_index: {
    minSignalCount: 999,
    minOperatorCount: 999,
    requiresAdminApproval: true,
    minAutoConfidence: 1.0,
    description: "Meta-knowledge structure. Manual admin updates only.",
  },

  // ── Moderate: curator can auto-update with high confidence ──
  theory: {
    minSignalCount: 30,
    minOperatorCount: 5,
    requiresAdminApproval: false,
    minAutoConfidence: 0.85,
    description: "Analytical models referencing statistics/practices. Updates mainly propagate from referenced statistics pages. Direct edits require strong evidence.",
  },
  practices: {
    minSignalCount: 20,
    minOperatorCount: 5,
    requiresAdminApproval: false,
    minAutoConfidence: 0.8,
    description: "Industry practices. Curator can auto-update when pattern is unambiguous across operators.",
  },

  // ── Fast: data-driven, low threshold ──
  statistics: {
    minSignalCount: 5,
    minOperatorCount: 3,
    requiresAdminApproval: false,
    minAutoConfidence: 0.6,
    description: "Empirical observations. Update as evidence accumulates. These are data points, not opinions.",
  },

  // ── Legacy types: moderate defaults ──
  topic_synthesis: {
    minSignalCount: 20,
    minOperatorCount: 5,
    requiresAdminApproval: false,
    minAutoConfidence: 0.8,
    description: "General knowledge articles. Moderate update threshold.",
  },
  process_description: {
    minSignalCount: 20,
    minOperatorCount: 5,
    requiresAdminApproval: false,
    minAutoConfidence: 0.8,
    description: "Process knowledge. Moderate update threshold.",
  },
  financial_pattern: {
    minSignalCount: 15,
    minOperatorCount: 3,
    requiresAdminApproval: false,
    minAutoConfidence: 0.7,
    description: "Financial patterns. Slightly lower threshold — financial data is more empirical.",
  },
};

/**
 * Get the update policy for a system wiki page type.
 * Falls back to practices-level policy for unknown types.
 */
export function getUpdatePolicy(pageType: string): UpdatePolicy {
  return UPDATE_POLICIES[pageType] ?? UPDATE_POLICIES.practices;
}

// ── Domain Taxonomy for Cross-Domain Discovery ──────────────────────────

/**
 * Broad domain categories for system wiki pages.
 * Used to detect cross-domain citations (e.g., a sales page cited in logistics reasoning).
 */
export const DOMAIN_TAXONOMY: Record<string, string[]> = {
  finance: ["accounting", "invoicing", "cash-flow", "budgeting", "tax", "audit", "financial-analysis", "revenue", "pricing"],
  operations: ["logistics", "warehouse", "supply-chain", "procurement", "inventory", "manufacturing", "quality-control"],
  sales: ["negotiation", "pipeline", "crm", "pricing-strategy", "proposal", "client-management", "conversion"],
  hr: ["hiring", "onboarding", "performance", "compensation", "compliance", "culture", "retention"],
  legal: ["contracts", "compliance", "regulatory", "ip", "dispute", "data-protection", "gdpr"],
  strategy: ["market-analysis", "competitive", "growth", "positioning", "partnerships", "m-and-a", "due-diligence"],
  technology: ["software", "infrastructure", "security", "data", "automation", "integration", "development"],
  communication: ["email", "meeting", "reporting", "stakeholder", "crisis-communication", "internal-comms"],
  project_management: ["planning", "execution", "risk", "resource-allocation", "agile", "waterfall", "delivery"],
  customer_success: ["support", "retention", "satisfaction", "escalation", "feedback", "churn"],
};

/**
 * Infer the domain of a system wiki page from its slug, title, and content.
 * Returns the best-matching domain key, or null if unclear.
 */
export function inferPageDomain(slug: string, title: string, contentPreview?: string): string | null {
  const text = `${slug} ${title} ${contentPreview ?? ""}`.toLowerCase();

  let bestDomain: string | null = null;
  let bestScore = 0;

  for (const [domain, keywords] of Object.entries(DOMAIN_TAXONOMY)) {
    let score = 0;
    for (const keyword of keywords) {
      if (text.includes(keyword)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestDomain = domain;
    }
  }

  return bestScore >= 1 ? bestDomain : null;
}

/**
 * Check if a citation is cross-domain.
 * Returns the source and target domains if they differ, or null if same domain.
 */
export function detectCrossDomainCitation(
  systemPageSlug: string,
  systemPageTitle: string,
  operatorIndustry: string | null,
  situationTypeSlug: string | null,
): { pageDomain: string; situationDomain: string } | null {
  const pageDomain = inferPageDomain(systemPageSlug, systemPageTitle);
  if (!pageDomain) return null;

  // Infer situation domain from situation type slug and operator industry
  const situationText = `${situationTypeSlug ?? ""} ${operatorIndustry ?? ""}`.toLowerCase();
  const situationDomain = inferPageDomain(situationText, situationText);
  if (!situationDomain) return null;

  if (pageDomain === situationDomain) return null;

  return { pageDomain, situationDomain };
}
