// ── Platform-level Project Template Seed ────────────────────────────────
// Seeds 79 ProjectTemplate archetypes (operatorId: null) covering 13 categories.
// Deterministic IDs for idempotent re-runs via upsert.

import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

// ── Types ──────────────────────────────────────────────────────────────

interface FrameworkSection {
  id: string;
  title: string;
  generationMode: "ai_generated" | "ai_assisted" | "human_authored";
  description: string;
}

interface TemplateInput {
  id: string;
  operatorId: null;
  name: string;
  description: string;
  category: string;
  analysisFramework: { sections: FrameworkSection[] };
  dataExpectations: { requiredTypes: string[] };
}

// ── Template definitions ───────────────────────────────────────────────

const templates: TemplateInput[] = [
  // ════════════════════════════════════════════════════════════════════════
  //  FINANCIAL (13)
  // ════════════════════════════════════════════════════════════════════════

  // 1. Buy-side due diligence
  {
    id: "tpl_buy_side_due_diligence",
    operatorId: null,
    name: "Buy-side due diligence",
    description:
      "Comprehensive financial and operational analysis for acquirers evaluating a target company. Covers quality of earnings, working capital, commercial viability, and integration risks.",
    category: "financial",
    analysisFramework: {
      sections: [
        {
          id: "revenue_quality",
          title: "Revenue Quality Assessment",
          generationMode: "ai_generated",
          description:
            "Analyze revenue composition, recurring vs one-time, customer cohort retention, and revenue recognition policies. Flag any channel or product concentration risk.",
        },
        {
          id: "ebitda_normalization",
          title: "EBITDA Normalization",
          generationMode: "ai_generated",
          description:
            "Identify and quantify non-recurring, owner-related, and pro-forma adjustments to derive a normalized EBITDA bridge from reported figures.",
        },
        {
          id: "customer_concentration",
          title: "Customer Concentration Analysis",
          generationMode: "ai_generated",
          description:
            "Assess top-customer revenue share, churn history, contract renewal terms, and switching costs. Quantify revenue-at-risk from single-customer dependency.",
        },
        {
          id: "working_capital",
          title: "Working Capital Analysis",
          generationMode: "ai_generated",
          description:
            "Model normalized working capital across DSO, DPO, and DIO. Identify seasonality patterns and any manipulation of payables/receivables timing.",
        },
        {
          id: "debt_liabilities",
          title: "Debt & Liabilities Review",
          generationMode: "ai_generated",
          description:
            "Map all on- and off-balance-sheet debt, contingent liabilities, change-of-control provisions, and pension/lease obligations.",
        },
        {
          id: "management_assessment",
          title: "Management Assessment",
          generationMode: "ai_assisted",
          description:
            "Evaluate management team capability, depth, and retention risk. Assess key-person dependencies and succession readiness.",
        },
        {
          id: "commercial_dd",
          title: "Commercial Due Diligence",
          generationMode: "ai_assisted",
          description:
            "Validate market sizing, competitive positioning, pricing power, and go-to-market effectiveness using CRM data and market intelligence.",
        },
        {
          id: "operational_dd",
          title: "Operational Due Diligence",
          generationMode: "ai_assisted",
          description:
            "Assess operational processes, capacity utilization, scalability constraints, and supply chain risks.",
        },
        {
          id: "it_systems",
          title: "IT Systems Review",
          generationMode: "ai_generated",
          description:
            "Evaluate technology stack, technical debt, cybersecurity posture, and integration complexity for post-acquisition IT merger.",
        },
        {
          id: "legal_compliance",
          title: "Legal & Compliance Review",
          generationMode: "ai_generated",
          description:
            "Screen for pending litigation, regulatory risks, IP encumbrances, and material contract issues that affect deal value.",
        },
        {
          id: "tax_review",
          title: "Tax Review",
          generationMode: "ai_generated",
          description:
            "Analyze corporate tax positions, transfer pricing exposure, historical audits, and structuring implications of the acquisition.",
        },
        {
          id: "strategic_recommendations",
          title: "Strategic Recommendations",
          generationMode: "human_authored",
          description:
            "Synthesize findings into an investment recommendation covering valuation implications, deal-breakers, and post-close priorities.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "financial_statements",
        "contracts",
        "crm_data",
        "tax_returns",
        "employee_records",
        "it_documentation",
      ],
    },
  },

  // 2. Sell-side due diligence
  {
    id: "tpl_sell_side_due_diligence",
    operatorId: null,
    name: "Sell-side due diligence",
    description:
      "Pre-sale vendor preparation that anticipates buyer questions, maximizes enterprise value by proactively addressing quality-of-earnings issues and presenting a clean data room.",
    category: "financial",
    analysisFramework: {
      sections: [
        {
          id: "qoe_preparation",
          title: "Quality of Earnings Preparation",
          generationMode: "ai_generated",
          description:
            "Build a defensible QoE report from the seller's perspective, normalizing one-time costs and owner adjustments to present sustainable earnings.",
        },
        {
          id: "revenue_defensibility",
          title: "Revenue Defensibility Analysis",
          generationMode: "ai_generated",
          description:
            "Demonstrate revenue durability through cohort analysis, contract backlog, and pipeline quality metrics.",
        },
        {
          id: "working_capital_normalization",
          title: "Working Capital Normalization",
          generationMode: "ai_generated",
          description:
            "Propose a normalized working capital target and peg mechanism for the SPA, supported by 24-month trend analysis.",
        },
        {
          id: "growth_story",
          title: "Growth Story & Projections",
          generationMode: "ai_assisted",
          description:
            "Construct a credible growth narrative backed by pipeline data, market trends, and historical growth rates.",
        },
        {
          id: "risk_mitigation",
          title: "Risk Mitigation Summary",
          generationMode: "ai_assisted",
          description:
            "Pre-emptively address known risks (customer concentration, key-person, regulatory) with mitigants and evidence.",
        },
        {
          id: "data_room_readiness",
          title: "Data Room Readiness",
          generationMode: "ai_generated",
          description:
            "Audit completeness of virtual data room against standard buyer request lists. Flag missing or outdated documents.",
        },
        {
          id: "valuation_support",
          title: "Valuation Support",
          generationMode: "human_authored",
          description:
            "Provide comparable transaction multiples and DCF sensitivity analysis to support the seller's valuation expectations.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "financial_statements",
        "contracts",
        "crm_data",
        "projections",
        "cap_table",
      ],
    },
  },

  // 3. Vendor due diligence
  {
    id: "tpl_vendor_due_diligence",
    operatorId: null,
    name: "Vendor due diligence",
    description:
      "Independent third-party analysis commissioned by the seller to provide prospective buyers with a credible, pre-packaged due diligence report.",
    category: "financial",
    analysisFramework: {
      sections: [
        {
          id: "financial_overview",
          title: "Financial Overview & Trends",
          generationMode: "ai_generated",
          description:
            "Present 3-year financial performance trends including revenue growth, margin progression, and cash flow generation.",
        },
        {
          id: "earnings_quality",
          title: "Earnings Quality & Adjustments",
          generationMode: "ai_generated",
          description:
            "Independently assess quality of earnings with transparent normalization adjustments and methodology disclosure.",
        },
        {
          id: "balance_sheet_review",
          title: "Balance Sheet Review",
          generationMode: "ai_generated",
          description:
            "Analyze asset quality, liability completeness, off-balance-sheet items, and net debt/cash position.",
        },
        {
          id: "commercial_assessment",
          title: "Commercial Assessment",
          generationMode: "ai_assisted",
          description:
            "Evaluate market position, customer relationships, competitive dynamics, and commercial sustainability.",
        },
        {
          id: "operational_review",
          title: "Operational Review",
          generationMode: "ai_assisted",
          description:
            "Assess operational efficiency, scalability, and key operational risks from an independent perspective.",
        },
        {
          id: "tax_and_legal",
          title: "Tax & Legal Summary",
          generationMode: "ai_generated",
          description:
            "Summarize tax compliance status, pending legal matters, and regulatory obligations relevant to prospective buyers.",
        },
        {
          id: "key_findings",
          title: "Key Findings & Red Flags",
          generationMode: "human_authored",
          description:
            "Consolidate material findings, red flags, and areas requiring further buyer-specific investigation.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "financial_statements",
        "tax_returns",
        "contracts",
        "management_accounts",
        "legal_documents",
      ],
    },
  },

  // 4. Credit risk assessment
  {
    id: "tpl_credit_risk_assessment",
    operatorId: null,
    name: "Credit risk assessment",
    description:
      "Evaluate creditworthiness of a borrower or counterparty through financial analysis, industry risk factors, and repayment capacity modeling.",
    category: "financial",
    analysisFramework: {
      sections: [
        {
          id: "borrower_overview",
          title: "Borrower Overview",
          generationMode: "ai_generated",
          description:
            "Profile the borrower's business model, ownership structure, management team, and operating history.",
        },
        {
          id: "financial_analysis",
          title: "Financial Statement Analysis",
          generationMode: "ai_generated",
          description:
            "Analyze 3-5 years of financials covering profitability trends, leverage ratios, liquidity, and cash flow adequacy.",
        },
        {
          id: "debt_service_coverage",
          title: "Debt Service Coverage",
          generationMode: "ai_generated",
          description:
            "Model DSCR under base, upside, and downside scenarios. Stress-test against revenue declines and margin compression.",
        },
        {
          id: "collateral_analysis",
          title: "Collateral & Security Analysis",
          generationMode: "ai_generated",
          description:
            "Evaluate the quality, liquidity, and enforceability of pledged collateral and security interests.",
        },
        {
          id: "industry_risk",
          title: "Industry & Market Risk",
          generationMode: "ai_assisted",
          description:
            "Assess cyclicality, regulatory exposure, competitive intensity, and technological disruption risk in the borrower's sector.",
        },
        {
          id: "credit_recommendation",
          title: "Credit Recommendation",
          generationMode: "human_authored",
          description:
            "Provide an internal credit rating recommendation with proposed terms, covenants, and monitoring requirements.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "financial_statements",
        "bank_statements",
        "debt_schedules",
        "collateral_documentation",
        "industry_reports",
      ],
    },
  },

  // 5. Equity research
  {
    id: "tpl_equity_research",
    operatorId: null,
    name: "Equity research",
    description:
      "Investment-grade equity analysis combining financial modeling, competitive positioning, and valuation to generate an investment recommendation on a public or pre-IPO company.",
    category: "financial",
    analysisFramework: {
      sections: [
        {
          id: "company_overview",
          title: "Company & Business Model Overview",
          generationMode: "ai_generated",
          description:
            "Summarize the company's business model, revenue segments, geographic mix, and strategic direction.",
        },
        {
          id: "industry_landscape",
          title: "Industry Landscape & Positioning",
          generationMode: "ai_assisted",
          description:
            "Map the competitive landscape, market share dynamics, barriers to entry, and secular growth drivers.",
        },
        {
          id: "financial_model",
          title: "Financial Model & Projections",
          generationMode: "ai_generated",
          description:
            "Build a 3-5 year P&L, balance sheet, and cash flow forecast with explicit assumptions for each line item.",
        },
        {
          id: "valuation",
          title: "Valuation Analysis",
          generationMode: "ai_generated",
          description:
            "Derive fair value using DCF, comparable companies, and precedent transactions. Present bull/base/bear price targets.",
        },
        {
          id: "risk_factors",
          title: "Risk Factors",
          generationMode: "ai_assisted",
          description:
            "Enumerate key downside risks including execution, competitive, regulatory, and macroeconomic factors.",
        },
        {
          id: "investment_thesis",
          title: "Investment Thesis & Recommendation",
          generationMode: "human_authored",
          description:
            "State the investment recommendation (buy/hold/sell) with clear catalysts, timeline, and conviction level.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "financial_statements",
        "earnings_transcripts",
        "sec_filings",
        "industry_reports",
        "market_data",
      ],
    },
  },

  // 6. Portfolio risk assessment
  {
    id: "tpl_portfolio_risk_assessment",
    operatorId: null,
    name: "Portfolio risk assessment",
    description:
      "Analyze an investment portfolio's risk exposures including concentration, correlation, liquidity, and tail-risk scenarios to optimize the risk-return profile.",
    category: "financial",
    analysisFramework: {
      sections: [
        {
          id: "portfolio_composition",
          title: "Portfolio Composition Overview",
          generationMode: "ai_generated",
          description:
            "Break down the portfolio by asset class, geography, sector, and instrument type with current allocation weights.",
        },
        {
          id: "concentration_analysis",
          title: "Concentration & Diversification",
          generationMode: "ai_generated",
          description:
            "Measure single-name, sector, and geographic concentration using Herfindahl and effective-N metrics.",
        },
        {
          id: "correlation_analysis",
          title: "Correlation & Factor Exposure",
          generationMode: "ai_generated",
          description:
            "Decompose portfolio returns into systematic factor exposures (market, size, value, momentum) and idiosyncratic risk.",
        },
        {
          id: "stress_testing",
          title: "Stress Testing & Scenario Analysis",
          generationMode: "ai_generated",
          description:
            "Run historical stress scenarios (2008 GFC, COVID, rate shocks) and hypothetical shocks. Report portfolio P&L impact.",
        },
        {
          id: "liquidity_assessment",
          title: "Liquidity Assessment",
          generationMode: "ai_assisted",
          description:
            "Evaluate portfolio liquidity by estimating days-to-liquidate and bid-ask cost under normal and stressed conditions.",
        },
        {
          id: "risk_recommendations",
          title: "Risk Mitigation Recommendations",
          generationMode: "human_authored",
          description:
            "Propose rebalancing actions, hedging strategies, or allocation shifts to improve the portfolio's risk-adjusted return.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "portfolio_holdings",
        "market_data",
        "transaction_history",
        "benchmark_data",
      ],
    },
  },

  // 7. Insurance underwriting analysis
  {
    id: "tpl_insurance_underwriting_analysis",
    operatorId: null,
    name: "Insurance underwriting analysis",
    description:
      "Risk evaluation for insurance underwriters assessing new policy applications or renewals. Covers loss history, exposure analysis, and pricing adequacy.",
    category: "financial",
    analysisFramework: {
      sections: [
        {
          id: "applicant_profile",
          title: "Applicant Profile & Risk Overview",
          generationMode: "ai_generated",
          description:
            "Summarize the applicant's business, industry classification, size metrics, and prior insurance history.",
        },
        {
          id: "loss_history",
          title: "Loss History Analysis",
          generationMode: "ai_generated",
          description:
            "Analyze 5-10 year loss history including frequency, severity, trends, and large-loss development patterns.",
        },
        {
          id: "exposure_analysis",
          title: "Exposure Analysis",
          generationMode: "ai_generated",
          description:
            "Quantify insurable exposures by line of business (property, liability, auto, workers comp) with premium base metrics.",
        },
        {
          id: "hazard_assessment",
          title: "Hazard & Risk Factor Assessment",
          generationMode: "ai_assisted",
          description:
            "Evaluate physical, moral, and morale hazards. Assess risk management practices and loss prevention measures.",
        },
        {
          id: "pricing_adequacy",
          title: "Pricing Adequacy Review",
          generationMode: "ai_generated",
          description:
            "Compare proposed premiums against actuarial indicated rates, loss ratios, and market benchmarks.",
        },
        {
          id: "underwriting_decision",
          title: "Underwriting Decision & Terms",
          generationMode: "human_authored",
          description:
            "State the underwriting decision (accept/decline/modify) with recommended terms, exclusions, and conditions.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "insurance_applications",
        "loss_runs",
        "financial_statements",
        "inspection_reports",
        "claims_data",
      ],
    },
  },

  // 8. Insurance claims investigation
  {
    id: "tpl_insurance_claims_investigation",
    operatorId: null,
    name: "Insurance claims investigation",
    description:
      "Structured investigation of insurance claims to determine validity, assess damages, and detect potential fraud indicators.",
    category: "financial",
    analysisFramework: {
      sections: [
        {
          id: "claim_summary",
          title: "Claim Summary & Timeline",
          generationMode: "ai_generated",
          description:
            "Reconstruct the chronology of events leading to the claim, including date of loss, reporting date, and key milestones.",
        },
        {
          id: "coverage_analysis",
          title: "Coverage & Policy Analysis",
          generationMode: "ai_generated",
          description:
            "Map the claim against policy terms, conditions, exclusions, and endorsements to determine coverage applicability.",
        },
        {
          id: "damage_assessment",
          title: "Damage & Loss Quantification",
          generationMode: "ai_generated",
          description:
            "Quantify the claimed loss using supporting documentation, independent estimates, and comparable benchmarks.",
        },
        {
          id: "fraud_indicators",
          title: "Fraud Indicator Screening",
          generationMode: "ai_generated",
          description:
            "Screen for red flags including inconsistent statements, prior claim patterns, financial distress, and documentation anomalies.",
        },
        {
          id: "investigation_findings",
          title: "Investigation Findings",
          generationMode: "ai_assisted",
          description:
            "Consolidate evidence from interviews, site inspections, third-party reports, and surveillance into factual findings.",
        },
        {
          id: "recommendation",
          title: "Claim Recommendation",
          generationMode: "human_authored",
          description:
            "Recommend claim disposition (pay, deny, negotiate) with supporting rationale and reserve adjustment if applicable.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "claims_data",
        "policy_documents",
        "inspection_reports",
        "witness_statements",
        "financial_records",
      ],
    },
  },

  // 9. AML / KYC investigation
  {
    id: "tpl_aml_kyc_investigation",
    operatorId: null,
    name: "AML / KYC investigation",
    description:
      "Anti-money laundering and know-your-customer investigation combining identity verification, transaction monitoring, and sanctions screening for regulatory compliance.",
    category: "financial",
    analysisFramework: {
      sections: [
        {
          id: "customer_identification",
          title: "Customer Identification & Verification",
          generationMode: "ai_generated",
          description:
            "Verify identity documents, beneficial ownership structure, and PEP/sanctions status against authoritative databases.",
        },
        {
          id: "beneficial_ownership",
          title: "Beneficial Ownership Analysis",
          generationMode: "ai_generated",
          description:
            "Trace ultimate beneficial owners through corporate layers, trusts, and nominee arrangements. Flag opaque structures.",
        },
        {
          id: "transaction_analysis",
          title: "Transaction Pattern Analysis",
          generationMode: "ai_generated",
          description:
            "Analyze transaction history for structuring, layering, round-tripping, and other typologies indicative of money laundering.",
        },
        {
          id: "source_of_funds",
          title: "Source of Funds / Wealth",
          generationMode: "ai_assisted",
          description:
            "Assess the plausibility of declared source of funds and wealth against available financial data and public records.",
        },
        {
          id: "adverse_media",
          title: "Adverse Media & Open-Source Intelligence",
          generationMode: "ai_generated",
          description:
            "Screen for negative news, regulatory actions, criminal proceedings, and reputational risks across global media sources.",
        },
        {
          id: "risk_rating",
          title: "Risk Rating & Recommendation",
          generationMode: "human_authored",
          description:
            "Assign a risk rating (low/medium/high) with recommended enhanced due diligence measures or account actions.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "identity_documents",
        "corporate_filings",
        "transaction_records",
        "sanctions_lists",
        "adverse_media",
      ],
    },
  },

  // 10. Financial restructuring advisory
  {
    id: "tpl_financial_restructuring_advisory",
    operatorId: null,
    name: "Financial restructuring advisory",
    description:
      "Advisory analysis for companies in financial distress, evaluating liquidity, stakeholder positions, and restructuring alternatives to maximize recovery value.",
    category: "financial",
    analysisFramework: {
      sections: [
        {
          id: "situation_assessment",
          title: "Situation Assessment",
          generationMode: "ai_generated",
          description:
            "Diagnose the root causes of financial distress — cyclical, structural, operational, or balance-sheet driven.",
        },
        {
          id: "liquidity_analysis",
          title: "Liquidity & Cash Flow Analysis",
          generationMode: "ai_generated",
          description:
            "Build a 13-week cash flow forecast identifying the liquidity runway, minimum cash requirements, and near-term crunch points.",
        },
        {
          id: "capital_structure",
          title: "Capital Structure Analysis",
          generationMode: "ai_generated",
          description:
            "Map the full debt stack including intercreditor priorities, covenant compliance status, and maturity profile.",
        },
        {
          id: "stakeholder_analysis",
          title: "Stakeholder Analysis",
          generationMode: "ai_assisted",
          description:
            "Assess positions and incentives of each creditor class, equity holders, employees, and key trading partners.",
        },
        {
          id: "restructuring_alternatives",
          title: "Restructuring Alternatives",
          generationMode: "ai_assisted",
          description:
            "Evaluate alternatives including operational turnaround, debt-for-equity swap, asset sales, refinancing, and insolvency proceedings.",
        },
        {
          id: "recovery_waterfall",
          title: "Recovery Waterfall Analysis",
          generationMode: "ai_generated",
          description:
            "Model recovery waterfalls under each restructuring scenario to quantify creditor recovery rates by tranche.",
        },
        {
          id: "implementation_plan",
          title: "Implementation Roadmap",
          generationMode: "human_authored",
          description:
            "Lay out a phased restructuring implementation plan with milestones, stakeholder communication strategy, and contingency triggers.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "financial_statements",
        "debt_schedules",
        "cash_flow_projections",
        "contracts",
        "creditor_agreements",
      ],
    },
  },

  // 11. IPO readiness assessment
  {
    id: "tpl_ipo_readiness_assessment",
    operatorId: null,
    name: "IPO readiness assessment",
    description:
      "Comprehensive assessment of a company's preparedness for an initial public offering, covering financial reporting, governance, compliance, and operational scalability.",
    category: "financial",
    analysisFramework: {
      sections: [
        {
          id: "financial_reporting",
          title: "Financial Reporting Readiness",
          generationMode: "ai_generated",
          description:
            "Evaluate adequacy of accounting systems, audit trail, and compliance with public-company reporting standards (IFRS/GAAP).",
        },
        {
          id: "governance_structure",
          title: "Corporate Governance Assessment",
          generationMode: "ai_assisted",
          description:
            "Review board composition, committee structures, related-party transactions, and governance policy gaps versus listing requirements.",
        },
        {
          id: "internal_controls",
          title: "Internal Controls & SOX Readiness",
          generationMode: "ai_generated",
          description:
            "Assess the maturity of internal controls over financial reporting, IT general controls, and remediation needs.",
        },
        {
          id: "legal_regulatory",
          title: "Legal & Regulatory Compliance",
          generationMode: "ai_generated",
          description:
            "Identify legal, regulatory, and intellectual property issues that could delay or complicate the listing process.",
        },
        {
          id: "equity_story",
          title: "Equity Story & Market Positioning",
          generationMode: "ai_assisted",
          description:
            "Evaluate the strength of the equity story, peer comparables, and likely investor reception in target capital markets.",
        },
        {
          id: "operational_scalability",
          title: "Operational Scalability",
          generationMode: "ai_assisted",
          description:
            "Assess whether operations, HR, IT, and finance functions can scale to meet public-company demands.",
        },
        {
          id: "gap_remediation",
          title: "Gap Analysis & Remediation Plan",
          generationMode: "human_authored",
          description:
            "Consolidate readiness gaps into a prioritized remediation roadmap with ownership, timelines, and cost estimates.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "financial_statements",
        "audit_reports",
        "corporate_documents",
        "cap_table",
        "board_minutes",
        "legal_documents",
      ],
    },
  },

  // 12. Debt refinancing analysis
  {
    id: "tpl_debt_refinancing_analysis",
    operatorId: null,
    name: "Debt refinancing analysis",
    description:
      "Analysis of refinancing options for existing debt facilities, comparing terms, costs, and structural alternatives to optimize the company's capital structure.",
    category: "financial",
    analysisFramework: {
      sections: [
        {
          id: "current_debt_profile",
          title: "Current Debt Profile",
          generationMode: "ai_generated",
          description:
            "Catalog all existing facilities including drawn amounts, rates, maturity dates, covenants, and prepayment provisions.",
        },
        {
          id: "cash_flow_capacity",
          title: "Cash Flow & Debt Capacity",
          generationMode: "ai_generated",
          description:
            "Assess free cash flow generation and sustainable leverage capacity under base, upside, and stress scenarios.",
        },
        {
          id: "market_conditions",
          title: "Market Conditions & Pricing",
          generationMode: "ai_generated",
          description:
            "Survey current market conditions including benchmark rates, credit spreads, and lender appetite for the borrower's credit profile.",
        },
        {
          id: "refinancing_alternatives",
          title: "Refinancing Alternatives",
          generationMode: "ai_assisted",
          description:
            "Compare structural alternatives (bank revolver, term loan, high-yield, private placement, mezzanine) with pros/cons for each.",
        },
        {
          id: "cost_benefit_analysis",
          title: "Cost-Benefit Analysis",
          generationMode: "ai_generated",
          description:
            "Quantify total cost of refinancing (breakage costs, fees, rate differential) against the benefit of improved terms or extended maturity.",
        },
        {
          id: "recommendation",
          title: "Refinancing Recommendation",
          generationMode: "human_authored",
          description:
            "Recommend the optimal refinancing structure with proposed terms, lender shortlist, and execution timeline.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "financial_statements",
        "debt_schedules",
        "credit_agreements",
        "cash_flow_projections",
        "market_data",
      ],
    },
  },

  // 13. Business valuation
  {
    id: "tpl_business_valuation",
    operatorId: null,
    name: "Business valuation",
    description:
      "Independent business valuation using multiple methodologies for transactions, tax, litigation, or financial reporting purposes.",
    category: "financial",
    analysisFramework: {
      sections: [
        {
          id: "company_overview",
          title: "Company & Industry Overview",
          generationMode: "ai_generated",
          description:
            "Profile the subject company's operations, market position, competitive advantages, and industry dynamics.",
        },
        {
          id: "financial_analysis",
          title: "Historical Financial Analysis",
          generationMode: "ai_generated",
          description:
            "Analyze 3-5 years of financial performance, normalizing for non-recurring items and owner adjustments.",
        },
        {
          id: "dcf_valuation",
          title: "Discounted Cash Flow Valuation",
          generationMode: "ai_generated",
          description:
            "Build a DCF model with explicit revenue, margin, and capex assumptions. Derive WACC and terminal value using appropriate methodology.",
        },
        {
          id: "comparable_companies",
          title: "Comparable Company Analysis",
          generationMode: "ai_generated",
          description:
            "Select a peer group of publicly traded comparables and derive implied valuation multiples (EV/Revenue, EV/EBITDA, P/E).",
        },
        {
          id: "precedent_transactions",
          title: "Precedent Transaction Analysis",
          generationMode: "ai_generated",
          description:
            "Identify relevant M&A transactions and derive acquisition multiples, adjusting for deal-specific premiums.",
        },
        {
          id: "discounts_premiums",
          title: "Discounts & Premiums",
          generationMode: "ai_assisted",
          description:
            "Apply DLOM, DLOC, control premium, or synergy adjustments as appropriate to the purpose of valuation.",
        },
        {
          id: "valuation_conclusion",
          title: "Valuation Conclusion",
          generationMode: "human_authored",
          description:
            "Triangulate across methodologies to arrive at a concluded value range with weighting rationale and key assumptions.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "financial_statements",
        "projections",
        "market_data",
        "comparable_company_data",
        "transaction_data",
      ],
    },
  },

  // ════════════════════════════════════════════════════════════════════════
  //  LEGAL (9)
  // ════════════════════════════════════════════════════════════════════════

  // 14. M&A legal due diligence
  {
    id: "tpl_ma_legal_due_diligence",
    operatorId: null,
    name: "M&A legal due diligence",
    description:
      "Legal review of a target company in an M&A transaction covering corporate structure, material contracts, litigation, IP, employment, and regulatory compliance.",
    category: "legal",
    analysisFramework: {
      sections: [
        {
          id: "corporate_structure",
          title: "Corporate Structure & Organization",
          generationMode: "ai_generated",
          description:
            "Map the corporate structure including subsidiaries, joint ventures, authorized share capital, and shareholder agreements.",
        },
        {
          id: "material_contracts",
          title: "Material Contract Review",
          generationMode: "ai_generated",
          description:
            "Review key commercial contracts for change-of-control provisions, termination rights, assignment restrictions, and unusual terms.",
        },
        {
          id: "litigation_review",
          title: "Litigation & Disputes",
          generationMode: "ai_generated",
          description:
            "Catalog pending, threatened, and settled litigation. Assess potential liabilities and insurance coverage.",
        },
        {
          id: "ip_review",
          title: "Intellectual Property Review",
          generationMode: "ai_generated",
          description:
            "Verify ownership and validity of patents, trademarks, copyrights, and trade secrets. Identify encumbrances and infringement risks.",
        },
        {
          id: "employment_matters",
          title: "Employment & Labor Matters",
          generationMode: "ai_generated",
          description:
            "Review employment contracts, collective agreements, pending labor disputes, and change-of-control obligations.",
        },
        {
          id: "regulatory_compliance",
          title: "Regulatory & Compliance Review",
          generationMode: "ai_assisted",
          description:
            "Assess compliance with applicable regulations, permits, licenses, and pending regulatory proceedings.",
        },
        {
          id: "real_estate_review",
          title: "Real Estate & Property",
          generationMode: "ai_generated",
          description:
            "Review property interests including owned real estate, lease agreements, and environmental liabilities.",
        },
        {
          id: "legal_risk_summary",
          title: "Legal Risk Summary & Deal Impact",
          generationMode: "human_authored",
          description:
            "Synthesize material legal risks with quantified exposure ranges and recommended deal protections (reps, warranties, indemnities).",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "corporate_documents",
        "contracts",
        "litigation_files",
        "ip_registrations",
        "employment_records",
        "regulatory_filings",
      ],
    },
  },

  // 15. Litigation case preparation
  {
    id: "tpl_litigation_case_preparation",
    operatorId: null,
    name: "Litigation case preparation",
    description:
      "Structured preparation for litigation including fact pattern analysis, evidence organization, legal theory development, and damages quantification.",
    category: "legal",
    analysisFramework: {
      sections: [
        {
          id: "fact_pattern",
          title: "Fact Pattern & Chronology",
          generationMode: "ai_generated",
          description:
            "Construct a detailed chronological narrative of events from available documents, communications, and witness accounts.",
        },
        {
          id: "evidence_inventory",
          title: "Evidence Inventory & Assessment",
          generationMode: "ai_generated",
          description:
            "Catalog all available evidence, assess admissibility and weight, and identify documentary gaps requiring discovery.",
        },
        {
          id: "legal_theory",
          title: "Legal Theory & Arguments",
          generationMode: "ai_assisted",
          description:
            "Develop legal theories, map claims to elements, and identify supporting case law and statutory authority.",
        },
        {
          id: "opposing_analysis",
          title: "Opposing Party Analysis",
          generationMode: "ai_assisted",
          description:
            "Anticipate the opposing party's likely arguments, defenses, and counterclaims. Identify vulnerabilities in their position.",
        },
        {
          id: "damages_quantification",
          title: "Damages Quantification",
          generationMode: "ai_generated",
          description:
            "Quantify damages using appropriate methodologies (lost profits, benefit of the bargain, cost of repair) with supporting calculations.",
        },
        {
          id: "case_strategy",
          title: "Case Strategy & Recommendations",
          generationMode: "human_authored",
          description:
            "Formulate litigation strategy including settlement posture, discovery plan, expert needs, and trial preparation priorities.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "contracts",
        "correspondence",
        "financial_records",
        "witness_statements",
        "legal_documents",
      ],
    },
  },

  // 16. IP portfolio review
  {
    id: "tpl_ip_portfolio_review",
    operatorId: null,
    name: "IP portfolio review",
    description:
      "Comprehensive review of an organization's intellectual property portfolio including patents, trademarks, copyrights, and trade secrets for strategic and transactional purposes.",
    category: "legal",
    analysisFramework: {
      sections: [
        {
          id: "patent_analysis",
          title: "Patent Portfolio Analysis",
          generationMode: "ai_generated",
          description:
            "Catalog patents and applications by jurisdiction, technology area, and lifecycle stage. Assess claim breadth and enforceability.",
        },
        {
          id: "trademark_analysis",
          title: "Trademark & Brand Analysis",
          generationMode: "ai_generated",
          description:
            "Review trademark registrations, pending applications, common-law marks, and domain names. Identify gaps and conflicts.",
        },
        {
          id: "copyright_trade_secrets",
          title: "Copyrights & Trade Secrets",
          generationMode: "ai_generated",
          description:
            "Assess copyright registrations, software licenses, and trade secret protection measures including NDA coverage.",
        },
        {
          id: "freedom_to_operate",
          title: "Freedom to Operate Assessment",
          generationMode: "ai_assisted",
          description:
            "Evaluate infringement risk from third-party IP rights that could constrain current or planned products and services.",
        },
        {
          id: "valuation_monetization",
          title: "IP Valuation & Monetization",
          generationMode: "ai_assisted",
          description:
            "Assess the economic value of the IP portfolio and identify licensing, cross-licensing, or divestiture opportunities.",
        },
        {
          id: "strategic_recommendations",
          title: "Strategic Recommendations",
          generationMode: "human_authored",
          description:
            "Provide recommendations for portfolio optimization including prosecution priorities, maintenance decisions, and defensive strategies.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "ip_registrations",
        "license_agreements",
        "invention_disclosures",
        "competitor_patents",
        "nda_agreements",
      ],
    },
  },

  // 17. Bulk contract review
  {
    id: "tpl_bulk_contract_review",
    operatorId: null,
    name: "Bulk contract review",
    description:
      "High-volume contract review extracting key terms, risks, and obligations across a portfolio of agreements for M&A, compliance, or portfolio management purposes.",
    category: "legal",
    analysisFramework: {
      sections: [
        {
          id: "contract_inventory",
          title: "Contract Inventory & Classification",
          generationMode: "ai_generated",
          description:
            "Catalog all contracts by type, counterparty, value, and term. Classify into risk tiers based on materiality thresholds.",
        },
        {
          id: "key_term_extraction",
          title: "Key Term Extraction",
          generationMode: "ai_generated",
          description:
            "Extract critical terms: pricing, termination rights, renewal, assignment, change-of-control, indemnification, and limitation of liability.",
        },
        {
          id: "risk_identification",
          title: "Risk Identification & Scoring",
          generationMode: "ai_generated",
          description:
            "Flag non-standard, adverse, or missing clauses. Score each contract on a risk matrix of likelihood and financial impact.",
        },
        {
          id: "obligation_mapping",
          title: "Obligation & Deadline Mapping",
          generationMode: "ai_generated",
          description:
            "Map performance obligations, notice periods, renewal deadlines, and compliance requirements into an actionable calendar.",
        },
        {
          id: "summary_findings",
          title: "Summary Findings & Recommendations",
          generationMode: "human_authored",
          description:
            "Highlight the highest-risk contracts, systemic clause deficiencies, and recommended renegotiation or remediation priorities.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: ["contracts", "amendments", "side_letters"],
    },
  },

  // 18. Regulatory compliance audit
  {
    id: "tpl_regulatory_compliance_audit",
    operatorId: null,
    name: "Regulatory compliance audit",
    description:
      "Systematic review of an organization's compliance with applicable regulations, industry standards, and internal policies across multiple regulatory domains.",
    category: "legal",
    analysisFramework: {
      sections: [
        {
          id: "regulatory_mapping",
          title: "Regulatory Universe Mapping",
          generationMode: "ai_generated",
          description:
            "Identify all applicable regulatory frameworks, industry standards, and jurisdictional requirements for the organization's operations.",
        },
        {
          id: "policy_review",
          title: "Policy & Procedure Review",
          generationMode: "ai_generated",
          description:
            "Evaluate the adequacy of internal policies and procedures against regulatory requirements. Identify gaps and outdated provisions.",
        },
        {
          id: "controls_testing",
          title: "Compliance Controls Testing",
          generationMode: "ai_generated",
          description:
            "Test the operating effectiveness of compliance controls through document review, process walkthroughs, and sample testing.",
        },
        {
          id: "violation_assessment",
          title: "Violation & Exposure Assessment",
          generationMode: "ai_assisted",
          description:
            "Identify existing or potential violations, quantify regulatory exposure, and assess likelihood of enforcement action.",
        },
        {
          id: "remediation_plan",
          title: "Remediation Plan",
          generationMode: "human_authored",
          description:
            "Prioritize compliance gaps by severity and develop a remediation roadmap with responsible owners and target completion dates.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "regulatory_filings",
        "internal_policies",
        "audit_reports",
        "training_records",
        "incident_logs",
      ],
    },
  },

  // 19. Employment law review
  {
    id: "tpl_employment_law_review",
    operatorId: null,
    name: "Employment law review",
    description:
      "Review of employment practices, contracts, and policies for legal compliance and risk mitigation across hiring, compensation, termination, and workplace safety.",
    category: "legal",
    analysisFramework: {
      sections: [
        {
          id: "employment_contracts",
          title: "Employment Contract Review",
          generationMode: "ai_generated",
          description:
            "Review standard and executive employment agreements for compliance with local labor law, restrictive covenants, and termination provisions.",
        },
        {
          id: "compensation_benefits",
          title: "Compensation & Benefits Compliance",
          generationMode: "ai_generated",
          description:
            "Assess compliance with wage and hour laws, equal pay requirements, pension obligations, and benefit plan regulations.",
        },
        {
          id: "workplace_policies",
          title: "Workplace Policies & Handbook Review",
          generationMode: "ai_generated",
          description:
            "Evaluate employee handbook and policies for legal adequacy covering anti-discrimination, harassment, leave, and whistleblower protections.",
        },
        {
          id: "dispute_history",
          title: "Employment Disputes & Litigation History",
          generationMode: "ai_generated",
          description:
            "Catalog past and pending employment disputes, labor complaints, and regulatory investigations. Assess pattern and systemic risk.",
        },
        {
          id: "risk_recommendations",
          title: "Risk Assessment & Recommendations",
          generationMode: "human_authored",
          description:
            "Summarize employment law risk exposure and recommend policy updates, training needs, and structural improvements.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "employment_records",
        "contracts",
        "internal_policies",
        "litigation_files",
        "payroll_data",
      ],
    },
  },

  // 20. Data privacy / GDPR assessment
  {
    id: "tpl_data_privacy_gdpr_assessment",
    operatorId: null,
    name: "Data privacy / GDPR assessment",
    description:
      "Assessment of data protection compliance covering GDPR, ePrivacy, and other applicable privacy regulations. Reviews data processing activities, consent mechanisms, and cross-border transfers.",
    category: "legal",
    analysisFramework: {
      sections: [
        {
          id: "data_mapping",
          title: "Data Mapping & Processing Inventory",
          generationMode: "ai_generated",
          description:
            "Map all personal data processing activities including data types, purposes, legal bases, retention periods, and data flows.",
        },
        {
          id: "legal_basis_review",
          title: "Legal Basis & Consent Review",
          generationMode: "ai_generated",
          description:
            "Evaluate the legal basis for each processing activity and assess consent mechanisms for adequacy and revocability.",
        },
        {
          id: "data_subject_rights",
          title: "Data Subject Rights Implementation",
          generationMode: "ai_generated",
          description:
            "Assess processes for handling data subject requests (access, erasure, portability, objection) within required timeframes.",
        },
        {
          id: "cross_border_transfers",
          title: "Cross-Border Transfer Mechanisms",
          generationMode: "ai_assisted",
          description:
            "Review international data transfer mechanisms (SCCs, adequacy decisions, BCRs) for compliance with Schrems II requirements.",
        },
        {
          id: "security_measures",
          title: "Technical & Organizational Measures",
          generationMode: "ai_generated",
          description:
            "Evaluate data security measures including encryption, access controls, pseudonymization, and breach notification procedures.",
        },
        {
          id: "vendor_management",
          title: "Third-Party & Vendor Management",
          generationMode: "ai_generated",
          description:
            "Review data processing agreements with vendors, assess sub-processor oversight, and evaluate third-party data sharing practices.",
        },
        {
          id: "gap_analysis",
          title: "Gap Analysis & Compliance Roadmap",
          generationMode: "human_authored",
          description:
            "Consolidate compliance gaps, prioritize by regulatory risk, and define a remediation roadmap with resource estimates.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "privacy_policies",
        "data_processing_agreements",
        "data_inventories",
        "consent_records",
        "security_documentation",
      ],
    },
  },

  // 21. Real estate transaction review
  {
    id: "tpl_real_estate_transaction_review",
    operatorId: null,
    name: "Real estate transaction review",
    description:
      "Legal review of a real estate transaction covering title, zoning, environmental, lease, and financing aspects for acquisition or disposition.",
    category: "legal",
    analysisFramework: {
      sections: [
        {
          id: "title_review",
          title: "Title Review & Encumbrances",
          generationMode: "ai_generated",
          description:
            "Examine title chain, easements, liens, encumbrances, and restrictive covenants. Identify title defects requiring cure.",
        },
        {
          id: "zoning_land_use",
          title: "Zoning & Land Use Compliance",
          generationMode: "ai_generated",
          description:
            "Verify current zoning classification, permitted uses, setback requirements, and any nonconforming use status.",
        },
        {
          id: "lease_review",
          title: "Lease Portfolio Review",
          generationMode: "ai_generated",
          description:
            "Analyze tenant leases for key terms, rental escalations, options, co-tenancy clauses, and estoppel requirements.",
        },
        {
          id: "environmental_review",
          title: "Environmental Compliance Review",
          generationMode: "ai_assisted",
          description:
            "Review Phase I/II environmental assessments, regulatory filings, and remediation obligations affecting the property.",
        },
        {
          id: "transaction_documents",
          title: "Transaction Document Review",
          generationMode: "ai_generated",
          description:
            "Review purchase agreement, financing documents, and closing conditions for legal sufficiency and risk allocation.",
        },
        {
          id: "closing_recommendations",
          title: "Closing Recommendations",
          generationMode: "human_authored",
          description:
            "Summarize legal risks, required title curative actions, and recommended closing conditions or deal modifications.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "title_documents",
        "leases",
        "environmental_reports",
        "zoning_certificates",
        "survey_documents",
      ],
    },
  },

  // 22. Dispute resolution preparation
  {
    id: "tpl_dispute_resolution_preparation",
    operatorId: null,
    name: "Dispute resolution preparation",
    description:
      "Preparation for alternative dispute resolution (mediation or arbitration) including position analysis, evidence marshalling, and settlement range modeling.",
    category: "legal",
    analysisFramework: {
      sections: [
        {
          id: "dispute_summary",
          title: "Dispute Summary & Issues",
          generationMode: "ai_generated",
          description:
            "Summarize the dispute background, identify the core legal and factual issues, and define the scope of claims and counterclaims.",
        },
        {
          id: "position_analysis",
          title: "Position Strength Analysis",
          generationMode: "ai_assisted",
          description:
            "Assess the relative strengths and weaknesses of each party's position on each disputed issue based on evidence and law.",
        },
        {
          id: "evidence_compilation",
          title: "Evidence Compilation & Gaps",
          generationMode: "ai_generated",
          description:
            "Organize available evidence by issue, assess documentary completeness, and identify critical evidence gaps.",
        },
        {
          id: "settlement_modeling",
          title: "Settlement Range Modeling",
          generationMode: "ai_generated",
          description:
            "Model best/worst/likely outcomes and BATNA for each party to establish a rational settlement zone.",
        },
        {
          id: "resolution_strategy",
          title: "Resolution Strategy",
          generationMode: "human_authored",
          description:
            "Formulate ADR strategy including opening position, concession plan, procedural preferences, and walk-away threshold.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "contracts",
        "correspondence",
        "legal_documents",
        "financial_records",
        "expert_reports",
      ],
    },
  },

  // ════════════════════════════════════════════════════════════════════════
  //  ACCOUNTING & AUDIT (8)
  // ════════════════════════════════════════════════════════════════════════

  // 23. Financial statement audit
  {
    id: "tpl_financial_statement_audit",
    operatorId: null,
    name: "Financial statement audit",
    description:
      "Structured audit engagement covering financial statement assertions, substantive testing, and controls evaluation to issue an audit opinion.",
    category: "audit",
    analysisFramework: {
      sections: [
        {
          id: "risk_assessment",
          title: "Risk Assessment & Planning",
          generationMode: "ai_generated",
          description:
            "Identify inherent and control risks by financial statement area. Determine materiality thresholds and design audit procedures accordingly.",
        },
        {
          id: "revenue_testing",
          title: "Revenue & Receivables Testing",
          generationMode: "ai_generated",
          description:
            "Test revenue recognition accuracy, cutoff, existence of receivables, and allowance for doubtful accounts through vouching and confirmation.",
        },
        {
          id: "expense_testing",
          title: "Expense & Payables Testing",
          generationMode: "ai_generated",
          description:
            "Test completeness of liabilities, accuracy of expense recognition, related-party transactions, and unusual journal entries.",
        },
        {
          id: "asset_verification",
          title: "Asset Verification",
          generationMode: "ai_generated",
          description:
            "Verify existence and valuation of significant assets including inventory, fixed assets, intangibles, and investments.",
        },
        {
          id: "internal_controls",
          title: "Internal Controls Evaluation",
          generationMode: "ai_assisted",
          description:
            "Evaluate design and operating effectiveness of key internal controls over financial reporting. Document deficiencies.",
        },
        {
          id: "going_concern",
          title: "Going Concern Assessment",
          generationMode: "ai_assisted",
          description:
            "Evaluate the entity's ability to continue as a going concern for at least 12 months based on financial indicators and management plans.",
        },
        {
          id: "audit_findings",
          title: "Audit Findings & Opinion",
          generationMode: "human_authored",
          description:
            "Summarize audit adjustments, management letter points, and the basis for the proposed audit opinion (unqualified, qualified, adverse, disclaimer).",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "financial_statements",
        "trial_balance",
        "bank_statements",
        "invoices",
        "contracts",
        "board_minutes",
      ],
    },
  },

  // 24. Tax compliance review
  {
    id: "tpl_tax_compliance_review",
    operatorId: null,
    name: "Tax compliance review",
    description:
      "Review of corporate tax filings, positions, and exposures across applicable jurisdictions to identify compliance gaps and optimization opportunities.",
    category: "audit",
    analysisFramework: {
      sections: [
        {
          id: "filing_status",
          title: "Filing Status & History",
          generationMode: "ai_generated",
          description:
            "Verify that all required tax returns have been filed timely across jurisdictions. Identify late filings and penalty exposure.",
        },
        {
          id: "income_tax",
          title: "Corporate Income Tax Analysis",
          generationMode: "ai_generated",
          description:
            "Review income tax computations, permanent and temporary differences, deferred tax assets/liabilities, and effective tax rate reconciliation.",
        },
        {
          id: "indirect_taxes",
          title: "VAT / Indirect Tax Review",
          generationMode: "ai_generated",
          description:
            "Assess VAT/GST compliance including input tax recovery, cross-border transaction classification, and reverse charge obligations.",
        },
        {
          id: "withholding_taxes",
          title: "Withholding Tax & Payroll Taxes",
          generationMode: "ai_generated",
          description:
            "Review withholding obligations on dividends, interest, royalties, and employment taxes for compliance and treaty benefit claims.",
        },
        {
          id: "tax_risk_assessment",
          title: "Tax Risk & Exposure Assessment",
          generationMode: "ai_assisted",
          description:
            "Identify uncertain tax positions, ongoing audits, and potential reassessment exposure. Quantify contingent tax liabilities.",
        },
        {
          id: "recommendations",
          title: "Compliance Recommendations",
          generationMode: "human_authored",
          description:
            "Prioritize compliance remediation, flag tax planning opportunities, and recommend changes to tax processes and controls.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "tax_returns",
        "financial_statements",
        "tax_correspondence",
        "transfer_pricing_documentation",
        "payroll_data",
      ],
    },
  },

  // 25. Transfer pricing analysis
  {
    id: "tpl_transfer_pricing_analysis",
    operatorId: null,
    name: "Transfer pricing analysis",
    description:
      "Analysis of intercompany transactions for arm's length compliance, including functional analysis, benchmarking, and documentation to satisfy transfer pricing regulations.",
    category: "audit",
    analysisFramework: {
      sections: [
        {
          id: "transaction_mapping",
          title: "Intercompany Transaction Mapping",
          generationMode: "ai_generated",
          description:
            "Catalog all intercompany transactions by type (goods, services, IP, financing) with volumes, pricing, and flow direction.",
        },
        {
          id: "functional_analysis",
          title: "Functional Analysis",
          generationMode: "ai_assisted",
          description:
            "Characterize each entity's functions, assets, and risks in the value chain to determine appropriate transfer pricing method.",
        },
        {
          id: "benchmarking",
          title: "Comparable Benchmarking",
          generationMode: "ai_generated",
          description:
            "Select appropriate transfer pricing method and perform benchmarking against comparable uncontrolled transactions or companies.",
        },
        {
          id: "economic_analysis",
          title: "Economic Analysis & Arm's Length Testing",
          generationMode: "ai_generated",
          description:
            "Test intercompany pricing against the interquartile range of benchmarked comparables. Identify out-of-range transactions.",
        },
        {
          id: "documentation_review",
          title: "Documentation & Compliance Review",
          generationMode: "ai_generated",
          description:
            "Assess master file, local file, and CbCR documentation against OECD guidelines and local regulatory requirements.",
        },
        {
          id: "risk_recommendations",
          title: "Risk Assessment & Recommendations",
          generationMode: "human_authored",
          description:
            "Identify transfer pricing risks, recommend pricing adjustments, and suggest advance pricing agreement opportunities.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "intercompany_agreements",
        "financial_statements",
        "transfer_pricing_documentation",
        "comparable_data",
        "corporate_structure",
      ],
    },
  },

  // 26. Internal controls assessment (SOX)
  {
    id: "tpl_internal_controls_assessment_sox",
    operatorId: null,
    name: "Internal controls assessment (SOX)",
    description:
      "Assessment of internal controls over financial reporting (ICFR) for Sarbanes-Oxley compliance, covering control design, operating effectiveness, and deficiency evaluation.",
    category: "audit",
    analysisFramework: {
      sections: [
        {
          id: "scoping",
          title: "Scoping & Risk Assessment",
          generationMode: "ai_generated",
          description:
            "Define scope of ICFR testing by identifying significant accounts, material transaction classes, and relevant assertions.",
        },
        {
          id: "control_inventory",
          title: "Control Inventory & Documentation",
          generationMode: "ai_generated",
          description:
            "Map process-level and entity-level controls to significant accounts. Evaluate completeness of control documentation and narratives.",
        },
        {
          id: "design_effectiveness",
          title: "Design Effectiveness Testing",
          generationMode: "ai_generated",
          description:
            "Evaluate whether each control is suitably designed to prevent or detect material misstatement in the relevant assertion.",
        },
        {
          id: "operating_effectiveness",
          title: "Operating Effectiveness Testing",
          generationMode: "ai_generated",
          description:
            "Test controls through inquiry, observation, reperformance, and inspection to confirm consistent operation throughout the period.",
        },
        {
          id: "it_general_controls",
          title: "IT General Controls (ITGC)",
          generationMode: "ai_assisted",
          description:
            "Assess ITGC including access management, change management, computer operations, and program development for financially significant systems.",
        },
        {
          id: "deficiency_evaluation",
          title: "Deficiency Evaluation & Remediation",
          generationMode: "human_authored",
          description:
            "Classify identified deficiencies (control deficiency, significant deficiency, material weakness) and recommend remediation actions.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "process_documentation",
        "control_matrices",
        "audit_reports",
        "it_documentation",
        "sample_transactions",
      ],
    },
  },

  // 27. Forensic accounting investigation
  {
    id: "tpl_forensic_accounting_investigation",
    operatorId: null,
    name: "Forensic accounting investigation",
    description:
      "Investigative analysis of suspected financial fraud, misstatement, or misconduct using forensic accounting techniques, data analytics, and evidence preservation.",
    category: "audit",
    analysisFramework: {
      sections: [
        {
          id: "allegation_assessment",
          title: "Allegation Assessment & Scoping",
          generationMode: "ai_assisted",
          description:
            "Evaluate the initial allegation, define investigation scope, and establish the factual questions to be resolved.",
        },
        {
          id: "data_collection",
          title: "Data Collection & Preservation",
          generationMode: "ai_generated",
          description:
            "Identify, preserve, and collect relevant financial records, communications, and electronic data with chain-of-custody controls.",
        },
        {
          id: "transaction_analysis",
          title: "Transaction Analysis & Anomaly Detection",
          generationMode: "ai_generated",
          description:
            "Apply forensic data analytics to identify anomalous transactions, duplicate payments, round-dollar patterns, and Benford's Law deviations.",
        },
        {
          id: "journal_entry_testing",
          title: "Journal Entry Testing",
          generationMode: "ai_generated",
          description:
            "Test high-risk journal entries for unauthorized entries, unusual timing, round amounts, and entries by unexpected personnel.",
        },
        {
          id: "fund_tracing",
          title: "Fund Tracing & Flow Analysis",
          generationMode: "ai_generated",
          description:
            "Trace the flow of funds through accounts to identify diversions, layering, or misappropriation of assets.",
        },
        {
          id: "findings_report",
          title: "Findings & Expert Report",
          generationMode: "human_authored",
          description:
            "Present factual findings with supporting evidence in a format suitable for legal proceedings, regulatory submission, or board presentation.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "financial_statements",
        "bank_statements",
        "journal_entries",
        "invoices",
        "correspondence",
        "access_logs",
      ],
    },
  },

  // 28. Revenue recognition review
  {
    id: "tpl_revenue_recognition_review",
    operatorId: null,
    name: "Revenue recognition review",
    description:
      "Technical review of revenue recognition policies and practices under ASC 606 / IFRS 15, assessing the five-step model application across contract types.",
    category: "audit",
    analysisFramework: {
      sections: [
        {
          id: "policy_assessment",
          title: "Revenue Recognition Policy Assessment",
          generationMode: "ai_generated",
          description:
            "Review the entity's revenue recognition policies for compliance with ASC 606 / IFRS 15 across all significant revenue streams.",
        },
        {
          id: "contract_identification",
          title: "Contract Identification & Modification",
          generationMode: "ai_generated",
          description:
            "Test contract identification criteria and evaluate treatment of contract modifications, combinations, and variable consideration.",
        },
        {
          id: "performance_obligations",
          title: "Performance Obligation Analysis",
          generationMode: "ai_generated",
          description:
            "Assess identification of distinct performance obligations and the basis for recognizing revenue over time vs at a point in time.",
        },
        {
          id: "transaction_price",
          title: "Transaction Price Allocation",
          generationMode: "ai_generated",
          description:
            "Review allocation of transaction price to performance obligations, including treatment of discounts, variable consideration, and significant financing.",
        },
        {
          id: "disclosure_review",
          title: "Disclosure Completeness",
          generationMode: "ai_assisted",
          description:
            "Evaluate whether revenue-related disclosures meet the disaggregation, contract balance, and remaining performance obligation requirements.",
        },
        {
          id: "findings",
          title: "Findings & Adjustment Recommendations",
          generationMode: "human_authored",
          description:
            "Summarize misapplications, quantify any required adjustments, and recommend policy or process improvements.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "contracts",
        "revenue_schedules",
        "financial_statements",
        "accounting_policies",
        "invoices",
      ],
    },
  },

  // 29. Inventory valuation assessment
  {
    id: "tpl_inventory_valuation_assessment",
    operatorId: null,
    name: "Inventory valuation assessment",
    description:
      "Assessment of inventory valuation methods, reserve adequacy, and existence for financial reporting or transactional purposes.",
    category: "audit",
    analysisFramework: {
      sections: [
        {
          id: "inventory_composition",
          title: "Inventory Composition & Aging",
          generationMode: "ai_generated",
          description:
            "Break down inventory by category (raw materials, WIP, finished goods), location, and aging. Identify slow-moving and obsolete items.",
        },
        {
          id: "costing_methodology",
          title: "Costing Methodology Review",
          generationMode: "ai_generated",
          description:
            "Evaluate the inventory costing method (FIFO, LIFO, weighted average, standard cost) for consistency, accuracy, and GAAP/IFRS compliance.",
        },
        {
          id: "lower_of_cost",
          title: "Lower of Cost or NRV Testing",
          generationMode: "ai_generated",
          description:
            "Test inventory carrying values against net realizable value. Quantify any required write-downs by category.",
        },
        {
          id: "reserve_analysis",
          title: "Inventory Reserve Analysis",
          generationMode: "ai_assisted",
          description:
            "Assess adequacy of obsolescence, shrinkage, and excess inventory reserves by analyzing historical write-off rates and turnover trends.",
        },
        {
          id: "valuation_conclusion",
          title: "Valuation Conclusion & Adjustments",
          generationMode: "human_authored",
          description:
            "Conclude on inventory valuation adequacy and quantify recommended adjustments to carrying value and reserve balances.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "inventory_records",
        "cost_data",
        "sales_data",
        "purchase_records",
        "count_sheets",
      ],
    },
  },

  // 30. Goodwill impairment testing
  {
    id: "tpl_goodwill_impairment_testing",
    operatorId: null,
    name: "Goodwill impairment testing",
    description:
      "Annual or trigger-based goodwill impairment assessment under ASC 350 / IAS 36, including reporting unit identification, fair value estimation, and impairment measurement.",
    category: "audit",
    analysisFramework: {
      sections: [
        {
          id: "reporting_unit_identification",
          title: "Reporting Unit Identification",
          generationMode: "ai_generated",
          description:
            "Identify and validate reporting units (CGUs under IFRS) and the allocation of goodwill to each unit.",
        },
        {
          id: "qualitative_assessment",
          title: "Qualitative Impairment Indicators",
          generationMode: "ai_generated",
          description:
            "Evaluate qualitative factors (macroeconomic, industry, entity-specific) to determine whether quantitative testing is required.",
        },
        {
          id: "fair_value_estimation",
          title: "Fair Value Estimation",
          generationMode: "ai_generated",
          description:
            "Estimate reporting unit fair value using income approach (DCF) and market approach (comparable companies/transactions).",
        },
        {
          id: "impairment_measurement",
          title: "Impairment Measurement",
          generationMode: "ai_generated",
          description:
            "Compare carrying amount to fair value and quantify any impairment charge. Perform sensitivity analysis on key assumptions.",
        },
        {
          id: "conclusion",
          title: "Conclusion & Disclosure Guidance",
          generationMode: "human_authored",
          description:
            "Conclude on impairment charge (if any), document key assumptions and sensitivities, and draft required financial statement disclosures.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "financial_statements",
        "projections",
        "market_data",
        "acquisition_records",
        "comparable_company_data",
      ],
    },
  },

  // ════════════════════════════════════════════════════════════════════════
  //  MANAGEMENT CONSULTING (10)
  // ════════════════════════════════════════════════════════════════════════

  // 31. Strategic review
  {
    id: "tpl_strategic_review",
    operatorId: null,
    name: "Strategic review",
    description:
      "Top-down strategic assessment of a company's competitive position, growth options, and strategic direction to inform board-level decision-making.",
    category: "consulting",
    analysisFramework: {
      sections: [
        {
          id: "current_state",
          title: "Current State Assessment",
          generationMode: "ai_generated",
          description:
            "Analyze the company's financial performance, market position, and competitive standing over the past 3-5 years.",
        },
        {
          id: "market_analysis",
          title: "Market & Industry Analysis",
          generationMode: "ai_assisted",
          description:
            "Map market size, growth drivers, competitive dynamics, and emerging trends that will shape the industry over the next 5 years.",
        },
        {
          id: "competitive_positioning",
          title: "Competitive Positioning",
          generationMode: "ai_assisted",
          description:
            "Evaluate competitive advantages and vulnerabilities relative to key competitors using capability mapping and win/loss analysis.",
        },
        {
          id: "growth_options",
          title: "Growth Options Assessment",
          generationMode: "ai_assisted",
          description:
            "Identify and evaluate organic and inorganic growth options including new markets, products, partnerships, and acquisition targets.",
        },
        {
          id: "capability_gaps",
          title: "Capability Gap Analysis",
          generationMode: "ai_generated",
          description:
            "Identify organizational capability gaps (talent, technology, processes) that must be closed to execute each growth option.",
        },
        {
          id: "strategic_recommendations",
          title: "Strategic Recommendations",
          generationMode: "human_authored",
          description:
            "Synthesize analysis into a recommended strategic direction with prioritized ideas, resource requirements, and success metrics.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "financial_statements",
        "crm_data",
        "industry_reports",
        "competitor_data",
        "internal_strategy_documents",
      ],
    },
  },

  // 32. Operational due diligence
  {
    id: "tpl_operational_due_diligence",
    operatorId: null,
    name: "Operational due diligence",
    description:
      "Deep-dive operational assessment for PE or strategic acquirers evaluating a target's operational performance, scalability, and improvement potential.",
    category: "consulting",
    analysisFramework: {
      sections: [
        {
          id: "operations_overview",
          title: "Operations Overview & KPIs",
          generationMode: "ai_generated",
          description:
            "Map core operational processes and benchmark KPIs (throughput, quality, cost, cycle time) against industry standards.",
        },
        {
          id: "cost_structure",
          title: "Cost Structure Analysis",
          generationMode: "ai_generated",
          description:
            "Decompose the cost base into fixed/variable, direct/indirect components. Identify cost reduction levers and achievability.",
        },
        {
          id: "capacity_scalability",
          title: "Capacity & Scalability Assessment",
          generationMode: "ai_assisted",
          description:
            "Evaluate current capacity utilization and the investment required to scale operations to support projected growth.",
        },
        {
          id: "supply_chain",
          title: "Supply Chain & Procurement",
          generationMode: "ai_generated",
          description:
            "Assess supplier concentration, lead times, procurement practices, and supply chain resilience to disruption.",
        },
        {
          id: "technology_systems",
          title: "Technology & Systems",
          generationMode: "ai_generated",
          description:
            "Evaluate the adequacy of operational technology, ERP systems, and automation maturity for current and future needs.",
        },
        {
          id: "workforce_assessment",
          title: "Workforce & Organization",
          generationMode: "ai_assisted",
          description:
            "Assess organizational structure, talent density, key-person risk, and labor market dynamics affecting talent retention.",
        },
        {
          id: "value_creation_plan",
          title: "Value Creation Plan",
          generationMode: "human_authored",
          description:
            "Quantify operational improvement opportunities into a 100-day and 3-year value creation roadmap with milestones.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "financial_statements",
        "operational_data",
        "employee_records",
        "procurement_data",
        "it_documentation",
      ],
    },
  },

  // 33. Digital maturity assessment
  {
    id: "tpl_digital_maturity_assessment",
    operatorId: null,
    name: "Digital maturity assessment",
    description:
      "Evaluation of an organization's digital capabilities across strategy, technology, data, process, and culture to define a digital transformation roadmap.",
    category: "consulting",
    analysisFramework: {
      sections: [
        {
          id: "digital_strategy",
          title: "Digital Strategy Alignment",
          generationMode: "ai_assisted",
          description:
            "Assess how well the organization's digital ideas align with business strategy and competitive requirements.",
        },
        {
          id: "technology_landscape",
          title: "Technology Landscape Assessment",
          generationMode: "ai_generated",
          description:
            "Map the current technology stack, integration architecture, and technical debt. Benchmark against industry peers.",
        },
        {
          id: "data_analytics",
          title: "Data & Analytics Maturity",
          generationMode: "ai_generated",
          description:
            "Evaluate data governance, analytics capabilities, AI/ML adoption, and decision-making processes across the organization.",
        },
        {
          id: "process_automation",
          title: "Process Digitization & Automation",
          generationMode: "ai_generated",
          description:
            "Assess the level of process digitization, workflow automation, and RPA/AI deployment in core business processes.",
        },
        {
          id: "digital_culture",
          title: "Digital Culture & Skills",
          generationMode: "ai_assisted",
          description:
            "Evaluate digital literacy, change readiness, innovation culture, and skill gaps across the workforce.",
        },
        {
          id: "transformation_roadmap",
          title: "Digital Transformation Roadmap",
          generationMode: "human_authored",
          description:
            "Define a phased digital transformation roadmap with quick wins, strategic bets, investment requirements, and capability building priorities.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "it_documentation",
        "process_documentation",
        "employee_surveys",
        "technology_inventory",
        "industry_benchmarks",
      ],
    },
  },

  // 34. Market entry analysis
  {
    id: "tpl_market_entry_analysis",
    operatorId: null,
    name: "Market entry analysis",
    description:
      "Analysis of market entry opportunities in a new geography or segment, covering market attractiveness, entry barriers, competitive landscape, and go-to-market strategy.",
    category: "consulting",
    analysisFramework: {
      sections: [
        {
          id: "market_sizing",
          title: "Market Sizing & Segmentation",
          generationMode: "ai_generated",
          description:
            "Estimate TAM, SAM, and SOM for the target market with segmentation by customer type, geography, and use case.",
        },
        {
          id: "competitive_landscape",
          title: "Competitive Landscape",
          generationMode: "ai_assisted",
          description:
            "Map incumbent competitors, their market share, positioning, and likely response to a new entrant.",
        },
        {
          id: "entry_barriers",
          title: "Entry Barriers & Regulatory Environment",
          generationMode: "ai_generated",
          description:
            "Assess barriers to entry including regulatory requirements, capital needs, distribution access, and brand/switching costs.",
        },
        {
          id: "customer_insights",
          title: "Customer Insights & Demand Validation",
          generationMode: "ai_assisted",
          description:
            "Synthesize customer research, pilot data, and demand indicators to validate product-market fit in the target market.",
        },
        {
          id: "financial_model",
          title: "Financial Model & Investment Case",
          generationMode: "ai_generated",
          description:
            "Build a market entry P&L and cash flow forecast with scenario analysis on market share ramp, pricing, and time to breakeven.",
        },
        {
          id: "entry_strategy",
          title: "Entry Strategy & Go-to-Market Plan",
          generationMode: "human_authored",
          description:
            "Recommend the optimal entry mode (organic, JV, acquisition), go-to-market approach, and first 12-month execution plan.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "industry_reports",
        "competitor_data",
        "customer_research",
        "regulatory_data",
        "financial_projections",
      ],
    },
  },

  // 35. Organizational restructuring
  {
    id: "tpl_organizational_restructuring",
    operatorId: null,
    name: "Organizational restructuring",
    description:
      "Design and implementation planning for organizational restructuring covering structure, spans and layers, role redesign, and change management.",
    category: "consulting",
    analysisFramework: {
      sections: [
        {
          id: "current_state_diagnosis",
          title: "Current State Diagnosis",
          generationMode: "ai_generated",
          description:
            "Analyze the current organizational structure, spans of control, layers, and decision rights against strategic requirements.",
        },
        {
          id: "structure_design",
          title: "Target Structure Design",
          generationMode: "ai_assisted",
          description:
            "Design the future organizational structure optimized for strategy execution, agility, and cost efficiency.",
        },
        {
          id: "role_mapping",
          title: "Role Mapping & Capability Requirements",
          generationMode: "ai_generated",
          description:
            "Map roles from current to future state, identify new capability requirements, and flag redeployment and redundancy implications.",
        },
        {
          id: "cost_impact",
          title: "Cost Impact Analysis",
          generationMode: "ai_generated",
          description:
            "Quantify restructuring costs (severance, relocation, recruitment) and ongoing savings from the new structure.",
        },
        {
          id: "change_management",
          title: "Change Management Plan",
          generationMode: "human_authored",
          description:
            "Define communication strategy, stakeholder engagement approach, transition timeline, and risk mitigation for the restructuring.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "org_charts",
        "employee_records",
        "financial_statements",
        "role_descriptions",
        "compensation_data",
      ],
    },
  },

  // 36. Cost optimization study
  {
    id: "tpl_cost_optimization_study",
    operatorId: null,
    name: "Cost optimization study",
    description:
      "Systematic identification and prioritization of cost reduction opportunities across the organization without compromising strategic capabilities.",
    category: "consulting",
    analysisFramework: {
      sections: [
        {
          id: "cost_baseline",
          title: "Cost Baseline & Decomposition",
          generationMode: "ai_generated",
          description:
            "Decompose the total cost base by function, cost type, and business unit. Establish the baseline for benchmarking and savings tracking.",
        },
        {
          id: "benchmarking",
          title: "Cost Benchmarking",
          generationMode: "ai_generated",
          description:
            "Benchmark cost ratios against industry peers and best-in-class operators to identify areas of above-peer spending.",
        },
        {
          id: "procurement_savings",
          title: "Procurement & Third-Party Spend",
          generationMode: "ai_generated",
          description:
            "Analyze third-party spend categories, contract terms, and consolidation opportunities. Quantify addressable procurement savings.",
        },
        {
          id: "process_efficiency",
          title: "Process Efficiency Opportunities",
          generationMode: "ai_assisted",
          description:
            "Identify automation, standardization, and process elimination opportunities across back-office and operational functions.",
        },
        {
          id: "workforce_optimization",
          title: "Workforce Optimization",
          generationMode: "ai_assisted",
          description:
            "Evaluate headcount productivity, spans of control, location strategy, and outsourcing/offshoring opportunities.",
        },
        {
          id: "implementation_roadmap",
          title: "Implementation Roadmap",
          generationMode: "human_authored",
          description:
            "Prioritize savings ideas by impact, feasibility, and risk. Create a phased implementation plan with P&L impact timeline.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "financial_statements",
        "procurement_data",
        "employee_records",
        "operational_data",
        "industry_benchmarks",
      ],
    },
  },

  // 37. Customer experience assessment
  {
    id: "tpl_customer_experience_assessment",
    operatorId: null,
    name: "Customer experience assessment",
    description:
      "End-to-end assessment of the customer experience across touchpoints, identifying pain points, loyalty drivers, and improvement opportunities to increase retention and lifetime value.",
    category: "consulting",
    analysisFramework: {
      sections: [
        {
          id: "journey_mapping",
          title: "Customer Journey Mapping",
          generationMode: "ai_generated",
          description:
            "Map the end-to-end customer journey across all touchpoints, identifying moments of truth, friction points, and emotional highs/lows.",
        },
        {
          id: "voice_of_customer",
          title: "Voice of Customer Analysis",
          generationMode: "ai_generated",
          description:
            "Synthesize customer feedback from surveys (NPS, CSAT), complaints, reviews, and social media to identify recurring themes.",
        },
        {
          id: "channel_performance",
          title: "Channel Performance Assessment",
          generationMode: "ai_generated",
          description:
            "Evaluate the performance and consistency of customer experience across digital, phone, in-person, and self-service channels.",
        },
        {
          id: "loyalty_economics",
          title: "Loyalty & Retention Economics",
          generationMode: "ai_generated",
          description:
            "Analyze customer retention rates, churn drivers, lifetime value segments, and the economic impact of experience improvements.",
        },
        {
          id: "cx_recommendations",
          title: "CX Improvement Recommendations",
          generationMode: "human_authored",
          description:
            "Prioritize experience improvements by customer impact and business value. Define quick wins and strategic CX investments.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "crm_data",
        "customer_surveys",
        "support_tickets",
        "web_analytics",
        "transaction_data",
      ],
    },
  },

  // 38. Supply chain assessment
  {
    id: "tpl_supply_chain_assessment",
    operatorId: null,
    name: "Supply chain assessment",
    description:
      "Comprehensive assessment of supply chain performance, resilience, and optimization opportunities from procurement through last-mile delivery.",
    category: "consulting",
    analysisFramework: {
      sections: [
        {
          id: "supply_chain_mapping",
          title: "Supply Chain Mapping",
          generationMode: "ai_generated",
          description:
            "Map the end-to-end supply chain including suppliers, manufacturing, warehousing, and distribution with lead times and costs at each node.",
        },
        {
          id: "supplier_analysis",
          title: "Supplier Analysis & Risk",
          generationMode: "ai_generated",
          description:
            "Assess supplier concentration, geographic risk, financial health, and alternative sourcing options for critical inputs.",
        },
        {
          id: "inventory_optimization",
          title: "Inventory Optimization",
          generationMode: "ai_generated",
          description:
            "Analyze inventory levels, turns, safety stock policies, and demand forecasting accuracy. Identify working capital release opportunities.",
        },
        {
          id: "logistics_performance",
          title: "Logistics & Distribution Performance",
          generationMode: "ai_generated",
          description:
            "Evaluate transportation costs, delivery performance, warehouse utilization, and network configuration efficiency.",
        },
        {
          id: "resilience_assessment",
          title: "Resilience & Continuity",
          generationMode: "ai_assisted",
          description:
            "Stress-test the supply chain against disruption scenarios (supplier failure, logistics disruption, demand spike) and assess contingency plans.",
        },
        {
          id: "optimization_plan",
          title: "Optimization Plan",
          generationMode: "human_authored",
          description:
            "Recommend supply chain improvements covering sourcing, inventory policy, logistics, and digital enablement with quantified benefits.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "procurement_data",
        "inventory_records",
        "logistics_data",
        "supplier_contracts",
        "demand_forecasts",
      ],
    },
  },

  // 39. Merger integration planning (PMI)
  {
    id: "tpl_merger_integration_planning",
    operatorId: null,
    name: "Merger integration planning (PMI)",
    description:
      "Post-merger integration planning covering organizational design, synergy capture, systems integration, and cultural alignment to realize deal value.",
    category: "consulting",
    analysisFramework: {
      sections: [
        {
          id: "integration_thesis",
          title: "Integration Thesis & Synergy Targets",
          generationMode: "ai_generated",
          description:
            "Define the strategic rationale for integration, quantify revenue and cost synergy targets, and establish the integration timeline.",
        },
        {
          id: "org_design",
          title: "Organizational Design & Talent Retention",
          generationMode: "ai_assisted",
          description:
            "Design the combined organization structure, define leadership appointments, and create retention plans for critical talent.",
        },
        {
          id: "functional_integration",
          title: "Functional Integration Plans",
          generationMode: "ai_assisted",
          description:
            "Develop integration plans for each function (finance, HR, sales, operations, IT) with milestones and interdependencies.",
        },
        {
          id: "systems_integration",
          title: "Systems & Data Integration",
          generationMode: "ai_generated",
          description:
            "Plan IT systems consolidation, data migration, and interim operating architecture for the transition period.",
        },
        {
          id: "cultural_alignment",
          title: "Cultural Integration & Change Management",
          generationMode: "ai_assisted",
          description:
            "Assess cultural differences, design alignment ideas, and plan communication strategies for combined workforce.",
        },
        {
          id: "synergy_tracking",
          title: "Synergy Tracking & Governance",
          generationMode: "ai_generated",
          description:
            "Establish an integration management office structure, synergy tracking methodology, and escalation protocols.",
        },
        {
          id: "day_one_readiness",
          title: "Day One Readiness & 100-Day Plan",
          generationMode: "human_authored",
          description:
            "Define Day One operating requirements, customer/employee communication, and the first 100-day priority actions.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "org_charts",
        "financial_statements",
        "it_documentation",
        "employee_records",
        "contracts",
        "operational_data",
      ],
    },
  },

  // 40. Workforce planning
  {
    id: "tpl_workforce_planning",
    operatorId: null,
    name: "Workforce planning",
    description:
      "Strategic workforce planning analysis to align talent supply with future demand, identifying skill gaps, hiring needs, and workforce shaping actions.",
    category: "consulting",
    analysisFramework: {
      sections: [
        {
          id: "current_workforce",
          title: "Current Workforce Profile",
          generationMode: "ai_generated",
          description:
            "Analyze the current workforce by function, level, skill, tenure, demographics, and cost. Identify concentration risks.",
        },
        {
          id: "demand_forecasting",
          title: "Future Demand Forecasting",
          generationMode: "ai_generated",
          description:
            "Model future workforce demand based on business plan, growth scenarios, productivity improvements, and automation impact.",
        },
        {
          id: "supply_analysis",
          title: "Talent Supply Analysis",
          generationMode: "ai_generated",
          description:
            "Forecast internal talent supply considering attrition, retirement, promotability, and internal mobility patterns.",
        },
        {
          id: "gap_analysis",
          title: "Gap Analysis & Critical Roles",
          generationMode: "ai_assisted",
          description:
            "Quantify the gap between future demand and projected supply by skill cluster. Identify critical roles with highest fill risk.",
        },
        {
          id: "workforce_plan",
          title: "Workforce Shaping Plan",
          generationMode: "human_authored",
          description:
            "Recommend workforce shaping actions (hire, develop, redeploy, restructure) with phasing, costs, and talent acquisition strategy.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "employee_records",
        "compensation_data",
        "org_charts",
        "business_plans",
        "labor_market_data",
      ],
    },
  },

  // ════════════════════════════════════════════════════════════════════════
  //  REAL ESTATE (5)
  // ════════════════════════════════════════════════════════════════════════

  // 41. Property valuation
  {
    id: "tpl_property_valuation",
    operatorId: null,
    name: "Property valuation",
    description:
      "Independent property valuation using income, sales comparison, and cost approaches for acquisition, financing, or financial reporting purposes.",
    category: "real_estate",
    analysisFramework: {
      sections: [
        {
          id: "property_description",
          title: "Property Description & Location",
          generationMode: "ai_generated",
          description:
            "Describe the property characteristics, location attributes, accessibility, and surrounding market conditions.",
        },
        {
          id: "income_approach",
          title: "Income Approach Valuation",
          generationMode: "ai_generated",
          description:
            "Estimate value using capitalization of net operating income and/or discounted cash flow of projected rental income.",
        },
        {
          id: "sales_comparison",
          title: "Sales Comparison Approach",
          generationMode: "ai_generated",
          description:
            "Select comparable sales, apply adjustments for differences in location, size, condition, and timing to derive an indicated value.",
        },
        {
          id: "cost_approach",
          title: "Cost Approach",
          generationMode: "ai_generated",
          description:
            "Estimate replacement cost new, less depreciation (physical, functional, external), plus land value.",
        },
        {
          id: "market_analysis",
          title: "Market Analysis & Trends",
          generationMode: "ai_assisted",
          description:
            "Analyze local market conditions including vacancy rates, rental trends, supply pipeline, and demand drivers.",
        },
        {
          id: "valuation_conclusion",
          title: "Valuation Conclusion",
          generationMode: "human_authored",
          description:
            "Reconcile the three approaches into a concluded market value with weighting rationale and key assumptions.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "property_records",
        "leases",
        "comparable_sales",
        "market_data",
        "inspection_reports",
      ],
    },
  },

  // 42. Environmental site assessment
  {
    id: "tpl_environmental_site_assessment",
    operatorId: null,
    name: "Environmental site assessment",
    description:
      "Phase I/II environmental site assessment evaluating potential contamination, regulatory compliance, and environmental liabilities for real estate transactions.",
    category: "real_estate",
    analysisFramework: {
      sections: [
        {
          id: "site_history",
          title: "Site History & Land Use",
          generationMode: "ai_generated",
          description:
            "Research historical land use, prior ownership, and historical operations using records, aerial photos, and Sanborn maps.",
        },
        {
          id: "regulatory_records",
          title: "Regulatory Records Review",
          generationMode: "ai_generated",
          description:
            "Search environmental databases for listed sites, permits, violations, spills, and underground storage tanks on or near the property.",
        },
        {
          id: "site_reconnaissance",
          title: "Site Reconnaissance Findings",
          generationMode: "ai_assisted",
          description:
            "Document observations from site inspection including storage tanks, staining, odors, drainage patterns, and adjacent property conditions.",
        },
        {
          id: "contamination_assessment",
          title: "Contamination Assessment",
          generationMode: "ai_generated",
          description:
            "Evaluate identified recognized environmental conditions (RECs) and quantify potential remediation scope and cost estimates.",
        },
        {
          id: "recommendations",
          title: "Conclusions & Recommendations",
          generationMode: "human_authored",
          description:
            "Classify findings (REC, CREC, HREC, de minimis), recommend Phase II investigation scope if warranted, and advise on transaction risk.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "environmental_reports",
        "property_records",
        "regulatory_filings",
        "site_photos",
        "historical_maps",
      ],
    },
  },

  // 43. Tenant analysis / lease review
  {
    id: "tpl_tenant_analysis_lease_review",
    operatorId: null,
    name: "Tenant analysis / lease review",
    description:
      "Analysis of a property's tenant roster and lease portfolio to assess income stability, rollover risk, and rental rate competitiveness.",
    category: "real_estate",
    analysisFramework: {
      sections: [
        {
          id: "tenant_roster",
          title: "Tenant Roster & Creditworthiness",
          generationMode: "ai_generated",
          description:
            "Profile each tenant including industry, credit rating, rental contribution, and financial health indicators.",
        },
        {
          id: "lease_terms",
          title: "Lease Terms Analysis",
          generationMode: "ai_generated",
          description:
            "Extract and compare key lease terms: base rent, escalations, expense recovery, renewal options, and termination rights.",
        },
        {
          id: "rollover_schedule",
          title: "Lease Rollover Schedule & Risk",
          generationMode: "ai_generated",
          description:
            "Map lease expirations by year and quantify rollover risk considering tenant renewal likelihood and market rental rates.",
        },
        {
          id: "market_rent_comparison",
          title: "Market Rent Comparison",
          generationMode: "ai_assisted",
          description:
            "Compare in-place rents to current market rates to identify mark-to-market opportunity or potential rental loss at rollover.",
        },
        {
          id: "income_recommendations",
          title: "Income Stability Assessment",
          generationMode: "human_authored",
          description:
            "Conclude on the stability and growth potential of rental income with recommendations for lease management and tenant retention.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "leases",
        "tenant_financials",
        "rent_rolls",
        "market_data",
        "property_records",
      ],
    },
  },

  // 44. Development feasibility study
  {
    id: "tpl_development_feasibility_study",
    operatorId: null,
    name: "Development feasibility study",
    description:
      "Feasibility analysis for a proposed real estate development project covering market demand, planning constraints, construction costs, and financial viability.",
    category: "real_estate",
    analysisFramework: {
      sections: [
        {
          id: "market_demand",
          title: "Market Demand Analysis",
          generationMode: "ai_generated",
          description:
            "Assess demand for the proposed development type in the target market including absorption rates, competition, and demographic drivers.",
        },
        {
          id: "planning_constraints",
          title: "Planning & Regulatory Constraints",
          generationMode: "ai_generated",
          description:
            "Review zoning, building codes, environmental regulations, and planning approval requirements that affect the development program.",
        },
        {
          id: "construction_costs",
          title: "Construction Cost Estimation",
          generationMode: "ai_generated",
          description:
            "Estimate total development costs including land, hard costs, soft costs, financing costs, and contingencies.",
        },
        {
          id: "financial_viability",
          title: "Financial Viability Analysis",
          generationMode: "ai_generated",
          description:
            "Build a development pro forma with revenue projections, cost assumptions, and returns analysis (IRR, profit on cost, equity multiple).",
        },
        {
          id: "risk_sensitivity",
          title: "Risk & Sensitivity Analysis",
          generationMode: "ai_assisted",
          description:
            "Stress-test the pro forma against construction cost overruns, delayed absorption, and rental/pricing downside scenarios.",
        },
        {
          id: "feasibility_conclusion",
          title: "Feasibility Conclusion",
          generationMode: "human_authored",
          description:
            "Conclude on project feasibility with a go/no-go recommendation, key conditions for viability, and risk mitigation measures.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "market_data",
        "planning_documents",
        "construction_estimates",
        "comparable_developments",
        "financial_projections",
      ],
    },
  },

  // 45. Building condition survey
  {
    id: "tpl_building_condition_survey",
    operatorId: null,
    name: "Building condition survey",
    description:
      "Technical assessment of a building's physical condition covering structure, envelope, MEP systems, and remaining useful life with capital expenditure forecasting.",
    category: "real_estate",
    analysisFramework: {
      sections: [
        {
          id: "structural_assessment",
          title: "Structural Assessment",
          generationMode: "ai_generated",
          description:
            "Evaluate the structural system including foundations, framing, load-bearing walls, and any evidence of settlement, cracking, or deterioration.",
        },
        {
          id: "building_envelope",
          title: "Building Envelope & Roofing",
          generationMode: "ai_generated",
          description:
            "Assess the condition of the roof, exterior walls, windows, doors, and waterproofing systems. Estimate remaining useful life.",
        },
        {
          id: "mep_systems",
          title: "MEP Systems Assessment",
          generationMode: "ai_generated",
          description:
            "Evaluate mechanical (HVAC), electrical, plumbing, and fire protection systems for condition, code compliance, and remaining useful life.",
        },
        {
          id: "code_compliance",
          title: "Code Compliance & Accessibility",
          generationMode: "ai_assisted",
          description:
            "Identify building code violations, ADA/accessibility deficiencies, and required upgrades for current standards compliance.",
        },
        {
          id: "capex_forecast",
          title: "Capital Expenditure Forecast",
          generationMode: "ai_generated",
          description:
            "Develop a 10-year capital expenditure forecast for immediate repairs, deferred maintenance, and planned replacements by building system.",
        },
        {
          id: "condition_summary",
          title: "Condition Summary & Recommendations",
          generationMode: "human_authored",
          description:
            "Summarize overall building condition, prioritize immediate and near-term repairs, and advise on impact to transaction pricing.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "inspection_reports",
        "building_plans",
        "maintenance_records",
        "equipment_inventories",
        "property_records",
      ],
    },
  },

  // ════════════════════════════════════════════════════════════════════════
  //  IT & CYBERSECURITY (6)
  // ════════════════════════════════════════════════════════════════════════

  // 46. Cybersecurity assessment
  {
    id: "tpl_cybersecurity_assessment",
    operatorId: null,
    name: "Cybersecurity assessment",
    description:
      "Comprehensive evaluation of an organization's cybersecurity posture covering threat landscape, control effectiveness, vulnerability management, and incident response readiness.",
    category: "it_cyber",
    analysisFramework: {
      sections: [
        {
          id: "threat_landscape",
          title: "Threat Landscape Analysis",
          generationMode: "ai_generated",
          description:
            "Assess the relevant threat landscape based on industry, geography, and technology profile. Identify the most likely threat actors and attack vectors.",
        },
        {
          id: "governance_framework",
          title: "Security Governance & Framework",
          generationMode: "ai_generated",
          description:
            "Evaluate the security governance structure, policies, and alignment with frameworks (NIST CSF, ISO 27001, CIS Controls).",
        },
        {
          id: "access_management",
          title: "Identity & Access Management",
          generationMode: "ai_generated",
          description:
            "Review IAM practices including authentication methods, privilege management, access reviews, and identity lifecycle processes.",
        },
        {
          id: "network_security",
          title: "Network & Endpoint Security",
          generationMode: "ai_generated",
          description:
            "Assess network segmentation, firewall rules, endpoint protection, and monitoring coverage across the infrastructure.",
        },
        {
          id: "vulnerability_management",
          title: "Vulnerability Management",
          generationMode: "ai_generated",
          description:
            "Evaluate the vulnerability management program including scanning cadence, patching SLAs, and remediation effectiveness.",
        },
        {
          id: "incident_response",
          title: "Incident Response Readiness",
          generationMode: "ai_assisted",
          description:
            "Assess incident response plans, team capabilities, tabletop exercise history, and communication protocols.",
        },
        {
          id: "data_protection",
          title: "Data Protection & Encryption",
          generationMode: "ai_generated",
          description:
            "Review data classification, encryption (at rest, in transit), DLP controls, and backup/recovery procedures.",
        },
        {
          id: "risk_recommendations",
          title: "Risk Prioritization & Recommendations",
          generationMode: "human_authored",
          description:
            "Prioritize identified risks by likelihood and impact. Recommend remediation actions with effort estimates and risk reduction metrics.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "security_policies",
        "vulnerability_scans",
        "network_diagrams",
        "access_logs",
        "incident_records",
        "it_documentation",
      ],
    },
  },

  // 47. IT infrastructure audit
  {
    id: "tpl_it_infrastructure_audit",
    operatorId: null,
    name: "IT infrastructure audit",
    description:
      "Technical audit of IT infrastructure covering compute, storage, network, and operational practices to identify reliability, performance, and cost optimization opportunities.",
    category: "it_cyber",
    analysisFramework: {
      sections: [
        {
          id: "infrastructure_inventory",
          title: "Infrastructure Inventory & Architecture",
          generationMode: "ai_generated",
          description:
            "Catalog all infrastructure components (servers, storage, network, cloud resources) and map the logical and physical architecture.",
        },
        {
          id: "capacity_performance",
          title: "Capacity & Performance Analysis",
          generationMode: "ai_generated",
          description:
            "Analyze utilization metrics, performance bottlenecks, and capacity forecasting against projected growth requirements.",
        },
        {
          id: "availability_resilience",
          title: "Availability & Resilience",
          generationMode: "ai_generated",
          description:
            "Evaluate high availability configurations, disaster recovery capabilities, backup procedures, and RTO/RPO compliance.",
        },
        {
          id: "operational_practices",
          title: "Operational Practices & ITIL Alignment",
          generationMode: "ai_assisted",
          description:
            "Assess IT service management practices including change management, incident management, and monitoring coverage.",
        },
        {
          id: "cost_analysis",
          title: "Infrastructure Cost Analysis",
          generationMode: "ai_generated",
          description:
            "Analyze infrastructure spending by category and identify rightsizing, consolidation, and licensing optimization opportunities.",
        },
        {
          id: "modernization_plan",
          title: "Modernization Roadmap",
          generationMode: "human_authored",
          description:
            "Recommend infrastructure modernization priorities with business case, migration approach, and phased implementation plan.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "it_documentation",
        "network_diagrams",
        "monitoring_data",
        "license_records",
        "cost_data",
      ],
    },
  },

  // 48. Software / technology DD
  {
    id: "tpl_software_technology_dd",
    operatorId: null,
    name: "Software / technology DD",
    description:
      "Technology due diligence for investors evaluating a software/tech company, covering architecture quality, engineering practices, scalability, and technical debt.",
    category: "it_cyber",
    analysisFramework: {
      sections: [
        {
          id: "architecture_review",
          title: "Architecture & Design Review",
          generationMode: "ai_assisted",
          description:
            "Evaluate the software architecture for modularity, scalability, and alignment with product roadmap requirements.",
        },
        {
          id: "code_quality",
          title: "Code Quality & Technical Debt",
          generationMode: "ai_generated",
          description:
            "Assess code quality metrics, test coverage, technical debt indicators, and refactoring needs using static analysis and repository data.",
        },
        {
          id: "engineering_practices",
          title: "Engineering Practices & DevOps",
          generationMode: "ai_generated",
          description:
            "Evaluate CI/CD pipelines, deployment frequency, code review practices, and engineering team velocity and productivity.",
        },
        {
          id: "scalability_performance",
          title: "Scalability & Performance",
          generationMode: "ai_generated",
          description:
            "Assess the system's ability to handle 10x growth in users, data, and transactions without architectural redesign.",
        },
        {
          id: "security_compliance",
          title: "Security & Compliance",
          generationMode: "ai_generated",
          description:
            "Review application security practices, data handling, compliance certifications (SOC 2, ISO 27001), and vulnerability history.",
        },
        {
          id: "team_assessment",
          title: "Engineering Team Assessment",
          generationMode: "ai_assisted",
          description:
            "Evaluate team composition, skill depth, key-person risk, documentation quality, and knowledge management practices.",
        },
        {
          id: "technology_risks",
          title: "Technology Risks & Investment Needs",
          generationMode: "human_authored",
          description:
            "Summarize critical technology risks, quantify required investment to address technical debt, and assess the technology's defensibility.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "source_code_access",
        "it_documentation",
        "architecture_diagrams",
        "deployment_logs",
        "security_reports",
      ],
    },
  },

  // 49. Data migration assessment
  {
    id: "tpl_data_migration_assessment",
    operatorId: null,
    name: "Data migration assessment",
    description:
      "Assessment and planning for data migration between systems, covering data quality, mapping complexity, transformation rules, and migration risk mitigation.",
    category: "it_cyber",
    analysisFramework: {
      sections: [
        {
          id: "source_analysis",
          title: "Source Data Analysis",
          generationMode: "ai_generated",
          description:
            "Profile source data systems including schemas, volumes, data types, quality issues, and integration points.",
        },
        {
          id: "data_quality",
          title: "Data Quality Assessment",
          generationMode: "ai_generated",
          description:
            "Assess data quality across dimensions (completeness, accuracy, consistency, timeliness) and quantify remediation effort.",
        },
        {
          id: "mapping_transformation",
          title: "Data Mapping & Transformation",
          generationMode: "ai_generated",
          description:
            "Define source-to-target data mappings, transformation rules, and business logic for data conversion.",
        },
        {
          id: "migration_strategy",
          title: "Migration Strategy & Approach",
          generationMode: "ai_assisted",
          description:
            "Recommend migration approach (big bang, phased, parallel run), tooling, and cutover strategy with rollback procedures.",
        },
        {
          id: "risk_mitigation",
          title: "Risk Mitigation & Validation Plan",
          generationMode: "human_authored",
          description:
            "Define data validation rules, reconciliation procedures, and rollback triggers to ensure migration integrity.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "database_schemas",
        "data_samples",
        "it_documentation",
        "business_rules",
        "data_dictionaries",
      ],
    },
  },

  // 50. Cloud readiness assessment
  {
    id: "tpl_cloud_readiness_assessment",
    operatorId: null,
    name: "Cloud readiness assessment",
    description:
      "Assessment of an organization's readiness to migrate workloads to cloud infrastructure, covering application portfolio, cost modeling, and migration planning.",
    category: "it_cyber",
    analysisFramework: {
      sections: [
        {
          id: "application_portfolio",
          title: "Application Portfolio Analysis",
          generationMode: "ai_generated",
          description:
            "Classify applications by cloud migration strategy (rehost, replatform, refactor, replace, retire) based on architecture and business value.",
        },
        {
          id: "infrastructure_assessment",
          title: "Current Infrastructure Assessment",
          generationMode: "ai_generated",
          description:
            "Map current infrastructure footprint, utilization patterns, and dependencies to identify cloud migration candidates.",
        },
        {
          id: "cost_modeling",
          title: "Cloud Cost Modeling",
          generationMode: "ai_generated",
          description:
            "Model total cost of ownership for cloud vs on-premises scenarios including compute, storage, networking, licensing, and operations.",
        },
        {
          id: "security_compliance",
          title: "Security & Compliance Requirements",
          generationMode: "ai_assisted",
          description:
            "Identify security, data residency, and regulatory constraints that affect cloud provider and service selection.",
        },
        {
          id: "organizational_readiness",
          title: "Organizational Readiness",
          generationMode: "ai_assisted",
          description:
            "Assess cloud skills, operating model readiness, and cultural factors that will affect migration success.",
        },
        {
          id: "migration_roadmap",
          title: "Migration Roadmap",
          generationMode: "human_authored",
          description:
            "Define migration waves, sequencing, pilot workloads, and the target operating model for cloud operations.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "it_documentation",
        "application_inventory",
        "infrastructure_data",
        "cost_data",
        "security_policies",
      ],
    },
  },

  // 51. System integration planning
  {
    id: "tpl_system_integration_planning",
    operatorId: null,
    name: "System integration planning",
    description:
      "Planning for enterprise system integration (ERP, CRM, etc.) covering requirements, architecture design, data flows, and implementation approach.",
    category: "it_cyber",
    analysisFramework: {
      sections: [
        {
          id: "requirements_analysis",
          title: "Integration Requirements Analysis",
          generationMode: "ai_generated",
          description:
            "Catalog integration requirements by business process, data flow direction, frequency, and latency requirements.",
        },
        {
          id: "architecture_design",
          title: "Integration Architecture Design",
          generationMode: "ai_assisted",
          description:
            "Design the integration architecture including middleware selection, API strategy, event-driven patterns, and error handling.",
        },
        {
          id: "data_mapping",
          title: "Data Mapping & Standards",
          generationMode: "ai_generated",
          description:
            "Define data mapping between systems, master data management rules, and data governance standards for the integrated environment.",
        },
        {
          id: "testing_strategy",
          title: "Testing Strategy",
          generationMode: "ai_generated",
          description:
            "Define integration testing approach including unit testing, end-to-end testing, performance testing, and user acceptance criteria.",
        },
        {
          id: "implementation_plan",
          title: "Implementation & Cutover Plan",
          generationMode: "human_authored",
          description:
            "Plan the phased implementation, cutover sequence, rollback procedures, and post-go-live support model.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "it_documentation",
        "api_specifications",
        "database_schemas",
        "process_documentation",
        "business_rules",
      ],
    },
  },

  // ════════════════════════════════════════════════════════════════════════
  //  HR & RECRUITMENT (5)
  // ════════════════════════════════════════════════════════════════════════

  // 52. Executive search assessment
  {
    id: "tpl_executive_search_assessment",
    operatorId: null,
    name: "Executive search assessment",
    description:
      "Structured executive candidate assessment combining competency evaluation, leadership style analysis, cultural fit, and reference intelligence for senior hiring decisions.",
    category: "hr",
    analysisFramework: {
      sections: [
        {
          id: "role_specification",
          title: "Role Specification & Success Profile",
          generationMode: "ai_assisted",
          description:
            "Define the role requirements, success criteria, and ideal candidate profile based on organizational context and strategic needs.",
        },
        {
          id: "candidate_evaluation",
          title: "Candidate Evaluation & Scoring",
          generationMode: "ai_generated",
          description:
            "Evaluate candidates against the success profile across competencies, experience, leadership capability, and cultural alignment.",
        },
        {
          id: "leadership_assessment",
          title: "Leadership Style Assessment",
          generationMode: "ai_assisted",
          description:
            "Assess each candidate's leadership style, decision-making approach, and fit with the organization's culture and leadership team.",
        },
        {
          id: "reference_analysis",
          title: "Reference & Background Analysis",
          generationMode: "ai_generated",
          description:
            "Synthesize reference feedback, background checks, and public record findings into a comprehensive candidate risk profile.",
        },
        {
          id: "recommendation",
          title: "Hiring Recommendation",
          generationMode: "human_authored",
          description:
            "Provide a ranked candidate recommendation with comparative assessment, onboarding considerations, and negotiation guidance.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "candidate_profiles",
        "reference_reports",
        "role_descriptions",
        "organizational_data",
        "assessment_results",
      ],
    },
  },

  // 53. Compensation benchmarking
  {
    id: "tpl_compensation_benchmarking",
    operatorId: null,
    name: "Compensation benchmarking",
    description:
      "Market benchmarking of compensation and benefits programs against industry peers to ensure competitiveness and internal equity.",
    category: "hr",
    analysisFramework: {
      sections: [
        {
          id: "current_compensation",
          title: "Current Compensation Analysis",
          generationMode: "ai_generated",
          description:
            "Analyze the current compensation structure including base pay, variable pay, equity, and benefits by role, level, and geography.",
        },
        {
          id: "market_benchmarking",
          title: "Market Benchmarking",
          generationMode: "ai_generated",
          description:
            "Compare compensation levels against market survey data, matching roles to benchmark positions at P25/P50/P75 percentiles.",
        },
        {
          id: "internal_equity",
          title: "Internal Equity Analysis",
          generationMode: "ai_generated",
          description:
            "Assess internal pay equity across gender, tenure, and performance dimensions. Identify compression and inversion issues.",
        },
        {
          id: "total_rewards",
          title: "Total Rewards Competitiveness",
          generationMode: "ai_assisted",
          description:
            "Evaluate the total rewards proposition including benefits, perquisites, work flexibility, and career development relative to talent competitors.",
        },
        {
          id: "recommendations",
          title: "Compensation Recommendations",
          generationMode: "human_authored",
          description:
            "Recommend pay structure adjustments, equity corrections, and total rewards enhancements with budget impact and implementation phasing.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "compensation_data",
        "employee_records",
        "market_surveys",
        "benefits_data",
        "org_charts",
      ],
    },
  },

  // 54. Organizational culture assessment
  {
    id: "tpl_organizational_culture_assessment",
    operatorId: null,
    name: "Organizational culture assessment",
    description:
      "Assessment of organizational culture through quantitative surveys, qualitative interviews, and behavioral observation to identify cultural strengths, gaps, and alignment with strategy.",
    category: "hr",
    analysisFramework: {
      sections: [
        {
          id: "culture_survey",
          title: "Culture Survey Analysis",
          generationMode: "ai_generated",
          description:
            "Analyze quantitative culture survey data across dimensions (collaboration, innovation, accountability, inclusion) by department and level.",
        },
        {
          id: "qualitative_insights",
          title: "Qualitative Insights",
          generationMode: "ai_assisted",
          description:
            "Synthesize themes from interviews and focus groups covering lived experience, management behaviors, and unwritten rules.",
        },
        {
          id: "strategy_alignment",
          title: "Culture-Strategy Alignment",
          generationMode: "ai_assisted",
          description:
            "Assess how well the current culture supports the organization's strategic objectives and identify cultural barriers to execution.",
        },
        {
          id: "subculture_analysis",
          title: "Subculture Analysis",
          generationMode: "ai_generated",
          description:
            "Identify cultural variations across departments, locations, and levels. Map subcultures that reinforce or undermine the desired culture.",
        },
        {
          id: "culture_roadmap",
          title: "Culture Transformation Roadmap",
          generationMode: "human_authored",
          description:
            "Define the target culture, key behavioral shifts, leadership actions, and reinforcement mechanisms to drive cultural change.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "employee_surveys",
        "interview_transcripts",
        "employee_records",
        "internal_communications",
        "performance_data",
      ],
    },
  },

  // 55. Workforce analytics
  {
    id: "tpl_workforce_analytics",
    operatorId: null,
    name: "Workforce analytics",
    description:
      "Data-driven analysis of workforce metrics including attrition, engagement, productivity, and diversity to inform evidence-based people decisions.",
    category: "hr",
    analysisFramework: {
      sections: [
        {
          id: "workforce_demographics",
          title: "Workforce Demographics & Composition",
          generationMode: "ai_generated",
          description:
            "Analyze workforce composition by demographics, tenure, function, level, and employment type. Track trends over 3 years.",
        },
        {
          id: "attrition_analysis",
          title: "Attrition & Retention Analysis",
          generationMode: "ai_generated",
          description:
            "Analyze voluntary and involuntary attrition by segment, identify leading indicators of flight risk, and quantify cost of turnover.",
        },
        {
          id: "engagement_productivity",
          title: "Engagement & Productivity Metrics",
          generationMode: "ai_generated",
          description:
            "Correlate engagement survey data with performance, productivity, and business outcome metrics to identify high-leverage interventions.",
        },
        {
          id: "dei_analytics",
          title: "Diversity, Equity & Inclusion Analytics",
          generationMode: "ai_generated",
          description:
            "Analyze representation, hiring, promotion, and pay equity across demographic dimensions. Track progress against DEI goals.",
        },
        {
          id: "insights_actions",
          title: "Insights & Recommended Actions",
          generationMode: "human_authored",
          description:
            "Translate analytical findings into actionable recommendations for talent strategy, retention programs, and organizational health improvements.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "employee_records",
        "performance_data",
        "employee_surveys",
        "compensation_data",
        "recruitment_data",
      ],
    },
  },

  // 56. Training needs analysis
  {
    id: "tpl_training_needs_analysis",
    operatorId: null,
    name: "Training needs analysis",
    description:
      "Systematic analysis of organizational training and development needs by comparing current capabilities to required competencies across roles and functions.",
    category: "hr",
    analysisFramework: {
      sections: [
        {
          id: "competency_mapping",
          title: "Competency Framework & Mapping",
          generationMode: "ai_generated",
          description:
            "Define required competencies by role family and level. Map current capability levels against requirements to quantify skill gaps.",
        },
        {
          id: "performance_gap_analysis",
          title: "Performance Gap Analysis",
          generationMode: "ai_generated",
          description:
            "Analyze performance data, quality metrics, and error rates to identify skill-related performance gaps by function and team.",
        },
        {
          id: "training_effectiveness",
          title: "Current Training Effectiveness",
          generationMode: "ai_generated",
          description:
            "Evaluate existing training programs for utilization, completion rates, knowledge retention, and behavioral impact.",
        },
        {
          id: "priority_assessment",
          title: "Priority Assessment",
          generationMode: "ai_assisted",
          description:
            "Prioritize training needs by business impact, urgency, and number of affected employees. Distinguish between training and non-training solutions.",
        },
        {
          id: "training_plan",
          title: "Training & Development Plan",
          generationMode: "human_authored",
          description:
            "Design a training program covering delivery methods, content priorities, scheduling, budget, and measurement approach.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "employee_records",
        "performance_data",
        "training_records",
        "competency_frameworks",
        "role_descriptions",
      ],
    },
  },

  // ════════════════════════════════════════════════════════════════════════
  //  COMPLIANCE & RISK (7)
  // ════════════════════════════════════════════════════════════════════════

  // 57. ESG / sustainability assessment
  {
    id: "tpl_esg_sustainability_assessment",
    operatorId: null,
    name: "ESG / sustainability assessment",
    description:
      "Assessment of environmental, social, and governance performance and practices against reporting frameworks (GRI, SASB, TCFD) and stakeholder expectations.",
    category: "compliance",
    analysisFramework: {
      sections: [
        {
          id: "environmental_metrics",
          title: "Environmental Performance",
          generationMode: "ai_generated",
          description:
            "Analyze environmental metrics including carbon emissions (Scope 1-3), energy use, water consumption, and waste management against targets.",
        },
        {
          id: "social_assessment",
          title: "Social Impact Assessment",
          generationMode: "ai_generated",
          description:
            "Evaluate social performance covering workforce health and safety, diversity and inclusion, community impact, and supply chain labor practices.",
        },
        {
          id: "governance_review",
          title: "Governance Practices Review",
          generationMode: "ai_generated",
          description:
            "Assess governance structures, board oversight of ESG, ethics policies, anti-corruption measures, and stakeholder engagement.",
        },
        {
          id: "materiality_assessment",
          title: "Materiality Assessment",
          generationMode: "ai_assisted",
          description:
            "Identify material ESG topics based on stakeholder priorities, industry benchmarks, and financial impact analysis.",
        },
        {
          id: "reporting_gaps",
          title: "Reporting Framework Alignment",
          generationMode: "ai_generated",
          description:
            "Map current ESG disclosures against GRI, SASB, TCFD, and CSRD requirements. Identify disclosure gaps and data collection needs.",
        },
        {
          id: "esg_roadmap",
          title: "ESG Strategy & Roadmap",
          generationMode: "human_authored",
          description:
            "Define ESG priorities, targets, and implementation roadmap aligned with business strategy and stakeholder expectations.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "sustainability_reports",
        "emissions_data",
        "employee_records",
        "supply_chain_data",
        "corporate_documents",
      ],
    },
  },

  // 58. Anti-corruption compliance
  {
    id: "tpl_anti_corruption_compliance",
    operatorId: null,
    name: "Anti-corruption compliance",
    description:
      "Assessment of anti-corruption compliance programs against FCPA, UK Bribery Act, and local anti-corruption laws, covering policies, controls, and third-party risk management.",
    category: "compliance",
    analysisFramework: {
      sections: [
        {
          id: "risk_assessment",
          title: "Corruption Risk Assessment",
          generationMode: "ai_generated",
          description:
            "Map corruption risks by geography, business line, and transaction type using Transparency International indices and industry typologies.",
        },
        {
          id: "policy_review",
          title: "Anti-Corruption Policy Review",
          generationMode: "ai_generated",
          description:
            "Evaluate anti-corruption policies, codes of conduct, and gift/hospitality guidelines for completeness and enforceability.",
        },
        {
          id: "third_party_management",
          title: "Third-Party Due Diligence",
          generationMode: "ai_generated",
          description:
            "Assess third-party risk management processes including agent vetting, due diligence depth, and ongoing monitoring of intermediaries.",
        },
        {
          id: "controls_testing",
          title: "Controls & Transaction Testing",
          generationMode: "ai_generated",
          description:
            "Test anti-corruption controls through sample transaction review, expense analysis, and payment testing for red flag indicators.",
        },
        {
          id: "training_awareness",
          title: "Training & Awareness Assessment",
          generationMode: "ai_assisted",
          description:
            "Evaluate anti-corruption training programs for coverage, frequency, content relevance, and effectiveness measurement.",
        },
        {
          id: "recommendations",
          title: "Compliance Enhancement Recommendations",
          generationMode: "human_authored",
          description:
            "Identify compliance program weaknesses and recommend enhancements to policies, controls, training, and monitoring.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "internal_policies",
        "financial_records",
        "third_party_agreements",
        "training_records",
        "incident_logs",
      ],
    },
  },

  // 59. Trade compliance / sanctions screening
  {
    id: "tpl_trade_compliance_sanctions_screening",
    operatorId: null,
    name: "Trade compliance / sanctions screening",
    description:
      "Review of trade compliance and sanctions programs covering screening processes, export controls, and embargo compliance across the organization's operations.",
    category: "compliance",
    analysisFramework: {
      sections: [
        {
          id: "sanctions_screening",
          title: "Sanctions Screening Review",
          generationMode: "ai_generated",
          description:
            "Evaluate screening processes against OFAC SDN, EU consolidated list, and UN sanctions lists. Test screening completeness and match resolution procedures.",
        },
        {
          id: "export_controls",
          title: "Export Control Compliance",
          generationMode: "ai_generated",
          description:
            "Assess export classification (EAR/ITAR), licensing compliance, deemed exports, and end-use/end-user screening processes.",
        },
        {
          id: "transaction_monitoring",
          title: "Transaction Monitoring",
          generationMode: "ai_generated",
          description:
            "Review transaction monitoring for trade-based money laundering indicators, restricted destination shipments, and suspicious routing patterns.",
        },
        {
          id: "policy_governance",
          title: "Policy & Governance Framework",
          generationMode: "ai_assisted",
          description:
            "Evaluate the trade compliance governance structure, policies, record-keeping, and voluntary self-disclosure procedures.",
        },
        {
          id: "remediation_plan",
          title: "Risk Assessment & Remediation",
          generationMode: "human_authored",
          description:
            "Identify compliance gaps, quantify violation exposure, and recommend program improvements with implementation priority.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "transaction_records",
        "customer_data",
        "shipping_records",
        "internal_policies",
        "screening_logs",
      ],
    },
  },

  // 60. Health & safety audit
  {
    id: "tpl_health_safety_audit",
    operatorId: null,
    name: "Health & safety audit",
    description:
      "Audit of occupational health and safety management systems, practices, and compliance against regulatory requirements and industry standards (ISO 45001).",
    category: "compliance",
    analysisFramework: {
      sections: [
        {
          id: "management_system",
          title: "Safety Management System Review",
          generationMode: "ai_generated",
          description:
            "Evaluate the OHS management system structure, leadership commitment, worker participation, and alignment with ISO 45001.",
        },
        {
          id: "hazard_identification",
          title: "Hazard Identification & Risk Assessment",
          generationMode: "ai_generated",
          description:
            "Review hazard identification processes, risk assessments, and hierarchy of controls applied across operational areas.",
        },
        {
          id: "incident_analysis",
          title: "Incident & Injury Analysis",
          generationMode: "ai_generated",
          description:
            "Analyze incident history, near-miss reports, injury rates, and root cause investigation quality over 3-5 years.",
        },
        {
          id: "regulatory_compliance",
          title: "Regulatory Compliance Assessment",
          generationMode: "ai_generated",
          description:
            "Test compliance with applicable OHS regulations, workplace standards, and inspection findings from regulatory authorities.",
        },
        {
          id: "improvement_plan",
          title: "Improvement Recommendations",
          generationMode: "human_authored",
          description:
            "Prioritize safety improvements by risk severity, recommend control measures, and define a continuous improvement program.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "incident_logs",
        "risk_assessments",
        "inspection_reports",
        "training_records",
        "internal_policies",
      ],
    },
  },

  // 61. Quality management review
  {
    id: "tpl_quality_management_review",
    operatorId: null,
    name: "Quality management review",
    description:
      "Assessment of quality management systems and practices against ISO 9001 or industry-specific standards, covering process controls, customer satisfaction, and continuous improvement.",
    category: "compliance",
    analysisFramework: {
      sections: [
        {
          id: "qms_assessment",
          title: "QMS Framework Assessment",
          generationMode: "ai_generated",
          description:
            "Evaluate the quality management system documentation, processes, and alignment with ISO 9001 or applicable standards.",
        },
        {
          id: "process_controls",
          title: "Process Controls & Monitoring",
          generationMode: "ai_generated",
          description:
            "Assess process controls, in-process inspections, statistical process control usage, and measurement system adequacy.",
        },
        {
          id: "nonconformance_analysis",
          title: "Nonconformance & CAPA Analysis",
          generationMode: "ai_generated",
          description:
            "Analyze nonconformance trends, corrective and preventive action effectiveness, and root cause analysis quality.",
        },
        {
          id: "customer_quality",
          title: "Customer Quality & Satisfaction",
          generationMode: "ai_assisted",
          description:
            "Review customer complaints, returns, warranty claims, and satisfaction metrics to assess external quality performance.",
        },
        {
          id: "improvement_recommendations",
          title: "Improvement Recommendations",
          generationMode: "human_authored",
          description:
            "Recommend quality system improvements, process capability enhancements, and continuous improvement program priorities.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "quality_records",
        "audit_reports",
        "customer_complaints",
        "process_documentation",
        "inspection_data",
      ],
    },
  },

  // 62. Business continuity assessment
  {
    id: "tpl_business_continuity_assessment",
    operatorId: null,
    name: "Business continuity assessment",
    description:
      "Assessment of business continuity and disaster recovery planning, covering business impact analysis, recovery strategies, and plan exercising effectiveness.",
    category: "compliance",
    analysisFramework: {
      sections: [
        {
          id: "business_impact",
          title: "Business Impact Analysis",
          generationMode: "ai_generated",
          description:
            "Identify critical business processes, quantify impact of disruption over time, and define recovery time and recovery point objectives.",
        },
        {
          id: "risk_assessment",
          title: "Threat & Risk Assessment",
          generationMode: "ai_generated",
          description:
            "Evaluate threats (natural disaster, cyber attack, pandemic, supply chain) and their likelihood and potential impact on operations.",
        },
        {
          id: "recovery_strategies",
          title: "Recovery Strategy Assessment",
          generationMode: "ai_generated",
          description:
            "Evaluate the adequacy of recovery strategies including alternate sites, backup systems, manual workarounds, and communication plans.",
        },
        {
          id: "plan_review",
          title: "BCP/DRP Documentation Review",
          generationMode: "ai_assisted",
          description:
            "Review business continuity and disaster recovery plans for completeness, currency, and alignment with ISO 22301 standards.",
        },
        {
          id: "exercise_effectiveness",
          title: "Exercise & Testing Assessment",
          generationMode: "ai_assisted",
          description:
            "Evaluate the exercise program including tabletop exercises, simulation drills, and full-scale tests. Assess lessons-learned implementation.",
        },
        {
          id: "gap_remediation",
          title: "Gap Analysis & Remediation Plan",
          generationMode: "human_authored",
          description:
            "Identify continuity planning gaps, recommend enhancements, and define an exercise schedule and plan maintenance program.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "business_continuity_plans",
        "risk_assessments",
        "it_documentation",
        "exercise_reports",
        "organizational_data",
      ],
    },
  },

  // 63. Third-party risk assessment
  {
    id: "tpl_third_party_risk_assessment",
    operatorId: null,
    name: "Third-party risk assessment",
    description:
      "Assessment of risks associated with third-party relationships including vendors, suppliers, and partners covering financial, operational, compliance, and cybersecurity dimensions.",
    category: "compliance",
    analysisFramework: {
      sections: [
        {
          id: "third_party_inventory",
          title: "Third-Party Inventory & Tiering",
          generationMode: "ai_generated",
          description:
            "Catalog third-party relationships and tier them by criticality based on data access, business dependency, and spend volume.",
        },
        {
          id: "financial_viability",
          title: "Financial Viability Assessment",
          generationMode: "ai_generated",
          description:
            "Evaluate the financial health and stability of critical third parties using financial data, credit ratings, and public information.",
        },
        {
          id: "operational_risk",
          title: "Operational & Concentration Risk",
          generationMode: "ai_generated",
          description:
            "Assess operational dependency, single-source concentration, geographic risk, and substitutability for critical vendors.",
        },
        {
          id: "cybersecurity_risk",
          title: "Cybersecurity & Data Risk",
          generationMode: "ai_generated",
          description:
            "Evaluate third-party cybersecurity posture, data handling practices, and compliance with contractual security requirements.",
        },
        {
          id: "compliance_risk",
          title: "Compliance & Regulatory Risk",
          generationMode: "ai_assisted",
          description:
            "Assess third-party regulatory compliance, sanctions exposure, ESG practices, and reputational risk.",
        },
        {
          id: "risk_mitigation",
          title: "Risk Mitigation & Monitoring Plan",
          generationMode: "human_authored",
          description:
            "Recommend risk mitigation actions, enhanced contractual protections, and an ongoing monitoring framework by vendor tier.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "vendor_contracts",
        "financial_statements",
        "security_assessments",
        "compliance_certifications",
        "procurement_data",
      ],
    },
  },

  // ════════════════════════════════════════════════════════════════════════
  //  HEALTHCARE (4)
  // ════════════════════════════════════════════════════════════════════════

  // 64. Clinical trial data analysis
  {
    id: "tpl_clinical_trial_data_analysis",
    operatorId: null,
    name: "Clinical trial data analysis",
    description:
      "Analysis of clinical trial data covering study design, efficacy endpoints, safety profiles, and statistical significance to support regulatory submissions or investment decisions.",
    category: "healthcare",
    analysisFramework: {
      sections: [
        {
          id: "study_design",
          title: "Study Design & Protocol Review",
          generationMode: "ai_generated",
          description:
            "Review the clinical trial protocol including study design, inclusion/exclusion criteria, endpoints, sample size, and statistical analysis plan.",
        },
        {
          id: "efficacy_analysis",
          title: "Efficacy Data Analysis",
          generationMode: "ai_generated",
          description:
            "Analyze primary and secondary efficacy endpoints, subgroup analyses, and dose-response relationships with statistical rigor.",
        },
        {
          id: "safety_analysis",
          title: "Safety Profile Assessment",
          generationMode: "ai_generated",
          description:
            "Evaluate adverse event data, serious adverse events, dose-limiting toxicities, and benefit-risk balance across treatment arms.",
        },
        {
          id: "statistical_review",
          title: "Statistical Methodology Review",
          generationMode: "ai_assisted",
          description:
            "Assess the appropriateness of statistical methods, handling of missing data, multiplicity adjustments, and sensitivity analyses.",
        },
        {
          id: "regulatory_implications",
          title: "Regulatory & Commercial Implications",
          generationMode: "human_authored",
          description:
            "Interpret results in the context of regulatory approval probability, competitive landscape, and commercial opportunity.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "clinical_data",
        "study_protocols",
        "statistical_reports",
        "adverse_event_data",
        "regulatory_submissions",
      ],
    },
  },

  // 65. Healthcare provider credentialing
  {
    id: "tpl_healthcare_provider_credentialing",
    operatorId: null,
    name: "Healthcare provider credentialing",
    description:
      "Verification and assessment of healthcare provider credentials including education, licensure, board certification, malpractice history, and clinical competency.",
    category: "healthcare",
    analysisFramework: {
      sections: [
        {
          id: "identity_verification",
          title: "Identity & Education Verification",
          generationMode: "ai_generated",
          description:
            "Verify provider identity, medical education, residency/fellowship training, and degree authenticity against primary sources.",
        },
        {
          id: "licensure_certification",
          title: "Licensure & Board Certification",
          generationMode: "ai_generated",
          description:
            "Verify active medical licenses, DEA registration, board certifications, and any license restrictions or disciplinary actions.",
        },
        {
          id: "malpractice_history",
          title: "Malpractice & Disciplinary History",
          generationMode: "ai_generated",
          description:
            "Review malpractice claims history, disciplinary actions, NPDB queries, and sanctions across all jurisdictions of practice.",
        },
        {
          id: "clinical_competency",
          title: "Clinical Competency Assessment",
          generationMode: "ai_assisted",
          description:
            "Evaluate clinical competency through peer references, case volume data, outcomes data, and continuing education compliance.",
        },
        {
          id: "credentialing_decision",
          title: "Credentialing Recommendation",
          generationMode: "human_authored",
          description:
            "Recommend credentialing decision (approve, provisional, deny) with identified concerns, monitoring requirements, and privilege delineation.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "credential_applications",
        "license_verifications",
        "malpractice_records",
        "reference_reports",
        "education_records",
      ],
    },
  },

  // 66. Medical device DD
  {
    id: "tpl_medical_device_dd",
    operatorId: null,
    name: "Medical device DD",
    description:
      "Due diligence on a medical device company covering regulatory pathway, clinical evidence, quality system, IP protection, and commercial viability.",
    category: "healthcare",
    analysisFramework: {
      sections: [
        {
          id: "regulatory_pathway",
          title: "Regulatory Pathway & Status",
          generationMode: "ai_generated",
          description:
            "Evaluate the regulatory pathway (510(k), PMA, CE marking, MDR), approval status, and pending submissions across target markets.",
        },
        {
          id: "clinical_evidence",
          title: "Clinical Evidence Assessment",
          generationMode: "ai_generated",
          description:
            "Review clinical studies, real-world evidence, and clinical evaluation reports supporting device safety and performance claims.",
        },
        {
          id: "quality_system",
          title: "Quality System & Manufacturing",
          generationMode: "ai_generated",
          description:
            "Assess QMS compliance (ISO 13485, 21 CFR 820), manufacturing capabilities, supplier controls, and CAPA effectiveness.",
        },
        {
          id: "ip_assessment",
          title: "IP & Technology Assessment",
          generationMode: "ai_assisted",
          description:
            "Evaluate patent protection, freedom-to-operate, technology differentiation, and competitive technology landscape.",
        },
        {
          id: "commercial_assessment",
          title: "Commercial & Market Assessment",
          generationMode: "ai_assisted",
          description:
            "Analyze the addressable market, reimbursement landscape, competitive dynamics, and commercial traction.",
        },
        {
          id: "investment_recommendation",
          title: "Investment Recommendation",
          generationMode: "human_authored",
          description:
            "Synthesize regulatory, clinical, quality, and commercial findings into an investment recommendation with key risk factors.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "regulatory_submissions",
        "clinical_data",
        "quality_records",
        "ip_registrations",
        "financial_statements",
        "market_data",
      ],
    },
  },

  // 67. Healthcare compliance audit
  {
    id: "tpl_healthcare_compliance_audit",
    operatorId: null,
    name: "Healthcare compliance audit",
    description:
      "Audit of healthcare organization compliance with HIPAA, Stark Law, Anti-Kickback Statute, and other healthcare-specific regulations.",
    category: "healthcare",
    analysisFramework: {
      sections: [
        {
          id: "hipaa_compliance",
          title: "HIPAA Privacy & Security Compliance",
          generationMode: "ai_generated",
          description:
            "Assess HIPAA Privacy Rule and Security Rule compliance including PHI handling, access controls, encryption, and breach notification procedures.",
        },
        {
          id: "fraud_abuse",
          title: "Fraud & Abuse Compliance (Stark / AKS)",
          generationMode: "ai_generated",
          description:
            "Review physician arrangements, referral patterns, and financial relationships for compliance with Stark Law and Anti-Kickback Statute.",
        },
        {
          id: "billing_compliance",
          title: "Billing & Coding Compliance",
          generationMode: "ai_generated",
          description:
            "Audit billing practices, coding accuracy, documentation support, and claims submission processes for compliance with Medicare/Medicaid requirements.",
        },
        {
          id: "compliance_program",
          title: "Compliance Program Effectiveness",
          generationMode: "ai_assisted",
          description:
            "Evaluate the seven elements of an effective compliance program: oversight, policies, training, reporting, enforcement, auditing, and response.",
        },
        {
          id: "risk_remediation",
          title: "Risk Assessment & Remediation",
          generationMode: "human_authored",
          description:
            "Prioritize compliance risks, quantify potential regulatory exposure, and recommend program enhancements and corrective actions.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "internal_policies",
        "billing_records",
        "audit_reports",
        "training_records",
        "incident_logs",
        "physician_contracts",
      ],
    },
  },

  // ════════════════════════════════════════════════════════════════════════
  //  MEDIA & PUBLISHING (3)
  // ════════════════════════════════════════════════════════════════════════

  // 68. Content rights audit
  {
    id: "tpl_content_rights_audit",
    operatorId: null,
    name: "Content rights audit",
    description:
      "Audit of content rights and licensing across a media portfolio covering ownership, territorial rights, expiration schedules, and monetization opportunities.",
    category: "media",
    analysisFramework: {
      sections: [
        {
          id: "rights_inventory",
          title: "Rights Inventory & Classification",
          generationMode: "ai_generated",
          description:
            "Catalog all content assets with rights metadata including ownership type, territorial scope, platform rights, and term duration.",
        },
        {
          id: "license_compliance",
          title: "License Compliance Review",
          generationMode: "ai_generated",
          description:
            "Verify compliance with inbound and outbound license terms including usage limits, attribution requirements, and sublicensing restrictions.",
        },
        {
          id: "expiration_management",
          title: "Rights Expiration & Renewal Management",
          generationMode: "ai_generated",
          description:
            "Map upcoming rights expirations, renewal options, and reversion clauses. Identify at-risk content requiring renegotiation.",
        },
        {
          id: "monetization_assessment",
          title: "Monetization Opportunity Assessment",
          generationMode: "ai_assisted",
          description:
            "Identify under-monetized content assets and new distribution channels, formats, or territories for rights exploitation.",
        },
        {
          id: "recommendations",
          title: "Rights Strategy Recommendations",
          generationMode: "human_authored",
          description:
            "Recommend rights acquisition priorities, renegotiation targets, and rights management process improvements.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "license_agreements",
        "content_catalog",
        "distribution_agreements",
        "royalty_statements",
        "rights_metadata",
      ],
    },
  },

  // 69. Advertising performance analysis
  {
    id: "tpl_advertising_performance_analysis",
    operatorId: null,
    name: "Advertising performance analysis",
    description:
      "Analysis of advertising campaign performance across channels covering reach, engagement, conversion, and ROI with optimization recommendations.",
    category: "media",
    analysisFramework: {
      sections: [
        {
          id: "campaign_overview",
          title: "Campaign Overview & KPIs",
          generationMode: "ai_generated",
          description:
            "Summarize campaign objectives, targeting parameters, creative assets, and key performance metrics across all active campaigns.",
        },
        {
          id: "channel_performance",
          title: "Channel Performance Comparison",
          generationMode: "ai_generated",
          description:
            "Compare performance across channels (search, social, display, video, programmatic) by CPM, CPC, CPA, and ROAS metrics.",
        },
        {
          id: "audience_analysis",
          title: "Audience & Targeting Analysis",
          generationMode: "ai_generated",
          description:
            "Analyze audience segment performance, demographic response rates, and lookalike/behavioral targeting effectiveness.",
        },
        {
          id: "creative_performance",
          title: "Creative Performance Assessment",
          generationMode: "ai_assisted",
          description:
            "Evaluate creative execution performance by format, messaging, and visual elements. Identify top-performing and fatigue-risk creative.",
        },
        {
          id: "optimization_recommendations",
          title: "Optimization Recommendations",
          generationMode: "human_authored",
          description:
            "Recommend budget reallocation, targeting refinements, creative rotation, and new test opportunities to improve ROAS.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "ad_platform_data",
        "web_analytics",
        "conversion_data",
        "creative_assets",
        "budget_data",
      ],
    },
  },

  // 70. Media production assessment
  {
    id: "tpl_media_production_assessment",
    operatorId: null,
    name: "Media production assessment",
    description:
      "Assessment of media production operations covering workflow efficiency, technology stack, cost management, and content quality for production companies or in-house teams.",
    category: "media",
    analysisFramework: {
      sections: [
        {
          id: "production_workflow",
          title: "Production Workflow Analysis",
          generationMode: "ai_generated",
          description:
            "Map the end-to-end production workflow from concept through delivery. Identify bottlenecks, redundancies, and automation opportunities.",
        },
        {
          id: "technology_stack",
          title: "Production Technology Assessment",
          generationMode: "ai_generated",
          description:
            "Evaluate production tools, DAM systems, collaboration platforms, and technology integration across the production pipeline.",
        },
        {
          id: "cost_analysis",
          title: "Production Cost Analysis",
          generationMode: "ai_generated",
          description:
            "Analyze production costs by project type, phase, and resource category. Benchmark against industry standards and identify savings opportunities.",
        },
        {
          id: "quality_assessment",
          title: "Content Quality & Standards",
          generationMode: "ai_assisted",
          description:
            "Evaluate quality control processes, brand consistency, and output quality across different production teams and content formats.",
        },
        {
          id: "improvement_plan",
          title: "Production Improvement Plan",
          generationMode: "human_authored",
          description:
            "Recommend workflow optimizations, technology investments, and organizational changes to improve production efficiency and quality.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "production_schedules",
        "cost_data",
        "technology_inventory",
        "quality_metrics",
        "process_documentation",
      ],
    },
  },

  // ════════════════════════════════════════════════════════════════════════
  //  EDUCATION (3)
  // ════════════════════════════════════════════════════════════════════════

  // 71. Academic program review
  {
    id: "tpl_academic_program_review",
    operatorId: null,
    name: "Academic program review",
    description:
      "Comprehensive review of an academic program covering curriculum design, learning outcomes, student performance, faculty quality, and market relevance.",
    category: "education",
    analysisFramework: {
      sections: [
        {
          id: "curriculum_analysis",
          title: "Curriculum & Learning Design",
          generationMode: "ai_generated",
          description:
            "Analyze curriculum structure, learning objectives alignment, course sequencing, and pedagogical approach against current disciplinary standards.",
        },
        {
          id: "student_outcomes",
          title: "Student Outcomes & Performance",
          generationMode: "ai_generated",
          description:
            "Evaluate student learning outcomes, graduation rates, time-to-completion, and post-graduation employment and earnings data.",
        },
        {
          id: "faculty_assessment",
          title: "Faculty & Resource Assessment",
          generationMode: "ai_generated",
          description:
            "Assess faculty qualifications, research output, teaching loads, and the adequacy of facilities, technology, and support resources.",
        },
        {
          id: "market_relevance",
          title: "Market Relevance & Demand",
          generationMode: "ai_assisted",
          description:
            "Evaluate program alignment with labor market demands, employer needs, and enrollment trends relative to competing programs.",
        },
        {
          id: "recommendations",
          title: "Improvement Recommendations",
          generationMode: "human_authored",
          description:
            "Recommend curriculum updates, resource investments, and strategic positioning changes to strengthen program quality and sustainability.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "curriculum_documents",
        "student_data",
        "faculty_records",
        "accreditation_reports",
        "labor_market_data",
      ],
    },
  },

  // 72. Institutional accreditation
  {
    id: "tpl_institutional_accreditation",
    operatorId: null,
    name: "Institutional accreditation",
    description:
      "Self-study preparation for institutional accreditation covering standards compliance, evidence documentation, and continuous improvement across all accreditation criteria.",
    category: "education",
    analysisFramework: {
      sections: [
        {
          id: "standards_mapping",
          title: "Accreditation Standards Mapping",
          generationMode: "ai_generated",
          description:
            "Map institutional practices and evidence against each accreditation standard. Identify compliance strengths and gaps.",
        },
        {
          id: "mission_governance",
          title: "Mission, Governance & Planning",
          generationMode: "ai_assisted",
          description:
            "Assess institutional mission clarity, governance effectiveness, strategic planning processes, and resource allocation alignment.",
        },
        {
          id: "academic_quality",
          title: "Academic Quality & Assessment",
          generationMode: "ai_generated",
          description:
            "Evaluate academic quality assurance processes, student learning assessment, program review cycles, and continuous improvement evidence.",
        },
        {
          id: "institutional_resources",
          title: "Institutional Resources & Support",
          generationMode: "ai_generated",
          description:
            "Assess financial sustainability, physical facilities, technology infrastructure, library resources, and student support services.",
        },
        {
          id: "self_study_preparation",
          title: "Self-Study Preparation & Gap Remediation",
          generationMode: "human_authored",
          description:
            "Develop the self-study narrative structure, evidence inventory, and gap remediation plan for pre-visit preparation.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "accreditation_reports",
        "institutional_data",
        "financial_statements",
        "student_data",
        "strategic_plans",
      ],
    },
  },

  // 73. EdTech assessment
  {
    id: "tpl_edtech_assessment",
    operatorId: null,
    name: "EdTech assessment",
    description:
      "Evaluation of educational technology solutions covering pedagogical effectiveness, technical quality, accessibility, data privacy, and institutional fit.",
    category: "education",
    analysisFramework: {
      sections: [
        {
          id: "pedagogical_effectiveness",
          title: "Pedagogical Effectiveness",
          generationMode: "ai_assisted",
          description:
            "Evaluate the learning design, evidence of efficacy, engagement mechanisms, and alignment with established pedagogical frameworks.",
        },
        {
          id: "technical_quality",
          title: "Technical Quality & Integration",
          generationMode: "ai_generated",
          description:
            "Assess platform stability, performance, LMS integration (LTI), API capabilities, and mobile accessibility.",
        },
        {
          id: "accessibility_inclusion",
          title: "Accessibility & Inclusion",
          generationMode: "ai_generated",
          description:
            "Evaluate WCAG 2.1 compliance, multilingual support, adaptive features, and accommodation for diverse learner needs.",
        },
        {
          id: "data_privacy",
          title: "Data Privacy & Security",
          generationMode: "ai_generated",
          description:
            "Review data collection practices, FERPA/COPPA compliance, data retention, and student data ownership rights.",
        },
        {
          id: "adoption_recommendation",
          title: "Adoption Recommendation",
          generationMode: "human_authored",
          description:
            "Provide a buy/build/partner recommendation with implementation considerations, total cost of ownership, and change management needs.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "product_documentation",
        "usage_data",
        "efficacy_studies",
        "security_documentation",
        "pricing_data",
      ],
    },
  },

  // ════════════════════════════════════════════════════════════════════════
  //  INSURANCE (3)
  // ════════════════════════════════════════════════════════════════════════

  // 74. Actuarial review
  {
    id: "tpl_actuarial_review",
    operatorId: null,
    name: "Actuarial review",
    description:
      "Independent actuarial review of insurance reserves, pricing adequacy, and risk models for regulatory compliance, M&A, or financial reporting purposes.",
    category: "insurance",
    analysisFramework: {
      sections: [
        {
          id: "reserve_analysis",
          title: "Loss Reserve Analysis",
          generationMode: "ai_generated",
          description:
            "Evaluate loss reserves using multiple actuarial methods (chain ladder, Bornhuetter-Ferguson, frequency-severity) and assess carried reserves versus actuarial indication.",
        },
        {
          id: "pricing_review",
          title: "Pricing Adequacy Review",
          generationMode: "ai_generated",
          description:
            "Assess pricing models, rate adequacy, loss ratio trends, and rate-change history to evaluate the sustainability of underwriting margins.",
        },
        {
          id: "risk_model_validation",
          title: "Risk Model Validation",
          generationMode: "ai_generated",
          description:
            "Validate catastrophe models, capital models, and reinsurance optimization models for methodology, assumptions, and calibration.",
        },
        {
          id: "experience_analysis",
          title: "Experience & Trend Analysis",
          generationMode: "ai_generated",
          description:
            "Analyze loss development patterns, frequency and severity trends, and emerging risk factors across lines of business.",
        },
        {
          id: "actuarial_opinion",
          title: "Actuarial Opinion & Recommendations",
          generationMode: "human_authored",
          description:
            "Issue an actuarial opinion on reserve adequacy with key assumptions, sensitivities, and recommended reserve adjustments.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "loss_triangles",
        "premium_data",
        "claims_data",
        "exposure_data",
        "reinsurance_contracts",
      ],
    },
  },

  // 75. Reinsurance analysis
  {
    id: "tpl_reinsurance_analysis",
    operatorId: null,
    name: "Reinsurance analysis",
    description:
      "Analysis of reinsurance program structure, pricing, and optimization opportunities to balance risk retention, cost efficiency, and capital management.",
    category: "insurance",
    analysisFramework: {
      sections: [
        {
          id: "program_structure",
          title: "Current Program Structure Review",
          generationMode: "ai_generated",
          description:
            "Map the current reinsurance program including treaty and facultative placements, attachment points, limits, and pricing across all lines.",
        },
        {
          id: "loss_modeling",
          title: "Loss & Catastrophe Modeling",
          generationMode: "ai_generated",
          description:
            "Model expected and tail losses by line of business, evaluate catastrophe exposure, and assess reinsurance recovery adequacy.",
        },
        {
          id: "pricing_analysis",
          title: "Reinsurance Pricing Analysis",
          generationMode: "ai_generated",
          description:
            "Evaluate reinsurance pricing relative to expected loss cost, market conditions, and rate-on-line benchmarks.",
        },
        {
          id: "capital_efficiency",
          title: "Capital Efficiency & Optimization",
          generationMode: "ai_assisted",
          description:
            "Analyze the capital efficiency of the reinsurance program and model alternative structures (higher retention, different limits, quota share) for cost-benefit.",
        },
        {
          id: "program_recommendations",
          title: "Program Recommendations",
          generationMode: "human_authored",
          description:
            "Recommend reinsurance program modifications for the upcoming renewal cycle with expected premium impact and capital implications.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "reinsurance_contracts",
        "loss_triangles",
        "premium_data",
        "catastrophe_model_output",
        "capital_model_data",
      ],
    },
  },

  // 76. Policy portfolio optimization
  {
    id: "tpl_policy_portfolio_optimization",
    operatorId: null,
    name: "Policy portfolio optimization",
    description:
      "Analysis and optimization of an insurance policy portfolio covering mix, profitability, risk segmentation, and strategic growth or pruning opportunities.",
    category: "insurance",
    analysisFramework: {
      sections: [
        {
          id: "portfolio_composition",
          title: "Portfolio Composition Analysis",
          generationMode: "ai_generated",
          description:
            "Profile the policy portfolio by line of business, segment, geography, and policy characteristics with premium and count distributions.",
        },
        {
          id: "profitability_analysis",
          title: "Segment Profitability Analysis",
          generationMode: "ai_generated",
          description:
            "Analyze combined ratios, loss ratios, and expense ratios by segment to identify profitable and unprofitable cohorts.",
        },
        {
          id: "risk_segmentation",
          title: "Risk Segmentation & Pricing",
          generationMode: "ai_generated",
          description:
            "Evaluate pricing segmentation effectiveness, identify cross-subsidization between risk classes, and recommend rate adjustments.",
        },
        {
          id: "retention_analysis",
          title: "Retention & Lapse Analysis",
          generationMode: "ai_generated",
          description:
            "Analyze policy retention rates, lapse patterns, and the profitability profile of renewing vs non-renewing policies.",
        },
        {
          id: "portfolio_strategy",
          title: "Portfolio Strategy Recommendations",
          generationMode: "human_authored",
          description:
            "Recommend portfolio actions including segment expansion, risk selection tightening, product redesign, and distribution strategy changes.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "policy_data",
        "claims_data",
        "premium_data",
        "actuarial_data",
        "market_data",
      ],
    },
  },

  // ════════════════════════════════════════════════════════════════════════
  //  SUSTAINABILITY (3)
  // ════════════════════════════════════════════════════════════════════════

  // 77. Carbon footprint assessment
  {
    id: "tpl_carbon_footprint_assessment",
    operatorId: null,
    name: "Carbon footprint assessment",
    description:
      "Comprehensive carbon footprint assessment covering Scope 1, 2, and 3 emissions measurement, reporting alignment with GHG Protocol, and reduction pathway planning.",
    category: "sustainability",
    analysisFramework: {
      sections: [
        {
          id: "scope_1_emissions",
          title: "Scope 1 Emissions Inventory",
          generationMode: "ai_generated",
          description:
            "Calculate direct emissions from owned/controlled sources including stationary combustion, mobile sources, fugitive emissions, and process emissions.",
        },
        {
          id: "scope_2_emissions",
          title: "Scope 2 Emissions Inventory",
          generationMode: "ai_generated",
          description:
            "Calculate indirect emissions from purchased electricity, steam, heating, and cooling using both location-based and market-based methods.",
        },
        {
          id: "scope_3_emissions",
          title: "Scope 3 Emissions Assessment",
          generationMode: "ai_generated",
          description:
            "Estimate material Scope 3 categories including purchased goods, business travel, employee commuting, upstream transportation, and use of sold products.",
        },
        {
          id: "hotspot_analysis",
          title: "Emissions Hotspot Analysis",
          generationMode: "ai_generated",
          description:
            "Identify the highest-emission activities, facilities, and value chain stages that represent the greatest reduction opportunities.",
        },
        {
          id: "reduction_pathway",
          title: "Reduction Pathway & Targets",
          generationMode: "ai_assisted",
          description:
            "Model emissions reduction scenarios aligned with Science Based Targets (SBTi) and recommend near-term and long-term targets.",
        },
        {
          id: "action_plan",
          title: "Carbon Reduction Action Plan",
          generationMode: "human_authored",
          description:
            "Define specific reduction ideas with abatement cost, timeline, and responsible owners. Prioritize by cost-effectiveness and feasibility.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "energy_data",
        "fuel_consumption",
        "travel_data",
        "procurement_data",
        "emissions_factors",
      ],
    },
  },

  // 78. Circular economy readiness
  {
    id: "tpl_circular_economy_readiness",
    operatorId: null,
    name: "Circular economy readiness",
    description:
      "Assessment of an organization's readiness to transition toward circular economy principles covering product design, material flows, waste management, and business model innovation.",
    category: "sustainability",
    analysisFramework: {
      sections: [
        {
          id: "material_flow_analysis",
          title: "Material Flow Analysis",
          generationMode: "ai_generated",
          description:
            "Map material inputs, outputs, and waste streams across the value chain. Quantify virgin material dependency and waste generation rates.",
        },
        {
          id: "product_design",
          title: "Product Design for Circularity",
          generationMode: "ai_assisted",
          description:
            "Evaluate product design against circular principles: durability, repairability, modularity, recyclability, and use of recycled content.",
        },
        {
          id: "waste_recovery",
          title: "Waste & Resource Recovery",
          generationMode: "ai_generated",
          description:
            "Assess current waste management practices, recycling rates, and opportunities for industrial symbiosis and closed-loop material recovery.",
        },
        {
          id: "business_model",
          title: "Circular Business Model Opportunities",
          generationMode: "ai_assisted",
          description:
            "Identify circular business model opportunities including product-as-a-service, remanufacturing, take-back schemes, and sharing platforms.",
        },
        {
          id: "transition_roadmap",
          title: "Circular Transition Roadmap",
          generationMode: "human_authored",
          description:
            "Define a phased transition roadmap with pilot projects, investment requirements, regulatory considerations, and circularity KPIs.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "material_data",
        "waste_data",
        "product_specifications",
        "supply_chain_data",
        "process_documentation",
      ],
    },
  },

  // 79. Climate risk assessment
  {
    id: "tpl_climate_risk_assessment",
    operatorId: null,
    name: "Climate risk assessment",
    description:
      "Assessment of physical and transition climate risks to an organization's operations, assets, and strategy aligned with TCFD recommendations.",
    category: "sustainability",
    analysisFramework: {
      sections: [
        {
          id: "physical_risk",
          title: "Physical Climate Risk Assessment",
          generationMode: "ai_generated",
          description:
            "Evaluate exposure to physical climate risks (extreme weather, sea level rise, temperature change, water stress) across facilities and supply chain.",
        },
        {
          id: "transition_risk",
          title: "Transition Risk Assessment",
          generationMode: "ai_generated",
          description:
            "Assess transition risks from policy changes, technology shifts, market dynamics, and reputational factors under different warming scenarios.",
        },
        {
          id: "scenario_analysis",
          title: "Climate Scenario Analysis",
          generationMode: "ai_generated",
          description:
            "Model financial impacts under IPCC climate scenarios (1.5C, 2C, 4C) across operations, revenue, costs, and asset values.",
        },
        {
          id: "opportunity_assessment",
          title: "Climate Opportunity Assessment",
          generationMode: "ai_assisted",
          description:
            "Identify business opportunities arising from climate transition including new products, markets, resource efficiency, and energy source diversification.",
        },
        {
          id: "governance_disclosure",
          title: "TCFD Governance & Disclosure",
          generationMode: "ai_assisted",
          description:
            "Evaluate climate governance structures, risk management integration, and TCFD disclosure readiness across all four pillars.",
        },
        {
          id: "adaptation_strategy",
          title: "Climate Adaptation Strategy",
          generationMode: "human_authored",
          description:
            "Recommend climate adaptation and mitigation actions, resilience investments, and strategy adjustments aligned with TCFD disclosure requirements.",
        },
      ],
    },
    dataExpectations: {
      requiredTypes: [
        "asset_locations",
        "financial_statements",
        "emissions_data",
        "climate_projections",
        "insurance_data",
      ],
    },
  },
];

// ── Seed function ──────────────────────────────────────────────────────

export async function seedProjectTemplates(): Promise<void> {
  for (const tpl of templates) {
    const framework = tpl.analysisFramework as unknown as Prisma.InputJsonValue;
    const expectations = tpl.dataExpectations as unknown as Prisma.InputJsonValue;
    await prisma.projectTemplate.upsert({
      where: { id: tpl.id },
      update: {
        name: tpl.name,
        description: tpl.description,
        category: tpl.category,
        analysisFramework: framework,
        dataExpectations: expectations,
      },
      create: {
        id: tpl.id,
        operatorId: tpl.operatorId,
        name: tpl.name,
        description: tpl.description,
        category: tpl.category,
        analysisFramework: framework,
        dataExpectations: expectations,
      },
    });
  }
  console.log(`[seed] Seeded ${templates.length} project templates`);
}
