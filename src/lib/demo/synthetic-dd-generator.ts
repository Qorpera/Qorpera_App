// ── Dynamic DD Project Generator ────────────────────────────────────────
// Generates unique, randomized DD project data with seeded PRNG.
// Each run with the same seed produces identical output.

import { prisma } from "@/lib/db";

// ── Types ───────────────────────────────────────────────────────────────

export interface TargetCompanyProfile {
  name: string;
  industry: string;
  revenue: number;
  revenueGrowth: number;
  employeeCount: number;
  topCustomerConcentration: number;
  ebitdaMargin: number;
  debtLevel: number;
  contractCount: number;
  missingDocumentCount: number;
  pendingLitigationCount: number;
  keyPersonRisk: "low" | "medium" | "high";
  techStackAge: "modern" | "mixed" | "legacy";
  riskProfile: "clean" | "moderate" | "complex";
}

// ── Seeded PRNG (mulberry32) ────────────────────────────────────────────

function createRng(seed: number) {
  let s = seed | 0;
  return {
    next(): number {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(min: number, max: number): number {
      return Math.floor(this.next() * (max - min + 1)) + min;
    },
    float(min: number, max: number): number {
      return this.next() * (max - min) + min;
    },
    pick<T>(arr: readonly T[]): T {
      return arr[Math.floor(this.next() * arr.length)];
    },
    weighted<T>(items: readonly T[], weights: readonly number[]): T {
      const total = weights.reduce((a, b) => a + b, 0);
      let r = this.next() * total;
      for (let i = 0; i < items.length; i++) {
        r -= weights[i];
        if (r <= 0) return items[i];
      }
      return items[items.length - 1];
    },
    shuffle<T>(arr: T[]): T[] {
      const out = [...arr];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(this.next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}

// ── Name pools ──────────────────────────────────────────────────────────

const SURNAMES = [
  "Vestergaard", "Krogh", "Lindberg", "Andersen", "Nielsen", "Pedersen",
  "Mortensen", "Søndergaard", "Henriksen", "Lauridsen", "Bjerregaard",
  "Thomsen", "Rasmussen", "Jørgensen", "Christensen", "Poulsen",
];

const INDUSTRY_WORDS = [
  "Solutions", "Manufacturing", "Systems", "Industries", "Group",
  "Components", "Services", "Engineering", "Dynamics", "Works",
];

const GEO_PREFIXES = [
  "Nordmark", "Fjord", "Kolding", "Odense", "Aalborg", "Aarhus",
  "Esbjerg", "Randers", "Herning", "Svendborg", "Viborg", "Silkeborg",
];

const NORDIC_WORDS = [
  "Ørsted", "Vidar", "Freja", "Baldur", "Saga", "Njord",
  "Tyr", "Idun", "Bragi", "Fenris", "Yggdrasil", "Valhalla",
];

const DANISH_ADJECTIVES = [
  "Grøn", "Blå", "Hvid", "Stor", "Ny", "Klar",
];

const DANISH_NOUNS = [
  "Energi", "Himmel", "Vand", "Lys", "Kraft", "Data",
];

const INDUSTRIES = [
  "SaaS", "Manufacturing", "Professional Services", "E-commerce",
  "Logistics", "Food & Beverage", "Clean Energy", "IT Services",
  "Healthcare Tech", "Construction",
] as const;

const INDUSTRY_EBITDA_RANGE: Record<string, [number, number]> = {
  "SaaS": [10, 30],
  "Manufacturing": [8, 20],
  "Professional Services": [12, 28],
  "E-commerce": [5, 18],
  "Logistics": [6, 16],
  "Food & Beverage": [7, 18],
  "Clean Energy": [10, 25],
  "IT Services": [12, 25],
  "Healthcare Tech": [8, 22],
  "Construction": [5, 15],
};

// ── Customer name generation ────────────────────────────────────────────

const CUSTOMER_PREFIXES = [
  "Maersk", "DSV", "PostNord", "Vestas", "Novo", "Grundfos", "Danfoss",
  "FLSmidth", "Carlsberg", "ISS", "GN Audio", "Demant", "Coloplast",
  "Rockwool", "Pandora", "JYSK", "Ørsted", "Matas", "Salling",
  "Coop", "Arla", "Danish Crown", "Bestseller", "KMD", "NNIT",
  "Netcompany", "Trifork", "SimCorp", "BankData", "ATP",
];

const CUSTOMER_SUFFIXES = [
  "Logistics", "Solutions", "Danmark", "Nordic", "Systems",
  "Group", "Services", "International", "Tech", "",
];

function generateCustomerName(rng: ReturnType<typeof createRng>): string {
  return `${rng.pick(CUSTOMER_PREFIXES)} ${rng.pick(CUSTOMER_SUFFIXES)}`.trim();
}

// ── Profile generation ──────────────────────────────────────────────────

function generateTargetProfile(
  rng: ReturnType<typeof createRng>,
  overrides?: Partial<TargetCompanyProfile>,
): TargetCompanyProfile {
  // Name
  const nameStyle = rng.int(0, 3);
  let name: string;
  if (nameStyle === 0) name = `${rng.pick(SURNAMES)} ${rng.pick(INDUSTRY_WORDS)}`;
  else if (nameStyle === 1) name = `${rng.pick(GEO_PREFIXES)} ${rng.pick(INDUSTRY_WORDS)}`;
  else if (nameStyle === 2) name = `${rng.pick(NORDIC_WORDS)} ${rng.pick(INDUSTRY_WORDS)}`;
  else name = `${rng.pick(DANISH_ADJECTIVES)} ${rng.pick(DANISH_NOUNS)} ${rng.pick(["A/S", "ApS"])}`;

  const industry = rng.pick(INDUSTRIES);

  // Log-normal revenue distribution (more small companies)
  const logRev = rng.float(Math.log(15), Math.log(200));
  const revenue = Math.round(Math.exp(logRev) * 1_000_000);

  const revenueGrowth = Math.round(rng.float(-5, 35));
  const employeeCount = Math.max(15, Math.round((revenue / 1_000_000) * rng.float(0.5, 1.2)));

  const topCustomerConcentration = Math.round(rng.float(20, 75));

  const [ebitdaMin, ebitdaMax] = INDUSTRY_EBITDA_RANGE[industry] ?? [8, 20];
  const ebitdaMargin = Math.round(rng.float(ebitdaMin, ebitdaMax));

  const debtLevel = Math.round(revenue * rng.float(0, 0.3));
  const contractCount = Math.max(20, Math.round((revenue / 1_000_000) * rng.float(1.5, 4)));
  const missingDocumentCount = rng.int(0, 8);
  const pendingLitigationCount = rng.int(0, 3);

  const keyPersonRisk = rng.weighted(
    ["low", "medium", "high"] as const,
    [60, 30, 10],
  );
  const techStackAge = rng.weighted(
    ["modern", "mixed", "legacy"] as const,
    [40, 40, 20],
  );

  // Compute risk profile
  let riskFactors = 0;
  if (topCustomerConcentration > 50) riskFactors++;
  if (revenueGrowth < 0) riskFactors++;
  if (missingDocumentCount > 3) riskFactors++;
  if (pendingLitigationCount > 1) riskFactors++;
  if (keyPersonRisk === "high") riskFactors++;
  if (techStackAge === "legacy") riskFactors++;

  const riskProfile: TargetCompanyProfile["riskProfile"] =
    riskFactors <= 1 ? "clean" : riskFactors <= 3 ? "moderate" : "complex";

  return {
    name, industry, revenue, revenueGrowth, employeeCount,
    topCustomerConcentration, ebitdaMargin, debtLevel, contractCount,
    missingDocumentCount, pendingLitigationCount, keyPersonRisk,
    techStackAge, riskProfile,
    ...overrides,
  };
}

// ── Deliverable content generators ──────────────────────────────────────

function fmt(n: number): string {
  return `DKK ${(n / 1_000_000).toFixed(1)}M`;
}

function generateCustomers(rng: ReturnType<typeof createRng>, profile: TargetCompanyProfile) {
  const top3Pct = profile.topCustomerConcentration;
  const top3Rev = Math.round(profile.revenue * top3Pct / 100);
  const splits = [rng.float(0.35, 0.5), rng.float(0.25, 0.35)];
  splits.push(1 - splits[0] - splits[1]);

  return [
    { name: generateCustomerName(rng), revenue: Math.round(top3Rev * splits[0]) },
    { name: generateCustomerName(rng), revenue: Math.round(top3Rev * splits[1]) },
    { name: generateCustomerName(rng), revenue: Math.round(top3Rev * splits[2]) },
    { name: generateCustomerName(rng), revenue: Math.round(profile.revenue * rng.float(0.04, 0.08)) },
    { name: generateCustomerName(rng), revenue: Math.round(profile.revenue * rng.float(0.02, 0.05)) },
  ];
}

function genRevenueContent(rng: ReturnType<typeof createRng>, p: TargetCompanyProfile, customers: ReturnType<typeof generateCustomers>) {
  const isSaaS = p.industry === "SaaS" || p.industry === "IT Services" || p.industry === "Healthcare Tech";
  const concRisk = p.topCustomerConcentration > 40 ? "high" : p.topCustomerConcentration > 30 ? "medium" : "low";

  return {
    sections: [
      { type: "heading", level: 2, text: "Revenue Quality Assessment" },
      { type: "heading", level: 3, text: "Executive Summary" },
      { type: "paragraph", text: `${p.name} generated ${fmt(p.revenue)} in revenue for FY2025, representing ${p.revenueGrowth}% YoY growth. ${isSaaS ? `Revenue is split between recurring subscriptions (${rng.int(60, 80)}%) and professional services (${rng.int(15, 30)}%).` : `Revenue is primarily driven by ${p.industry.toLowerCase()} operations with ${p.contractCount} active customer contracts.`}` },
      { type: "heading", level: 3, text: "Customer Concentration" },
      { type: "paragraph", text: `Top 3 customers account for ${p.topCustomerConcentration}% of total revenue: ${customers[0].name} (${fmt(customers[0].revenue)}), ${customers[1].name} (${fmt(customers[1].revenue)}), and ${customers[2].name} (${fmt(customers[2].revenue)}).` },
      ...(concRisk !== "low" ? [{ type: "risk" as const, severity: concRisk, text: `Risk \u2014 Customer concentration: Top 3 customers = ${p.topCustomerConcentration}% of revenue.${concRisk === "high" ? " Loss of any single top customer would materially impact revenue trajectory." : ""}` }] : []),
      { type: "evidence", text: `Evidence: Transaction data from accounting system, cross-referenced with CRM deal records. ${customers.length} customer accounts analyzed.` },
      ...(p.revenueGrowth < 5 ? [{ type: "risk" as const, severity: "medium", text: `Risk \u2014 Revenue growth: ${p.revenueGrowth}% YoY growth is below market average for ${p.industry}.` }] : []),
      { type: "completeness_ok", text: "Transaction data: 36 months, complete" },
      { type: "completeness_ok", text: `Customer records: All ${p.contractCount} active contracts verified` },
      ...(p.missingDocumentCount > 0 ? [{ type: "completeness_gap" as const, text: `Contract documents: ${p.contractCount - p.missingDocumentCount} of ${p.contractCount} located (${p.missingDocumentCount} missing)` }] : []),
    ],
  };
}

function genEbitdaContent(rng: ReturnType<typeof createRng>, p: TargetCompanyProfile) {
  const ebitda = Math.round(p.revenue * p.ebitdaMargin / 100);
  const adjustmentPct = rng.float(0.1, 0.25);
  const totalAdj = Math.round(ebitda * adjustmentPct);
  const adj1 = Math.round(totalAdj * rng.float(0.3, 0.5));
  const adj2 = Math.round(totalAdj * rng.float(0.2, 0.35));
  const adj3 = totalAdj - adj1 - adj2;
  const adjEbitda = ebitda + totalAdj;
  const adjMargin = ((adjEbitda / p.revenue) * 100).toFixed(1);

  return {
    sections: [
      { type: "heading", level: 2, text: "EBITDA Normalization" },
      { type: "heading", level: 3, text: "Executive Summary" },
      { type: "paragraph", text: `Reported EBITDA for FY2025 is ${fmt(ebitda)} (${p.ebitdaMargin}% margin). After normalization adjustments totaling ${fmt(totalAdj)}, adjusted EBITDA stands at ${fmt(adjEbitda)} (${adjMargin}% margin).` },
      { type: "heading", level: 3, text: "Adjustment Details" },
      { type: "paragraph", text: `1. Owner/founder compensation normalization: ${fmt(adj1)} (benchmarked to industry median)\n2. One-time legal and consulting costs: ${fmt(adj2)}\n3. Non-recurring recruitment and restructuring: ${fmt(adj3)}` },
      ...(totalAdj / ebitda > 0.2 ? [{ type: "risk" as const, severity: "medium", text: `Risk \u2014 Normalization magnitude: Adjustments represent ${Math.round(adjustmentPct * 100)}% of reported EBITDA. Elevated scrutiny warranted.` }] : []),
      { type: "completeness_ok", text: "P&L data: 36 months, complete and reconciled" },
      { type: "completeness_ok", text: "Adjustment documentation: All adjustments supported by source documents" },
    ],
  };
}

function genWorkingCapitalContent(rng: ReturnType<typeof createRng>, p: TargetCompanyProfile) {
  const wcPct = rng.float(0.15, 0.25);
  const wc = Math.round(p.revenue * wcPct);
  const seasonal = ["Food & Beverage", "Construction", "E-commerce"].includes(p.industry);
  const dso = rng.int(28, 55);

  return {
    sections: [
      { type: "heading", level: 2, text: "Working Capital Analysis" },
      { type: "heading", level: 3, text: "Executive Summary" },
      { type: "paragraph", text: `Normalized working capital is ${fmt(wc)}.${seasonal ? ` Significant seasonal variation identified \u2014 Q4 working capital is approximately ${rng.int(30, 80)}% above Q2 levels.` : ""} Accounts receivable DSO is ${dso} days${dso > 45 ? ", above industry benchmark" : ", in line with industry"}.` },
      ...(seasonal ? [{ type: "risk" as const, severity: "low", text: "Risk \u2014 Seasonal distortion: Working capital peg should use 12-month average, not period-end snapshot." }] : []),
      ...(dso > 50 ? [{ type: "risk" as const, severity: "medium", text: `Risk \u2014 Collection efficiency: DSO of ${dso} days suggests potential collection issues.` }] : []),
      { type: "completeness_ok", text: "Balance sheet data: 36 months, complete" },
      { type: "completeness_gap", text: `Aged receivables breakdown: Available for last ${rng.int(12, 24)} months only` },
    ],
  };
}

function genDebtContent(rng: ReturnType<typeof createRng>, p: TargetCompanyProfile) {
  const ebitda = Math.round(p.revenue * p.ebitdaMargin / 100);
  const debtToEbitda = ebitda > 0 ? p.debtLevel / ebitda : 0;
  const facilityCount = p.debtLevel > 0 ? rng.int(1, 3) : 0;

  return {
    sections: [
      { type: "heading", level: 2, text: "Debt & Liabilities Review" },
      { type: "heading", level: 3, text: "Executive Summary" },
      { type: "paragraph", text: p.debtLevel > 0
        ? `Total outstanding debt is ${fmt(p.debtLevel)}, consisting of ${facilityCount} facilit${facilityCount === 1 ? "y" : "ies"}. Net Debt / EBITDA ratio is ${debtToEbitda.toFixed(1)}x.${p.pendingLitigationCount > 0 ? ` ${p.pendingLitigationCount} pending litigation matter${p.pendingLitigationCount > 1 ? "s" : ""} identified.` : " No off-balance-sheet liabilities identified."}`
        : "The company operates debt-free. No financial liabilities beyond standard trade payables identified." },
      ...(debtToEbitda > 3 ? [{ type: "risk" as const, severity: "high", text: `Risk \u2014 Leverage: Net Debt / EBITDA of ${debtToEbitda.toFixed(1)}x exceeds the 3.5x threshold. Lender sensitivity analysis recommended.` }] : []),
      ...(p.pendingLitigationCount > 0 ? [{ type: "risk" as const, severity: p.pendingLitigationCount > 1 ? "high" : "medium", text: `Risk \u2014 Pending litigation: ${p.pendingLitigationCount} active claim${p.pendingLitigationCount > 1 ? "s" : ""}. Legal counsel assessment of materiality required.` }] : []),
      { type: "completeness_ok", text: "Loan agreements: All reviewed and terms confirmed" },
      { type: p.pendingLitigationCount > 0 ? "completeness_gap" : "completeness_ok", text: p.pendingLitigationCount > 0 ? "Litigation files: Partial documentation received" : "Contingent liabilities: Legal review complete, no material exposure" },
    ],
  };
}

function genCustomerConcentrationContent(rng: ReturnType<typeof createRng>, p: TargetCompanyProfile, customers: ReturnType<typeof generateCustomers>) {
  const highRisk = p.topCustomerConcentration > 50;
  const medRisk = p.topCustomerConcentration > 40;

  return {
    sections: [
      { type: "heading", level: 2, text: "Customer Concentration Analysis" },
      { type: "heading", level: 3, text: "Executive Summary" },
      { type: "paragraph", text: `Top 3 customers represent ${p.topCustomerConcentration}% of revenue. ${customers[0].name} alone accounts for ${Math.round(customers[0].revenue / p.revenue * 100)}%. Churn among remaining customers is ${rng.float(2, 8).toFixed(1)}% annual gross churn.` },
      ...(medRisk ? [{ type: "risk" as const, severity: highRisk ? "high" : "medium", text: `Risk \u2014 ${customers[0].name} dependency: Single customer = ${Math.round(customers[0].revenue / p.revenue * 100)}% of revenue.${highRisk ? " Loss would materially impact business viability." : ""}` }] : []),
      { type: "completeness_ok", text: "Customer revenue data: Complete, cross-referenced with accounting and CRM" },
    ],
  };
}

function genContractContent(rng: ReturnType<typeof createRng>, p: TargetCompanyProfile) {
  const reviewed = p.contractCount - p.missingDocumentCount;
  const cocCount = rng.int(0, Math.min(3, Math.floor(p.contractCount / 15)));

  return {
    sections: [
      { type: "heading", level: 2, text: "Contract Portfolio Review" },
      { type: "heading", level: 3, text: "Executive Summary" },
      { type: "paragraph", text: `${p.contractCount} active contracts reviewed. ${reviewed} located in data room.${cocCount > 0 ? ` ${cocCount} contract${cocCount > 1 ? "s" : ""} contain${cocCount === 1 ? "s" : ""} change-of-control clauses.` : " No change-of-control clauses identified."}` },
      ...(cocCount > 0 ? [{ type: "risk" as const, severity: "high", text: `Risk \u2014 Change-of-control: ${cocCount} contract${cocCount > 1 ? "s" : ""} include CoC provisions allowing termination within 30 days of ownership change.` }] : []),
      ...(p.missingDocumentCount > 2 ? [{ type: "risk" as const, severity: "medium", text: `Risk \u2014 Missing documentation: ${p.missingDocumentCount} contracts not located in data room.` }] : []),
      { type: p.missingDocumentCount > 0 ? "completeness_gap" : "completeness_ok", text: `Contract documents: ${reviewed} of ${p.contractCount} located` },
    ],
  };
}

function genEmployeeContent(rng: ReturnType<typeof createRng>, p: TargetCompanyProfile) {
  const retention = rng.float(82, 96).toFixed(0);

  return {
    sections: [
      { type: "heading", level: 2, text: "Employee & Key Person Risk" },
      { type: "heading", level: 3, text: "Executive Summary" },
      { type: "paragraph", text: `${p.name} has ${p.employeeCount} FTEs. Annual retention rate is ${retention}%.${p.keyPersonRisk === "high" ? " Critical key person dependencies identified \u2014 2-3 individuals hold undocumented knowledge with no succession plan." : p.keyPersonRisk === "medium" ? " Some key person coverage gaps identified in technical roles." : " Adequate bench strength across critical functions."}` },
      ...(p.keyPersonRisk !== "low" ? [{ type: "risk" as const, severity: p.keyPersonRisk === "high" ? "high" : "medium", text: `Risk \u2014 Key person dependency: ${p.keyPersonRisk === "high" ? "Critical roles have no documented succession plan. Single-threaded knowledge in core operations." : "Partial coverage gaps in technical and leadership roles."}` }] : []),
      { type: "completeness_ok", text: "Employee roster: Complete, verified against payroll data" },
      { type: "completeness_gap", text: `Employment contracts: ${p.employeeCount - rng.int(2, 8)} of ${p.employeeCount} reviewed` },
    ],
  };
}

function genTechContent(rng: ReturnType<typeof createRng>, p: TargetCompanyProfile) {
  const techDesc = {
    modern: "Cloud-native architecture with modern CI/CD pipelines. Test coverage above 70%. Low technical debt.",
    mixed: "Partially modernized stack with some legacy components. Migration to cloud in progress. Moderate technical debt in core modules.",
    legacy: "Predominantly legacy technology stack. On-premise hosting with manual deployment. Significant technical debt requiring multi-year modernization program.",
  };

  return {
    sections: [
      { type: "heading", level: 2, text: "Technology Stack Assessment" },
      { type: "heading", level: 3, text: "Executive Summary" },
      { type: "paragraph", text: techDesc[p.techStackAge] },
      ...(p.techStackAge === "legacy" ? [{ type: "risk" as const, severity: "high", text: "Risk \u2014 Technical debt: Legacy systems require significant investment to modernize. Estimated migration cost should be factored into valuation." }] : p.techStackAge === "mixed" ? [{ type: "risk" as const, severity: "medium", text: "Risk \u2014 Migration in progress: Ongoing modernization creates execution risk during ownership transition." }] : []),
      { type: p.techStackAge === "legacy" ? "completeness_gap" : "completeness_ok", text: p.techStackAge === "legacy" ? "Technology documentation: Limited — much knowledge is tribal" : "Technology documentation: Architecture docs and deployment procedures reviewed" },
    ],
  };
}

function genTaxContent(rng: ReturnType<typeof createRng>, p: TargetCompanyProfile) {
  const findings = rng.int(0, 1);
  return {
    sections: [
      { type: "heading", level: 2, text: "Tax Compliance Review" },
      { type: "heading", level: 3, text: "Executive Summary" },
      { type: "paragraph", text: `${p.name} is compliant with Danish corporate tax obligations. Effective tax rate of ${rng.float(21, 24).toFixed(1)}% aligns with statutory rate.${findings > 0 ? " One minor VAT filing discrepancy identified and corrected." : " No issues identified."}` },
      ...(findings > 0 ? [{ type: "risk" as const, severity: "low", text: "Risk \u2014 Minor VAT discrepancy: Historical filing correction required. No material exposure." }] : []),
      { type: "completeness_ok", text: "Tax returns: Last 3 years reviewed" },
    ],
  };
}

function genRegulatoryContent(rng: ReturnType<typeof createRng>, p: TargetCompanyProfile) {
  const heavy = ["Manufacturing", "Food & Beverage", "Clean Energy", "Healthcare Tech", "Construction"].includes(p.industry);
  const findingCount = heavy ? rng.int(1, 3) : rng.int(0, 1);

  return {
    sections: [
      { type: "heading", level: 2, text: "Regulatory & License Audit" },
      { type: "heading", level: 3, text: "Executive Summary" },
      { type: "paragraph", text: `${heavy ? `${p.industry} sector subject to significant regulatory oversight.` : "Standard regulatory requirements."} ${findingCount > 0 ? `${findingCount} item${findingCount > 1 ? "s" : ""} flagged for attention.` : "All licenses and certifications current."}` },
      ...(findingCount > 0 ? [{ type: "risk" as const, severity: findingCount > 1 ? "medium" : "low", text: `Risk \u2014 Regulatory compliance: ${findingCount} finding${findingCount > 1 ? "s" : ""} requiring remediation.` }] : []),
      { type: "completeness_ok", text: "Regulatory filings: All reviewed" },
    ],
  };
}

function genVendorContent(rng: ReturnType<typeof createRng>, p: TargetCompanyProfile) {
  const singleSource = ["Manufacturing", "Construction", "Food & Beverage"].includes(p.industry) ? rng.int(0, 2) : rng.int(0, 1);

  return {
    sections: [
      { type: "heading", level: 2, text: "Vendor Dependency Analysis" },
      { type: "heading", level: 3, text: "Executive Summary" },
      { type: "paragraph", text: `${rng.int(12, 25)} material vendor relationships reviewed.${singleSource > 0 ? ` ${singleSource} single-source dependenc${singleSource > 1 ? "ies" : "y"} identified.` : " No single-source dependencies identified for critical operations."}` },
      ...(singleSource > 0 ? [{ type: "risk" as const, severity: "medium", text: `Risk \u2014 Vendor concentration: ${singleSource} critical input${singleSource > 1 ? "s have" : " has"} only one qualified supplier.` }] : []),
      { type: "completeness_ok", text: "Vendor contracts: All material agreements reviewed" },
    ],
  };
}

function genIPContent(rng: ReturnType<typeof createRng>, p: TargetCompanyProfile) {
  const hasIP = ["SaaS", "Healthcare Tech", "IT Services"].includes(p.industry);
  const hasPatents = ["Manufacturing", "Clean Energy"].includes(p.industry) && rng.next() > 0.5;
  const patentAppCount = rng.int(1, 3);
  const processPatentCount = rng.int(1, 4);

  let ipText: string;
  if (hasIP) {
    ipText = `${p.name} holds proprietary software IP. ${rng.int(0, 2) > 0 ? "No patents filed \u2014 algorithms are trade secrets only." : `${patentAppCount} patent application${patentAppCount > 1 ? "s" : ""} pending.`} IP assignment clauses reviewed in employment contracts.`;
  } else if (hasPatents) {
    ipText = `${processPatentCount} process patent${processPatentCount > 1 ? "s" : ""} registered. Standard trade secret protections in place.`;
  } else {
    ipText = "Limited IP portfolio. Business value is primarily in customer relationships and operational know-how.";
  }

  return {
    sections: [
      { type: "heading", level: 2, text: "IP & Patent Analysis" },
      { type: "heading", level: 3, text: "Executive Summary" },
      { type: "paragraph", text: ipText },
      ...(hasIP && p.keyPersonRisk === "high" ? [{ type: "risk" as const, severity: "medium", text: "Risk \u2014 IP concentration: Core IP knowledge held by key individuals without adequate documentation." }] : []),
      { type: hasIP ? "completeness_ok" : "completeness_gap", text: hasIP ? "IP documentation: Reviewed and catalogued" : "IP documentation: Limited formal documentation exists" },
    ],
  };
}

// ── Completeness report ─────────────────────────────────────────────────

function genCompletenessReport(rng: ReturnType<typeof createRng>, stage: string, confidence: string | null) {
  const coverage = stage === "deliverable" ? rng.int(90, 100) : stage === "workboard" ? rng.int(70, 92) : rng.int(55, 80);

  return {
    sections: [
      { name: "Financial data", status: coverage > 85 ? "complete" : "partial", detail: "Transaction-level accounting data", itemCount: rng.int(500, 1200), confidence: coverage > 85 ? "high" : "medium" },
      { name: "Customer contracts", status: coverage > 80 ? "complete" : "partial", detail: "Customer agreement documentation", itemCount: rng.int(20, 100), confidence: coverage > 80 ? "high" : "medium" },
      { name: "Document repository", status: "complete", detail: "Internal documents and reports", itemCount: rng.int(100, 400), confidence: "high" },
    ],
    contradictions: [],
    overallConfidence: confidence ?? "medium",
    analyzedSources: rng.int(2, 4),
    totalSources: 4,
    coveragePercent: coverage,
  };
}

// ── Main seed function ──────────────────────────────────────────────────

export async function syntheticDDSeedProjectData(
  operatorId: string,
  options?: {
    targetCompanyProfile?: Partial<TargetCompanyProfile>;
    seed?: number;
  },
): Promise<{ projectId: string; targetProfile: TargetCompanyProfile }> {
  const rng = createRng(options?.seed ?? Date.now());
  const profile = generateTargetProfile(rng, options?.targetCompanyProfile);

  console.log(`[dd-gen] Generating DD project for ${profile.name} (${profile.industry}, ${fmt(profile.revenue)}, risk: ${profile.riskProfile})`);

  // ── Find operator users ──────────────────────────────────────────

  const admins = await prisma.user.findMany({
    where: { operatorId, role: { in: ["admin"] } },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });

  const members = await prisma.user.findMany({
    where: { operatorId, role: "member" },
    orderBy: { createdAt: "asc" },
    take: 4,
    select: { id: true, name: true },
  });

  if (admins.length === 0 && members.length === 0) {
    throw new Error("[dd-gen] No users found for operator");
  }

  const allUsers = [...admins, ...members];
  const owner = admins[0] ?? members[0];
  const reviewer = admins[1] ?? members[0] ?? owner;
  const analyst1 = members[0] ?? owner;
  const analyst2 = members[1] ?? reviewer;

  // ── Create project ───────────────────────────────────────────────

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + rng.int(10, 30));

  await prisma.projectTemplate.upsert({
    where: { id: "tmpl-buyside-dd" },
    create: {
      id: "tmpl-buyside-dd",
      operatorId: null,
      name: "Buy-Side Due Diligence",
      category: "financial",
      description: "Comprehensive analysis of a target company for acquisition.",
      analysisFramework: [],
      dataExpectations: [],
    },
    update: {},
  });

  const project = await prisma.project.create({
    data: {
      operatorId,
      templateId: "tmpl-buyside-dd",
      name: `Acquisition DD \u2014 ${profile.name}`,
      description: `Buy-side due diligence on ${profile.name}, a Danish ${profile.industry.toLowerCase()} company.`,
      status: "active",
      createdById: owner.id,
      dueDate,
    },
  });
  const projectId = project.id;

  // ── Members (deduplicated) ───────────────────────────────────────

  const memberDefs: Array<{ userId: string; role: string }> = [];
  const usedIds = new Set<string>();
  for (const m of [
    { userId: owner.id, role: "owner" },
    { userId: reviewer.id, role: "reviewer" },
    { userId: analyst1.id, role: "analyst" },
    { userId: analyst2.id, role: "analyst" },
  ]) {
    if (!usedIds.has(m.userId)) {
      memberDefs.push(m);
      usedIds.add(m.userId);
    }
  }

  for (const m of memberDefs) {
    await prisma.projectMember.create({
      data: { projectId, userId: m.userId, role: m.role, addedById: owner.id },
    });
  }

  // ── Generate deliverable content ─────────────────────────────────

  const customers = generateCustomers(rng, profile);

  const contentGenerators: Array<{ slug: string; title: string; section: string; gen: () => ReturnType<typeof genRevenueContent> }> = [
    { slug: "revenue", title: "Revenue Quality Assessment", section: "revenue-quality", gen: () => genRevenueContent(rng, profile, customers) },
    { slug: "ebitda", title: "EBITDA Normalization", section: "ebitda-norm", gen: () => genEbitdaContent(rng, profile) },
    { slug: "working-capital", title: "Working Capital Analysis", section: "working-capital", gen: () => genWorkingCapitalContent(rng, profile) },
    { slug: "debt", title: "Debt & Liabilities Review", section: "debt-liabilities", gen: () => genDebtContent(rng, profile) },
    { slug: "customer", title: "Customer Concentration Analysis", section: "customer-concentration", gen: () => genCustomerConcentrationContent(rng, profile, customers) },
    { slug: "contract", title: "Contract Portfolio Review", section: "contract-portfolio", gen: () => genContractContent(rng, profile) },
    { slug: "employee", title: "Employee & Key Person Risk", section: "employee-key-person", gen: () => genEmployeeContent(rng, profile) },
    { slug: "tech-stack", title: "Technology Stack Assessment", section: "tech-stack", gen: () => genTechContent(rng, profile) },
    { slug: "tax", title: "Tax Compliance Review", section: "tax-compliance", gen: () => genTaxContent(rng, profile) },
    { slug: "regulatory", title: "Regulatory & License Audit", section: "regulatory-license", gen: () => genRegulatoryContent(rng, profile) },
    { slug: "vendor", title: "Vendor Dependency Analysis", section: "vendor-dependency", gen: () => genVendorContent(rng, profile) },
    { slug: "ip", title: "IP & Patent Analysis", section: "ip-patent", gen: () => genIPContent(rng, profile) },
  ];

  // ── Distribute across stages ─────────────────────────────────────

  const intelligenceCount = rng.int(3, 6);
  const deliverableCount = rng.int(2, 4);
  const workboardCount = 12 - intelligenceCount - deliverableCount;

  const shuffled = rng.shuffle(contentGenerators);
  const intelligenceItems = shuffled.slice(0, intelligenceCount);
  const workboardItems = shuffled.slice(intelligenceCount, intelligenceCount + workboardCount);
  const deliverableStageItems = shuffled.slice(intelligenceCount + workboardCount);

  // Intelligence: at least 1 running (no content), 1 queued (no content), rest complete
  for (let i = 0; i < intelligenceItems.length; i++) {
    const item = intelligenceItems[i];
    const isRunning = i === 0;
    const isQueued = i === 1;
    const hasContent = !isRunning && !isQueued;
    const content = hasContent ? item.gen() : null;
    const confidence = hasContent ? rng.pick(["high", "medium"]) : null;
    const risks = hasContent ? (content?.sections.filter((s: { type: string }) => s.type === "risk").length ?? 0) : 0;

    await prisma.projectDeliverable.create({
      data: {
        projectId,
        title: item.title,
        templateSectionId: item.section,
        stage: "intelligence",
        generationMode: "ai_generated",
        content: content ?? undefined,
        confidenceLevel: confidence,
        riskCount: risks,
        completenessReport: hasContent ? genCompletenessReport(rng, "intelligence", confidence) : undefined,
      },
    });
  }

  // Workboard: all assigned, all have content
  const assignableUsers = rng.shuffle([reviewer, analyst1, analyst2, owner]);
  for (let i = 0; i < workboardItems.length; i++) {
    const item = workboardItems[i];
    const content = item.gen();
    const confidence = rng.pick(["high", "medium"]);
    const risks = content.sections.filter((s: { type: string }) => s.type === "risk").length;

    await prisma.projectDeliverable.create({
      data: {
        projectId,
        title: item.title,
        templateSectionId: item.section,
        stage: "workboard",
        generationMode: "ai_generated",
        content,
        confidenceLevel: confidence,
        riskCount: risks,
        assignedToId: assignableUsers[i % assignableUsers.length].id,
        completenessReport: genCompletenessReport(rng, "workboard", confidence),
      },
    });
  }

  // Deliverable: all accepted
  const acceptors = [owner, reviewer];
  for (let i = 0; i < deliverableStageItems.length; i++) {
    const item = deliverableStageItems[i];
    const content = item.gen();
    const confidence = rng.pick(["high", "medium"]);
    const risks = content.sections.filter((s: { type: string }) => s.type === "risk").length;

    await prisma.projectDeliverable.create({
      data: {
        projectId,
        title: item.title,
        templateSectionId: item.section,
        stage: "deliverable",
        generationMode: "ai_generated",
        content,
        confidenceLevel: confidence,
        riskCount: risks,
        acceptedById: acceptors[i % acceptors.length].id,
        acceptedAt: new Date(Date.now() - rng.int(1, 5) * 86400000),
        completenessReport: genCompletenessReport(rng, "deliverable", confidence),
      },
    });
  }

  // ── Messages ─────────────────────────────────────────────────────

  const messageCount = rng.int(4, 8);
  const messageTemplates = [
    `The ${profile.name} customer concentration at ${profile.topCustomerConcentration}% concerns me. We should model churn scenarios for the top 3.`,
    `Revenue growth of ${profile.revenueGrowth}% looks ${profile.revenueGrowth > 15 ? "strong" : profile.revenueGrowth > 5 ? "adequate" : "below expectations"}. Need to understand the drivers before the next client call.`,
    `EBITDA margin of ${profile.ebitdaMargin}% is ${profile.ebitdaMargin > 20 ? "above" : "around"} industry average for ${profile.industry}. The normalization adjustments seem reasonable.`,
    `${profile.missingDocumentCount > 0 ? `Still missing ${profile.missingDocumentCount} contract documents from the data room. Pushing the target's CFO for these.` : "Data room is complete \u2014 good responsiveness from the target."}`,
    `${profile.keyPersonRisk === "high" ? "Key person risk is critical. We need to recommend retention bonuses in the SPA." : profile.keyPersonRisk === "medium" ? "Some key person gaps \u2014 flagging for the HR section." : "Key person coverage looks adequate. Documenting in the report."}`,
    `${profile.pendingLitigationCount > 0 ? `Found ${profile.pendingLitigationCount} pending litigation matter${profile.pendingLitigationCount > 1 ? "s" : ""}. Need legal counsel to assess materiality.` : "Clean on the litigation front \u2014 no pending claims found."}`,
    `Tech stack is ${profile.techStackAge}. ${profile.techStackAge === "legacy" ? "This will need significant investment post-acquisition." : profile.techStackAge === "mixed" ? "Ongoing migration adds some execution risk." : "Low tech risk overall."}`,
    `Working capital seasonality ${["Food & Beverage", "Construction", "E-commerce"].includes(profile.industry) ? "is significant for this industry \u2014 using 12-month average for the WC peg." : "is minimal. Period-end snapshot should be acceptable."}`,
  ];

  const msgUsers = rng.shuffle(allUsers);
  for (let i = 0; i < messageCount; i++) {
    await prisma.projectMessage.create({
      data: {
        projectId,
        userId: msgUsers[i % msgUsers.length].id,
        content: messageTemplates[i % messageTemplates.length],
        createdAt: new Date(Date.now() - (messageCount - i) * 3600000),
      },
    });
  }

  // ── Notifications ────────────────────────────────────────────────

  const notifCount = rng.int(3, 6);
  const notifTemplates = [
    { type: "analysis_complete", content: `${rng.pick(contentGenerators).title} analysis is complete` },
    { type: "data_uploaded", content: "Target uploaded new documents to data room" },
    { type: "risk_flagged", content: `Risk flag: customer concentration at ${profile.topCustomerConcentration}%` },
    { type: "deliverable_ready", content: `${rng.pick(deliverableStageItems)?.title ?? "Analysis"} ready for acceptance` },
    { type: "stage_change", content: `${rng.pick(workboardItems)?.title ?? "Deliverable"} pulled into workboard` },
    { type: "deadline_approaching", content: `Project deadline in ${rng.int(8, 20)} days` },
  ];

  for (let i = 0; i < notifCount; i++) {
    const n = notifTemplates[i % notifTemplates.length];
    await prisma.projectNotification.create({
      data: {
        projectId,
        type: n.type,
        content: n.content,
        createdAt: new Date(Date.now() - (notifCount - i) * 7200000),
      },
    });
  }

  // ── Connectors ───────────────────────────────────────────────────

  const connectors: Array<{ label: string; provider: string; status: string; syncedItemCount: number }> = [
    { label: `${profile.name} e-conomic`, provider: "economic", status: "synced", syncedItemCount: rng.int(300, 1200) },
    { label: `${profile.name} Google Drive`, provider: "google-drive", status: "synced", syncedItemCount: rng.int(100, 500) },
  ];

  if (["SaaS", "IT Services", "Professional Services"].includes(profile.industry)) {
    connectors.push({ label: `${profile.name} HubSpot`, provider: "hubspot", status: "synced", syncedItemCount: rng.int(100, 500) });
  } else if (profile.industry === "E-commerce") {
    connectors.push({ label: `${profile.name} Shopify`, provider: "shopify", status: rng.next() > 0.3 ? "synced" : "syncing", syncedItemCount: rng.next() > 0.3 ? rng.int(200, 800) : 0 });
  } else if (["Manufacturing", "Construction"].includes(profile.industry)) {
    connectors.push({ label: `${profile.name} Dynamics 365`, provider: "dynamics-365", status: "synced", syncedItemCount: rng.int(400, 1500) });
  } else {
    connectors.push({ label: `${profile.name} ${rng.pick(["Pipedrive", "HubSpot"])}`, provider: rng.pick(["pipedrive", "hubspot"]), status: "synced", syncedItemCount: rng.int(80, 300) });
  }

  // 4th connector — sometimes syncing
  if (rng.next() > 0.4) {
    connectors.push({ label: `${profile.name} ${rng.pick(["Zendesk", "Intercom", "Freshdesk"])}`, provider: rng.pick(["zendesk", "intercom", "freshdesk"]), status: "syncing", syncedItemCount: 0 });
  } else {
    connectors.push({ label: `${profile.name} Slack`, provider: "slack", status: "synced", syncedItemCount: rng.int(50, 200) });
  }

  for (const c of connectors) {
    await prisma.projectConnector.create({
      data: { projectId, ...c },
    });
  }

  console.log(`[dd-gen] Created project ${projectId}: ${profile.name} (${profile.riskProfile} risk, ${12} deliverables)`);

  return { projectId, targetProfile: profile };
}

// ── Batch generation ────────────────────────────────────────────────────

export async function generateDDBatch(
  operatorId: string,
  count: number,
  options?: { seedStart?: number },
): Promise<Array<{ projectId: string; targetProfile: TargetCompanyProfile }>> {
  const seedStart = options?.seedStart ?? Date.now();
  const results: Array<{ projectId: string; targetProfile: TargetCompanyProfile }> = [];

  for (let i = 0; i < count; i++) {
    const result = await syntheticDDSeedProjectData(operatorId, { seed: seedStart + i });
    results.push(result);
  }

  return results;
}
