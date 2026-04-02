/**
 * Master list of expected business documents for Danish companies.
 *
 * Used during onboarding to detect which foundational documents exist in
 * connected drives (Google Drive, OneDrive, SharePoint) and flag gaps.
 * Documents are layered: a universal base layer for all Danish companies,
 * industry-specific layers (food production, PE-owned), and connector-
 * informed additions.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface ExpectedDocument {
  slug: string;
  name: string;
  nameDa: string;
  searchQueries: string[];
  category: "legal" | "compliance" | "financial" | "operational" | "hr" | "quality" | "governance";
  relevanceConditions: {
    industries?: string[];
    connectors?: string[];
    minEmployees?: number;
    keywords?: string[];
  };
  description: string;
  descriptionDa: string;
  department?: string;
}

// ── Document Registry ──────────────────────────────────────────────────────

export const EXPECTED_DOCUMENTS: ExpectedDocument[] = [
  // ─── Base Layer (all Danish companies) ─────────────────────────────────

  {
    slug: "vedtaegter",
    name: "Articles of association",
    nameDa: "Vedtægter",
    searchQueries: ["vedtægter", "articles of association", "selskabets vedtægter"],
    category: "legal",
    relevanceConditions: {},
    description: "The company's articles of association registered with the Danish Business Authority.",
    descriptionDa: "Selskabets vedtægter registreret hos Erhvervsstyrelsen.",
  },
  {
    slug: "forsikringspolice",
    name: "Insurance policy",
    nameDa: "Forsikringspolice",
    searchQueries: ["forsikringspolice", "forsikring", "insurance policy", "erhvervsforsikring"],
    category: "legal",
    relevanceConditions: {},
    description: "Active business insurance policies covering liability, property, and operations.",
    descriptionDa: "Aktive erhvervsforsikringer der dækker ansvar, ejendom og drift.",
  },
  {
    slug: "aarsrapport",
    name: "Annual report",
    nameDa: "Årsrapport",
    searchQueries: ["årsrapport", "annual report", "årsregnskab", "regnskab"],
    category: "financial",
    relevanceConditions: {},
    description: "The most recent annual report filed with the Danish Business Authority.",
    descriptionDa: "Seneste årsrapport indsendt til Erhvervsstyrelsen.",
    department: "Økonomi",
  },
  {
    slug: "budget",
    name: "Annual budget",
    nameDa: "Budget",
    searchQueries: ["budget", "årsbudget", "annual budget"],
    category: "financial",
    relevanceConditions: {},
    description: "The current fiscal year budget with revenue and cost projections.",
    descriptionDa: "Indeværende regnskabsårs budget med omsætnings- og omkostningsprognoser.",
    department: "Økonomi",
  },
  {
    slug: "forretningsplan",
    name: "Business plan",
    nameDa: "Forretningsplan",
    searchQueries: ["forretningsplan", "business plan", "strategiplan", "strategi"],
    category: "governance",
    relevanceConditions: {},
    description: "The company's current business plan or strategic plan.",
    descriptionDa: "Virksomhedens gældende forretningsplan eller strategiplan.",
    department: "Ledelse",
  },
  {
    slug: "medarbejderhaandbog",
    name: "Employee handbook",
    nameDa: "Medarbejderhåndbog",
    searchQueries: ["medarbejderhåndbog", "personalehåndbog", "employee handbook"],
    category: "hr",
    relevanceConditions: {},
    description: "Internal handbook covering employment terms, policies, and procedures.",
    descriptionDa: "Intern håndbog med ansættelsesvilkår, politikker og procedurer.",
    department: "HR",
  },
  {
    slug: "apv",
    name: "Workplace risk assessment",
    nameDa: "APV",
    searchQueries: ["APV", "arbejdspladsvurdering", "workplace risk assessment"],
    category: "compliance",
    relevanceConditions: {},
    description: "Mandatory workplace risk assessment (APV) required by Danish Working Environment Act.",
    descriptionDa: "Lovpligtig arbejdspladsvurdering i henhold til arbejdsmiljøloven.",
    department: "HR",
  },
  {
    slug: "gdpr_register",
    name: "GDPR register",
    nameDa: "Personaleoplysninger",
    searchQueries: ["GDPR", "persondataregister", "fortegnelse behandlingsaktiviteter", "personaleoplysninger"],
    category: "compliance",
    relevanceConditions: {},
    description: "Register of personal data processing activities as required by GDPR Article 30.",
    descriptionDa: "Fortegnelse over behandlingsaktiviteter i henhold til GDPR artikel 30.",
  },
  {
    slug: "handelsbetingelser",
    name: "Terms of trade",
    nameDa: "Handelsbetingelser",
    searchQueries: ["handelsbetingelser", "salgs- og leveringsbetingelser", "terms of trade"],
    category: "legal",
    relevanceConditions: {},
    description: "Standard terms of sale and delivery applicable to customer transactions.",
    descriptionDa: "Generelle salgs- og leveringsbetingelser for kundetransaktioner.",
  },
  {
    slug: "brandplan",
    name: "Fire safety plan",
    nameDa: "Brandplan",
    searchQueries: ["brandplan", "brandinstruks", "fire safety plan", "beredskabsplan"],
    category: "compliance",
    relevanceConditions: {},
    description: "Fire safety and emergency evacuation plan for company premises.",
    descriptionDa: "Brand- og evakueringsplan for virksomhedens lokaler.",
  },

  // ─── Food Production Layer ─────────────────────────────────────────────

  {
    slug: "haccp_plan",
    name: "HACCP plan",
    nameDa: "HACCP-plan",
    searchQueries: ["HACCP", "hazard analysis", "kritiske kontrolpunkter", "HACCP-plan"],
    category: "quality",
    relevanceConditions: {
      keywords: ["food", "dairy", "ice cream", "beverage", "bakery", "meat", "organic"],
    },
    description: "Hazard Analysis and Critical Control Points plan for food safety management.",
    descriptionDa: "Hazard Analysis and Critical Control Points-plan for fødevaresikkerhedsstyring.",
    department: "Kvalitet",
  },
  {
    slug: "oekologisk_certifikat",
    name: "Organic certificate",
    nameDa: "Økologisk certifikat",
    searchQueries: ["økologisk certifikat", "organic certificate", "økologibevis", "ø-mærke"],
    category: "quality",
    relevanceConditions: {
      keywords: ["food", "dairy", "ice cream", "beverage", "bakery", "meat", "organic"],
    },
    description: "Organic certification from the Danish Veterinary and Food Administration.",
    descriptionDa: "Økologisk certificering fra Fødevarestyrelsen.",
    department: "Kvalitet",
  },
  {
    slug: "allergenoversigt",
    name: "Allergen overview",
    nameDa: "Allergenoversigt",
    searchQueries: ["allergenoversigt", "allergen", "allergener", "allergen overview"],
    category: "quality",
    relevanceConditions: {
      keywords: ["food", "dairy", "ice cream", "beverage", "bakery", "meat", "organic"],
    },
    description: "Allergen management documentation covering all 14 EU-declared allergens.",
    descriptionDa: "Allergenstyrings-dokumentation for alle 14 EU-deklarerede allergener.",
    department: "Kvalitet",
  },
  {
    slug: "foedevaresikkerhedsmanual",
    name: "Food safety manual",
    nameDa: "Fødevaresikkerhedsmanual",
    searchQueries: ["fødevaresikkerhedsmanual", "food safety manual", "fødevaresikkerhed"],
    category: "quality",
    relevanceConditions: {
      keywords: ["food", "dairy", "ice cream", "beverage", "bakery", "meat", "organic"],
    },
    description: "Comprehensive food safety management system manual.",
    descriptionDa: "Komplet manual for fødevaresikkerhedsstyringssystem.",
  },
  {
    slug: "egenkontrolprogram",
    name: "Self-inspection programme",
    nameDa: "Egenkontrolprogram",
    searchQueries: ["egenkontrolprogram", "egenkontrol", "self-inspection", "egenkontroldokumentation"],
    category: "quality",
    relevanceConditions: {
      keywords: ["food", "dairy", "ice cream", "beverage", "bakery", "meat", "organic"],
    },
    description: "Mandatory self-inspection programme as required by Danish food safety regulation.",
    descriptionDa: "Lovpligtigt egenkontrolprogram i henhold til fødevarelovgivningen.",
  },
  {
    slug: "leverandoercertifikater",
    name: "Supplier certificates",
    nameDa: "Leverandørcertifikater",
    searchQueries: ["leverandørcertifikater", "supplier certificates", "leverandørgodkendelse", "leverandørdokumentation"],
    category: "quality",
    relevanceConditions: {
      keywords: ["food", "dairy", "ice cream", "beverage", "bakery", "meat", "organic"],
    },
    description: "Certificates and approval documentation for raw material suppliers.",
    descriptionDa: "Certifikater og godkendelsesdokumentation for råvareleverandører.",
  },
  {
    slug: "produktspecifikationer",
    name: "Product specifications",
    nameDa: "Produktspecifikationer",
    searchQueries: ["produktspecifikationer", "product specifications", "produktspec", "specifikationer"],
    category: "operational",
    relevanceConditions: {
      keywords: ["food", "dairy", "ice cream", "beverage", "bakery", "meat", "organic"],
    },
    description: "Detailed product specifications including ingredients, processes, and packaging.",
    descriptionDa: "Detaljerede produktspecifikationer med ingredienser, processer og emballage.",
    department: "Produktion",
  },
  {
    slug: "rengoringsprogram",
    name: "Cleaning programme",
    nameDa: "Rengøringsprogram",
    searchQueries: ["rengøringsprogram", "rengøringsplan", "cleaning programme", "hygiejneplan"],
    category: "quality",
    relevanceConditions: {
      keywords: ["food", "dairy", "ice cream", "beverage", "bakery", "meat", "organic"],
    },
    description: "Cleaning and sanitation schedules for production areas and equipment.",
    descriptionDa: "Rengørings- og sanitetsplaner for produktionsområder og udstyr.",
  },
  {
    slug: "temperaturovervagning",
    name: "Temperature monitoring SOP",
    nameDa: "Temperaturovervågning SOP",
    searchQueries: ["temperaturovervågning", "temperaturlog", "temperature monitoring", "kølekontrol"],
    category: "quality",
    relevanceConditions: {
      keywords: ["food", "dairy", "ice cream", "beverage", "bakery", "meat", "organic"],
    },
    description: "Standard operating procedure for temperature monitoring during storage and transport.",
    descriptionDa: "Standardprocedure for temperaturovervågning under opbevaring og transport.",
  },
  {
    slug: "sporbarhedsprocedure",
    name: "Traceability procedure",
    nameDa: "Sporbarhedsprocedure",
    searchQueries: ["sporbarhed", "sporbarhedsprocedure", "traceability", "lot tracking"],
    category: "quality",
    relevanceConditions: {
      keywords: ["food", "dairy", "ice cream", "beverage", "bakery", "meat", "organic"],
    },
    description: "Traceability procedures for tracking raw materials through to finished products.",
    descriptionDa: "Sporbarhedsprocedurer for sporing af råvarer til færdigvarer.",
  },
  {
    slug: "massebalance",
    name: "Organic mass balance",
    nameDa: "Massebalance",
    searchQueries: ["massebalance", "mass balance", "økologisk massebalance", "organic mass balance"],
    category: "quality",
    relevanceConditions: {
      keywords: ["food", "dairy", "ice cream", "beverage", "bakery", "meat", "organic"],
    },
    description: "Organic mass balance records reconciling organic inputs with outputs.",
    descriptionDa: "Økologisk massebalance der afstemmer økologiske inputs med outputs.",
    department: "Kvalitet",
  },
  {
    slug: "inspektionsrapporter",
    name: "Inspection reports",
    nameDa: "Inspektionsrapporter",
    searchQueries: ["inspektionsrapporter", "kontrolrapport", "inspection report", "fødevarekontrol"],
    category: "compliance",
    relevanceConditions: {
      keywords: ["food", "dairy", "ice cream", "beverage", "bakery", "meat", "organic"],
    },
    description: "Reports from food safety inspections by the Danish Veterinary and Food Administration.",
    descriptionDa: "Rapporter fra fødevarekontrol udført af Fødevarestyrelsen.",
    department: "Kvalitet",
  },

  // ─── PE-Owned Layer ────────────────────────────────────────────────────

  {
    slug: "ejeraftale",
    name: "Shareholders' agreement",
    nameDa: "Ejeraftale",
    searchQueries: ["ejeraftale", "aktionæroverenskomst", "shareholders agreement"],
    category: "governance",
    relevanceConditions: {
      keywords: ["kapitalfond", "DSK", "investment", "bestyrelsesformand"],
    },
    description: "Agreement between shareholders governing ownership rights and obligations.",
    descriptionDa: "Aftale mellem ejere om ejerrettigheder og -forpligtelser.",
  },
  {
    slug: "bestyrelsesforretningsorden",
    name: "Board rules of procedure",
    nameDa: "Bestyrelsesforretningsorden",
    searchQueries: ["bestyrelsesforretningsorden", "forretningsorden", "board rules of procedure"],
    category: "governance",
    relevanceConditions: {
      keywords: ["kapitalfond", "DSK", "investment", "bestyrelsesformand"],
    },
    description: "Formal rules of procedure governing board meetings and decision-making.",
    descriptionDa: "Formel forretningsorden for bestyrelsesmøder og beslutningstagning.",
  },
  {
    slug: "rapporteringsskabeloner",
    name: "Reporting templates",
    nameDa: "Rapporteringsskabeloner",
    searchQueries: ["rapporteringsskabelon", "reporting template", "board reporting", "bestyrelsesrapportering"],
    category: "governance",
    relevanceConditions: {
      keywords: ["kapitalfond", "DSK", "investment", "bestyrelsesformand"],
    },
    description: "Standardised reporting templates for board and investor reporting cycles.",
    descriptionDa: "Standardiserede rapporteringsskabeloner til bestyrelses- og investorrapportering.",
    department: "Ledelse",
  },
  {
    slug: "esg_rapport",
    name: "ESG report",
    nameDa: "ESG-rapport",
    searchQueries: ["ESG", "ESG-rapport", "bæredygtighedsrapport", "sustainability report"],
    category: "governance",
    relevanceConditions: {
      keywords: ["kapitalfond", "DSK", "investment", "bestyrelsesformand"],
    },
    description: "Environmental, Social, and Governance report for investor and regulatory compliance.",
    descriptionDa: "Miljø-, social- og governance-rapport til investor- og regulatorisk compliance.",
    department: "Ledelse",
  },
  {
    slug: "social_impact",
    name: "Social impact reporting",
    nameDa: "Social impact rapportering",
    searchQueries: ["social impact", "samfundsansvar", "CSR rapport", "impact rapportering"],
    category: "governance",
    relevanceConditions: {
      keywords: ["kapitalfond", "DSK", "investment", "bestyrelsesformand"],
    },
    description: "Social impact and corporate social responsibility reporting documentation.",
    descriptionDa: "Social impact- og CSR-rapporteringsdokumentation.",
    department: "Ledelse",
  },

  // ─── Connector-Informed Layer ──────────────────────────────────────────

  {
    slug: "gs1_edi",
    name: "GS1/EDI setup",
    nameDa: "GS1/EDI opsætning",
    searchQueries: ["GS1", "EDI", "EDI opsætning", "GS1 opsætning"],
    category: "operational",
    relevanceConditions: {
      connectors: ["economic", "tracezilla"],
      keywords: ["retail", "EDI"],
    },
    description: "GS1 and EDI configuration for electronic data interchange with retail partners.",
    descriptionDa: "GS1- og EDI-opsætning til elektronisk dataudveksling med detailhandelspartnere.",
  },
  {
    slug: "atp_certifikat",
    name: "ATP certificate for vehicles",
    nameDa: "ATP-certifikat for køretøjer",
    searchQueries: ["ATP-certifikat", "ATP certifikat", "køletransport certifikat", "ATP agreement"],
    category: "compliance",
    relevanceConditions: {
      connectors: ["shipmondo"],
    },
    description: "ATP certificate for temperature-controlled transport vehicles.",
    descriptionDa: "ATP-certifikat for temperaturkontrollerede transportkøretøjer.",
  },
  {
    slug: "overenskomst",
    name: "Collective agreement",
    nameDa: "Overenskomst",
    searchQueries: ["overenskomst", "collective agreement", "faglig overenskomst"],
    category: "hr",
    relevanceConditions: {
      minEmployees: 20,
    },
    description: "Collective bargaining agreement with relevant trade union(s).",
    descriptionDa: "Kollektiv overenskomst med relevante fagforbund.",
  },
];

// ── Filter Function ────────────────────────────────────────────────────────

/**
 * Returns the subset of EXPECTED_DOCUMENTS that are relevant to a specific
 * company based on its industry, connected tools, size, and content keywords.
 *
 * A document is included when ALL non-empty conditions match:
 *  - industries: company industry appears in the list (case-insensitive)
 *  - connectors: at least one connected provider matches
 *  - minEmployees: company meets the threshold
 *  - keywords: at least one keyword appears in the industry string or content keywords
 *
 * Documents with empty relevanceConditions (base layer) are always included.
 */
