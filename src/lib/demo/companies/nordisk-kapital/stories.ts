// ── Nordisk Kapital A/S — Story Content ──────────────────────────────────
// ~75 hand-written content items covering DD methodology, active engagements,
// team coordination, and institutional knowledge.
// ~65% Danish, ~35% English. M&A advisory vocabulary.
// Google Workspace + Slack connector providers.

import type { SyntheticContent } from "../../synthetic-types";

function daysAgoDate(d: number): string {
  return new Date(Date.now() - d * 86400000).toISOString();
}

export const NK_STORIES: SyntheticContent[] = [
  // ═══════════════════════════════════════════════════════════════════════
  // Category 1 — DD Methodology Documents (10 items, Google Drive)
  // ═══════════════════════════════════════════════════════════════════════

  {
    sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 90,
    content: `NK Financial DD Framework v4.2 — Nordisk Kapital A/S

1. REVENUE QUALITY ASSESSMENT
1.1 Revenue Composition Analysis
- Break down revenue by: product/service line, customer, geography, contract type
- Recurring vs non-recurring classification (SaaS: ARR/MRR, traditional: framework agreements vs spot orders)
- Revenue recognition methodology review (ASC 606 / IFRS 15 compliance)
- Threshold: Customer concentration above 40% of total revenue = HIGH risk flag
- Threshold: Top customer above 25% of revenue = CRITICAL dependency risk

1.2 Revenue Quality Scoring
- Score 1-5 on: visibility (contracted vs pipeline), predictability (variance analysis), sustainability (churn/retention)
- SaaS targets: Net Revenue Retention below 100% = MEDIUM flag, below 90% = HIGH flag
- Manufacturing targets: Order backlog coverage below 3 months = HIGH flag

2. EBITDA NORMALIZATION
2.1 Standard Adjustment Categories (23 items)
- Owner compensation normalization (benchmark: industry median for equivalent role)
- One-time legal/consulting costs (verify truly non-recurring — 3-year lookback)
- Non-arm's length transactions (related party pricing adjustment)
- Restructuring costs (only if completed and non-recurring)
- Revenue timing (deferred revenue changes, contract timing)
- Threshold: Adjustments exceeding 30% of reported EBITDA = ELEVATED scrutiny required

3. WORKING CAPITAL ANALYSIS
- Normalize for seasonality using 12-month average (not period-end snapshot)
- Identify non-operational items embedded in working capital
- Calculate normalized WC as percentage of revenue — compare to industry benchmarks
- Threshold: WC/Revenue deviation >5pp from industry = requires narrative explanation

4. DEBT & LIABILITIES REVIEW
- Map all financial and non-financial debt
- Include: leases (IFRS 16), pension obligations, contingent liabilities, earn-outs
- Off-balance-sheet items: guarantees, factoring, consignment inventory
- Threshold: Net Debt / EBITDA above 3.5x = requires lender sensitivity analysis

5. QUALITY OF EARNINGS BRIDGE
- Build reported → adjusted EBITDA bridge with supporting evidence for each adjustment
- Every adjustment >DKK 100K requires source documentation
- Partner sign-off required before client delivery`,
    metadata: { fileName: "NK_Financial_DD_Framework_v4.2.pdf", author: "Astrid Kjeldsen", lastModified: daysAgoDate(90) },
  },

  {
    sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 85,
    content: `Revenue Quality Assessment — Standard Operating Procedure

Step 1: Data Collection (Days 1-3)
- Request 36 months of transaction-level revenue data from target
- Request customer master list with contract terms
- Request aging schedule and credit note history

Step 2: Revenue Decomposition (Days 3-7)
- Classify all revenue lines into: recurring, project-based, pass-through, other
- For SaaS: separate ARR from professional services from one-time fees
- For manufacturing: separate product revenue from service/maintenance from spare parts
- Apply NK customer concentration analysis: top 1, top 3, top 5, top 10 as % of total

Step 3: Trend Analysis (Days 5-10)
- Monthly revenue by category — identify seasonality, one-offs, step changes
- Customer cohort analysis: retention rates by vintage year
- New business vs existing customer growth decomposition
- Price vs volume decomposition where data permits

Step 4: Quality Scoring (Days 8-12)
- Apply NK Revenue Quality Scorecard (5 dimensions, each 1-5):
  A. Visibility: contracted/committed revenue as % of next 12 months
  B. Predictability: actual vs forecast variance over 24 months
  C. Sustainability: customer retention rate and competitive position
  D. Concentration: inverse of top-3 customer dependency
  E. Recognition: compliance and conservatism of accounting policies
- Overall score = weighted average (A: 25%, B: 20%, C: 25%, D: 15%, E: 15%)
- Score below 3.0 = HIGH risk flag in executive summary

Step 5: Deliverable Drafting (Days 10-15)
- Use NK Report Template v3 (Google Docs)
- Executive summary: 1 page, 3-5 key findings, overall confidence level
- Detailed analysis: 8-15 pages with charts and tables
- Risk register: each risk scored Impact (1-5) × Likelihood (1-5)`,
    metadata: { fileName: "Revenue_Quality_SOP_v2.pdf", author: "Astrid Kjeldsen", lastModified: daysAgoDate(85) },
  },

  {
    sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 80,
    content: `EBITDA Normalization Checklist — 23 Adjustment Categories

Category 1: Owner/Management Compensation
□ Owner salary vs market rate (use Korn Ferry Danish benchmark)
□ Owner perks (car, housing, personal expenses)
□ Management bonuses — recurring vs one-time component
□ Board fees — arm's length assessment

Category 2: Non-Recurring Items
□ Legal settlements or litigation costs
□ Restructuring charges (verify scope and completion)
□ M&A transaction costs (historical, buyer's own costs excluded)
□ IPO preparation costs
□ One-time consulting projects (3-year lookback for recurrence)

Category 3: Related Party Transactions
□ Rent for owner-controlled premises (market rate adjustment)
□ Intercompany service fees (transfer pricing analysis)
□ Loans to/from related parties (market interest rate)
□ Purchases from affiliated entities

Category 4: Accounting Policy Adjustments
□ Revenue recognition timing (ASC 606 cutoff analysis)
□ Provision adequacy (warranty, bad debt, inventory obsolescence)
□ Depreciation policy vs economic life
□ Capitalization vs expensing policy

Category 5: Operational Normalization
□ Seasonal working capital fluctuation impact on EBITDA
□ FX impact (separate structural from transactional)
□ COVID-19 residual effects (government subsidies, demand distortion)
□ Run-rate impact of recent hires/departures
□ Facility cost changes (new lease, relocation)

SIGN-OFF REQUIREMENT: All adjustments >DKK 100K require partner review and source documentation.`,
    metadata: { fileName: "EBITDA_Normalization_Checklist_23_Categories.xlsx", author: "Astrid Kjeldsen", lastModified: daysAgoDate(80) },
  },

  {
    sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 75,
    content: `Working Capital Analysis — Seasonal Normalization Guide

Purpose: Avoid purchase price distortion from period-end WC snapshots.

Method:
1. Collect monthly balance sheet data for 24-36 months
2. Calculate WC components monthly: receivables, inventory, prepayments, payables, accruals
3. Compute trailing 12-month average for each component
4. Identify seasonal patterns — plot monthly WC as % of trailing revenue
5. Calculate normalized WC = 12-month average, excluding outlier months (>2σ deviation)

Key Metrics:
- Days Sales Outstanding (DSO) — benchmark: Danish SMB median = 38 days
- Days Inventory Outstanding (DIO) — sector-specific benchmarks
- Days Payable Outstanding (DPO) — watch for stretching (deteriorating supplier relations)
- Cash Conversion Cycle (CCC) = DSO + DIO - DPO

Red Flags:
- DSO increasing >5 days YoY without revenue mix change = collection issue
- DIO increasing while revenue flat = obsolescence risk
- DPO increasing sharply = cash flow pressure (verify with supplier interviews)

Seasonal Industries in Denmark:
- Food/agriculture: Q3 harvest spike, Q4 processing peak
- Construction: Q2-Q3 peak, Q1 trough
- Retail: Q4 Christmas inventory build
- SaaS: typically low seasonality unless customer base is seasonal

OUTPUT: Normalized WC peg for SPA, with seasonal adjustment mechanism if CCC variance > ±15%.`,
    metadata: { fileName: "Working_Capital_Seasonal_Normalization_Guide.pdf", author: "Line Bech", lastModified: daysAgoDate(75) },
  },

  {
    sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 70,
    content: `Contract Review Methodology — Risk Classification Matrix

Every customer/vendor/partner contract reviewed in DD receives a risk classification:

CLASSIFICATION MATRIX:
┌─────────────────────────┬────────────┬────────────┬────────────┐
│ Risk Factor             │ LOW (1)    │ MEDIUM (2) │ HIGH (3)   │
├─────────────────────────┼────────────┼────────────┼────────────┤
│ Change-of-control clause│ None       │ Notification│ Termination│
│ Term remaining          │ >24 months │ 12-24 mo   │ <12 months │
│ Revenue dependency      │ <5% rev    │ 5-15% rev  │ >15% rev   │
│ Renewal terms           │ Auto-renew │ Negotiated │ Fixed term │
│ Pricing mechanism       │ Indexed    │ Fixed      │ Declining  │
│ Non-compete/exclusivity │ None       │ Limited    │ Broad      │
│ IP assignment           │ Clear      │ Shared     │ Ambiguous  │
│ Liability caps          │ Adequate   │ Low        │ Unlimited  │
└─────────────────────────┴────────────┴────────────┴────────────┘

Total score per contract: sum of 8 factors (range 8-24).
- Score 8-12: GREEN — standard risk, footnote in report
- Score 13-17: YELLOW — requires narrative and mitigation discussion
- Score 18-24: RED — executive summary item, potential deal impact

CHANGE-OF-CONTROL CONTRACTS:
Any contract with termination-on-CoC affecting >5% of revenue MUST be flagged in the executive summary and SPA conditions.

Process: Line Bech coordinates contract log. Each reviewer tags findings in shared Google Sheet. Weekly sync during active DD.`,
    metadata: { fileName: "Contract_Review_Risk_Classification_Matrix.pdf", author: "Thomas Riber", lastModified: daysAgoDate(70) },
  },

  {
    sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 65,
    content: `Employee & Key Person Risk Assessment Framework

PURPOSE: Identify key person dependencies and retention risks that affect target valuation.

STEP 1: KEY PERSON IDENTIFICATION
- Map critical functions: who holds undocumented knowledge?
- Revenue-linked: salespeople with personal client relationships (threshold: >10% of revenue personally managed)
- Technology-linked: engineers with sole knowledge of critical systems
- Relationship-linked: executives whose departure triggers CoC clauses

STEP 2: RETENTION RISK SCORING
For each key person, score 1-5:
- Replaceability: how difficult to hire equivalent (1 = easy, 5 = unique)
- Flight risk: non-compete status, known market interest, vesting schedule
- Impact on exit: revenue/client/technology at risk if they leave
- Overall risk = max(Replaceability, Impact) × Flight risk weight

STEP 3: MITIGATION ASSESSMENT
- Existing retention mechanisms: stock options, long notice periods, non-competes
- Knowledge documentation level: formal procedures, tribal knowledge
- Succession planning: identified backups, cross-training

STEP 4: DEAL STRUCTURE RECOMMENDATIONS
- Key person risk score >15: recommend retention bonuses in SPA
- Key person risk score >20: recommend earn-out structure linking to key person retention
- Founders with risk score >25: recommend employment agreement as condition precedent

DANISH EMPLOYMENT LAW NOTES:
- Funktionærloven: notice periods based on seniority (up to 6 months)
- Non-compete clauses: max 12 months, requires compensation (min 40% of salary during restriction)
- IP assignment: default in ansættelsesret unless otherwise agreed — verify for pre-2019 contracts`,
    metadata: { fileName: "Employee_Key_Person_Risk_Framework.pdf", author: "Thomas Riber", lastModified: daysAgoDate(65) },
  },

  {
    sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 60,
    content: `Data Room Completeness Checklist — 147 Items

SECTION A: CORPORATE & LEGAL (22 items)
A.01 Articles of association (current + amendments)
A.02 Shareholder register and cap table
A.03 Board meeting minutes (last 3 years)
A.04 General meeting minutes (last 3 years)
A.05 Corporate structure chart
A.06 Shareholder agreements / drag-along / tag-along
A.07 Powers of attorney
A.08 Regulatory licenses and permits
A.09 Pending/threatened litigation summary
A.10 Material correspondence with authorities
[... items A.11 through A.22 ...]

SECTION B: FINANCIAL (28 items)
B.01 Annual reports (audited, last 3 years)
B.02 Monthly management accounts (last 24 months)
B.03 Budget / forecast current year + next year
B.04 Detailed P&L by cost center / department
B.05 Balance sheet with sub-ledger detail
B.06 Cash flow statement (direct method preferred)
B.07 Aged receivables schedule (current)
B.08 Aged payables schedule (current)
B.09 Inventory valuation and aging
B.10 Fixed asset register with depreciation schedule
B.11 Bank facility agreements and covenant compliance
B.12 Tax returns (last 3 years)
B.13 Transfer pricing documentation
B.14 VAT reconciliation
[... items B.15 through B.28 ...]

SECTION C: COMMERCIAL (25 items)
C.01 Customer list with revenue per customer (3 years)
C.02 Top 10 customer contracts
C.03 Customer churn/retention data
C.04 Pricing strategy and recent price changes
C.05 Pipeline / order backlog
C.06 Competitor analysis
C.07 Market size and share estimates
[... items C.08 through C.25 ...]

SECTION D: HR & ORGANIZATIONAL (18 items)
D.01 Organization chart (current)
D.02 Employee list with start dates, titles, compensation
D.03 Employment contracts (template + key person specifics)
D.04 Non-compete / non-solicitation agreements
D.05 Pension and benefit plan details
D.06 Employee handbook / HR policies
[... items D.07 through D.18 ...]

SECTION E: TECHNOLOGY & IP (16 items)
SECTION F: OPERATIONS & SUPPLY CHAIN (20 items)
SECTION G: INSURANCE & RISK (10 items)
SECTION H: ENVIRONMENTAL (8 items)

TRACKING: Each item tagged as Received / Requested / Missing / Not Applicable.
Completeness % reported in weekly DD status update to client.`,
    metadata: { fileName: "Data_Room_Completeness_Checklist_147_Items.xlsx", author: "Line Bech", lastModified: daysAgoDate(60) },
  },

  {
    sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 55,
    content: `NK Report Writing Style Guide — Version 3

GENERAL PRINCIPLES:
- Write for the reader: PE partner or corporate board, not accountants
- Lead with conclusions, support with evidence
- Every risk finding must include: what is it, why it matters, what to do about it
- Use DKK throughout (convert EUR/USD at period-end rates, state rates used)
- Report in English (client language) unless specifically agreed otherwise

STRUCTURE:
1. Executive Summary (1-2 pages)
   - Transaction overview (1 paragraph)
   - Key findings (3-5 bullets, prioritized by impact)
   - Overall confidence level: HIGH / MEDIUM / LOW with brief justification
   - Recommended deal adjustments (summarized)

2. Detailed Analysis Sections
   - Each section: finding → evidence → impact quantification → recommendation
   - Use tables for financial data (no inline numbers in paragraphs)
   - Charts: max 6 per section, consistent color scheme (NK blue #1a3a5c, accent #e8a838)

3. Risk Register
   - Every risk scored: Impact (1-5) × Likelihood (1-5) = Risk Score (1-25)
   - RED risks (score >15): executive summary mandatory
   - AMBER risks (score 8-15): section callout
   - GREEN risks (score <8): appendix only

4. Appendices
   - Data room completeness matrix
   - Detailed financial schedules
   - Methodology notes

TONE:
- Authoritative but measured — avoid "significant" and "substantial" (quantify instead)
- "NordTech's ARR grew 23% YoY" not "NordTech experienced significant growth"
- Flag uncertainty explicitly: "Based on available data..." or "Subject to management confirmation..."

QUALITY GATES:
- Associate/analyst draft → Senior Associate review → Partner sign-off
- No report leaves NK without partner signature
- Client-facing reports use NK LaTeX template (ask Jakob for setup)`,
    metadata: { fileName: "NK_Report_Writing_Style_Guide_v3.pdf", author: "Henrik Vestergaard", lastModified: daysAgoDate(55) },
  },

  {
    sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 50,
    content: `SaaS Company DD Playbook — ARR vs Revenue Recognition

Specific methodology for SaaS/subscription targets (relevant for NordTech and TechNordic pipeline):

ARR CALCULATION:
- True ARR = sum of annualized values of active subscriptions at period end
- Exclude: one-time setup fees, professional services, usage-based overages
- Include: contracted committed minimum spend (even if usage-based above that)
- Watch for: mid-year pricing changes not yet reflected in billing

NET REVENUE RETENTION (NRR):
- NRR = (ARR from same-customer cohort at period end) / (ARR from that cohort at period start)
- Must use SAME CUSTOMER base — new logos excluded
- NRR > 120%: elite, expansion-driven (Datadog-class)
- NRR 110-120%: strong, healthy upsell
- NRR 100-110%: adequate, limited churn
- NRR < 100%: net contraction — investigate immediately

GROSS CHURN vs NET CHURN:
- Gross churn: total ARR lost from downgrades + cancellations (always positive)
- Net churn: gross churn minus expansion from surviving customers
- Report BOTH — net churn can mask dangerous gross churn

PROFESSIONAL SERVICES:
- In SaaS DD, professional services are often a drag on margins
- Separate P&L: blended margins mislead
- Question: are services "necessary evil" (implementation) or strategic (consulting)?
- Threshold: PS > 30% of revenue = company is services business with software, not SaaS

RULE OF 40:
- Revenue growth rate + EBITDA margin ≥ 40% = good
- For Danish SaaS: adjust expectations — Rule of 30 more realistic for SMB segment
- Always contextualize: a profitable company growing 15% is better than a loss-making company growing 35%`,
    metadata: { fileName: "SaaS_DD_Playbook_ARR_Revenue_Recognition.pdf", author: "Astrid Kjeldsen", lastModified: daysAgoDate(50) },
  },

  {
    sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 45,
    content: `Manufacturing Sector DD Notes — Common Pitfalls (Nordisk Kapital Internal)

Based on lessons from Scandia Foods and 3 prior manufacturing engagements:

PITFALL 1: Inventory Valuation Surprises
- Manufacturing companies often have complex cost allocation (overhead absorption)
- Standard cost vs actual cost gaps accumulate over years
- ALWAYS request physical inventory count reconciliation, not just ERP report
- Obsolescence provisions often inadequate — apply 3-year no-movement rule

PITFALL 2: CapEx vs Maintenance CapEx
- Companies capitalize maintenance to inflate EBITDA
- Ask for CapEx breakdown: growth vs maintenance vs regulatory/compliance
- Rule of thumb: true maintenance CapEx = 2-4% of fixed asset gross book value
- If reported maintenance CapEx < 2%: likely underspending or misclassifying

PITFALL 3: Customer Contracts in Manufacturing
- Framework agreements ≠ guaranteed volume (common misunderstanding)
- "Framework" often means pre-negotiated pricing with no volume commitment
- Request actual order volumes vs framework maximums — often 50-70% utilization

PITFALL 4: Environmental Liabilities
- Especially relevant for food production (Scandia), metal working, chemicals
- Denmark: miljøansvarsloven — strict liability for contamination
- Check: soil surveys, EPA correspondence, insurance coverage
- Historic sites: always request Phase I environmental assessment

PITFALL 5: Seasonality Distortion
- Manufacturing with seasonal demand: year-end snapshot misleads
- Scandia lesson: their Q4 inventory was 2.3× Q2 level — normalized WC was DKK 8M lower than reported
- ALWAYS use 12-month average for WC peg in seasonal businesses`,
    metadata: { fileName: "Manufacturing_DD_Common_Pitfalls.pdf", author: "Astrid Kjeldsen", lastModified: daysAgoDate(45) },
  },


  // ═══════════════════════════════════════════════════════════════════════
  // Category 2 — Internal Process Emails (18 items, Gmail)
  // ═══════════════════════════════════════════════════════════════════════

  {
    sourceType: "email", connectorProvider: "google-gmail", daysAgo: 35,
    content: "Kære team, efter afslutningen af Scandia Foods DD har vi lavet en grundig evaluering af hvad der gik godt og hvad vi kan forbedre. Tre key takeaways:\n\n1. Vi undervurderede sæsoneffekten på working capital med ca. DKK 8M. Fremover SKAL vi altid bruge 12-måneders gennemsnit for sæsonprægede virksomheder — aldrig periodeslut-snapshot.\n\n2. Vores data room completeness tracking var for langsom. Vi fik først fuld data 3 uger inde i engagement. Line har opdateret vores onboarding-procedure til at kræve minimum 70% completeness før vi starter analyse.\n\n3. EBITDA-normaliseringerne manglede én vigtig justering: ejerlån til markedsrente. Vi fangede det i review, men det burde have været i first draft. Kasper — tilføj venligst til checklisten.\n\nVh, Astrid",
    metadata: { from: "astrid@nordisk-kapital.dk", to: "team@nordisk-kapital.dk", subject: "Scandia Foods DD — lessons learned og procesopdateringer", date: daysAgoDate(35) },
  },

  {
    sourceType: "email", connectorProvider: "google-gmail", daysAgo: 30,
    content: "Henrik, I wanted to discuss the commercial DD scope for the NordTech engagement before we finalize the proposal to Roskilde Finans. My initial view:\n\n1. Market sizing: Danish logistics software market + Scandinavian expansion opportunity\n2. Competitive landscape: 4-5 direct competitors, plus in-house solutions at large logistics companies\n3. Customer interviews: minimum 8 (top 5 by revenue + 2 recently churned + 1 prospect)\n4. Technology assessment: limited scope — high-level architecture review, not code audit\n5. Go-to-market: sales efficiency metrics, CAC/LTV analysis\n\nI estimate 12 working days for the commercial stream. Sofie and Kasper can handle the bulk of the analysis work.\n\nShall we sync before Thursday's call with Nikolaj?\n\nThomas",
    metadata: { from: "thomas@nordisk-kapital.dk", to: "henrik@nordisk-kapital.dk", subject: "NordTech — commercial DD scope discussion", date: daysAgoDate(30) },
  },

  {
    sourceType: "email", connectorProvider: "google-gmail", daysAgo: 28,
    content: "Thomas, tak for oplægget. Enig i scope — dog vil jeg gerne have teknologi-assessmentet udvidet. NordTech har en proprietær routing-algoritme som er central for deres value proposition. Uden at lave et fuldt code review bør vi i det mindste:\n\n1. Forstå arkitekturen (monolith vs microservices, cloud vs on-prem)\n2. Vurdere tech debt niveau (deploy frequency, test coverage som proxy)\n3. Key person risk på CTO (Morten Hauge er co-founder og eneste der kender routing engine)\n\nJeg foreslår vi allokerer 3 ekstra dage til tech stream og beder Mikkel hjælpe — han har software-baggrund.\n\nVi tager det på call med Nikolaj torsdag.\n\nHenrik",
    metadata: { from: "henrik@nordisk-kapital.dk", to: "thomas@nordisk-kapital.dk", subject: "RE: NordTech — commercial DD scope discussion", date: daysAgoDate(28) },
  },

  {
    sourceType: "email", connectorProvider: "google-gmail", daysAgo: 25,
    content: "Hi all, quick update on the quality review process. Going forward, all DD reports must pass through the following gates before client delivery:\n\n1. Analyst/Associate self-review (checklist in Drive)\n2. Senior Associate cross-review (different person than the author)\n3. Partner review with markup\n4. Final formatting check (Julie or Mikkel)\n\nMinimum 48 hours between gate 3 (partner review) and client delivery. No exceptions.\n\nThis is in response to the near-miss on Scandia where a draft version almost went to the client with placeholder text still in Section 4.\n\nLine",
    metadata: { from: "line@nordisk-kapital.dk", to: "team@nordisk-kapital.dk", subject: "Updated QA process — mandatory review gates", date: daysAgoDate(25) },
  },

  {
    sourceType: "email", connectorProvider: "google-gmail", daysAgo: 22,
    content: "Astrid, I have a question about revenue recognition for NordTech. They use percentage-of-completion for professional services engagements (implementation projects), but their milestone documentation is inconsistent. Specifically:\n\n- 4 of 12 active projects have no formal milestone sign-off documents\n- The revenue recognized on these 4 projects totals DKK 3.2M\n- Without milestone docs, we can't independently verify the completion percentage\n\nShould we:\na) Flag this as a risk finding and note the DKK 3.2M exposure, or\nb) Request the milestone docs from the target and delay our assessment?\n\nMy instinct is (a) — flag it now and note that verification is pending. But wanted your guidance since this feeds into the revenue quality score.\n\nMarcus",
    metadata: { from: "marcus@nordisk-kapital.dk", to: "astrid@nordisk-kapital.dk", subject: "NordTech — revenue recognition edge case (% completion)", date: daysAgoDate(22) },
  },

  {
    sourceType: "email", connectorProvider: "google-gmail", daysAgo: 21,
    content: "Marcus, godt spottet. Gør begge dele:\n\n1. Flag det som risk finding med DKK 3.2M eksponering (AMBER-klassificering)\n2. Send request til NordTech data room — Pia Thorsen er vores kontakt for financial docs\n3. I mellemtiden, lav en sensitivity analyse: hvad er EBITDA-impact hvis de 4 projekter er overvurderet med 20%, 40%, 60%?\n\nDet skal med i næste ugentlige status til Nikolaj. Line — kan du koordinere data room request?\n\nAstrid",
    metadata: { from: "astrid@nordisk-kapital.dk", to: "marcus@nordisk-kapital.dk", cc: "line@nordisk-kapital.dk", subject: "RE: NordTech — revenue recognition edge case (% completion)", date: daysAgoDate(21) },
  },

  {
    sourceType: "email", connectorProvider: "google-gmail", daysAgo: 18,
    content: "Team NordTech, status update for this week's workstream meeting:\n\nFinancial DD (Astrid/Marcus/Nadia):\n- Revenue quality assessment: 80% complete. Flagged customer concentration (top 3 = 61% of ARR)\n- EBITDA normalization: draft complete, pending partner review\n- Working capital: in progress, seasonal patterns less relevant for SaaS but investigating deferred revenue timing\n- Outstanding: milestone docs for 4 PS projects (requested, not received)\n\nCommercial DD (Thomas/Sofie/Kasper):\n- Market sizing complete. Danish logistics software TAM: DKK 2.1B\n- Customer interviews: 5 of 8 completed. Key finding: high satisfaction but price sensitivity emerging\n- Competitor analysis: draft due Friday\n- Tech assessment: Mikkel starting Monday\n\nLegal (external counsel):\n- Contract review: 42 of 49 contracts reviewed. 3 CoC clauses found (Maersk, DSV, GLS)\n- Employment contracts: 32 of 38 reviewed. 6 missing IP assignment clauses (early employees)\n\nTimeline: on track for draft report delivery in 14 days.\n\nLine",
    metadata: { from: "line@nordisk-kapital.dk", to: "team@nordisk-kapital.dk", subject: "NordTech DD — weekly status W14", date: daysAgoDate(18) },
  },

  {
    sourceType: "email", connectorProvider: "google-gmail", daysAgo: 15,
    content: "Nikolaj, herewith our weekly DD status update for NordTech ApS.\n\nOverall progress: 65% complete. On track for draft delivery in 12 working days.\n\nKey findings to date:\n1. Customer concentration above our 40% threshold — top 3 customers account for 61% of ARR (DKK 20.7M of 34.0M). Maersk alone is 27%.\n2. Three enterprise contracts contain change-of-control clauses with termination rights. Combined ARR exposure: DKK 15.2M.\n3. Revenue recognition methodology concern — DKK 3.2M of professional services revenue lacks milestone documentation. Flagged as AMBER.\n4. Key person risk on CTO (sole architect of routing engine). No succession plan.\n\nData room completeness: 82% (was 71% last week — target is providing docs faster now).\n\nPlease let me know if you'd like to discuss any of these findings on our Thursday call.\n\nBest regards,\nHenrik Vestergaard\nManaging Partner, Nordisk Kapital A/S",
    metadata: { from: "henrik@nordisk-kapital.dk", to: "nikolaj.brink@roskildefinans.dk", cc: "camilla.frost@roskildefinans.dk", subject: "NordTech DD — Weekly Status Update W14", date: daysAgoDate(15) },
  },

  {
    sourceType: "email", connectorProvider: "google-gmail", daysAgo: 12,
    content: "Henrik, thanks for the update. The customer concentration finding is concerning — we need to understand how sticky these relationships really are. Can you prioritize the Maersk customer interview? We need to know if they're evaluating alternatives.\n\nAlso, the CoC clause exposure is material. Can your team model the worst-case scenario: what does NordTech look like if all 3 CoC customers terminate within 12 months of close?\n\nThe revenue recognition issue — please push hard to get those milestone docs. We can't close without that gap resolved.\n\nOne more thing: what's the timeline for the technology assessment? Our IC is asking about the routing engine IP and whether it's defensible.\n\nNikolaj",
    metadata: { from: "nikolaj.brink@roskildefinans.dk", to: "henrik@nordisk-kapital.dk", subject: "RE: NordTech DD — Weekly Status Update W14", direction: "received", date: daysAgoDate(12) },
  },

  {
    sourceType: "email", connectorProvider: "google-gmail", daysAgo: 10,
    content: "Nadia, kan du lave en churn-scenarieanalyse til NordTech? Nikolaj vil se worst-case hvis alle 3 CoC-kunder opsiger inden for 12 måneder:\n\n- Maersk Logistics: DKK 9.2M ARR\n- DSV Solutions: DKK 6.8M ARR\n- GLS Danmark: DKK 4.7M (estimeret fra PostNord-kontrakten, de er udsplittet)\n\nWait — check om det er GLS eller PostNord. Kontraktgennemgangen sagde 'Maersk, DSV, GLS' men revenue-daten viser PostNord som #3. Kan Line verificere?\n\nModel 3 scenarier:\n1. Alle 3 opsiger (worst case): impact på ARR, revenue, EBITDA\n2. Kun Maersk opsiger (Maersk-specifik): den mest sandsynlige risiko\n3. Ingen opsiger men forhandler 15% rabat (renegotiation scenario)\n\nDet skal være klar til torsdag.\n\nAstrid",
    metadata: { from: "astrid@nordisk-kapital.dk", to: "nadia@nordisk-kapital.dk", cc: "line@nordisk-kapital.dk", subject: "NordTech — CoC churn-scenarieanalyse (haster)", date: daysAgoDate(10) },
  },

  {
    sourceType: "email", connectorProvider: "google-gmail", daysAgo: 8,
    content: "Astrid/Line, I checked the contract review log vs the revenue data:\n\nThe contract review identified CoC clauses in: Maersk Logistics, DSV Solutions, GLS Danmark\nBut the revenue data shows the #3 customer as PostNord Danmark (DKK 4.7M), not GLS.\n\nI looked deeper — GLS is a PostNord subsidiary for parcel delivery. The contract is in GLS's name but revenue is booked under PostNord's master account in e-conomic. So it's the same customer, different entity names.\n\nThis means the CoC exposure covers PostNord/GLS = DKK 4.7M, not a separate entity.\n\nWant me to update the contract log to reflect this? And should we flag the entity inconsistency in the report?\n\nNadia",
    metadata: { from: "nadia@nordisk-kapital.dk", to: "astrid@nordisk-kapital.dk", cc: "line@nordisk-kapital.dk", subject: "RE: NordTech — CoC churn-scenarieanalyse — GLS/PostNord clarification", date: daysAgoDate(8) },
  },

  {
    sourceType: "email", connectorProvider: "google-gmail", daysAgo: 5,
    content: "Sofie, here are my notes from the Maersk customer interview yesterday:\n\nInterviewee: Lars Jeppesen, VP Logistics Technology, Maersk Logistics\nDuration: 45 minutes\n\nKey takeaways:\n1. Very satisfied with NordTech's routing optimization — says it saves them 12-15% on route planning\n2. However: Maersk is building an in-house logistics platform ('Project Atlas') — timeline 18-24 months\n3. NordTech contract runs until Dec 2027, but if Atlas is ready they would not renew\n4. Price is not a concern — value delivered is clear. It's strategic direction that's the risk\n5. No awareness of the acquisition — he assumed NordTech would remain independent\n\nIMPLICATION: Even without CoC trigger, Maersk (27% of ARR) is a medium-term churn risk due to in-house build. This is arguably MORE important than the CoC clause itself.\n\nI'll write up the formal interview note for the report. Thomas should decide how prominently to flag this.\n\nKasper",
    metadata: { from: "kasper@nordisk-kapital.dk", to: "sofie@nordisk-kapital.dk", cc: "thomas@nordisk-kapital.dk", subject: "NordTech — Maersk customer interview notes", date: daysAgoDate(5) },
  },

  {
    sourceType: "email", connectorProvider: "google-gmail", daysAgo: 3,
    content: "All, Maersk-interviewet ændrer vores risikovurdering markant. Lars Jeppesen bekræftede at Maersk bygger en intern platform ('Project Atlas') med 18-24 måneders horisont.\n\nDet betyder:\n- CoC-klausulen er sekundær — den reelle risiko er strategisk churn uanset ejerskifte\n- 27% af ARR har medium-term churn risk (2-3 år), uafhængigt af transaktionen\n- Vi skal opgradere customer concentration fra AMBER til RED i executive summary\n\nJeg foreslår vi anbefaler Roskilde Finans at:\n1. Forhandle earn-out der er delvist betinget af Maersk-fastholdelse\n2. Kræve at NordTech starter diversificeringsstrategi som betingelse for close\n3. Justere valuation med 15-20% Maersk-afhængigheds-rabat\n\nKan vi samle teamet i morgen kl. 10 for at diskutere inden torsdags-kaldet med Nikolaj?\n\nHenrik",
    metadata: { from: "henrik@nordisk-kapital.dk", to: "team@nordisk-kapital.dk", subject: "NordTech — Maersk risiko-eskalering (RED flag)", date: daysAgoDate(3) },
  },

  {
    sourceType: "email", connectorProvider: "google-gmail", daysAgo: 40,
    content: "Jens, tak for det gode møde i tirsdags. Vi er glade for at Danvik har valgt Nordisk Kapital til at rådgive på sell-side processen.\n\nSom aftalt er vores tilgang:\n1. Vendor DD rapport (finansiel + kommerciel) — 4-6 uger\n2. Information memorandum / teaser — parallel med DD\n3. Buyer identification og outreach — efter DD completion\n4. Forhandlingsstøtte gennem hele processen\n\nVi starter med at bede om adgang til jeres regnskabssystem og en række dokumenter (checkliste vedlagt).\n\nKaren — kan vi aftale et kickoff-møde med jeres bogholder i næste uge?\n\nMed venlig hilsen,\nHenrik Vestergaard",
    metadata: { from: "henrik@nordisk-kapital.dk", to: "jens.rasmussen@danvik.dk", cc: "karen.ibsen@danvik.dk", subject: "Danvik sell-side — engagement start og næste skridt", date: daysAgoDate(40) },
  },

  {
    sourceType: "email", connectorProvider: "google-gmail", daysAgo: 7,
    content: "Mikkel, her er en opsummering af hvad du skal levere for NordTech tech assessment:\n\n1. Arkitekturoversigt: monolith vs microservices, cloud infra (AWS/Azure/GCP), database setup\n2. Tech debt vurdering: deploy frequency (daglig/ugentlig/månedlig), test coverage (spørg CTO), CI/CD pipeline\n3. Key person risiko: Morten Hauge (CTO) er sole architect af routing engine — dokumentér hvad der sker hvis han forlader\n4. IP-vurdering: er routing-algoritmen patenterbar? Hvem ejer IP'en? Check hans ansættelseskontrakt\n5. Skalerbarhed: kan platformen håndtere 10× nuværende volumen?\n\nDu har 5 arbejdsdage. Brug template fra Drive. Ring til mig hvis du sidder fast.\n\nThomas",
    metadata: { from: "thomas@nordisk-kapital.dk", to: "mikkel@nordisk-kapital.dk", subject: "NordTech tech assessment — brief og scope", date: daysAgoDate(7) },
  },

  {
    sourceType: "email", connectorProvider: "google-gmail", daysAgo: 2,
    content: "Thomas, preliminary findings from the NordTech tech assessment:\n\n1. Architecture: Monolithic Node.js backend with React frontend. Single PostgreSQL database. Hosted on AWS (eu-central-1, Frankfurt). Routing engine is a separate Python service — this is the core IP.\n\n2. Tech debt: Medium. They deploy weekly, test coverage ~62% (their claim, I couldn't verify independently). No formal CI/CD — manual deployment via SSH. This is concerning for a DKK 47M revenue company.\n\n3. Key person: CRITICAL. Morten Hauge wrote the routing engine Python service alone over 3 years. No other developer has worked on it. Documentation: a single README.md file. He's the only person who can debug production issues in the routing service. If he leaves, they literally cannot maintain their core product.\n\n4. IP: No patents filed. The algorithms are trade secrets only. Morten's employment contract (from 2019) does NOT have an explicit IP assignment clause — this is a significant gap. Danish law presumes employer ownership of employee inventions, but it's not airtight without a clause.\n\n5. Scalability: Current architecture handles ~2,000 route calculations/day. They claim it can do 10,000 but haven't load-tested. Database is single-instance, no read replicas.\n\nShall I write this up in report format?\n\nMikkel",
    metadata: { from: "mikkel@nordisk-kapital.dk", to: "thomas@nordisk-kapital.dk", subject: "NordTech tech assessment — preliminary findings", date: daysAgoDate(2) },
  },


  // ═══════════════════════════════════════════════════════════════════════
  // Category 3 — Prior Engagement Learnings (6 items, Google Drive)
  // ═══════════════════════════════════════════════════════════════════════

  {
    sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 32,
    content: `Scandia Foods DD — Lessons Learned (Internal Only)

Engagement: Buy-side DD for Nordic Capital on Scandia Foods Group (food production)
Duration: 8 weeks (2 weeks over original estimate)
Fee: DKK 1.9M (no overrun — fixed fee)

WHAT WENT WELL:
- Revenue quality assessment was thorough — identified DKK 4.2M of non-recurring revenue that management hadn't disclosed
- Contract review caught a major supplier agreement with above-market pricing (DKK 1.1M annual savings opportunity)
- Customer interviews (6 conducted) provided excellent qualitative color
- Report was well-received by client — "best DD report we've seen" (Nikolaj Brink, Roskilde Finans)

WHAT NEEDS IMPROVEMENT:
1. Working capital: We used period-end Q4 WC (DKK 28.4M) in initial draft. Q4 is peak season for food production — inventory was 2.3× Q2 levels. Corrected WC using 12-month average was DKK 20.1M. This DKK 8.3M difference could have materially affected the purchase price.
   → ACTION: Always use 12-month average for seasonal businesses. Added to Framework.

2. Data room access: We didn't receive complete financial data until Week 3. Analysis compressed into remaining 5 weeks.
   → ACTION: New onboarding procedure requires 70% data room completeness before engagement start (Line owns this).

3. Environmental liability: We outsourced environmental review to external counsel. They were slow (3 weeks for a Phase I report). Delayed the overall timeline.
   → ACTION: Pre-negotiate turnaround times with environmental consultants. Line maintaining preferred vendor list.

4. Near-miss: Draft report sent to Henrik for review still contained "[INSERT ANALYSIS]" placeholder in Section 4.2.
   → ACTION: Mandatory 48-hour buffer between partner review and client delivery. Formatting check by Julie/Mikkel before send.`,
    metadata: { fileName: "Scandia_Foods_DD_Lessons_Learned.pdf", author: "Astrid Kjeldsen", lastModified: daysAgoDate(32) },
  },

  {
    sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 28,
    content: `Q4 2025 Engagement Retrospective — Cross-Deal Patterns

Reviewed: Scandia Foods (food), Aarhus Components (manufacturing), BrightPath (edtech)

PATTERN 1: Customer Concentration is Always Higher Than Reported
- 3 out of 3 targets had customer concentration above their stated level
- Scandia: reported "no customer above 15%" — actually 22% when subsidiaries consolidated
- Aarhus Components: reported "diversified base" — top 5 customers = 58%
- BrightPath: reported "1,200 school customers" — 4 municipalities = 71% of revenue
→ LESSON: Always consolidate entities and look through distribution/reseller layers

PATTERN 2: Working Capital Requires Sector Context
- Using standardized WC benchmarks without sector adjustment led to errors
- Food production: 3-month seasonal WC swing (DKK 8M for Scandia)
- Manufacturing: project-based WC variability (Aarhus: ±DKK 3M around milestones)
- SaaS/edtech: deferred revenue is the dominant WC component (BrightPath: DKK 12M)
→ LESSON: Build sector-specific WC models, not generic ones

PATTERN 3: Key Person Risk Underestimated in Founder-Led Companies
- All 3 targets had key person risks we initially rated too low
- Post-deal, BrightPath founder left after 6 months (earn-out disagreement)
→ LESSON: For founder-led companies, assume key person risk is HIGH unless proven otherwise`,
    metadata: { fileName: "Q4_2025_Engagement_Retrospective.pdf", author: "Henrik Vestergaard", lastModified: daysAgoDate(28) },
  },

  {
    sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 100,
    content: `Danvik Industries — Sell-Side Preparation Checklist (Active)

Status: In preparation for buyer outreach (Q2 2026 target)

Company overview:
- Danish manufacturer of precision metal components for industrial applications
- Revenue: DKK 89M (2025), EBITDA: DKK 14.2M (16% margin)
- 45 employees, factory in Odense
- Owner: Jens Rasmussen (founder, 67 years old) — succession-motivated sale
- Strengths: ISO 9001 certified, long-term customer relationships, proprietary tooling
- Challenges: aging workforce, single-site concentration, limited international exposure

Vendor DD status:
- Financial DD: assigned to Marcus and Nadia. Start: Week 15.
- Commercial DD: assigned to Sofie. Market sizing in progress.
- Legal: external counsel engaged (Kromann Reumert). Start: Week 16.

Information Memorandum:
- Henrik drafting investment highlights section
- Thomas drafting market and competitive section
- Target distribution: 15-20 qualified buyers (mix of strategic + PE)

Timeline:
- Vendor DD completion: Week 20
- IM distribution: Week 22
- First round bids: Week 26
- Management presentations: Week 28-30
- Final bids: Week 32`,
    metadata: { fileName: "Danvik_Sell_Side_Preparation_Checklist.xlsx", author: "Henrik Vestergaard", lastModified: daysAgoDate(100) },
  },

  {
    sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 20,
    content: `TechNordic Solutions — Preliminary Scoping Notes

Meeting notes from initial call with Stefan Olsen (MD, TechNordic):

Company: IT services & managed services provider, Aalborg
Revenue: ~DKK 52M (2025), EBITDA: ~DKK 7M (estimated, unaudited)
Employees: 28
Service offering: cloud migration, managed IT infrastructure, cybersecurity consulting
Customer base: 120+ Danish SMBs, primarily Nordjylland region
Growth: 18% YoY revenue growth, primarily organic

Why they're exploring a sale:
- Stefan wants a partner to accelerate growth (doesn't want to remain lifestyle business)
- Interest from larger IT services companies (NNIT, KMD) but wants a "fair process"
- Not yet engaged an advisor — we would be first

Our assessment:
- Interesting target for PE roll-up strategy (IT services consolidation play)
- Valuation range: 6-8× EBITDA = DKK 42-56M enterprise value
- Key risk: customer concentration (unknown — need data), key person (Stefan himself)
- Timeline: if we win mandate, DD would start Q3 2026

Next steps:
- Henrik to send engagement letter draft
- Thomas to prepare competitive landscape overview (who else is acquiring Danish IT services?)
- Fee: standard retainer + success fee structure`,
    metadata: { fileName: "TechNordic_Preliminary_Scoping_Notes.pdf", author: "Thomas Riber", lastModified: daysAgoDate(20) },
  },

  {
    sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 15,
    content: `Vestjysk Energi — Preliminary Assessment Notes

Initial conversation with Ole Hansen (CEO):

Company: Regional energy company (electricity distribution + production), Ringkøbing-Skjern area
Revenue: DKK 340M (2025) — heavily regulated revenue (grid tariffs set by Energitilsynet)
Employees: 85
Ownership: Municipal cooperative (consumer-owned)

Situation:
- Board considering transition to A/S structure (demutualization)
- Need independent valuation for the conversion process
- Regulatory complexity: Danish energy regulation (elforsyningsloven) governs asset valuation
- Potential subsequent acquisition by Norlys or Eniig after conversion

Our role (if engaged):
- Independent valuation assessment
- Regulatory compliance review
- Transaction structure advisory (demutualization + potential subsequent sale)

Complexity factors:
- Regulated asset base: valuation based on regulated equity, not market multiples
- Concession agreements with municipality
- Employee protections during ownership change (virksomhedsoverdragelsesloven)
- Political sensitivity: municipality must approve

Fee estimate: DKK 2.0M (significant regulatory complexity justifies premium)
Timeline: 6-9 months if engaged

Status: Awaiting board decision (expected June 2026)`,
    metadata: { fileName: "Vestjysk_Energi_Preliminary_Assessment.pdf", author: "Henrik Vestergaard", lastModified: daysAgoDate(15) },
  },

  {
    sourceType: "drive_doc", connectorProvider: "google-drive", daysAgo: 38,
    content: `NK Fee Benchmarks & Deal Economics (Confidential)

Standard fee structures (updated Q1 2026):

BUY-SIDE DD (our core offering):
- Base retainer: DKK 350-500K/month depending on scope
- Typical engagement: 6-10 weeks
- Total fee range: DKK 1.5-2.5M for mid-market (EV DKK 50-500M)
- Premium for complex sectors (energy, financial services): +30%
- Discount for repeat clients: 10-15%

SELL-SIDE ADVISORY:
- Retainer: DKK 200-300K/month (lower because success fee compensates)
- Success fee: 1.5-2.5% of enterprise value (sliding scale)
- Minimum total engagement: DKK 1.5M
- Cap on success fee: negotiated per deal

VENDOR DD (sell-side preparation):
- Fixed fee: DKK 800K-1.5M
- Includes: financial DD report, data room organization, management presentation coaching
- Does NOT include: buyer identification, negotiation support

TEAM ALLOCATION (typical buy-side DD):
- Partner: 15-20% of time (oversight, client relationship, quality control)
- VP/Senior Associate: 40-50% (analytical lead, report authoring)
- Associates/Analysts: 100% dedicated (data analysis, modeling, research)
- Blended rate target: DKK 3,500/hour (internal)

2025 PERFORMANCE:
- Completed engagements: 7
- Total revenue: DKK 11.8M
- Average fee per engagement: DKK 1.69M
- Utilization rate (fee-earning staff): 72%
- Target 2026: DKK 14M revenue, 78% utilization`,
    metadata: { fileName: "NK_Fee_Benchmarks_Deal_Economics_Q1_2026.xlsx", author: "Henrik Vestergaard", lastModified: daysAgoDate(38) },
  },


  // ═══════════════════════════════════════════════════════════════════════
  // Category 4 — Slack Messages (18 items)
  // ═══════════════════════════════════════════════════════════════════════

  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 1, content: "NordTech draft report er 90% færdig. Mangler tech assessment (Mikkel leverer i dag) og den opdaterede CoC-scenarieanalyse. Astrid — din partner review kan starte i morgen formiddag.", metadata: { channel: "deals", authorEmail: "line@nordisk-kapital.dk", authorName: "Line Bech" } },

  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 2, content: "Maersk interview debrief: de bygger en intern platform. 27% af NordTech ARR er i risiko på 2-3 års sigt. Det er en game-changer for vores risikovurdering. Henrik indkalder til teammøde i morgen.", metadata: { channel: "deals", authorEmail: "kasper@nordisk-kapital.dk", authorName: "Kasper Møller" } },

  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 3, content: "Morten Hauge (NordTech CTO) er den eneste der kender routing engine. Ingen dokumentation udover en README. Hvis han smutter efter transaktionen er de fucked. Key person risk = CRITICAL.", metadata: { channel: "financial-dd", authorEmail: "mikkel@nordisk-kapital.dk", authorName: "Mikkel Skov" } },

  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 5, content: "Reminder: mandag pipeline review kl. 9:00. Agenda: NordTech status, Danvik timeline, TechNordic/Vestjysk scoping updates. Alle partnere + senior associates.", metadata: { channel: "general", authorEmail: "dorthe@nordisk-kapital.dk", authorName: "Dorthe Petersen" } },

  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 7, content: "Quick question on the NordTech EBITDA bridge: should we normalize for the DKK 400K consulting fee they paid to a strategy firm in Q3? It was a one-time engagement for market entry planning (Sweden). Feels non-recurring but they say they might do it again.", metadata: { channel: "financial-dd", authorEmail: "nadia@nordisk-kapital.dk", authorName: "Nadia Poulsen" } },

  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 7, content: "Nadia — include it as a normalization but flag it in the narrative. 'Management intends to repeat' doesn't make it recurring until they actually do. Classic sandbagging to inflate adjusted EBITDA. Add a sensitivity line in the bridge.", metadata: { channel: "financial-dd", authorEmail: "astrid@nordisk-kapital.dk", authorName: "Astrid Kjeldsen" } },

  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 10, content: "Danvik data room er nu sat op. Karen Ibsen har givet os adgang. 127 dokumenter uploadet. Marcus og Nadia starter financial review i morgen. Sofie — du har markedsanalyse deadlines W16.", metadata: { channel: "deals", authorEmail: "line@nordisk-kapital.dk", authorName: "Line Bech" } },

  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 12, content: "Er der nogen der har erfaring med e-conomic API? NordTech bruger det og jeg vil gerne trække 3 års transaktionsdata direkte i stedet for at vente på deres Excel-export. Jakob — kan du hjælpe?", metadata: { channel: "financial-dd", authorEmail: "marcus@nordisk-kapital.dk", authorName: "Marcus Holm" } },

  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 12, content: "Marcus — ja, vi har brugt e-conomic API før på Scandia. Jeg sender dig credentials og et Python-script der trækker journal entries. Husk: det er KUNDENS data, så log alt du trækker.", metadata: { channel: "financial-dd", authorEmail: "jakob@nordisk-kapital.dk", authorName: "Jakob Friis" } },

  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 14, content: "Just had a great call with Stefan Olsen from TechNordic. They're seriously considering engaging us for sell-side advisory. DKK 52M revenue IT services company. Henrik — I'll send you the scoping notes today.", metadata: { channel: "deals", authorEmail: "thomas@nordisk-kapital.dk", authorName: "Thomas Riber" } },

  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 16, content: "NordTech customer concentration analysis done. Top 3 = 61% of ARR. Way above our 40% threshold. Maersk alone is 27%. This needs to be front and center in the executive summary.", metadata: { channel: "financial-dd", authorEmail: "marcus@nordisk-kapital.dk", authorName: "Marcus Holm" } },

  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 18, content: "FYI Vestjysk Energi board meeting er udsat til juni. Ole Hansen ringede i formiddags. De skal have politisk opbakning fra byrådet først. Vores scoping work er on hold.", metadata: { channel: "deals", authorEmail: "henrik@nordisk-kapital.dk", authorName: "Henrik Vestergaard" } },

  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 20, content: "Contract review update: 42 of 49 NordTech contracts reviewed. Found 3 change-of-control clauses — Maersk, DSV, and one more (checking if it's GLS or PostNord — different entity names in contract vs invoicing).", metadata: { channel: "legal-review", authorEmail: "sofie@nordisk-kapital.dk", authorName: "Sofie Brandt" } },

  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 22, content: "Gentle reminder: alle timer skal registreres i Harvest inden fredag kl. 12. Vi har 3 aktive mandater og Henrik har brug for præcise tal til månedsrapporten. Tak! 🙏", metadata: { channel: "general", authorEmail: "dorthe@nordisk-kapital.dk", authorName: "Dorthe Petersen" } },

  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 25, content: "Sofie — har du fundet benchmark-data for dansk logistiksoftware-marked? Jeg er ved at estimere TAM og har brug for markedsstørrelse + vækstrate. Helst fra IDC eller Gartner.", metadata: { channel: "commercial-dd", authorEmail: "kasper@nordisk-kapital.dk", authorName: "Kasper Møller" } },

  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 25, content: "Kasper — IDC rapporten er i Drive under /Research/Market Reports. Dansk logistik-software TAM estimeret til DKK 2.1B i 2025, vokser 8-10% årligt. Jeg har også fundet 4-5 direkte konkurrenter til NordTech. Deler listen i morgen.", metadata: { channel: "commercial-dd", authorEmail: "sofie@nordisk-kapital.dk", authorName: "Sofie Brandt" } },

  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 30, content: "Hej alle — printer er fikset. Det var toneren der var tom, ikke en hardware-fejl. Jakob har bestilt ny. Og kaffe-maskinen er også repareret 🎉", metadata: { channel: "random", authorEmail: "dorthe@nordisk-kapital.dk", authorName: "Dorthe Petersen" } },

  { sourceType: "slack_message", connectorProvider: "slack", daysAgo: 35, content: "Welcome Julie! 🎉 Julie Winther starter i dag som analyst. Hun kommer fra CBS (cand.merc.aud) og har praktik-erfaring fra PwC Transaction Services. Vis hende rundt og vær søde ❤️", metadata: { channel: "general", authorEmail: "dorthe@nordisk-kapital.dk", authorName: "Dorthe Petersen" } },


  // ═══════════════════════════════════════════════════════════════════════
  // Category 5 — Calendar / Meeting Notes (7 items)
  // ═══════════════════════════════════════════════════════════════════════

  {
    sourceType: "calendar_note", connectorProvider: "google-calendar", daysAgo: 1,
    content: "Monday Pipeline Review — Notes (Attendees: Henrik, Astrid, Thomas, Line)\n\n1. NordTech DD: 90% complete. Draft report for partner review tomorrow. Key risk: Maersk in-house build (RED flag). Tech assessment received from Mikkel — CTO key person risk CRITICAL. Timeline: draft to Roskilde Finans by Friday.\n\n2. Danvik Sell-Side: Data room active, 127 docs. Financial analysis starting this week. IM outline approved by Jens Rasmussen. Target buyer list: 18 names (12 strategic, 6 PE).\n\n3. TechNordic: Scoping call went well. Stefan Olsen interested. Henrik sending engagement letter this week. Estimated fee: DKK 1.5M.\n\n4. Vestjysk Energi: On hold — board meeting postponed to June. Keep relationship warm.\n\n5. Team capacity: NordTech winding down (2 weeks). Marcus and Nadia transitioning to Danvik. Sofie and Kasper available from W17 for new mandates.\n\nAction items: Henrik → TechNordic engagement letter. Astrid → NordTech partner review. Line → Danvik data room completeness check.",
    metadata: { title: "Monday Pipeline Review", organizer: "dorthe@nordisk-kapital.dk", attendees: ["henrik@nordisk-kapital.dk", "astrid@nordisk-kapital.dk", "thomas@nordisk-kapital.dk", "line@nordisk-kapital.dk"], date: daysAgoDate(1) },
  },

  {
    sourceType: "calendar_note", connectorProvider: "google-calendar", daysAgo: 4,
    content: "NordTech DD — Maersk Risk Discussion (Full team)\n\nContext: Kasper's Maersk interview revealed in-house platform build ('Project Atlas')\n\nDiscussion:\n- Henrik: This changes the risk profile fundamentally. Even without CoC trigger, 27% of ARR has medium-term churn risk.\n- Astrid: We need to model the P&L impact. If Maersk churns, NordTech EBITDA drops from DKK 10.5M to ~DKK 5.8M.\n- Thomas: Commercial DD should address: can NordTech replace Maersk revenue? Their sales team is 3 people — limited capacity for enterprise hunting.\n- Line: The positive angle: if NordTech can diversify during the earn-out period, the risk is manageable.\n\nDecisions:\n1. Upgrade customer concentration to RED in executive summary\n2. Recommend earn-out partially tied to Maersk retention / revenue diversification\n3. Suggest 15-20% valuation adjustment for Maersk dependency\n4. Henrik to present to Nikolaj on Thursday call",
    metadata: { title: "NordTech — Maersk Risk Discussion", organizer: "henrik@nordisk-kapital.dk", attendees: ["henrik@nordisk-kapital.dk", "astrid@nordisk-kapital.dk", "thomas@nordisk-kapital.dk", "line@nordisk-kapital.dk", "marcus@nordisk-kapital.dk", "sofie@nordisk-kapital.dk", "kasper@nordisk-kapital.dk", "nadia@nordisk-kapital.dk", "mikkel@nordisk-kapital.dk"], date: daysAgoDate(4) },
  },

  {
    sourceType: "calendar_note", connectorProvider: "google-calendar", daysAgo: 8,
    content: "NordTech DD Kick-off — Roskilde Finans (Henrik, Astrid, Thomas, Line + Nikolaj Brink, Camilla Frost, Frederik Borg from Roskilde Finans)\n\nAgreed scope:\n- Financial DD: full scope per NK framework v4.2\n- Commercial DD: market sizing, customer interviews (8), competitive landscape\n- Technology: limited assessment (architecture + key person, not code audit)\n- Legal: outsourced to Kromann Reumert, NK coordinates\n\nTimeline: 8 weeks to draft report, 2 weeks for revisions\nFee: DKK 2.4M (monthly retainer DKK 400K × 6 months, adjusted for scope)\n\nData room: NordTech CFO (Pia Thorsen) is primary contact. Access via SharePoint.\n\nKey areas of focus per Nikolaj:\n- Revenue quality and sustainability (is the ARR real?)\n- Customer concentration (how dependent on top 3?)\n- Technology defensibility (is the routing engine a real moat?)\n- Management team quality (beyond the founders)",
    metadata: { title: "NordTech DD Kick-off — Roskilde Finans", organizer: "henrik@nordisk-kapital.dk", attendees: ["henrik@nordisk-kapital.dk", "astrid@nordisk-kapital.dk", "thomas@nordisk-kapital.dk", "line@nordisk-kapital.dk", "nikolaj.brink@roskildefinans.dk", "camilla.frost@roskildefinans.dk", "frederik.borg@roskildefinans.dk"], date: daysAgoDate(8) },
  },

  {
    sourceType: "calendar_note", connectorProvider: "google-calendar", daysAgo: 15,
    content: "Weekly NordTech Status Call — Roskilde Finans (Henrik + Nikolaj)\n\nTopics:\n1. Progress: 65% complete, on track\n2. Customer concentration flag: 61% top 3 — Nikolaj concerned\n3. CoC clauses: 3 identified — Nikolaj wants worst-case modeling\n4. Revenue recognition: DKK 3.2M pending verification\n5. Data room: 82% complete, improving\n\nNikolaj's priorities for next week:\n- Get Maersk customer interview scheduled\n- Model CoC churn scenarios\n- Push for milestone docs\n- IC wants tech assessment results\n\nNext call: Thursday 10:00",
    metadata: { title: "NordTech Weekly — Roskilde Finans", organizer: "henrik@nordisk-kapital.dk", attendees: ["henrik@nordisk-kapital.dk", "nikolaj.brink@roskildefinans.dk"], date: daysAgoDate(15) },
  },

  {
    sourceType: "calendar_note", connectorProvider: "google-calendar", daysAgo: 40,
    content: "Danvik Industries — Engagement Kickoff (Henrik, Thomas + Jens Rasmussen, Karen Ibsen)\n\nDiscussion:\n- Jens (67) wants to retire within 2 years — succession-motivated sale\n- No internal successor — his two sons work in different industries\n- Company has been profitable for 25 years, stable customer base\n- Jens wants 'the right buyer' — preferably someone who will keep the Odense factory and employees\n- Emotional attachment: he founded the company in 1999\n\nKey info:\n- Revenue: DKK 89M, EBITDA: DKK 14.2M (16% margin)\n- 45 employees, some with 15+ years tenure\n- Factory: owned freehold, recently renovated\n- No debt, DKK 12M cash on balance sheet\n\nAgreed:\n- NK to produce vendor DD report (financial + commercial)\n- Parallel: prepare Information Memorandum\n- Target: buyer outreach Q2/Q3 2026\n- Fee: DKK 1.8M (DKK 300K/month retainer + DKK 600K completion fee)",
    metadata: { title: "Danvik Industries — Engagement Kickoff", organizer: "henrik@nordisk-kapital.dk", attendees: ["henrik@nordisk-kapital.dk", "thomas@nordisk-kapital.dk", "jens.rasmussen@danvik.dk", "karen.ibsen@danvik.dk"], date: daysAgoDate(40) },
  },

  {
    sourceType: "calendar_note", connectorProvider: "google-calendar", daysAgo: 120,
    content: "Scandia Foods — Final Report Delivery (Henrik, Astrid + Nikolaj Brink, Camilla Frost)\n\nDelivered:\n- 42-page DD report covering financial, commercial, and operational dimensions\n- Risk register: 14 items (3 RED, 5 AMBER, 6 GREEN)\n- Key RED risks: seasonal WC distortion, supplier contract above market, management depth\n- Recommended purchase price adjustments: net DKK -6.2M (WC normalization + supplier savings)\n\nClient feedback:\n- Nikolaj: 'This is the most thorough DD report we've received from any advisor.'\n- Camilla: Appreciated the scenario modeling on customer churn\n- They used our WC analysis to negotiate DKK 5.5M price reduction\n\nPost-mortem:\n- Engagement went 2 weeks over (8 weeks vs 6 planned)\n- Root cause: late data room completion by target\n- Fixed fee — no overrun billed\n- Relationship strengthened: Roskilde Finans engaged us for NordTech DD based on Scandia experience",
    metadata: { title: "Scandia Foods — Final Report Delivery", organizer: "henrik@nordisk-kapital.dk", attendees: ["henrik@nordisk-kapital.dk", "astrid@nordisk-kapital.dk", "nikolaj.brink@roskildefinans.dk", "camilla.frost@roskildefinans.dk"], date: daysAgoDate(120) },
  },

  {
    sourceType: "calendar_note", connectorProvider: "google-calendar", daysAgo: 14,
    content: "TechNordic — Initial Scoping Call (Thomas + Stefan Olsen)\n\nStefan Olsen, Managing Director, TechNordic Solutions (IT services, Aalborg).\nInterested in sell-side advisory. Company doing DKK 52M revenue, growing 18% YoY.\n\nStefan's goals:\n- Find a partner that can help scale beyond Nordjylland\n- Doesn't want a 'fire sale' — wants fair value and good cultural fit\n- Open to PE or strategic buyer\n- Timeline: flexible, but would like to start process Q3 2026\n\nThomas's assessment:\n- Interesting target for IT services roll-up play\n- Multiple potential buyers: NNIT, KMD, Netcompany, PE firms doing IT consolidation\n- Key unknowns: customer concentration, management team beyond Stefan\n- Fee: standard sell-side structure (retainer + success fee)\n\nNext step: Henrik to send engagement letter. Thomas to prepare competitive overview.",
    metadata: { title: "TechNordic — Scoping Call", organizer: "thomas@nordisk-kapital.dk", attendees: ["thomas@nordisk-kapital.dk", "stefan@technordic.dk"], date: daysAgoDate(14) },
  },


  // ═══════════════════════════════════════════════════════════════════════
  // Additional items — team coordination & process
  // ═══════════════════════════════════════════════════════════════════════

  {
    sourceType: "email", connectorProvider: "google-gmail", daysAgo: 45,
    content: "Kære alle, som I ved har vi vundet NordTech-mandatet fra Roskilde Finans. Det er vores største engagement i år (DKK 2.4M fee) og en vigtig reference-case for SaaS DD.\n\nTeam allocation:\n- Financial DD lead: Astrid (med Marcus og Nadia)\n- Commercial DD lead: Thomas (med Sofie og Kasper)\n- Tech assessment: Mikkel\n- Project management: Line\n- Quality review: Henrik (partner sign-off)\n\nKick-off med Roskilde Finans er onsdag kl. 14. Alle leads deltager.\n\nDette er et prestige-mandat — Roskilde Finans har 6 andre deals i pipeline som vi gerne vil vinde. Lad os levere exceptionelt.\n\nHenrik",
    metadata: { from: "henrik@nordisk-kapital.dk", to: "team@nordisk-kapital.dk", subject: "NordTech DD — team allocation og kick-off", date: daysAgoDate(45) },
  },

  {
    sourceType: "slack_message", connectorProvider: "slack", daysAgo: 9,
    content: "Julie — kan du hjælpe mig med at formatere NordTech revenue quality tabellerne? Jeg har data i et Google Sheet men det skal ind i report template. Astrids krav: konsistente decimaler, NK blå (#1a3a5c) headers, og DKK formatering med tusindtals-separator.", metadata: { channel: "financial-dd", authorEmail: "nadia@nordisk-kapital.dk", authorName: "Nadia Poulsen" },
  },

  {
    sourceType: "slack_message", connectorProvider: "slack", daysAgo: 6,
    content: "Thomas — customer interview #6 (DSV Solutions) er booket til torsdag kl. 11. Kontakt: Peter Andersen, VP Operations. Fokusområder: satisfaction, renewal intent, competitive alternatives, og reaction to potential ownership change. Sofie deltager som notetaker.", metadata: { channel: "commercial-dd", authorEmail: "kasper@nordisk-kapital.dk", authorName: "Kasper Møller" },
  },

  {
    sourceType: "email", connectorProvider: "google-gmail", daysAgo: 42,
    content: "Line, herewith the updated data room completeness tracker for NordTech. Current status:\n\nSection A (Corporate/Legal): 18 of 22 items received (82%)\nSection B (Financial): 24 of 28 items received (86%)\nSection C (Commercial): 15 of 25 items received (60%) — this is the bottleneck\nSection D (HR): 12 of 18 items received (67%)\nSection E (Technology): 8 of 16 items received (50%)\nSection F-H: not yet requested\n\nOverall: 77 of 109 items = 71%. Below our 70% threshold for starting analysis, but very close.\n\nPia Thorsen (NordTech CFO) says Section C commercial data is being compiled — expected by end of week.\n\nShall we start the financial analysis now and run commercial in parallel once data arrives?\n\nMarcus",
    metadata: { from: "marcus@nordisk-kapital.dk", to: "line@nordisk-kapital.dk", cc: "astrid@nordisk-kapital.dk", subject: "NordTech data room — completeness status (71%)", date: daysAgoDate(42) },
  },
];
