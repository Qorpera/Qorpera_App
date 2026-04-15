// ── Page-type → visibility defaults ────────────────────────────────────────
//
// Single source of truth for which visibility tier a page type receives.
// Imported by wiki-engine, wiki-findings-pass, and wiki-synthesis-pass.

export const PAGE_TYPE_VISIBILITY: Record<string, string> = {
  // Domain-scoped
  domain_hub: "domain",
  external_relationship: "domain",
  process_description: "domain",
  process: "domain",
  project: "domain",
  situation_type: "domain",
  situation_instance: "domain",
  situation_pattern: "domain",
  tool_system: "domain",

  // Findings (domain-scoped)
  findings_domain: "domain",
  findings_process: "domain",
  findings_external: "domain",
  findings_project: "domain",

  // Personal
  person_profile: "personal",
  findings_person: "personal",

  // Management
  findings_overview: "management",
  contradiction_log: "management",
  log: "management",

  // Operator-wide
  company_overview: "operator",
  topic_synthesis: "operator",
  operational_learning: "operator",
  index: "operator",
};

export function getDefaultVisibility(pageType: string): string {
  return PAGE_TYPE_VISIBILITY[pageType] ?? "operator";
}