export function getRelevantDocuments(opts: {
  industry: string;
  connectorProviders: string[];
  employeeCount: number;
  contentKeywords?: string[];
}): ExpectedDocument[] {
  const industryLower = opts.industry.toLowerCase();
  const connectorsLower = opts.connectorProviders.map((c) => c.toLowerCase());
  const contentLower = (opts.contentKeywords ?? []).map((k) => k.toLowerCase());

  return EXPECTED_DOCUMENTS.filter((doc) => {
    const cond = doc.relevanceConditions;

    // Base-layer documents (no conditions) are always relevant
    const hasAnyCondition =
      (cond.industries && cond.industries.length > 0) ||
      (cond.connectors && cond.connectors.length > 0) ||
      cond.minEmployees !== undefined ||
      (cond.keywords && cond.keywords.length > 0);

    if (!hasAnyCondition) return true;

    // Industry filter: at least one listed industry matches
    if (cond.industries && cond.industries.length > 0) {
      const matches = cond.industries.some(
        (ind) => industryLower.includes(ind.toLowerCase()),
      );
      if (!matches) return false;
    }

    // Connector filter: at least one connected provider matches
    if (cond.connectors && cond.connectors.length > 0) {
      const matches = cond.connectors.some((conn) =>
        connectorsLower.includes(conn.toLowerCase()),
      );
      if (!matches) return false;
    }

    // Employee count filter
    if (cond.minEmployees !== undefined) {
      if (opts.employeeCount < cond.minEmployees) return false;
    }

    // Keyword filter: at least one keyword appears in industry or content keywords
    if (cond.keywords && cond.keywords.length > 0) {
      const matches = cond.keywords.some((kw) => {
        const kwLower = kw.toLowerCase();
        return (
          industryLower.includes(kwLower) ||
          contentLower.some((ck) => ck.includes(kwLower))
        );
      });
      if (!matches) return false;
    }

    return true;
  });
}
