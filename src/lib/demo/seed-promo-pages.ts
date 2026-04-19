/**
 * Promo Demo Wiki Pages — All 36 pages as embedded constants.
 *
 * Each page has: slug, pageType, title, content (full markdown), properties (JSONB).
 * The seed runner creates KnowledgePage records from these.
 */

import type { IdeaDashboard } from "@/lib/idea-dashboard-types";

export interface PromoPage {
  slug: string;
  pageType: string;
  title: string;
  content: string;
  properties: Record<string, unknown>;
}

// Matches the exact format `injectDashboardSection` writes in idea-reasoning.ts
// so the parser in idea-page-parser.ts reads embedded dashboards identically
// to runtime-generated ones.
function buildDashboardSection(dashboard: IdeaDashboard): string {
  return `## Dashboard\n\n\`\`\`json\n${JSON.stringify(dashboard, null, 2)}\n\`\`\`\n`;
}

// ══════════════════════════════════════════════════════════
// SITUATION INSTANCES (5 pages)
// ══════════════════════════════════════════════════════════

export const SITUATION_PAGES: PromoPage[] = [
  // ── 1. Board meeting ────────────────────────────────────
  {
    slug: "sit-board-meeting",
    pageType: "situation_instance",
    title: "Board meeting in 3 days — no preparation started",
    properties: {
      situation_id: "demo-sit-board-meeting",
      status: "proposed",
      severity: 0.78,
      confidence: 0.92,
      situation_type: "board-meeting-preparation",
      detected_at: "2026-04-14T09:12:00Z",
      source: "detected",
      assigned_to: "anna-korsgaard",
      domain: "management",
      current_step: 1,
      autonomy_level: "supervised",
      cycle_number: 1,
      after_batch: "resolve",
      resolution_type: "self_resolving",
    },
    content: `# Board meeting in 3 days — no preparation started

| Property | Value |
|---|---|
| ID | demo-sit-board-meeting |
| Status | Proposed |
| Severity | 0.78 |
| Confidence | 0.92 |
| Situation Type | [[board-meeting-preparation]] |
| Assigned To | [[anna-korsgaard]] |
| Domain | [[management]] |
| Detected | 2026-04-14 09:12 |
| Source | Detected |
| Current Step | 1 |

## Trigger
Board meeting scheduled for April 17 at 14:00 (calendar). No agenda circulated. No briefing document in shared drive. Last board meeting (March 13) had a 12-page briefing sent 5 days in advance. Current preparation gap: 0 documents, 0 communications to board members in the last 14 days.

## Context
Board consists of 4 members: [[erik-vestergaard]] (chair), [[karen-holm]], [[thomas-bach-board]], [[anna-korsgaard]] (CEO, presenting). Previous meeting minutes reference 3 follow-up items: (1) Q1 revenue target review, (2) hiring plan for Q3, (3) client concentration risk assessment. Financial data available from connected accounting system through March 31. Active projects: 6 in delivery, 2 in pipeline. One client relationship flagged as cooling — see [[client-greenfield-corp]].

## Investigation
Cross-referenced calendar, email, and drive activity for the last 21 days. No draft documents found matching "board", "bestyrelse", or "meeting prep" in any connected system. [[anna-korsgaard]]'s calendar shows 4 consecutive days of client meetings this week — likely the reason preparation hasn't started. The previous board briefing (March 8) was authored by Anna and took approximately 6 hours based on drive edit history.

Financial summary compiled from accounting connector: Q1 revenue 4.2M DKK (94% of target), EBITDA margin 18.3%, accounts receivable 1.1M DKK with 340K overdue. Headcount: 26 FTE, 2 open positions. Project delivery: 5 of 6 active projects on schedule, 1 delayed (see [[project-delay-meridian-redesign]]).

The 3 follow-up items from the previous meeting have partial resolution: Q1 revenue figures are now available, hiring plan draft exists in drive but is incomplete, client concentration analysis has not been started.

## Action Plan

1. **Compile board briefing document** (generate → pending)
   Generate a structured board briefing covering: Q1 financial summary (revenue, EBITDA, AR/AP, cash position), project portfolio status (6 active, 1 delayed), team update (26 FTE, 2 open positions), follow-up items from March meeting (Q1 actuals now available, hiring plan incomplete, concentration analysis not started), and key risks (Greenfield relationship cooling, Meridian project delay). Format as a professional 10-page PDF matching the March briefing structure.
   [preview: document]
   [assigned: anna-korsgaard]
   [params: {"title": "Board Briefing — Q1 2026 Review", "format": "pdf", "content": "BOARD BRIEFING — Q1 2026\\n\\nPrepared for: Board of Directors\\nPrepared by: Anna Korsgaard, CEO\\nDate: April 17, 2026\\n\\n─────────────────────────────────\\n\\n1. FINANCIAL SUMMARY (Q1 2026)\\n\\nRevenue: 4,200,000 DKK (target: 4,480,000 — 94% attainment)\\nEBITDA: 769,000 DKK (margin: 18.3%, up from 16.9% in Q4 2025)\\nCash position: 1,800,000 DKK\\nAccounts receivable: 1,100,000 DKK (of which 340,000 overdue)\\nAccounts payable: 620,000 DKK\\nNet working capital: 1,180,000 DKK\\n\\nRevenue gap analysis: The 280K shortfall is timing-related — two deals expected to close in March slipped to early April. Both are now signed. Q2 pipeline is healthy at 2.8M DKK weighted.\\n\\n2. PROJECT PORTFOLIO\\n\\n| Project | Client | Status | Due | Health |\\n|---|---|---|---|---|\\n| Operational review | Greenfield Corp | On track | May 15 | Amber |\\n| Website redesign | Meridian Solutions | Delayed | Apr 28 | Red |\\n| Logistics optimization | Northwave Logistics | On track | Jun 12 | Green |\\n| Reporting automation | Internal | Planning | TBD | — |\\n\\nMeridian delay: 8 days behind schedule due to UX scope creep. Revised timeline accepted by client. Change order pending signature (40 additional hours, unbudgeted).\\n\\nGreenfield risk: Lead consultant Emma Dalsgaard has resigned (last day May 9). Project deadline is May 15. Knowledge transfer plan being implemented. Line Vestergaard assigned as successor.\\n\\n3. TEAM UPDATE\\n\\nHeadcount: 26 FTE (target: 28)\\nOpen positions: 2 (Senior Consultant, Business Development)\\nDepartures: Emma Dalsgaard (Senior Consultant, effective May 9)\\nNew hires: Camilla Ravn (Business Development, started March 3)\\n\\nHiring plan status: Draft exists for Q3 but is incomplete. Needs review before finalizing.\\n\\n4. FOLLOW-UP ITEMS FROM MARCH MEETING\\n\\n| Item | Status | Notes |\\n|---|---|---|\\n| Q1 revenue target review | Complete | See Section 1. 94% attainment, gap is timing. |\\n| Q3 hiring plan | In progress | Draft incomplete. Target: finalize by May 1. |\\n| Client concentration risk | Not started | Top 3 clients = 58% of revenue. Analysis needed. |\\n\\n5. KEY RISKS\\n\\n1. Client concentration: Greenfield Corp (33%), Meridian (12%), Northwave (9%) = 54% of trailing 12-month revenue. Loss of Greenfield would be material.\\n2. Greenfield relationship: Response times from key stakeholder declining. No executive meeting since January. Recommend CEO-level outreach.\\n3. Knowledge loss: Emma Dalsgaard's departure removes the only logistics sector expertise. Handover plan in progress but timeline is tight.\\n4. Cash flow: 340K overdue receivables against 1.2M payroll on April 25. Manageable but requires active collection.\\n\\n6. Q2 OUTLOOK\\n\\nPipeline: 2.8M DKK weighted across 4 deals.\\nCapacity: Team utilization at 78%. Available capacity exists for 1 additional mid-size engagement.\\nPriorities: (1) Greenfield relationship stabilization, (2) Emma knowledge transfer, (3) Q3 hiring plan completion, (4) Client concentration mitigation strategy."}]

2. **Send agenda and briefing to board members** (generate → pending)
   Email to Erik Vestergaard, Karen Holm, and Thomas Bach with the proposed agenda and attached board briefing.
   [preview: email]
   [assigned: anna-korsgaard]
   [params: {"to": ["erik@vestergaard-advisory.dk", "karen@holm-advisory.dk", "thomas@bach-invest.dk"], "subject": "Board Meeting April 17 — Agenda and Briefing", "body": "Dear Board Members,\\n\\nPlease find attached the briefing document for our quarterly board meeting on Thursday, April 17 at 14:00.\\n\\nProposed agenda:\\n1. Q1 financial review (revenue at 94% of target, EBITDA margin 18.3%)\\n2. Project portfolio update — 5 of 6 on track, Meridian redesign delayed 8 days\\n3. Follow-up: Q3 hiring plan status (draft incomplete)\\n4. Client concentration risk — top 3 clients at 58% of revenue, Greenfield relationship flagged\\n5. Q2 outlook and priorities\\n\\nPlease let me know if you have any additions to the agenda.\\n\\nBest regards,\\nAnna Korsgaard"}]

3. **Flag incomplete hiring plan for review** (human_task → pending)
   The Q3 hiring plan draft in shared drive is incomplete (last edited March 22). Review and update before the meeting, or note it as "in progress" in the briefing.
   [preview: generic]
   [assigned: anna-korsgaard]

## Timeline
- 2026-04-14 09:12 — Detected: Board meeting in 3 days, no preparation activity found

## Playbook Reference
See [[board-meeting-preparation]] for standard preparation workflow. Previous meetings averaged 5 hours of preparation time with briefing sent 3-5 days in advance.`,
  },

  // ── 2. Client inquiry unanswered ────────────────────────
  {
    slug: "sit-client-inquiry",
    pageType: "situation_instance",
    title: "Client inquiry unanswered — Greenfield Corp, 4 days",
    properties: {
      situation_id: "demo-sit-client-inquiry",
      status: "proposed",
      severity: 0.82,
      confidence: 0.88,
      situation_type: "client-inquiry-unanswered",
      detected_at: "2026-04-14T11:30:00Z",
      source: "detected",
      assigned_to: "ida-frost",
      domain: "sales",
      current_step: 1,
      autonomy_level: "supervised",
      cycle_number: 1,
      after_batch: "monitor",
      resolution_type: "response_dependent",
      monitoring_criteria: {
        waitingFor: "Reply from James Thornton at Greenfield Corp",
        expectedWithinDays: 3,
        followUpAction: "Escalate to anna-korsgaard for CEO-level outreach",
      },
    },
    content: `# Client inquiry unanswered — Greenfield Corp, 4 days

| Property | Value |
|---|---|
| ID | demo-sit-client-inquiry |
| Status | Proposed |
| Severity | 0.82 |
| Confidence | 0.88 |
| Situation Type | [[client-inquiry-unanswered]] |
| Assigned To | [[ida-frost]] |
| Domain | [[sales]] |
| Detected | 2026-04-14 11:30 |
| Source | Detected |
| Current Step | 1 |

## Trigger
Email from James Thornton (COO, [[client-greenfield-corp]]) received April 10 at 15:22. Subject: "Q2 scope and timeline questions." Contains 3 specific questions about the ongoing operational review. No response sent from any company email address in 4 days.

## Context
[[client-greenfield-corp]] is the largest client by revenue (1.4M DKK annually). Relationship health is flagged as "at risk" — response times from their side have been declining over the past 3 weeks. The operational review project is led by [[emma-dalsgaard]] who has resigned (last day May 9). The 3 questions concern: (1) whether Q2 deliverables are on track given staffing changes, (2) a request for the interim findings summary, and (3) availability for an on-site workshop in May.

## Investigation
Searched all outbound communications to Greenfield Corp domain since April 10 — no responses found. [[ida-frost]] was out sick April 11-12, returned April 13 but the email appears buried. [[martin-bach]] mentioned it in #sales on April 11 ("Someone follow up with Thornton, Ida is out") but no action was taken. The interim findings summary referenced in question 2 exists as a draft in shared drive, last edited by [[emma-dalsgaard]] on April 8.

This client's historical average response time from our team is 4 hours. A 4-day gap is 24x the norm and represents a significant service failure for a top-tier account, especially during a period of declining relationship health.

## Action Plan

1. **Draft response to James Thornton** (generate → pending)
   Compose a response addressing all 3 questions from the original email. Acknowledge the delay without over-explaining. Address the staffing change proactively.
   [preview: email]
   [assigned: ida-frost]
   [params: {"to": "j.thornton@greenfield-corp.com", "subject": "Re: Q2 scope and timeline questions", "body": "Dear James,\\n\\nApologies for the delayed response — I wanted to ensure I had accurate answers to each of your questions.\\n\\n1. Q2 deliverables: We are on track. We have reallocated resources to ensure continuity through the transition, and Line Vestergaard will be joining the project team alongside the existing members to maintain momentum.\\n\\n2. Interim findings: Please find the latest interim findings summary attached. Emma completed the core analysis through March, and we are building on those results for the final deliverables.\\n\\n3. On-site workshop: We would be happy to arrange this. I have availability the weeks of May 5 and May 12. Would either of those work for your team? I will send a formal agenda once we confirm the date.\\n\\nPlease let me know if you have any additional questions.\\n\\nBest regards,\\nIda Frost"}]

2. **Schedule internal alignment on Greenfield transition** (api_action → pending)
   Create a 30-minute meeting with [[ida-frost]], [[emma-dalsgaard]], and [[sofie-nielsen]] to align on the Greenfield transition plan before the client workshop.
   [capability: Create Calendar Event]
   [preview: calendar_event]
   [assigned: ida-frost]
   [params: {"title": "Greenfield Corp — transition alignment", "startTime": "2026-04-20T10:00:00", "endTime": "2026-04-20T10:30:00", "attendees": ["ida@company.dk", "emma@company.dk", "sofie@company.dk"], "description": "Align on handover plan for Greenfield operational review before client workshop in May."}]

3. **Update relationship health notes** (human_task → pending)
   Update the [[client-greenfield-corp]] wiki page with current relationship assessment and next steps for the transition period.
   [preview: generic]
   [assigned: ida-frost]

## Timeline
- 2026-04-10 15:22 — Inbound email from James Thornton with 3 questions
- 2026-04-11 09:15 — Martin Bach flagged in #sales, no action taken
- 2026-04-14 11:30 — Detected: 4 days without response, high-value client

## Playbook Reference
See [[client-inquiry-unanswered]]. Historical performance: 6 of 7 detected inquiries resolved successfully with drafted responses.`,
  },

  // ── 3. Monthly report ───────────────────────────────────
  {
    slug: "sit-monthly-report",
    pageType: "situation_instance",
    title: "Monthly report not started — deadline tomorrow",
    properties: {
      situation_id: "demo-sit-monthly-report",
      status: "proposed",
      severity: 0.65,
      confidence: 0.95,
      situation_type: "monthly-report-deadline",
      detected_at: "2026-04-14T08:00:00Z",
      source: "detected",
      assigned_to: "lars-eriksen",
      domain: "finance",
      current_step: 1,
      autonomy_level: "supervised",
      cycle_number: 1,
      after_batch: "resolve",
      resolution_type: "self_resolving",
    },
    content: `# Monthly report not started — deadline tomorrow

| Property | Value |
|---|---|
| ID | demo-sit-monthly-report |
| Status | Proposed |
| Severity | 0.65 |
| Confidence | 0.95 |
| Situation Type | [[monthly-report-deadline]] |
| Assigned To | [[lars-eriksen]] |
| Domain | [[finance]] |
| Detected | 2026-04-14 08:00 |
| Source | Detected |
| Current Step | 1 |

## Trigger
Monthly management report for March is due April 15 (tomorrow). No draft document found in shared drive. The [[monthly-reporting]] process page indicates this report typically takes 12 hours across 3 people.

## Context
Report was originally due April 10 per the standard process but was informally delayed when [[lars-eriksen]] flagged he was prioritizing Q1 close. The board meeting on April 17 makes this report doubly important — key figures will be referenced in the board briefing. Historical pattern: 2 of the last 4 reports were delivered late (average delay: 3 days). [[anna-korsgaard]] has expressed frustration with reporting delays.

## Investigation
Checked connected systems for data availability. e-conomic: March financials fully reconciled (P&L, balance sheet, cash flow) — available for automated compilation. HubSpot: pipeline data current as of April 13 sync. Project status: available from [[sofie-nielsen]]'s weekly update email (April 12).

The 12 hours of manual work historically breaks down as: ~7 hours data gathering across 4 systems (automatable), ~3 hours formatting and layout, ~2 hours analysis and commentary. All data sources are connected and current — the report can be compiled automatically from connected systems with human review of the analysis sections.

## Action Plan

1. **Compile March management report** (generate → pending)
   Generate the standard monthly report from connected data sources: P&L and balance sheet from e-conomic, project portfolio status from latest delivery update, sales pipeline from HubSpot, headcount data from wiki. Use the February report structure as the format template. Include Q1 cumulative figures since this feeds the board briefing.
   [preview: document]
   [assigned: lars-eriksen]
   [params: {"title": "Monthly Management Report — March 2026", "format": "pdf", "content": "MONTHLY MANAGEMENT REPORT\\nMarch 2026\\n\\nPrepared by: Lars Eriksen, Finance Manager\\nDate: April 14, 2026\\n\\n─────────────────────────────────\\n\\n1. FINANCIAL SUMMARY\\n\\n| Metric | March 2026 | Feb 2026 | Q1 Total | Q1 Target | Attainment |\\n|---|---|---|---|---|---|\\n| Revenue | 1,480,000 | 1,390,000 | 4,200,000 | 4,480,000 | 94% |\\n| Cost of delivery | 890,000 | 860,000 | 2,590,000 | — | — |\\n| Gross margin | 590,000 | 530,000 | 1,610,000 | — | 38.3% |\\n| Operating expenses | 310,000 | 305,000 | 920,000 | — | — |\\n| EBITDA | 280,000 | 225,000 | 769,000 | — | 18.3% |\\n\\nCash position: 1,800,000 DKK (down from 2,100,000 in February)\\nAccounts receivable: 1,100,000 DKK\\n  — Current: 760,000\\n  — Overdue 1-30 days: 160,000 (Northwave 95K, Backstrom 65K)\\n  — Overdue 30+ days: 180,000 (Meridian Solutions)\\nAccounts payable: 620,000 DKK (all current)\\n\\nNote: Revenue gap vs target is timing — two deals closed in early April that were expected in March.\\n\\n2. PROJECT PORTFOLIO\\n\\n| Project | Client | Revenue | Utilization | Status |\\n|---|---|---|---|---|\\n| Operational review | Greenfield Corp | 420,000 | On plan | Amber — consultant departure risk |\\n| Website redesign | Meridian Solutions | 180,000 | Over budget | Red — 8 days delayed |\\n| Logistics optimization | Northwave Logistics | 95,000 | On plan | Green |\\n| Internal reporting | Internal | — | 12 hrs/month | Planning |\\n\\nTeam utilization (March): 78% (target: 80%)\\n  — Emma Dalsgaard: 95% (near capacity)\\n  — Line Vestergaard: 52% (available)\\n  — All others: 75-85% range\\n\\n3. SALES PIPELINE\\n\\n| Deal | Stage | Value | Expected Close | Owner |\\n|---|---|---|---|---|\\n| Greenfield Phase 2 | Proposal | 680,000 | Q3 | Martin Bach |\\n| New prospect (inbound) | Qualification | 350,000 | Q2 | Camilla Ravn |\\n| Northwave expansion | Discussion | 220,000 | Q3 | Ida Frost |\\n| Existing client upsell | Negotiation | 180,000 | Q2 | Jonas Kjaer |\\n\\nWeighted pipeline: 2,800,000 DKK\\nNew contacts added (March): 12\\nWin rate (trailing 12 months): 34%\\n\\n4. TEAM & HR\\n\\nHeadcount: 26 FTE\\nDepartures: Emma Dalsgaard (Senior Consultant, last day May 9)\\nNew hires: Camilla Ravn (BD, started March 3 — onboarding complete)\\nOpen positions: Senior Consultant, Business Development\\nSick days (March): 4 total across team\\n\\n5. KEY RISKS & ACTIONS\\n\\n1. Meridian overdue invoice (180K, 32 days) — follow-up sent, awaiting response\\n2. Greenfield relationship signals declining — CEO outreach recommended\\n3. Emma departure — knowledge transfer plan in progress\\n4. Monthly reporting process — 60% of effort is manual data gathering, automation opportunity identified\\n\\n6. OUTLOOK\\n\\nApril revenue forecast: 1,550,000 DKK (includes the two slipped March deals)\\nQ2 target: 4,800,000 DKK\\nKey dates: Payroll April 25 (1.2M), VAT filing July 1, annual audit prep begins May 1"}]

2. **Send report to Anna for review** (generate → pending)
   Email the compiled report to Anna with a summary of key highlights and any data points requiring her input before board distribution.
   [preview: email]
   [assigned: lars-eriksen]
   [params: {"to": "anna@company.dk", "subject": "March Management Report — for review", "body": "Hi Anna,\\n\\nAttached is the March management report. Key highlights:\\n\\n- Q1 revenue: 4.2M DKK (94% of target)\\n- EBITDA margin: 18.3% (up from 16.9% in Q4)\\n- AR aging: 340K DKK overdue (3 invoices, collection in progress)\\n- Project delivery: 5 of 6 on schedule, Meridian delayed 8 days\\n- Pipeline: 2.8M DKK weighted (4 active deals)\\n\\nTwo items need your input before I distribute to the board:\\n1. Commentary on the Q1 revenue gap (280K below target) — is this timing or structural?\\n2. Your assessment of the Greenfield relationship for the risk section\\n\\nLet me know if you'd like any changes.\\n\\nBest,\\nLars"}]

## Timeline
- 2026-04-14 08:00 — Detected: Monthly report due tomorrow, no draft found

## Playbook Reference
See [[monthly-report-deadline]]. This situation type has been detected twice before — both times the compiled report was approved and sent within 2 hours of generation.`,
  },

  // ── 4. Overdue invoices ─────────────────────────────────
  {
    slug: "sit-overdue-invoices",
    pageType: "situation_instance",
    title: "3 overdue invoices — payroll in 9 days",
    properties: {
      situation_id: "demo-sit-overdue-invoices",
      status: "proposed",
      severity: 0.74,
      confidence: 0.91,
      situation_type: "overdue-invoice-collection",
      detected_at: "2026-04-14T07:30:00Z",
      source: "detected",
      assigned_to: "lars-eriksen",
      domain: "finance",
      current_step: 1,
      autonomy_level: "supervised",
      cycle_number: 1,
      after_batch: "monitor",
      resolution_type: "response_dependent",
      monitoring_criteria: {
        waitingFor: "Payment or response from Meridian Solutions",
        expectedWithinDays: 7,
        followUpAction: "Escalate to anna-korsgaard for executive outreach",
      },
    },
    content: `# 3 overdue invoices — payroll in 9 days

| Property | Value |
|---|---|
| ID | demo-sit-overdue-invoices |
| Status | Proposed |
| Severity | 0.74 |
| Confidence | 0.91 |
| Situation Type | [[overdue-invoice-collection]] |
| Assigned To | [[lars-eriksen]] |
| Domain | [[finance]] |
| Detected | 2026-04-14 07:30 |
| Source | Detected |
| Current Step | 1 |

## Trigger
3 invoices overdue with a combined value of 340K DKK. Next payroll (1.2M DKK) due April 25 — 9 business days away. Current cash position: 1.8M DKK. Post-payroll cash drops to 600K DKK against 620K in accounts payable if nothing is collected.

## Context
Overdue breakdown:
- [[client-meridian-solutions]]: 180K DKK, 32 days overdue. First late payment in the relationship. One reminder sent 10 days ago, no response. Client also has a delayed project — may indicate internal budget pressure.
- [[client-northwave-logistics]]: 95K DKK, 21 days overdue. Payment terms: 30 days net. Client historically pays day 28-35. Within normal pattern.
- Backstrom & Partners: 65K DKK, 18 days overdue. Small client, irregular project work. No prior late payments. No reminder sent.

## Investigation
Analyzed payment history patterns across all 3 clients. [[client-northwave-logistics]] has a consistent pattern of paying between day 28-35 — their invoice is not yet concerning and will likely clear within the week without intervention. [[client-meridian-solutions]] has always paid within 18 days previously — the 32-day delay combined with project delivery issues is a genuine anomaly warranting direct follow-up. Backstrom has no established pattern (only 2 prior invoices, both on time).

Cash flow forecast: even if only the Northwave invoice (95K) arrives by April 25, post-payroll cash position would be 695K — tight but sufficient. The Meridian invoice is the critical one to accelerate.

## Action Plan

1. **Send personalized follow-up to Meridian Solutions** (generate → pending)
   Direct email to the finance contact at [[client-meridian-solutions]]. Professional and firm but not aggressive. Do not mention the project delay — keep the invoice conversation separate.
   [preview: email]
   [assigned: lars-eriksen]
   [params: {"to": "accounts@meridian-solutions.dk", "subject": "Invoice #2847 — payment status inquiry", "body": "Dear Accounts Team,\\n\\nI am writing regarding invoice #2847 for 180,000 DKK, issued on March 13 with payment terms of 14 days net. The invoice is now 32 days outstanding.\\n\\nWe sent a reminder on April 4 but have not received a response. Could you please confirm whether the invoice is being processed, or if there are any issues we should be aware of?\\n\\nFor your reference, I have attached a copy of the original invoice.\\n\\nPlease do not hesitate to contact me directly if you need any additional information.\\n\\nBest regards,\\nLars Eriksen\\nFinance Manager"}]

2. **Send first reminder to Backstrom & Partners** (generate → pending)
   Friendly first reminder with invoice details. Standard tone — no prior issues with this client.
   [preview: email]
   [assigned: maria-svendsen]
   [params: {"to": "info@backstrom-partners.dk", "subject": "Friendly reminder — Invoice #2859", "body": "Dear Backstrom & Partners,\\n\\nThis is a friendly reminder regarding invoice #2859 for 65,000 DKK, issued on March 27. The payment due date was April 10.\\n\\nIf payment has already been arranged, please disregard this message. Otherwise, we would appreciate payment at your earliest convenience.\\n\\nA copy of the invoice is attached for your reference.\\n\\nBest regards,\\nMaria Svendsen\\nBookkeeper"}]

3. **Monitor Northwave — no action needed** (human_task → pending)
   [[client-northwave-logistics]] payment pattern suggests payment will arrive by April 21. Monitor only. Escalate if not received by April 23.
   [preview: generic]
   [assigned: lars-eriksen]

## Timeline
- 2026-04-14 07:30 — Detected: 3 invoices overdue (340K DKK combined), payroll in 9 days`,
  },

  // ── 5. Knowledge transfer ───────────────────────────────
  {
    slug: "sit-knowledge-transfer",
    pageType: "situation_instance",
    title: "Employee resigned — knowledge transfer required",
    properties: {
      situation_id: "demo-sit-knowledge-transfer",
      status: "proposed",
      severity: 0.85,
      confidence: 0.90,
      situation_type: "knowledge-transfer-required",
      detected_at: "2026-04-13T14:00:00Z",
      source: "detected",
      assigned_to: "sofie-nielsen",
      domain: "delivery",
      current_step: 1,
      autonomy_level: "supervised",
      cycle_number: 1,
      after_batch: "re_evaluate",
      resolution_type: "self_resolving",
    },
    content: `# Employee resigned — knowledge transfer required

| Property | Value |
|---|---|
| ID | demo-sit-knowledge-transfer |
| Status | Proposed |
| Severity | 0.85 |
| Confidence | 0.90 |
| Situation Type | [[knowledge-transfer-required]] |
| Assigned To | [[sofie-nielsen]] |
| Domain | [[delivery]] |
| Detected | 2026-04-13 14:00 |
| Source | Detected |
| Current Step | 1 |

## Trigger
[[emma-dalsgaard]] (Senior Consultant) submitted resignation on April 2. Last working day: May 9. No formal knowledge transfer plan has been created. 25 working days remain. Emma holds critical knowledge in 4 areas that lack backup or documentation.

## Context
Emma has been with the company for 3.5 years. She is the only team member with deep logistics sector expertise, which underpins the [[client-northwave-logistics]] engagement and informed the methodology used in 2 completed projects. She currently leads the [[client-greenfield-corp]] operational review (due May 15 — 6 days after her last day). [[line-vestergaard]] has been identified as a partial successor but is a junior consultant without sector expertise.

No exit interview has been scheduled. No documentation sprint has been initiated. Emma's calendar shows she is fully booked with project work through May 9 — no time has been allocated for knowledge transfer.

## Investigation
Mapped Emma's knowledge footprint across all connected systems:

**Client relationships at risk:**
- [[client-greenfield-corp]] — primary analyst. Stakeholder relationships with COO and 3 operations managers. Project handover gap of 6 working days between Emma's departure and project deadline.
- [[client-northwave-logistics]] — methodology author. Not on the active project team but consulted weekly by [[mikkel-toft]].

**Undocumented knowledge:**
- Logistics optimization framework — used in 3 projects, never formally documented. Exists only in Emma's working files and experience.
- Client-specific data models and analysis templates — stored on Emma's local drive, not in shared drive.
- Junior consultant onboarding methodology — Emma informally trains new analysts, process not documented.

**Documented knowledge (lower risk):**
- Project deliverables for completed engagements — in shared drive.
- Standard analysis templates — in shared drive (but logistics-specific variants are local only).

Estimated total knowledge transfer effort: 30-40 hours (8-10 structured sessions plus documentation time). With 25 working days remaining, this requires immediate scheduling to avoid critical knowledge loss.

## Action Plan

1. **Generate structured handover plan** (generate → pending)
   Create a detailed handover document listing all knowledge areas, assigned successors, session topics, and deadlines. Prioritize by risk: Greenfield project continuity first (immediate), logistics methodology second (before departure), client relationships third (introduction meetings).
   [preview: document]
   [assigned: sofie-nielsen]
   [params: {"title": "Knowledge Transfer Plan — Emma Dalsgaard", "format": "pdf", "content": "KNOWLEDGE TRANSFER PLAN\\nEmma Dalsgaard → Team\\n\\nDeparture date: May 9, 2026\\nWorking days remaining: 25\\nPlan owner: Sofie Nielsen, Head of Delivery\\n\\n─────────────────────────────────\\n\\nPRIORITY 1: CRITICAL (Complete by April 25)\\n\\n1.1 Greenfield Corp Project Continuity\\n    Successor: Line Vestergaard\\n    Session: 90-min walkthrough (week 16)\\n    Covers: Current project status, deliverable pipeline, stakeholder map,\\n    data models, analysis methodology for this engagement\\n    Deliverable: Written project status document + stakeholder contact list\\n    Risk if missed: 6-day gap between Emma's departure and project deadline\\n\\n1.2 Logistics Optimization Methodology\\n    Successor: Mikkel Toft\\n    Session: 120-min deep-dive (week 16)\\n    Covers: Framework overview, tool selection rationale, data collection\\n    templates, analysis process, benchmarking approach\\n    Deliverable: Documented methodology guide (written by Emma)\\n    Risk if missed: Company loses only logistics sector capability\\n\\nPRIORITY 2: HIGH (Complete by May 2)\\n\\n2.1 Client Relationship Introductions\\n    Successor: Ida Frost\\n    Session: 60-min briefing (week 17)\\n    Covers: Greenfield stakeholder relationships (COO + 3 ops managers),\\n    Northwave stakeholder context, communication preferences\\n    Deliverable: Relationship notes added to client wiki pages\\n\\n2.2 Local Files Migration\\n    Owner: Emma Dalsgaard\\n    Deadline: End of week 17\\n    Scope: All local working files, analysis templates, client-specific\\n    data models moved to shared drive\\n    Structure: /Knowledge Transfer/Emma Dalsgaard/ with subfolders\\n\\nPRIORITY 3: IMPORTANT (Complete by May 7)\\n\\n3.1 Junior Consultant Onboarding Process\\n    Successor: Sofie Nielsen\\n    Session: 90-min documentation session (week 18)\\n    Covers: Current informal onboarding approach, recommended reading,\\n    first-project checklist, mentoring structure\\n    Deliverable: Written onboarding guide\\n\\n3.2 Final Q&A and Gap Check\\n    Participants: Emma, Sofie, Line, Mikkel\\n    Session: 60-min review (week 19)\\n    Covers: Verify all handover items complete, identify remaining gaps,\\n    agree on post-departure contact protocol\\n\\nSCHEDULE OVERVIEW\\n\\n| Week | Session | Duration | Participants |\\n|---|---|---|---|\\n| 16 | Greenfield walkthrough | 90 min | Emma, Line, Sofie |\\n| 16 | Logistics methodology | 120 min | Emma, Mikkel |\\n| 17 | Client introductions | 60 min | Emma, Ida |\\n| 17 | Files migration deadline | — | Emma |\\n| 18 | Onboarding documentation | 90 min | Emma, Sofie |\\n| 19 | Final Q&A | 60 min | Emma, Sofie, Line, Mikkel |\\n\\nTotal handover time: ~8 hours of structured sessions + documentation work\\n\\nESCALATION\\nIf any Priority 1 item is not completed by April 25, escalate to Anna Korsgaard immediately. Greenfield project continuity cannot be compromised."}]

2. **Schedule handover sessions** (api_action → pending)
   Create 6 calendar events over the next 3 weeks: (1) Greenfield project walkthrough with Line Vestergaard — week 16, (2) Logistics methodology deep-dive with Mikkel Toft — week 16, (3) Client relationship introductions with Ida Frost — week 17, (4) Local files migration and template handover — week 17, (5) Junior onboarding process documentation — week 18, (6) Final Q&A and gap check — week 19.
   [capability: Create Calendar Event]
   [preview: calendar_event]
   [assigned: sofie-nielsen]
   [params: {"events": [{"title": "Knowledge Transfer: Greenfield project walkthrough", "startTime": "2026-04-13T10:00:00", "endTime": "2026-04-13T11:30:00", "attendees": ["emma@company.dk", "line@company.dk", "sofie@company.dk"]}, {"title": "Knowledge Transfer: Logistics methodology", "startTime": "2026-04-15T13:00:00", "endTime": "2026-04-15T15:00:00", "attendees": ["emma@company.dk", "mikkel@company.dk"]}, {"title": "Knowledge Transfer: Client introductions", "startTime": "2026-04-20T14:00:00", "endTime": "2026-04-20T15:00:00", "attendees": ["emma@company.dk", "ida@company.dk"]}, {"title": "Knowledge Transfer: Files & templates migration", "startTime": "2026-04-22T10:00:00", "endTime": "2026-04-22T11:00:00", "attendees": ["emma@company.dk", "sofie@company.dk"]}, {"title": "Knowledge Transfer: Onboarding process documentation", "startTime": "2026-04-28T09:00:00", "endTime": "2026-04-28T10:30:00", "attendees": ["emma@company.dk", "sofie@company.dk"]}, {"title": "Knowledge Transfer: Final Q&A", "startTime": "2026-05-07T11:00:00", "endTime": "2026-05-07T12:00:00", "attendees": ["emma@company.dk", "sofie@company.dk", "line@company.dk", "mikkel@company.dk"]}]}]

3. **Request local file migration** (generate → pending)
   Email to Emma requesting that all local working files, analysis templates, and client-specific data models be moved to the shared drive by end of week 16.
   [preview: email]
   [assigned: sofie-nielsen]
   [params: {"to": "emma@company.dk", "subject": "File migration request — handover preparation", "body": "Hi Emma,\\n\\nAs part of the knowledge transfer process, could you please move the following files from your local drive to the shared drive by end of this week?\\n\\n1. Logistics optimization framework and methodology notes\\n2. Client-specific data models (Greenfield, Northwave, and any completed projects)\\n3. Analysis templates — especially the logistics-specific variants\\n4. Any working files related to the Greenfield operational review\\n\\nI have created a folder structure in the shared drive under /Knowledge Transfer/Emma Dalsgaard/ with subfolders for each category.\\n\\nPlease let me know if you need any help with this, or if there are files I have not listed that should be included.\\n\\nThanks,\\nSofie"}]

4. **Schedule exit interview** (human_task → pending)
   [[anna-korsgaard]] should schedule a 45-minute exit interview with Emma to understand departure reasons and capture strategic feedback. This is separate from the knowledge transfer sessions.
   [preview: generic]
   [assigned: anna-korsgaard]

## Timeline
- 2026-04-02 — Emma Dalsgaard submitted resignation
- 2026-04-13 14:00 — Detected: 11 days since resignation, no handover plan created, 25 working days remaining

## Playbook Reference
See [[knowledge-transfer-required]]. First occurrence of this situation type — no historical performance data available.`,
  },
];

// ══════════════════════════════════════════════════════════
// SITUATION TYPES (5 pages)
// ══════════════════════════════════════════════════════════

export const SITUATION_TYPE_PAGES: PromoPage[] = [
  {
    slug: "board-meeting-preparation",
    pageType: "situation_type",
    title: "Board Meeting Preparation",
    properties: { domain: "management", enabled: true, autonomy_level: "supervised", approval_rate: 1, total_proposed: 3, total_approved: 3, consecutive_approvals: 3, detected_count: 3, confirmed_count: 3, dismissed_count: 0 },
    content: `# Board Meeting Preparation\n\n## Detection Criteria\nTriggers when a board meeting is detected in calendar within 5 days AND no preparation activity is found (no briefing document created, no agenda email sent, no board-related communication in the last 7 days).\n\n## Playbook\n1. Compile financial summary from accounting system\\n2. Gather project status from delivery team\\n3. Draft briefing document with standard sections\\n4. Send agenda and briefing to board members\\n5. Flag any unresolved follow-up items from previous meeting\n\n## Responsible People\n[[anna-korsgaard]] — primary. CEO prepares and presents.\n\n## Resolution Patterns\nAll 3 prior instances resolved by generating the briefing + sending agenda email. Average time saved: ~5 hours.\n\n## Active Instances\nSee [[sit-board-meeting]].\n\n## Recent Resolved\nMarch 2026: briefing compiled and sent 4 days before meeting.\\nFebruary 2026: briefing compiled and sent 5 days before meeting.\n\n## Known Edge Cases\nNone documented yet.`,
  },
  {
    slug: "client-inquiry-unanswered",
    pageType: "situation_type",
    title: "Client Inquiry Unanswered",
    properties: { domain: "sales", enabled: true, autonomy_level: "supervised", approval_rate: 0.86, total_proposed: 7, total_approved: 6, consecutive_approvals: 4, detected_count: 7, confirmed_count: 6, dismissed_count: 1 },
    content: `# Client Inquiry Unanswered\n\n## Detection Criteria\nTriggers when an inbound client email containing a question, request, or action item has not received a response within 48 hours. Excludes automated emails, newsletters, and cc-only messages. Severity increases with client value and days elapsed.\n\n## Playbook\n1. Identify the original inquiry and extract key questions\\n2. Assemble relevant context (project status, recent interactions, account history)\\n3. Draft a response addressing each question\\n4. Route to the assigned account manager for review and send\n\n## Responsible People\n[[ida-frost]], [[jonas-kjaer]] — account managers. [[martin-bach]] — escalation.\n\n## Resolution Patterns\n6 of 7 resolved by drafted response. 1 dismissed (already handled via phone).\n\n## Active Instances\nSee [[sit-client-inquiry]].\n\n## Recent Resolved\nNone in last 14 days.\n\n## Known Edge Cases\nPhone/meeting resolution not visible in email — check calendar and Slack before flagging.`,
  },
  {
    slug: "monthly-report-deadline",
    pageType: "situation_type",
    title: "Monthly Report Deadline",
    properties: { domain: "finance", enabled: true, autonomy_level: "supervised", approval_rate: 1, total_proposed: 2, total_approved: 2, consecutive_approvals: 2, detected_count: 2, confirmed_count: 2, dismissed_count: 0 },
    content: `# Monthly Report Deadline\n\n## Detection Criteria\nTriggers when the monthly reporting deadline is within 24 hours AND no draft document has been created or updated in the current reporting period.\n\n## Playbook\n1. Pull financial data from accounting connector\\n2. Pull project status from delivery\\n3. Pull pipeline data from CRM\\n4. Compile into standard report format\\n5. Route to [[lars-eriksen]] for review\n\n## Responsible People\n[[lars-eriksen]] — owner. [[sofie-nielsen]], [[martin-bach]] — contributors.\n\n## Resolution Patterns\nBoth prior instances resolved by automated compilation + human review. Average time saved: ~8 hours.\n\n## Active Instances\nSee [[sit-monthly-report]].\n\n## Recent Resolved\nFebruary 2026: compiled and sent within 2 hours of detection.\n\n## Known Edge Cases\nQ4/annual reports require additional sections not in the standard template.`,
  },
  {
    slug: "overdue-invoice-collection",
    pageType: "situation_type",
    title: "Overdue Invoice Collection",
    properties: { domain: "finance", enabled: true, autonomy_level: "supervised", approval_rate: 1, total_proposed: 4, total_approved: 4, consecutive_approvals: 4, detected_count: 4, confirmed_count: 4, dismissed_count: 0 },
    content: `# Overdue Invoice Collection\n\n## Detection Criteria\nTriggers when one or more invoices exceed payment terms by more than 14 days AND the combined overdue amount exceeds 50K DKK. Severity escalates with total overdue amount, proximity to payroll, and client payment history.\n\n## Playbook\n1. Prioritize invoices by urgency (amount, age, client history)\\n2. Check for existing communication about each invoice\\n3. Draft differentiated follow-up emails\\n4. Flag cash flow impact if overdue amount threatens upcoming obligations\n\n## Responsible People\n[[lars-eriksen]] — owner. [[maria-svendsen]] — execution.\n\n## Resolution Patterns\nAll 4 prior instances resolved. Average collection acceleration: 6 days.\n\n## Active Instances\nSee [[sit-overdue-invoices]].\n\n## Recent Resolved\nMarch 2026: 2 invoices collected within 5 days of follow-up.\n\n## Known Edge Cases\nClients with known seasonal payment patterns (e.g. construction firms) should not be flagged during their off-season.`,
  },
  {
    slug: "knowledge-transfer-required",
    pageType: "situation_type",
    title: "Knowledge Transfer Required",
    properties: { domain: "delivery", enabled: true, autonomy_level: "supervised", approval_rate: 0, total_proposed: 1, total_approved: 0, consecutive_approvals: 0, detected_count: 1, confirmed_count: 0, dismissed_count: 0 },
    content: `# Knowledge Transfer Required\n\n## Detection Criteria\nTriggers when an employee departure is detected AND the departing person owns critical knowledge, client relationships, or project responsibilities that lack documented backup.\n\n## Playbook\n1. Map all knowledge, relationships, and responsibilities held by the departing person\\n2. Identify gaps — what has no backup, no documentation, no successor\\n3. Propose a structured handover plan with specific sessions and deadlines\\n4. Create calendar invitations for handover meetings\\n5. Track completion of handover items\n\n## Responsible People\n[[sofie-nielsen]] — delivery departures. [[martin-bach]] — sales departures.\n\n## Resolution Patterns\nFirst occurrence — no historical data.\n\n## Active Instances\nSee [[sit-knowledge-transfer]].\n\n## Recent Resolved\nNone.\n\n## Known Edge Cases\nContractors and part-time employees may not trigger resignation signals through normal email patterns.`,
  },
];

// ══════════════════════════════════════════════════════════
// DOMAIN HUBS (4 pages)
// ══════════════════════════════════════════════════════════

export const DOMAIN_PAGES: PromoPage[] = [
  {
    slug: "management",
    pageType: "domain_hub",
    title: "Management",
    properties: { lead: "anna-korsgaard", member_count: 1, department_type: "department" },
    content: `# Management\n\n## Overview\nExecutive leadership and strategic oversight. Responsible for company direction, board relations, client portfolio strategy, and cross-department coordination.\n\n## Team\n[[anna-korsgaard]] — CEO & Founder.\n\n## Processes\nQuarterly board meetings and reporting. Annual strategy and budget cycle. Key client relationship oversight (accounts above 500K DKK).\n\n## Tools & Systems\nGoogle Calendar, Gmail, Google Drive, HubSpot (executive dashboard).\n\n## Active Situations\nSee [[sit-board-meeting]].\n\n## Key Relationships\n[[client-greenfield-corp]] — largest client, CEO-level relationship.\\n[[erik-vestergaard]] — board chair.\n\n## Performance & Patterns\nBoard briefing preparation has been inconsistent — last two briefings sent less than 48 hours before the meeting. Client concentration: top 3 clients represent 58% of revenue.`,
  },
  {
    slug: "sales",
    pageType: "domain_hub",
    title: "Sales & Client Relations",
    properties: { lead: "martin-bach", member_count: 4, department_type: "department" },
    content: `# Sales & Client Relations\n\n## Overview\nClient acquisition, account management, and revenue growth. Full client lifecycle from outreach through renewal.\n\n## Team\n[[martin-bach]] — Sales Director. [[ida-frost]] — Senior Account Manager. [[jonas-kjaer]] — Account Manager. [[camilla-ravn]] — Business Development.\n\n## Processes\nPipeline review (weekly). Client QBRs. Proposal process. Renewal management.\n\n## Tools & Systems\nHubSpot CRM, Gmail, Google Calendar.\n\n## Active Situations\nSee [[sit-client-inquiry]].\n\n## Key Relationships\n[[client-greenfield-corp]] — 1.4M DKK, at risk. [[client-northwave-logistics]] — 380K DKK, healthy. [[client-meridian-solutions]] — 520K DKK, strained.\n\n## Performance & Patterns\nQ1 new revenue: 1.1M DKK (92% of target). Win rate: 34%. Average sales cycle: 42 days. Retention: 91%.`,
  },
  {
    slug: "delivery",
    pageType: "domain_hub",
    title: "Delivery & Projects",
    properties: { lead: "sofie-nielsen", member_count: 6, department_type: "department" },
    content: `# Delivery & Projects\n\n## Overview\nProject execution, client delivery, and quality assurance.\n\n## Team\n[[sofie-nielsen]] — Head of Delivery. [[thomas-wind]] — Senior PM. [[emma-dalsgaard]] — Senior Consultant (departing May 9). [[mikkel-toft]] — Consultant. [[line-vestergaard]] — Junior Consultant. [[peter-holm]] — Analyst.\n\n## Processes\nProject kick-off. Weekly delivery standup. Client status updates. Resource allocation.\n\n## Tools & Systems\nJira, Google Drive, Google Calendar, Slack.\n\n## Active Situations\nSee [[sit-knowledge-transfer]].\n\n## Key Relationships\n[[client-greenfield-corp]] — active operational review. [[client-meridian-solutions]] — website redesign (delayed). [[client-northwave-logistics]] — logistics optimization.\n\n## Performance & Patterns\nUtilization: 78%. [[emma-dalsgaard]] at 95% (near capacity). [[line-vestergaard]] at 52% (available). Meridian redesign delayed 8 days due to scope creep.`,
  },
  {
    slug: "finance",
    pageType: "domain_hub",
    title: "Finance & Administration",
    properties: { lead: "lars-eriksen", member_count: 3, department_type: "department" },
    content: `# Finance & Administration\n\n## Overview\nFinancial management, invoicing, payroll, compliance, and office administration.\n\n## Team\n[[lars-eriksen]] — Finance Manager. [[maria-svendsen]] — Bookkeeper. [[nina-lund]] — Office Manager.\n\n## Processes\n[[monthly-reporting]] — monthly management report. Invoicing (e-conomic). Payroll (25th monthly). VAT reporting (quarterly). Annual audit.\n\n## Tools & Systems\ne-conomic, Google Drive, Gmail.\n\n## Active Situations\nSee [[sit-overdue-invoices]], [[sit-monthly-report]].\n\n## Key Relationships\nExternal auditor (BDO). Bank relationship.\n\n## Performance & Patterns\nQ1 revenue: 4.2M DKK (94% target). EBITDA: 18.3%. Cash: 1.8M DKK. AR: 1.1M DKK (340K overdue). Monthly reports delivered late 2 of last 4 months.`,
  },
];

// ══════════════════════════════════════════════════════════
// PERSON PROFILES (17 pages)
// ══════════════════════════════════════════════════════════

export const PERSON_PAGES: PromoPage[] = [
  { slug: "anna-korsgaard", pageType: "person_profile", title: "Anna Korsgaard", properties: { role: "CEO & Founder", department: "management", email: "anna@company.dk", status: "active" },
    content: `# Anna Korsgaard\n\n## Role & Responsibilities\nFounder and CEO. Leads company strategy, board relations, and manages the top 5 client relationships directly. Final decision-maker on hires, pricing, and engagements above 500K DKK.\n\n## Expertise & Strengths\nStrategic advisory, client relationship management, board governance.\n\n## Active Situations\n[[sit-board-meeting]] — board meeting preparation.\n\n## Key Relationships\n[[erik-vestergaard]] (board chair), [[martin-bach]] (sales director), [[sofie-nielsen]] (head of delivery), [[client-greenfield-corp]] (primary relationship).\n\n## Processes\nBoard briefing preparation. Monthly financial review with [[lars-eriksen]]. Weekly project review with [[sofie-nielsen]].\n\n## Performance Notes\nHighly responsive (avg reply: 22 min). Calendar typically 70-80% booked; this week at 92%.\n\n## History Traces\nBoard briefing pattern: authored personally, takes ~6 hours, sent 3-5 days before meeting.` },
  { slug: "martin-bach", pageType: "person_profile", title: "Martin Bach", properties: { role: "Sales Director", department: "sales", email: "martin@company.dk", status: "active", reports_to: "anna-korsgaard" },
    content: `# Martin Bach\n\n## Role & Responsibilities\nLeads the sales team. Owns pipeline management, pricing decisions under 500K DKK, and client retention strategy.\n\n## Expertise & Strengths\nSales strategy, client retention, pipeline management.\n\n## Active Situations\nNone currently assigned.\n\n## Key Relationships\n[[ida-frost]], [[client-greenfield-corp]], [[client-northwave-logistics]].\n\n## Processes\nWeekly pipeline review. CRM updates (Friday afternoons).\n\n## Performance Notes\nAverage reply time: 35 minutes. Prefers Slack internal, email client-facing.\n\n## History Traces\nOnboarding [[camilla-ravn]] (started 6 weeks ago).` },
  { slug: "sofie-nielsen", pageType: "person_profile", title: "Sofie Nielsen", properties: { role: "Head of Delivery", department: "delivery", email: "sofie@company.dk", status: "active", reports_to: "anna-korsgaard" },
    content: `# Sofie Nielsen\n\n## Role & Responsibilities\nOwns project delivery, resource allocation, and client escalations. Manages a team of 5.\n\n## Expertise & Strengths\nProject management, resource planning, client escalation.\n\n## Active Situations\n[[sit-knowledge-transfer]] — knowledge transfer for [[emma-dalsgaard]].\n\n## Key Relationships\n[[thomas-wind]], [[emma-dalsgaard]], [[client-meridian-solutions]].\n\n## Processes\nWeekly project review with [[anna-korsgaard]]. Resource allocation.\n\n## Performance Notes\nCurrently managing Meridian redesign delay and Emma's departure planning.\n\n## History Traces\nEvaluating contractor options for capacity gap in weeks 18-22.` },
  { slug: "lars-eriksen", pageType: "person_profile", title: "Lars Eriksen", properties: { role: "Finance Manager", department: "finance", email: "lars@company.dk", status: "active", reports_to: "anna-korsgaard" },
    content: `# Lars Eriksen\n\n## Role & Responsibilities\nFinancial management, budgeting, cash flow forecasting, and management reporting. Coordinates with external auditor.\n\n## Expertise & Strengths\nFinancial analysis, cash flow management, reporting.\n\n## Active Situations\n[[sit-overdue-invoices]], [[sit-monthly-report]].\n\n## Key Relationships\n[[maria-svendsen]] (bookkeeper), [[anna-korsgaard]], external auditor (BDO).\n\n## Processes\n[[monthly-reporting]] — owner. Invoice follow-up (escalation after 30 days).\n\n## Performance Notes\nMethodical communicator, prefers email with documentation. March report delayed.\n\n## History Traces\nSends monthly financial summary to Anna by the 10th.` },
  { slug: "emma-dalsgaard", pageType: "person_profile", title: "Emma Dalsgaard", properties: { role: "Senior Consultant", department: "delivery", email: "emma@company.dk", status: "active", reports_to: "sofie-nielsen" },
    content: `# Emma Dalsgaard\n\n## Role & Responsibilities\nLead consultant on complex engagements. Specializes in process optimization and operational analysis. Only team member with deep logistics sector expertise.\n\n## Expertise & Strengths\nLogistics optimization, process analysis, operational reviews.\n\n## Active Situations\nSubject of [[sit-knowledge-transfer]].\n\n## Key Relationships\n[[client-greenfield-corp]] (primary analyst), [[client-northwave-logistics]] (methodology), [[line-vestergaard]] (mentee).\n\n## Processes\nLogistics optimization framework (undocumented). Junior consultant onboarding (informal).\n\n## Performance Notes\nResigned April 2. Last day: May 9. No counteroffer made. Utilization at 95%.\n\n## History Traces\n3.5 years tenure. Led 5 completed engagements. Knowledge at risk: logistics methodology, client data models, onboarding process.` },
  { slug: "ida-frost", pageType: "person_profile", title: "Ida Frost", properties: { role: "Senior Account Manager", department: "sales", email: "ida@company.dk", status: "active", reports_to: "martin-bach" },
    content: `# Ida Frost\n\n## Role & Responsibilities\nManages 8 active client accounts. Primary contact for [[client-greenfield-corp]] (day-to-day) and [[client-northwave-logistics]].\n\n## Expertise & Strengths\nAccount management, client relations, renewal negotiations.\n\n## Active Situations\n[[sit-client-inquiry]] — unanswered Greenfield email.\n\n## Key Relationships\n[[client-greenfield-corp]], [[client-northwave-logistics]], [[martin-bach]].\n\n## Processes\nClient QBRs. Renewal conversations (under 300K independently).\n\n## Performance Notes\nFlagged declining Greenfield response times 2 weeks ago. Was sick April 11-12.\n\n## History Traces\nHandles most renewals independently for accounts under 300K DKK.` },
  { slug: "thomas-wind", pageType: "person_profile", title: "Thomas Wind", properties: { role: "Senior Project Manager", department: "delivery", email: "thomas.w@company.dk", status: "active", reports_to: "sofie-nielsen" },
    content: `# Thomas Wind\n\n## Role & Responsibilities\nManages 3 active projects including [[project-delay-meridian-redesign]].\n\n## Expertise & Strengths\nProject management, client delivery.\n\n## Active Situations\nNone currently assigned.\n\n## Key Relationships\n[[sofie-nielsen]], [[client-meridian-solutions]].\n\n## Processes\nProject delivery, client status updates.\n\n## Performance Notes\nCurrently handling Meridian delay. Planned vacation week 20.\n\n## History Traces\nApproved scope additions on Meridian without formal change order — scope creep.` },
  { slug: "maria-svendsen", pageType: "person_profile", title: "Maria Svendsen", properties: { role: "Bookkeeper", department: "finance", email: "maria@company.dk", status: "active", reports_to: "lars-eriksen" },
    content: `# Maria Svendsen\n\n## Role & Responsibilities\nInvoicing, accounts payable/receivable, bank reconciliation, e-conomic administration.\n\n## Expertise & Strengths\nBookkeeping, AP/AR, e-conomic.\n\n## Active Situations\nNone currently assigned.\n\n## Key Relationships\n[[lars-eriksen]].\n\n## Processes\nInvoicing cycle. Bank reconciliation. Vendor payments.\n\n## Performance Notes\nNo notes.\n\n## History Traces\nNo notable traces.` },
  { slug: "nina-lund", pageType: "person_profile", title: "Nina Lund", properties: { role: "Office Manager", department: "finance", email: "nina@company.dk", status: "active", reports_to: "anna-korsgaard" },
    content: `# Nina Lund\n\n## Role & Responsibilities\nFacilities, vendor management, HR administration, compliance tracking.\n\n## Expertise & Strengths\nAdministration, compliance, HR.\n\n## Active Situations\nNone.\n\n## Key Relationships\n[[anna-korsgaard]].\n\n## Processes\nVendor management. Compliance tracking.\n\n## Performance Notes\nNo notes.\n\n## History Traces\nNo notable traces.` },
  { slug: "jonas-kjaer", pageType: "person_profile", title: "Jonas Kjaer", properties: { role: "Account Manager", department: "sales", email: "jonas.k@company.dk", status: "active", reports_to: "martin-bach" },
    content: `# Jonas Kjaer\n\n## Role & Responsibilities\nManages 5 mid-market accounts.\n\n## Expertise & Strengths\nAccount management, mid-market sales.\n\n## Active Situations\nNone.\n\n## Key Relationships\n[[martin-bach]], [[client-meridian-solutions]].\n\n## Processes\nClient management, proposal support.\n\n## Performance Notes\nNo notes.\n\n## History Traces\nNo notable traces.` },
  { slug: "camilla-ravn", pageType: "person_profile", title: "Camilla Ravn", properties: { role: "Business Development", department: "sales", email: "camilla@company.dk", status: "active", reports_to: "martin-bach" },
    content: `# Camilla Ravn\n\n## Role & Responsibilities\nInbound qualification, outreach campaigns, CRM hygiene. Started 6 weeks ago.\n\n## Expertise & Strengths\nLead generation, CRM.\n\n## Active Situations\nNone.\n\n## Key Relationships\n[[martin-bach]].\n\n## Processes\nInbound qualification. Outreach campaigns.\n\n## Performance Notes\nNew hire, onboarding.\n\n## History Traces\nNo notable traces.` },
  { slug: "mikkel-toft", pageType: "person_profile", title: "Mikkel Toft", properties: { role: "Consultant", department: "delivery", email: "mikkel@company.dk", status: "active", reports_to: "sofie-nielsen" },
    content: `# Mikkel Toft\n\n## Role & Responsibilities\nAssigned to 2 active projects.\n\n## Expertise & Strengths\nConsulting, project delivery.\n\n## Active Situations\nNone.\n\n## Key Relationships\n[[sofie-nielsen]], [[emma-dalsgaard]] (consults weekly on logistics).\n\n## Processes\nProject delivery.\n\n## Performance Notes\nPulled from Northwave to support Meridian for 1 week.\n\n## History Traces\nNo notable traces.` },
  { slug: "line-vestergaard", pageType: "person_profile", title: "Line Vestergaard", properties: { role: "Junior Consultant", department: "delivery", email: "line@company.dk", status: "active", reports_to: "sofie-nielsen" },
    content: `# Line Vestergaard\n\n## Role & Responsibilities\nSupporting [[emma-dalsgaard]] on Greenfield engagement. Identified as partial successor.\n\n## Expertise & Strengths\nData analysis. Learning logistics methodology.\n\n## Active Situations\nNone.\n\n## Key Relationships\n[[emma-dalsgaard]] (mentor), [[sofie-nielsen]].\n\n## Processes\nProject support, data analysis.\n\n## Performance Notes\nUtilization at 52% — available for new assignments. Lacks logistics sector expertise.\n\n## History Traces\nNo notable traces.` },
  { slug: "peter-holm", pageType: "person_profile", title: "Peter Holm", properties: { role: "Analyst", department: "delivery", email: "peter@company.dk", status: "active", reports_to: "sofie-nielsen" },
    content: `# Peter Holm\n\n## Role & Responsibilities\nData analysis and reporting across projects.\n\n## Expertise & Strengths\nData analysis, reporting.\n\n## Active Situations\nNone.\n\n## Key Relationships\n[[sofie-nielsen]].\n\n## Processes\nProject data analysis.\n\n## Performance Notes\nNo notes.\n\n## History Traces\nNo notable traces.` },
  { slug: "erik-vestergaard", pageType: "person_profile", title: "Erik Vestergaard", properties: { role: "Board Chair (External)", department: "management", email: "erik@vestergaard-advisory.dk", status: "active" },
    content: `# Erik Vestergaard\n\n## Role & Responsibilities\nBoard chair. Quarterly meetings. Strategic advisory.\n\n## Expertise & Strengths\nCorporate governance, strategic advisory.\n\n## Active Situations\nNone.\n\n## Key Relationships\n[[anna-korsgaard]] — 1:1 every two weeks.\n\n## Processes\nBoard governance.\n\n## Performance Notes\nExternal board member.\n\n## History Traces\nNo notable traces.` },
  { slug: "karen-holm", pageType: "person_profile", title: "Karen Holm", properties: { role: "Board Member (External)", department: "management", email: "karen@holm-advisory.dk", status: "active" },
    content: `# Karen Holm\n\n## Role & Responsibilities\nBoard member. Financial oversight and audit committee.\n\n## Expertise & Strengths\nFinancial oversight, audit.\n\n## Active Situations\nNone.\n\n## Key Relationships\n[[anna-korsgaard]].\n\n## Processes\nBoard governance, audit oversight.\n\n## Performance Notes\nExternal board member.\n\n## History Traces\nNo notable traces.` },
  { slug: "thomas-bach-board", pageType: "person_profile", title: "Thomas Bach", properties: { role: "Board Member (External)", department: "management", email: "thomas@bach-invest.dk", status: "active" },
    content: `# Thomas Bach\n\n## Role & Responsibilities\nBoard member. Commercial strategy advisory.\n\n## Expertise & Strengths\nCommercial strategy.\n\n## Active Situations\nNone.\n\n## Key Relationships\n[[anna-korsgaard]].\n\n## Processes\nBoard governance.\n\n## Performance Notes\nExternal board member.\n\n## History Traces\nNo notable traces.` },
];

// ══════════════════════════════════════════════════════════
// CLIENT RELATIONSHIPS (3 pages)
// ══════════════════════════════════════════════════════════

export const CLIENT_PAGES: PromoPage[] = [
  { slug: "client-greenfield-corp", pageType: "external_relationship", title: "Greenfield Corp — Client Relationship",
    properties: { relationship_type: "client", status: "active", domain: "sales", account_owner: "ida-frost", risk_level: "high", annual_value: "1.4M DKK" },
    content: `# Greenfield Corp — Client Relationship\n\n## Overview\nLargest client by revenue. Management consultancy engagement covering operational reviews, process optimization, and strategic advisory. Relationship managed by [[anna-korsgaard]] (CEO-level) and [[ida-frost]] (day-to-day).\n\n## Key Contacts\nJames Thornton — COO. Primary stakeholder. Response time increasing.\n\n## Contract & Terms\nAnnual engagement. Renewal: Q3 (approximately 80 days). No formal contract renegotiation started.\n\n## Financial Summary\n2025: 1.4M DKK (3 projects). 2024: 1.1M DKK. 2023: 480K DKK. Growing relationship.\n\n## Communication Patterns\nResponse time from Thornton increased from 2h to 14h over 3 weeks. Last 3 emails shorter. No meeting scheduled in next 30 days.\n\n## Situation History\n[[sit-client-inquiry]] — unanswered email, 4 days.\n\n## Risk & Opportunities\n[[emma-dalsgaard]] departure creates delivery continuity risk. Response time pattern matches pre-churn behavior. No executive meeting since January.` },
  { slug: "client-meridian-solutions", pageType: "external_relationship", title: "Meridian Solutions — Client Relationship",
    properties: { relationship_type: "client", status: "active", domain: "sales", account_owner: "jonas-kjaer", risk_level: "medium", annual_value: "520K DKK" },
    content: `# Meridian Solutions — Client Relationship\n\n## Overview\nMid-market technology company. Current engagement: website redesign and digital strategy. Managed by [[jonas-kjaer]] (commercial), [[thomas-wind]] (delivery).\n\n## Key Contacts\nFinance team — unresponsive on invoice inquiry.\n\n## Contract & Terms\nProject-based engagement.\n\n## Financial Summary\nOutstanding invoice: 180K DKK, 32 days overdue. First late payment. Historically reliable (avg 18 days).\n\n## Communication Patterns\nNo response to invoice reminder sent 10 days ago.\n\n## Situation History\nReferenced in [[sit-overdue-invoices]].\n\n## Risk & Opportunities\nProject delay + overdue invoice is unusual — may indicate internal budget issues.` },
  { slug: "client-northwave-logistics", pageType: "external_relationship", title: "Northwave Logistics — Client Relationship",
    properties: { relationship_type: "client", status: "active", domain: "sales", account_owner: "ida-frost", risk_level: "low", annual_value: "380K DKK" },
    content: `# Northwave Logistics — Client Relationship\n\n## Overview\nRegional logistics company. Current engagement: logistics optimization and route planning analysis. Managed by [[ida-frost]] (commercial), [[mikkel-toft]] (delivery).\n\n## Key Contacts\nHenrik Madsen — COO. Responsive and engaged.\n\n## Contract & Terms\nProject-based. Payment terms: 30 days net.\n\n## Financial Summary\nOutstanding: 95K DKK, 21 days. Within normal payment pattern (day 28-35).\n\n## Communication Patterns\nHealthy. Regular engagement.\n\n## Situation History\nReferenced in [[sit-overdue-invoices]] (low urgency). [[emma-dalsgaard]] is methodology author.\n\n## Risk & Opportunities\nExpansion potential: warehouse optimization (discussed informally).` },
];

// ══════════════════════════════════════════════════════════
// PROCESS PAGES (2 pages)
// ══════════════════════════════════════════════════════════

export const PROCESS_PAGES: PromoPage[] = [
  { slug: "monthly-reporting", pageType: "process", title: "Monthly Management Reporting",
    properties: { owner: "lars-eriksen", domain: "finance", status: "active", frequency: "monthly", criticality: "high" },
    content: `# Monthly Management Reporting\n\n## Purpose\nMonthly management report compiled by [[lars-eriksen]] with input from all department heads. Covers financial summary, project portfolio status, sales pipeline, and key risks.\n\n## Steps\n1. Pull financial data from e-conomic (P&L, balance sheet, AR/AP, cash)\\n2. Collect project status from [[sofie-nielsen]]\\n3. Collect pipeline summary from [[martin-bach]]\\n4. Compile into standard report format\\n5. Review with [[anna-korsgaard]]\\n6. Distribute to board members\n\n## Roles & Responsibilities\n[[lars-eriksen]] — owner, financial compilation, distribution. [[sofie-nielsen]] — project status input. [[martin-bach]] — pipeline input.\n\n## Tools & Systems\ne-conomic, HubSpot, Google Drive, Gmail.\n\n## Quality Criteria\nDue by 10th of each month. All 4 data sources current. Format consistent with prior months.\n\n## Common Issues\n60% of work is data gathering (automatable). Format inconsistency between months. 2 of last 4 reports delivered late.\n\n## Related Processes\nBoard briefing preparation (consumes this report).\n\n## Situation Types\n[[monthly-report-deadline]].\n\n## Change History\nNo formal changes. Process has been informal since company founding.` },
  { slug: "project-delay-meridian-redesign", pageType: "process", title: "Project Delay — Meridian Redesign",
    properties: { owner: "thomas-wind", domain: "delivery", status: "active" },
    content: `# Project Delay — Meridian Redesign\n\n## Purpose\nTracking page for the Meridian Solutions website redesign delay.\n\n## Steps\nScope creep remediation. Revised timeline communication. Change order.\n\n## Roles & Responsibilities\n[[thomas-wind]] — project manager. [[sofie-nielsen]] — escalation. [[mikkel-toft]] — redeployed from Northwave.\n\n## Tools & Systems\nJira, Google Drive.\n\n## Quality Criteria\nRevised deadline April 28. Client acknowledged scope additions.\n\n## Common Issues\nScope additions approved without formal change order.\n\n## Related Processes\nProject delivery. Client status updates.\n\n## Situation Types\nNone currently linked.\n\n## Change History\nOriginal deadline: April 20. Revised: April 28. Root cause: UX scope creep.` },
];

// ══════════════════════════════════════════════════════════
// IDEAS (3 pages)
// ══════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════
// IDEA DASHBOARDS
// Payloads embedded into the three idea content strings below.
// Format: parseIdeaPage → parseDashboardSection (see idea-page-parser.ts).
// ══════════════════════════════════════════════════════════

const DASHBOARD_SCOPE_CREEP: IdeaDashboard = {
  cards: [
    {
      primitive: "impact_bar",
      span: 6,
      claim: "60–80% fewer unbudgeted hours per engagement",
      explanation:
        "Scope additions currently proceed without estimate or client signature. A change-order checkpoint converts informal expansion into budgeted work.",
      confidence: "medium",
      evidence: [
        {
          ref: "scope-creep-analysis",
          inferred: false,
          summary:
            "38 hrs/mo averaged across 3 active engagements last quarter",
        },
        {
          ref: null,
          inferred: true,
          summary:
            "Projected 8–15 hrs/mo based on change-order benchmarks in similar consultancies",
        },
      ],
      data: {
        baseline: { typicalValue: 38, unit: "hrs/mo" },
        projected: {
          typicalValue: 12,
          range: { low: 8, high: 15 },
          unit: "hrs/mo",
        },
        savings: {
          typicalValue: 26,
          unit: "hrs/mo",
          label: "recovered delivery capacity across active engagements",
        },
      },
    },
    {
      primitive: "entity_set",
      span: 6,
      claim: "4 engagements with unbilled scope drift · last 90 days",
      explanation:
        "All four expanded mid-engagement without a written amendment. Ranked by unbilled hours.",
      confidence: "high",
      evidence: [
        {
          ref: "engagement-ledger",
          inferred: false,
          summary:
            "Time entries tagged 'scope-change' aggregated per engagement",
        },
      ],
      data: {
        subtitle: "from past 90 days",
        entities: [
          {
            name: "Hansen-Meier Industri",
            slug: "hansen-meier",
            flag: "bad",
            metric: "+82 hrs",
            metricFlag: "bad",
          },
          {
            name: "Nordsø Logistik",
            flag: "warn",
            metric: "+54 hrs",
            metricFlag: "warn",
          },
          {
            name: "Baltica Retail",
            flag: "warn",
            metric: "+31 hrs",
            metricFlag: "warn",
          },
          {
            name: "Orsa Møbler",
            flag: "neutral",
            metric: "+12 hrs",
          },
        ],
      },
    },
    {
      primitive: "process_flow",
      span: 12,
      claim: "5-step change-order workflow with two mandatory checkpoints",
      explanation:
        "Quantification precedes client signature, which precedes any billable work. Both checkpoints are non-skippable.",
      confidence: "high",
      evidence: [
        {
          ref: "change-order-workflow",
          inferred: false,
          summary: "Draft workflow spec attached to this idea",
        },
      ],
      data: {
        steps: [
          { label: "Identify" },
          { label: "Quantify", checkpoint: true, note: "Estimate" },
          { label: "Client approval", checkpoint: true, note: "Signature" },
          { label: "Invoice update" },
          { label: "Track" },
        ],
      },
    },
  ],
};

const DASHBOARD_PROFITABILITY: IdeaDashboard = {
  cards: [
    {
      primitive: "conceptual_diagram",
      span: 6,
      claim: "Portfolio splits into three margin tiers, weighted toward low-margin foundation work",
      explanation:
        "Foundation-tier clients (<20% margin) make up more than half the portfolio but generate less than a quarter of profit. Tier framing would shift acquisition strategy.",
      confidence: "medium",
      evidence: [
        {
          ref: "client-ledger",
          inferred: false,
          summary:
            "Client P&L breakdown across 14 active engagements, last 12 months",
        },
        {
          ref: null,
          inferred: true,
          summary:
            "Tier thresholds are hypothesis — sample size of 14 is below the stability mark",
        },
      ],
      data: {
        variant: "tier_pyramid",
        tiers: [
          {
            label: "Strategic",
            count: 2,
            threshold: "≥35% margin",
            flag: "good",
          },
          {
            label: "Standard",
            count: 5,
            threshold: "20–35% margin",
            flag: "neutral",
          },
          {
            label: "Foundation",
            count: 7,
            threshold: "<20% margin",
            flag: "bad",
          },
        ],
      },
    },
    {
      primitive: "impact_bar",
      span: 6,
      claim: "Hypothetical lift if foundation tier rebalances: +6pp average margin",
      explanation:
        "Modeled scenario: if half of foundation-tier engagements are replaced with standard-tier work, blended margin improves from 19% to 25%. Highly speculative at current sample size.",
      confidence: "low",
      evidence: [
        {
          ref: null,
          inferred: true,
          summary: "Scenario model, no empirical basis in current portfolio data",
        },
      ],
      data: {
        baseline: { typicalValue: 19, unit: "%" },
        projected: {
          typicalValue: 25,
          range: { low: 21, high: 29 },
          unit: "%",
        },
      },
    },
  ],
};

const DASHBOARD_REPORTING: IdeaDashboard = {
  cards: [
    {
      primitive: "automation_loop",
      span: 12,
      claim: "Monthly KPI report cycle — 4-node flow replacing 38 hours of manual compilation",
      explanation:
        "Runs 1st of each month. Trust gradient: first two cycles route through operator approval before send; auto-sends after two clean cycles with anomaly-only escalation.",
      confidence: "high",
      evidence: [
        {
          ref: "reporting-time-audit",
          inferred: false,
          summary: "38 hrs/mo measured across 3 reporters over 4 months",
        },
        {
          ref: "reporting-template",
          inferred: false,
          summary:
            "Existing monthly format — 4 sections, data from 6 source systems",
        },
      ],
      data: {
        annotation:
          "First 2 cycles require operator approval before the Notify step. After 2 clean cycles, auto-sends with anomaly-only escalation.",
        nodes: [
          {
            icon: "trigger",
            title: "Trigger",
            sub: "1st of month\n09:00 CET",
          },
          {
            icon: "fetch",
            title: "Fetch",
            sub: "6 source systems\ne-conomic, Planday,\nHubSpot, Stripe,\nDinero, GSheets",
          },
          {
            icon: "compose",
            title: "Compose",
            sub: "4-section format\nflags deviations\n>15% vs 3-mo avg",
          },
          {
            icon: "notify",
            title: "Notify",
            sub: "4 recipients\nCEO, CFO, board,\ndelivery lead",
          },
        ],
      },
    },
    {
      primitive: "trend_or_distribution",
      span: 6,
      claim: "Manual reporting effort trending up 12 months running",
      explanation:
        "Hours spent compiling the monthly report have climbed 40% over the last year as source systems multiplied. Warning tint reflects the trajectory.",
      confidence: "medium",
      evidence: [
        {
          ref: "reporting-time-audit",
          inferred: false,
          summary: "Monthly hours logged under 'reporting' category",
        },
      ],
      data: {
        kind: "sparkline",
        headlineValue: 38,
        headlineUnit: "hrs",
        deltaLabel: "↑ from 27",
        flag: "warn",
        points: [27, 28, 26, 29, 30, 31, 32, 33, 34, 36, 37, 38],
        xAxisStart: "Apr 2025",
        xAxisEnd: "Mar 2026",
      },
    },
    {
      primitive: "trend_or_distribution",
      span: 6,
      claim: "Where the 38 hours go",
      explanation:
        "Data pull and formatting dominate the effort. Automation targets the primary slice — data pull — first.",
      confidence: "medium",
      evidence: [
        {
          ref: "reporting-time-audit",
          inferred: false,
          summary: "Task-level breakdown from reporter timesheets",
        },
      ],
      data: {
        kind: "donut",
        segments: [
          { label: "Data pull & aggregation", value: 14, flag: "primary" },
          { label: "Formatting & layout", value: 12, flag: "secondary" },
          { label: "Review & edit", value: 8, flag: "secondary" },
          { label: "Distribution", value: 4, flag: "tertiary" },
        ],
      },
    },
  ],
};

export const IDEA_PAGES: PromoPage[] = [
  {
    slug: "init-client-profitability",
    pageType: "idea",
    title: "Client profitability below margin threshold on 3 engagements",
    properties: {
      status: "proposed",
      proposal_type: "strategy_revision",
      severity: "high",
      owner: "anna-korsgaard",
      domain: "finance",
      priority: "high",
      proposed_date: "2026-04-12T00:00:00Z",
      expected_impact: "high",
      effort_estimate: "small",
      primary_deliverable: {
        type: "document",
        title: "Margin Recovery Plan",
        description: "A written plan with specific pricing and staffing adjustments for each of the three under-margin engagements (Greenfield, Meridian, Northwave), plus a rollout sequence.",
        rationale: "A single document consolidates the per-engagement interventions so Anna can review the full commercial picture in one place before approving client conversations.",
        proposedContent: "# Margin Recovery Plan — Q2 2026\n\n## Summary\nThree active engagements are operating below the 25% margin threshold, with a combined annualized margin gap of approximately 180K DKK. This plan proposes specific interventions per engagement to restore margin without damaging client relationships.\n\n## Engagement 1 — Greenfield Operational Review\n\n**Current state:** Billed 420K, actual cost 390K, margin 7.1% vs 25% target.\n\n**Root cause:** Underpriced relative to the senior resources deployed. Emma Dalsgaard (senior) carrying 95% utilization on this engagement.\n\n**Intervention:** Reprice Phase 2 renewal at a rate that reflects actual senior-consultant cost. Estimated margin recovery at renewal: 15–18 percentage points.\n\n**Owner:** Martin Bach (commercial conversation), Anna Korsgaard (final pricing approval).\n\n**Timing:** Before renewal conversation scheduled for May 2026.\n\n## Engagement 2 — Meridian Redesign\n\n**Current state:** 40 hours of unbudgeted scope creep, effective margin dropped to 11%.\n\n**Root cause:** UX scope additions approved verbally without change order.\n\n**Intervention:** Issue formal change order for the 40 unbudgeted hours at standard rate. Estimated recovery: 60K DKK. Client relationship expected to absorb this as standard commercial practice.\n\n**Owner:** Sofie Nielsen (client conversation), Lars Eriksen (invoice).\n\n**Timing:** Within 2 weeks.\n\n## Engagement 3 — Northwave Optimization\n\n**Current state:** On track at 22% margin, below the 25% threshold due to senior-consultant rate.\n\n**Root cause:** Senior consultant carrying established-methodology hours that a mid-level could handle.\n\n**Intervention:** Review staffing mix with Sofie Nielsen — replace senior hours with mid-level where methodology is documented. Estimated margin recovery: 3–5 percentage points.\n\n**Owner:** Sofie Nielsen (staffing plan).\n\n**Timing:** Before next sprint, approximately 3 weeks.\n\n## Expected combined impact\n\nAnnualized margin recovery: 120–180K DKK. No client relationship risk if handled as standard commercial process.\n\n## Follow-up\n\nAfter implementation, review project selection criteria to prevent similar underpricing patterns in future engagements.",
      },
    },
    content: `# Client profitability below margin threshold on 3 engagements

## Trigger
Cross-referencing billing data with project time tracking revealed 3 active engagements operating below the company's 25% margin threshold. Combined margin gap represents approximately 180K DKK in annual margin erosion if patterns continue.

## Evidence
- Greenfield operational review: billed 420K, actual cost 390K — margin 7.1% vs 25% target
- Meridian redesign: 40 hours unbudgeted scope creep, effective margin dropped to 11%
- Northwave optimization: on track at 22% margin but below 25% threshold due to senior consultant rate

${buildDashboardSection(DASHBOARD_PROFITABILITY)}
## Investigation
Analyzed project profitability across all active engagements by cross-referencing e-conomic billing data with time tracking and resource allocation. Three engagements are below the 25% target margin. The root causes differ: Greenfield is underpriced relative to the senior resources deployed, Meridian suffered scope creep without a change order, and Northwave uses a senior consultant where a mid-level could handle established methodology steps.

## Proposal
1. Renegotiate Meridian scope with formal change order to recover 40 unbudgeted hours (estimated recovery: 60K DKK)
2. Adjust Greenfield Phase 2 pricing to reflect actual delivery costs before renewal conversation
3. Review Northwave staffing mix with [[sofie-nielsen]] — replace senior hours with mid-level where methodology is established

## Primary Deliverable
Margin recovery plan with specific pricing and staffing adjustments per engagement.

## Downstream Effects
Improved project selection criteria for future engagements. Establishes precedent for mandatory change orders on scope additions.

## Impact Assessment
Estimated margin recovery: 120-180K DKK annually. Meridian change order alone would recover 60K. No client relationship risk if handled as standard commercial process.

## Alternatives Considered
- Accept current margins and absorb the gap — rejected, sets a precedent for underpricing
- Reduce delivery quality to hit margins — rejected, damages client relationships and reputation

## Timeline
- 2026-04-12 — Pattern detected from billing analysis
- 2026-04-14 — Idea proposed`,
  },
  {
    slug: "init-reporting-automation",
    pageType: "idea",
    title: "Monthly reporting costs 38 hours/month — 60% automatable",
    properties: {
      status: "proposed",
      proposal_type: "process_creation",
      severity: "medium",
      owner: "lars-eriksen",
      domain: "finance",
      priority: "medium",
      proposed_date: "2026-04-13T00:00:00Z",
      expected_impact: "high",
      effort_estimate: "medium",
      primary_deliverable: {
        type: "wiki_create",
        targetPageSlug: "automated-monthly-report-compilation",
        targetPageType: "system_job",
        title: "Automated Monthly Report Compilation",
        description: "A new system_job page that defines a scheduled job running on the 8th of each month, pulling financial, project, and pipeline data from connected sources and generating a draft management report for review.",
        rationale: "Codifying the compilation as a system job turns a 38-hour recurring manual process into a scheduled automation with a single human review step, eliminating coordination overhead and late-report risk.",
        proposedContent: "# Automated Monthly Report Compilation\n\n## Purpose\n\nProduce a draft monthly management report on the 8th of each month by automatically compiling data from connected business systems, routing the draft to the finance manager for analysis commentary, and distributing the final version to management and the board.\n\n## Trigger\n\nScheduled — runs on the 8th calendar day of each month at 06:00 CET.\n\n## Inputs\n\n- **e-conomic connector** — previous month's financial summary (revenue, costs, EBITDA, AR aging, cash position)\n- **Project tracking (wiki + internal DB)** — project status, utilization, delivery health\n- **HubSpot connector** — pipeline summary (deals by stage, weighted value, new contacts added)\n- **Wiki (headcount pages)** — team changes, departures, new hires\n\n## Steps\n\n1. **Gather** — pull financial summary from e-conomic\n2. **Gather** — compile project status from project tracking and wiki\n3. **Gather** — compile pipeline summary from HubSpot\n4. **Gather** — compile team update from wiki person pages\n5. **Generate** — produce draft report in the standard management-report format\n6. **Route** — send draft to Lars Eriksen (finance manager) for review and commentary, awaiting approval\n7. **Distribute** — send approved final report to Anna Korsgaard and the board distribution list\n\n## Outputs\n\n- PDF report stored in Qorpera\n- Email distribution to recipients listed above\n- Wiki page updated at `/wiki/monthly-management-report` with a link to the month's PDF\n\n## Owners\n\n- **System owner:** Lars Eriksen (finance manager)\n- **Escalation contact:** Anna Korsgaard (CEO)\n\n## Expected savings\n\nApproximately 23 hours/month of productive capacity across 3 senior staff. Estimated cost savings: 28K DKK/month.\n\n## Failure mode\n\nIf any input connector is unavailable at trigger time, the job retries every hour for 8 hours and then notifies the system owner. Draft is never sent incomplete.",
      },
    },
    content: `# Monthly reporting costs 38 hours/month — 60% automatable

## Trigger
Activity analysis detected that 3 people spend a combined 38 hours every month compiling the same recurring management report from the same connected data sources. The data gathering portion (60% of effort) is fully automatable.

## Evidence
- [[lars-eriksen]] spends ~6 hours/month on financial data gathering from e-conomic — data is available via connected API
- [[sofie-nielsen]] spends ~3 hours/month compiling project status — data exists in project tracking and wiki
- [[martin-bach]] spends ~3 hours/month on pipeline summary — data is current in HubSpot connector
- [[monthly-reporting]] process page documents 12 hours direct effort, 2 of last 4 reports delivered late
- Coordination overhead adds ~26 hours/month (waiting for inputs, follow-up emails, revision cycles)

${buildDashboardSection(DASHBOARD_REPORTING)}
## Investigation
Mapped the end-to-end monthly reporting process. The 38 total hours break down as: 12 hours of direct compilation work (7 hours data gathering + 3 hours formatting + 2 hours analysis), plus 26 hours of coordination overhead (email follow-ups between departments, waiting for inputs, revision cycles). The data gathering portion pulls from 4 systems that are all connected to Qorpera: e-conomic (financials), HubSpot (pipeline), project tracking (delivery status), and wiki (headcount/team data).

## Proposal
Create an automated report compilation system job that runs on the 8th of each month:
1. Auto-pull financial summary from e-conomic connector
2. Auto-compile project status from wiki and delivery data
3. Auto-compile pipeline summary from HubSpot connector
4. Generate draft report in the standard format
5. Route to [[lars-eriksen]] for review and analysis commentary
6. Distribute final version to [[anna-korsgaard]] and board

## Primary Deliverable
System job configuration and report template that produces a draft monthly report automatically.

## Downstream Effects
Eliminates the primary cause of late reports. Frees 23 hours/month of productive capacity across 3 senior staff. Creates a consistent report format every month.

## Impact Assessment
Time savings: ~23 hours/month (60% of 38 hours). Reliability: reports delivered on time every month. Cost savings: approximately 28K DKK/month in recovered productive hours.

## Alternatives Considered
- Hire a junior analyst to compile reports — rejected, adds headcount cost and doesn't solve the data gathering problem
- Simplify the report format — rejected, board and management rely on the current level of detail

## Timeline
- 2026-04-13 — Pattern detected from activity analysis
- 2026-04-14 — Idea proposed`,
  },
  {
    slug: "init-scope-creep-process",
    pageType: "idea",
    title: "Recurring delivery delays on same project type — scope creep pattern detected",
    properties: {
      status: "proposed",
      proposal_type: "process_creation",
      severity: "medium",
      owner: "sofie-nielsen",
      domain: "delivery",
      priority: "high",
      proposed_date: "2026-04-13T00:00:00Z",
      expected_impact: "medium",
      effort_estimate: "small",
      primary_deliverable: {
        type: "wiki_create",
        targetPageSlug: "change-order-workflow",
        targetPageType: "process",
        title: "Change Order Workflow",
        description: "A new process page defining the mandatory workflow for any scope addition on client engagements: template, approval gates, client sign-off, and KPI tracking.",
        rationale: "The recurring pattern of scope creep in UX phases is structural — it recurs because there is no process to stop it. A documented workflow with a mandatory checkpoint converts a cultural norm into an operational standard.",
        proposedContent: "# Change Order Workflow\n\n## Purpose\n\nEnsure every scope addition on a client engagement is captured, quantified, priced, and approved by the client before work begins. This prevents unbudgeted hours, timeline slippage, and margin erosion caused by informal scope expansion.\n\n## When this process applies\n\nTriggered when any of the following occurs on an active engagement:\n\n- Client requests work outside the original statement of work\n- Project manager identifies a scope gap that requires additional hours to close\n- An internal decision adds hours to the delivery estimate (e.g., adding a research phase)\n\n## Steps\n\n1. **Identify** — project manager flags the scope addition in the project wiki page with a one-line description\n2. **Quantify** — project manager estimates additional hours, timeline impact, and cost using the change-order template\n3. **Internal review** — engagement lead (Sofie Nielsen or Thomas Wind) approves or adjusts the estimate before it reaches the client\n4. **Client approval** — change order sent to the client sponsor with the scope, hours, cost, and timeline impact. Must be signed before work begins.\n5. **Invoice update** — finance manager updates the engagement's billing plan once the change order is countersigned\n6. **Track** — change order logged against the engagement's KPI dashboard\n\n## Change order template\n\nThe change-order document must include:\n\n- Engagement name and contract reference\n- Description of the scope addition\n- Estimated additional hours (by role)\n- Timeline impact (days added to original delivery date)\n- Additional cost (DKK)\n- Client sponsor signature block\n- Qorpera counter-signature block\n\n## Owners\n\n- **Process owner:** Sofie Nielsen (delivery lead)\n- **Escalation:** Anna Korsgaard (CEO) for disputed change orders\n\n## KPI\n\nChange order compliance rate: percentage of scope additions that followed this workflow vs informal scope creep. Target: 100%.\n\n## Rollout\n\n- Brief all project managers on the workflow within 2 weeks of process approval\n- Apply retroactively to the Meridian engagement (40 unbudgeted hours)\n- Review compliance rate monthly for the first quarter, then quarterly",
      },
    },
    content: `# Recurring delivery delays on same project type — scope creep pattern detected

## Trigger
Situation history analysis revealed that website and digital projects consistently experience scope creep during the UX phase, causing delivery delays. The Meridian redesign is the third instance of this pattern in 12 months.

## Evidence
- Meridian redesign delayed 8 days due to UX scope additions approved without change order
- 2 of 3 website/digital projects in the last 12 months experienced similar scope creep in the UX phase
- No formal change order process exists — scope additions are approved verbally by project managers
- See [[project-delay-meridian-redesign]] for the current instance

${buildDashboardSection(DASHBOARD_SCOPE_CREEP)}
## Investigation
Analyzed delivery timelines across all projects in the last 12 months. Website and digital projects show a consistent pattern: client requests additional UX research or design iterations during the UX phase, project managers approve to maintain client satisfaction, but no formal change order is created. This results in unbudgeted hours, timeline delays, and margin erosion. The pattern is structural — it recurs because there is no process to prevent it.

## Proposal
Implement a mandatory change order workflow for all scope additions:
1. Create a change order template (hours estimate, timeline impact, cost, client approval field)
2. Add a scope change checkpoint to the project delivery process wiki page
3. Brief project managers ([[thomas-wind]], [[sofie-nielsen]]) on the new workflow
4. Retroactively apply to the Meridian engagement — draft change order for the 40 unbudgeted hours
5. Track change order compliance as a delivery KPI

## Primary Deliverable
Change order template and updated project delivery process page.

## Downstream Effects
Protects project margins. Creates a paper trail for scope changes. Gives project managers a framework to push back on unbounded client requests without damaging the relationship.

## Impact Assessment
Expected reduction in delivery delays: 60-80% for affected project types. Margin protection: prevents 40-80 unbudgeted hours per project. No client friction — change orders are standard commercial practice.

## Alternatives Considered
- Add buffer time to all project estimates — rejected, masks the root cause and inflates pricing
- Refuse all scope changes — rejected, damages client relationships

## Timeline
- 2026-04-13 — Pattern detected from situation history analysis
- 2026-04-14 — Idea proposed`,
  },
];

// ══════════════════════════════════════════════════════════
// PROJECT PAGES
// ══════════════════════════════════════════════════════════

export const PROJECT_PAGES: PromoPage[] = [
  {
    slug: "proj-launch-marketing-plan",
    pageType: "project_portfolio",
    title: "Launch Marketing Plan",
    properties: {
      status: "active",
      owner: "camilla-ravn",
      domain: "sales",
      priority: "high",
      start_date: "2026-04-01",
      target_date: "2026-09-30",
    },
    content: `# Launch Marketing Plan

## Purpose & Scope

Coordinate the marketing and go-to-market workstreams for an upcoming service offering launch planned for late Q3 2026. Success criteria: positioning and messaging finalized by end of Q2, launch assets production complete by end of August, beachhead campaign live by target launch date, first 10 qualified pipeline opportunities generated within 30 days of launch.

**Included:** Brand positioning, messaging development, launch asset production (website, collateral, sales enablement), campaign planning, launch event planning, internal rollout.

**Not included:** Product/service offering definition (handled separately), pricing decisions (sign-off by [[anna-korsgaard]] outside this portfolio), post-launch demand generation (separate portfolio after launch).

## Child Projects

Individual workstreams tracked as child projects under this portfolio:

1. [[proj-brand-messaging]] — Brand + Messaging. Positioning, value proposition, messaging pillars, competitor comparison. Target complete: end of Q2.
2. [[proj-launch-asset-production]] — Launch Asset Production. Website, one-pager, sales deck, demo script, case study templates. Target complete: end of August.
3. [[proj-beachhead-campaign]] — Beachhead Campaign. Target account list, outreach sequences, content calendar, paid placement plan. Launch: target launch date.
4. [[proj-launch-event]] — Launch Event. In-person event for first-wave customers and partners. Target: within two weeks of launch.

## Team

- [[camilla-ravn]] — Portfolio owner (Business Development)
- [[anna-korsgaard]] — Executive sponsor
- [[martin-bach]] — Sales input on positioning and messaging
- [[ida-frost]] — Customer-facing messaging review

External vendors (creative agency, web development) to be selected during scoping.

## Timeline & Milestones

- **2026-04-15** — Portfolio kicked off
- **2026-05-01** — Brand + Messaging workstream scoped and staffed
- **2026-06-30** — Positioning and messaging locked
- **2026-07-15** — Launch Asset Production in full execution
- **2026-08-31** — Launch assets complete, beachhead campaign in final prep
- **2026-09-15** — Soft launch (invite-only briefings)
- **2026-09-30** — Full launch

## Risks & Issues

- **Headcount capacity** — [[camilla-ravn]] is the only full-time Business Development resource. If the portfolio scope expands, external support will be needed by July.
- **Sales bandwidth during launch** — Expect pipeline conversations to consume 20-30% of [[martin-bach]]'s time through October. Existing client commitments need to be sequenced.
- **Vendor selection timeline** — Creative and web development vendors not yet selected. If selection slips past end of April, the Asset Production workstream compresses.

## Decisions

No formal decisions logged yet. This section will fill as child project work generates material trade-offs.

## Status Updates

- **2026-04-15** — Portfolio created. Initial scoping started. Owner: [[camilla-ravn]]. Sponsor: [[anna-korsgaard]].`,
  },

  {
    slug: "proj-brand-messaging",
    pageType: "project",
    title: "Brand + Messaging",
    properties: {
      status: "planned",
      owner: "camilla-ravn",
      domain: "sales",
      priority: "high",
      start_date: "2026-05-01",
      target_date: "2026-06-30",
      parent_project: "proj-launch-marketing-plan",
    },
    content: `# Brand + Messaging

## Objective

Define the positioning, value proposition, and messaging framework for the upcoming service offering launch. Lock brand tone, competitive differentiation, and messaging pillars before Launch Asset Production begins. Success criteria: approved positioning statement, messaging pillars with voice guidelines, and competitor comparison matrix ready to hand off to design and sales enablement workstreams by end of Q2.

## Scope

**Included:** Positioning statement development, value proposition framing, messaging pillars, voice and tone guidelines, competitor comparison matrix, internal messaging validation with sales team.

**Not included:** Visual identity (handled in [[proj-launch-asset-production]]), sales collateral (handled in Asset Production), pricing narratives (sign-off by [[anna-korsgaard]]).

## Team

- [[camilla-ravn]] — Project owner, primary author
- [[martin-bach]] — Sales review and validation
- [[ida-frost]] — Customer-voice checkpoint
- [[anna-korsgaard]] — Executive sign-off on positioning

## Deliverables

1. [[del-positioning-statement]] — Positioning statement
2. [[del-messaging-pillars]] — Messaging pillars and voice guidelines
3. [[del-competitor-comparison]] — Competitor comparison matrix

## Timeline & Milestones

- **2026-05-01** — Kickoff, competitor research begins
- **2026-05-15** — Draft positioning statement circulated
- **2026-06-05** — Messaging pillars v1 complete
- **2026-06-20** — Sales team validation session
- **2026-06-30** — Positioning and messaging locked, handoff to Asset Production

## Risks & Issues

- **Competitor landscape shifting** — Two competitors preparing launches in overlapping window. Positioning may need late adjustments if their messaging lands first.
- **Sales validation bandwidth** — [[martin-bach]] is in active client delivery through mid-May; validation session may slip if his calendar tightens.

## Decisions

No decisions logged yet. Awaiting project start.

## Related Situations

No detected situations currently.

## Status Updates

- **2026-04-15** — Project planned as child of [[proj-launch-marketing-plan]]. Kickoff scheduled for May 1.`,
  },

  {
    slug: "proj-launch-asset-production",
    pageType: "project",
    title: "Launch Asset Production",
    properties: {
      status: "planned",
      owner: "camilla-ravn",
      domain: "sales",
      priority: "high",
      start_date: "2026-07-01",
      target_date: "2026-08-31",
      parent_project: "proj-launch-marketing-plan",
    },
    content: `# Launch Asset Production

## Objective

Produce the full set of launch assets: website, service one-pager, sales deck, demo script, and case study templates. All assets must reflect locked positioning and messaging from [[proj-brand-messaging]]. Success criteria: website live in preview mode, sales deck approved for use, one-pager and demo script in sales hands before beachhead campaign launches.

## Scope

**Included:** Website copy and build (vendor-led), service one-pager, sales deck, demo script, case study templates (3 variants), asset library on shared drive.

**Not included:** Positioning and messaging development (handled in [[proj-brand-messaging]]), paid media creative (handled in [[proj-beachhead-campaign]]), launch event materials (handled in [[proj-launch-event]]).

## Team

- [[camilla-ravn]] — Project owner, content lead
- [[martin-bach]] — Sales deck and demo script owner
- [[anna-korsgaard]] — Final approval on website and sales deck
- External creative agency (TBD) — Design and web development

## Deliverables

1. [[del-website]] — Launch website
2. [[del-sales-deck]] — Sales deck
3. [[del-one-pager]] — Service one-pager

## Timeline & Milestones

- **2026-07-01** — Kickoff, vendor selection finalized
- **2026-07-15** — Content wireframes and sales deck outline approved
- **2026-08-01** — Website draft v1 in preview, sales deck v1 ready for review
- **2026-08-20** — One-pager final, demo script rehearsed
- **2026-08-31** — All assets production-complete, handoff to beachhead

## Risks & Issues

- **Vendor selection slip** — If creative and web vendor not confirmed by end of April ([[proj-launch-marketing-plan]] dependency), this workstream's start date compresses.
- **Messaging handoff gap** — Depends on [[proj-brand-messaging]] locking positioning by June 30. Any slip pushes this workstream's start back.
- **[[camilla-ravn]] capacity** — Running Brand + Messaging and Asset Production concurrently for two weeks in late June. External support may be needed.

## Decisions

No decisions logged yet. Awaiting project start.

## Related Situations

No detected situations currently.

## Status Updates

- **2026-04-15** — Project planned as child of [[proj-launch-marketing-plan]]. Start date depends on Brand + Messaging completion.`,
  },

  {
    slug: "proj-beachhead-campaign",
    pageType: "project",
    title: "Beachhead Campaign",
    properties: {
      status: "planned",
      owner: "martin-bach",
      domain: "sales",
      priority: "high",
      start_date: "2026-08-15",
      target_date: "2026-09-30",
      parent_project: "proj-launch-marketing-plan",
    },
    content: `# Beachhead Campaign

## Objective

Plan and execute a focused outbound campaign targeting a narrow segment of high-fit prospects ahead of full launch. Produce the target account list, outreach sequences, content calendar, and paid placement plan. Success criteria: target list approved, sequences ready for sales hands on launch date, content calendar populated through the first 6 weeks post-launch, first 10 qualified pipeline opportunities within 30 days.

## Scope

**Included:** Target account list (50-100 accounts), personalised outreach sequences, content calendar (blog, social, newsletter), paid placement on 2-3 channels, tracking and reporting setup.

**Not included:** Asset production (handled in [[proj-launch-asset-production]]), launch event (handled in [[proj-launch-event]]), post-launch demand generation.

## Team

- [[martin-bach]] — Project owner, target list and sequences
- [[ida-frost]] — Outreach execution, content calendar
- [[camilla-ravn]] — Content and paid placement coordination
- External paid media partner (TBD)

## Deliverables

1. [[del-target-account-list]] — Target account list
2. [[del-outreach-sequences]] — Outreach sequences
3. [[del-content-calendar]] — Content calendar

## Timeline & Milestones

- **2026-08-15** — Kickoff, target list criteria locked
- **2026-08-31** — Target list approved, sequences drafted
- **2026-09-10** — Content calendar populated, paid placement contracts signed
- **2026-09-15** — Soft launch outreach begins to invite-only accounts
- **2026-09-30** — Full launch, sequences activated, first opportunities tracked

## Risks & Issues

- **[[martin-bach]] capacity overlap** — Running beachhead concurrently with ongoing client delivery. Expect 20-30% of time consumed through October.
- **List quality** — Without a pre-existing validated ICP, target list accuracy depends on research cycles. May require a second pass if early responses are weak.
- **Paid channel timing** — Contracts on 2-3 channels need signing by September 10; any delay compresses the activation window.

## Decisions

No decisions logged yet. Awaiting project start.

## Related Situations

No detected situations currently.

## Status Updates

- **2026-04-15** — Project planned as child of [[proj-launch-marketing-plan]]. Start date depends on Asset Production nearing completion.`,
  },

  {
    slug: "proj-launch-event",
    pageType: "project",
    title: "Launch Event",
    properties: {
      status: "planned",
      owner: "camilla-ravn",
      domain: "sales",
      priority: "high",
      start_date: "2026-09-01",
      target_date: "2026-10-15",
      parent_project: "proj-launch-marketing-plan",
    },
    content: `# Launch Event

## Objective

Organise an in-person launch event for first-wave customers, partners, and a small number of press contacts. The event anchors the launch narrative, generates qualified conversations, and produces assets (photos, quotes, short-form video) for use in post-launch demand generation. Success criteria: 40-60 attendees, event runs without operational issues, 8-12 qualified conversations produced, post-event content package ready within two weeks.

## Scope

**Included:** Venue and logistics, invitation list, presentation deck, run-of-show, on-site content capture plan, post-event follow-up sequence.

**Not included:** Ongoing campaign execution (handled in [[proj-beachhead-campaign]]), core launch assets (handled in [[proj-launch-asset-production]]).

## Team

- [[camilla-ravn]] — Project owner, event production
- [[anna-korsgaard]] — Keynote presenter
- [[martin-bach]] — Invitation list and on-site conversations
- [[ida-frost]] — Post-event follow-up sequence
- External event coordinator (TBD)

## Deliverables

1. [[del-event-plan]] — Event plan and run-of-show
2. [[del-invite-list]] — Invitation list
3. [[del-presentation-deck]] — Presentation deck

## Timeline & Milestones

- **2026-09-01** — Kickoff, venue shortlist confirmed
- **2026-09-15** — Venue contract signed, invitations sent
- **2026-09-25** — RSVP count reviewed, final agenda locked
- **2026-10-05** — Event day
- **2026-10-15** — Post-event follow-up complete, content package delivered

## Risks & Issues

- **Venue availability** — Preferred Copenhagen venues book out 8-12 weeks in advance. Contract must be signed by mid-September.
- **RSVP volatility** — First-wave event RSVPs tend to confirm late. Expect 25-40% attrition from invited-to-attended.
- **Anna's keynote prep** — [[anna-korsgaard]] will also be running Q3 board cycle. Keynote rehearsal window is tight.

## Decisions

No decisions logged yet. Awaiting project start.

## Related Situations

No detected situations currently.

## Status Updates

- **2026-04-15** — Project planned as child of [[proj-launch-marketing-plan]]. Target date: within two weeks of the September 30 full launch.`,
  },

  {
    slug: "proj-buyer-side-dd",
    pageType: "project",
    title: "Buyer Side Due Diligence",
    properties: {
      status: "active",
      owner: "anna-korsgaard",
      domain: "management",
      priority: "high",
      start_date: "2026-04-10",
      target_date: "2026-05-30",
      progress: 25,
    },
    content: `# Buyer Side Due Diligence

## Objective

Conduct buyer-side due diligence on an identified acquisition target to inform a go/no-go recommendation to leadership and, if go, support deal structuring and post-close integration planning. Success criteria: all twelve DD workstreams complete with supporting evidence, risk register produced, go/no-go recommendation delivered by target date.

## Scope

**Included:** Financial review (revenue quality, EBITDA normalization, working capital), commercial review (customer concentration, contract portfolio), operational review (team, technology, key-person risk), legal and regulatory review (corporate structure, contracts, licenses, IP), valuation reconciliation.

**Not included:** Deal negotiation and structuring (post-DD), integration planning (triggered if go decision), external legal DD by third-party counsel (parallel engagement, coordinated but not owned here).

## Team

- [[anna-korsgaard]] — Deal lead, final sign-off on recommendation
- [[lars-eriksen]] — Finance DD workstream (revenue quality, EBITDA normalization, working capital, debt)
- [[martin-bach]] — Commercial DD workstream (customer concentration, contract portfolio)
- [[sofie-nielsen]] — Operational DD workstream (team, technology, key-person risk, vendor dependency)

External counsel (to be engaged) for legal, tax, and IP review.

## Deliverables

Twelve workstreams produce one report section each, consolidated into a final DD memo:

1. [[del-dd-revenue-quality]] — Revenue quality assessment (owner: [[lars-eriksen]])
2. [[del-dd-ebitda-normalization]] — EBITDA normalization (owner: [[lars-eriksen]])
3. [[del-dd-working-capital]] — Working capital analysis (owner: [[lars-eriksen]])
4. [[del-dd-debt-liabilities]] — Debt and liabilities review (owner: [[lars-eriksen]])
5. [[del-dd-customer-concentration]] — Customer concentration analysis (owner: [[martin-bach]])
6. [[del-dd-contract-portfolio]] — Contract portfolio review (owner: [[martin-bach]])
7. [[del-dd-employee-keyperson]] — Employee and key-person risk (owner: [[sofie-nielsen]])
8. [[del-dd-tech-stack]] — Technology stack assessment (owner: [[sofie-nielsen]])
9. [[del-dd-tax-compliance]] — Tax compliance review (owner: [[lars-eriksen]])
10. [[del-dd-regulatory-license]] — Regulatory and license audit (owner: [[sofie-nielsen]])
11. [[del-dd-vendor-dependency]] — Vendor dependency analysis (owner: [[sofie-nielsen]])
12. [[del-dd-ip-patent]] — IP and patent analysis (owner: [[sofie-nielsen]])

**Final deliverable:** Consolidated DD memo with executive summary, per-workstream findings, risk register, and go/no-go recommendation.

## Timeline & Milestones

- **2026-04-10** — Engagement started, data room access established
- **2026-04-25** — Financial workstreams first pass complete
- **2026-05-05** — Commercial workstreams first pass complete
- **2026-05-12** — Operational workstreams first pass complete
- **2026-05-20** — All workstreams second pass with target-company Q&A
- **2026-05-25** — Risk register finalized, go/no-go draft
- **2026-05-30** — Final memo and recommendation delivered to leadership

## Risks & Issues

- **Data room gaps** — Two contract amendments referenced in the target's contract register but not yet located in the data room. Request pending with target counsel.
- **Management availability** — Target-company CFO is transitioning; key financial Q&A may slip beyond the planned schedule.
- **Timeline pressure** — 50-day window to complete full DD. If initial findings surface material concerns, the timeline must extend or a reduced-scope recommendation is issued.

## Decisions

- **2026-04-10** — Scope locked to twelve workstreams. Legal DD scoped to external counsel to preserve internal capacity during active delivery commitments.

## Related Situations

No detected situations currently. A situation may be generated if DD surfaces material risk requiring broader organizational response.

## Status Updates

- **2026-04-10** — Engagement kicked off. Data room access confirmed. Workstream owners assigned.
- **2026-04-14** — Financial workstream first findings: revenue composition reviewed, early concentration signal noted (to be quantified in workstream 5).
- **2026-04-17** — Overall ~25% complete. No red flags yet. Contract amendment gap opened with target.`,
  },
];

// ══════════════════════════════════════════════════════════
// SYSTEM JOB PAGES
// ══════════════════════════════════════════════════════════

export const SYSTEM_JOB_PAGES: PromoPage[] = [
  {
    slug: "sj-client-engagement-health",
    pageType: "system_job",
    title: "Client Engagement Health",
    properties: {
      status: "active",
      schedule: "0 7 * * 1",
      description: "Weekly scan of active client engagements for scope creep, timeline risk, margin erosion, and relationship concerns. Flags engagements needing follow-up.",
      owner: "sofie-nielsen",
      domain: "delivery",
      trust_level: "propose",
      auto_approve_steps: false,
      last_run: "2026-04-14T07:00:00Z",
      next_run: "2026-04-21T07:00:00Z",
      latest_run_summary: "3 engagements reviewed. 1 flagged red on timeline dimension — Meridian redesign delay escalated.",
      latest_run_status: "completed",
    },
    content: `# Client Engagement Health

## Purpose

Monitor the health of active client engagements and surface early warning signals for scope creep, timeline risk, margin erosion, and relationship concerns before they compound. The output is a weekly review of all active engagements with a health rating and, where relevant, a proposed situation for follow-up.

## Scope

All active client engagements tracked in the operator's wiki under the [[delivery]] domain. Signals drawn from communications (response lags, tone shifts), project wiki pages (milestone slippage, scope change notes), and billing data (burn rate vs. budget).

## Method

Each Monday morning the job:

1. Lists all engagements with [[delivery]] domain and status "active" in the wiki.
2. For each engagement, pulls the past 7 days of activity signals (communications, project page edits, billing entries).
3. Scores engagement health on four dimensions: scope, timeline, margin, relationship.
4. Flags engagements with any dimension at red or two dimensions at amber.
5. Proposes situations for flagged engagements; updates the engagement's project page with a status note.

## Output

- Weekly health summary across all engagements.
- Proposed situation_instance pages for flagged engagements.
- Status update appended to each affected project's wiki page.

## Recipients

- [[sofie-nielsen]] — Delivery lead, owns response to flagged engagements.
- [[anna-korsgaard]] — CEO, cc'd on red-flagged engagements only.

## Configuration

- **Cron:** \`0 7 * * 1\` (Mondays at 07:00 CET)
- **Importance threshold:** 0.3 — propose situation if any engagement scores above threshold
- **Scope:** domain
- **Trust level:** propose — surfaces situations for human review; does not auto-commit

## Execution History

- **2026-04-14 (Monday, 07:00)** — 3 active engagements reviewed. 1 flagged red on timeline dimension. Situation [[project-delay-meridian-redesign]] updated with status note. Importance score: 0.62.
- **2026-04-07 (Monday, 07:00)** — 3 active engagements reviewed. 1 flagged amber on scope dimension (same engagement, earlier signal). No situation proposed; status note appended to project page. Importance score: 0.28.
- **2026-03-31 (Monday, 07:00)** — 3 active engagements reviewed. All green. No output. Importance score: 0.12.`,
  },

  {
    slug: "sj-board-meeting-prep-monitor",
    pageType: "system_job",
    title: "Board Meeting Preparation",
    properties: {
      status: "active",
      schedule: "0 6 * * *",
      description: "Daily scan for upcoming board meetings within 5 days. Surfaces preparation situations when briefing documents are missing.",
      owner: "anna-korsgaard",
      domain: "management",
      trust_level: "observe",
      auto_approve_steps: false,
      last_run: "2026-04-17T06:00:00Z",
      next_run: "2026-04-18T06:00:00Z",
      latest_run_summary: "Upcoming board meeting in 3 days. Preparation situation already in proposed state; no new action needed.",
      latest_run_status: "completed",
    },
    content: `# Board Meeting Preparation

## Purpose

Ensure board meetings have preparation materials ready with enough lead time for the board to review. The job detects upcoming board meetings from the calendar and surfaces a situation when a meeting is within 5 days and no briefing document has been prepared or circulated.

## Scope

[[management]] domain. Calendar events matching the board-meeting pattern. Cross-references to [[anna-korsgaard]] (chair of prep), [[erik-vestergaard]] (board chair), and the situation type [[board-meeting-preparation]].

## Method

Daily at 06:00 the job:

1. Scans the calendar for events in the next 14 days matching the board-meeting pattern.
2. For each upcoming meeting, checks whether a briefing document has been created in Qorpera, and whether it has been circulated.
3. If a meeting is within 5 days and no briefing exists, proposes a situation.
4. If a meeting is within 2 days and no briefing has been circulated, escalates with priority "high".

## Output

- Proposed situation_instance pages of type [[board-meeting-preparation]] when the 5-day threshold is crossed.
- Updated status on the latest board-meeting-preparation situation (if open).

## Recipients

- [[anna-korsgaard]] — Owns briefing preparation.
- [[erik-vestergaard]] — Board chair, cc'd on escalated situations only.

## Configuration

- **Cron:** \`0 6 * * *\` (daily at 06:00 CET)
- **Importance threshold:** 0.3
- **Scope:** domain
- **Trust level:** observe — surfaces signal only; situation creation requires manual confirmation for now

## Execution History

- **2026-04-17 (Friday, 06:00)** — Upcoming board meeting detected in 3 days. Situation [[sit-board-meeting]] already exists in "proposed" state. No new situation created; state confirmed. Importance score: 0.55.
- **2026-04-13 (Monday, 06:00)** — Upcoming board meeting detected in 7 days. Below 5-day threshold; no action. Importance score: 0.08.
- **2026-04-10 (Friday, 06:00)** — No board meetings detected in the next 14 days. No output. Importance score: 0.00.`,
  },

  {
    slug: "sj-monthly-investor-briefing",
    pageType: "system_job",
    title: "Monthly Investor Briefing",
    properties: {
      status: "active",
      schedule: "0 8 1 * *",
      description: "Monthly draft of the investor briefing covering prior month's financials, pipeline, delivery, team, and risks. Drafted for CEO review before distribution.",
      owner: "anna-korsgaard",
      domain: "management",
      trust_level: "propose",
      auto_approve_steps: false,
      last_run: "2026-04-01T08:00:00Z",
      next_run: "2026-05-01T08:00:00Z",
      latest_run_summary: "March briefing produced, reviewed by Anna, and distributed to investor list on April 2.",
      latest_run_status: "completed",
    },
    content: `# Monthly Investor Briefing

## Purpose

Prepare a monthly briefing for investors covering the prior month's operating performance, financial position, pipeline status, team changes, and material risks or opportunities. The job produces a draft briefing ready for [[anna-korsgaard]]'s review and sign-off before distribution.

## Scope

[[management]] domain with inputs from [[finance]] (revenue, margin, cash position), [[sales]] (pipeline, new business), and [[delivery]] (engagement status, capacity). Cross-references to [[anna-korsgaard]] (drafter and distributor), [[lars-eriksen]] (financial data sanity check), [[martin-bach]] (commercial data sanity check).

## Method

On the 1st of each month at 08:00 the job:

1. Pulls the prior month's financial summary from connected accounting data.
2. Compiles the pipeline and deal-movement summary from CRM data.
3. Gathers engagement status and capacity data from active project pages in the wiki.
4. Gathers team changes (new hires, departures) from person-page changes in the wiki.
5. Drafts the briefing in the standard format: Executive Summary, Financial Performance, Commercial Pipeline, Delivery Performance, Team, Risks, Outlook.
6. Routes draft to [[anna-korsgaard]] for review.

## Output

- Draft briefing document produced as a deliverable on this job's wiki page.
- Notification to Anna when draft is ready for review.
- Final version distributed by Anna to the investor list after review (distribution is manual, outside this job's scope).

## Recipients

- [[anna-korsgaard]] — Reviewer and distributor.
- [[lars-eriksen]] — Financial data sanity check (cc'd on draft).
- [[martin-bach]] — Commercial data sanity check (cc'd on draft).

## Configuration

- **Cron:** \`0 8 1 * *\` (1st of each month at 08:00 CET)
- **Importance threshold:** 0.5 — briefing is always produced; the score reflects whether anything in the draft warrants early attention from Anna
- **Scope:** company_wide
- **Trust level:** propose — drafts are reviewed, never sent without approval

## Execution History

- **2026-04-01 (08:00)** — March briefing draft produced. Reviewed and signed off by Anna 2026-04-02. Distributed to investor list 2026-04-02. Importance score: 0.48.
- **2026-03-01 (08:00)** — February briefing draft produced. Reviewed and signed off 2026-03-02. Distributed 2026-03-03. Importance score: 0.34.
- **2026-02-01 (08:00)** — January briefing draft produced. Reviewed and signed off 2026-02-02. Distributed 2026-02-02. Importance score: 0.41.`,
  },

  {
    slug: "sj-weekly-performance-purpose-orientation",
    pageType: "system_job",
    title: "Weekly Performance Evaluation & Purpose Orientation",
    properties: {
      status: "active",
      schedule: "0 17 * * 5",
      description: "Friday reflective evaluation of the week's decisions and activity against stated purpose and strategic priorities. Surfaces drift and proposes corrective ideas.",
      owner: "anna-korsgaard",
      domain: "management",
      trust_level: "propose",
      auto_approve_steps: false,
      last_run: "2026-04-17T17:00:00Z",
      next_run: "2026-04-24T17:00:00Z",
      latest_run_summary: "Five material decisions tracked this week. Three aligned with Q2 margin-protection priority; two diverged — scope addition without change order, and launch/DD sequencing tension. Awaiting review.",
      latest_run_status: "awaiting_review",
    },
    content: `# Weekly Performance Evaluation & Purpose Orientation

## Purpose

Evaluate the week's operating activity against the company's stated purpose, strategic priorities, and commitments. The job produces a reflective evaluation each Friday afternoon, asking: did the week's decisions and activity move us toward our stated purpose, or did we drift? The output is an evaluation for leadership review — a structured mirror for the CEO at week's end, not an external-facing report.

## Scope

Company-wide. Inputs: decisions logged during the week (meetings, approvals, commitments captured in wiki pages), activity signals from connected tools, and the stated strategic priorities captured on company-level pages. Cross-references to [[anna-korsgaard]] (primary reviewer) and all [[management]]-domain pages.

## Method

Every Friday at 17:00 the job:

1. Reads current company-level strategic priorities to anchor the evaluation lens.
2. Scans the week's activity: decisions logged on wiki pages, significant communications, project status changes, resource allocation shifts, idea proposals surfaced.
3. For each material activity, evaluates alignment with stated purpose on a three-way scale: aligned, neutral, divergent.
4. Produces a short narrative evaluation: what went well, where the company drifted, what the drift implies, what leadership should consider.
5. If drift is material, proposes an idea or flags a strategic-link candidate for review.

## Output

- Weekly evaluation narrative written to this wiki page's Execution History each run.
- When drift is material, a proposed idea or strategic_link page.
- Notification to Anna when evaluation is ready.

## Recipients

- [[anna-korsgaard]] — Primary reviewer. The evaluation is ultimately for leadership reflection, not external distribution.

## Configuration

- **Cron:** \`0 17 * * 5\` (Fridays at 17:00 CET)
- **Importance threshold:** 0.3
- **Scope:** company_wide
- **Trust level:** propose — evaluations are never published without review; ideas surfaced for consideration, not auto-accepted

## Execution History

- **2026-04-17 (Friday, 17:00) — AWAITING REVIEW**

  Importance score: 0.71

  **Evaluation summary (unreviewed):** Five material decisions tracked this week across [[management]], [[sales]], and [[delivery]]. Three aligned directly with the stated Q2 priority of margin protection on active engagements — [[init-client-profitability]] proposed, [[init-scope-creep-process]] proposed, [[sit-overdue-invoices]] acted on. Two diverged: (1) the late-stage scope addition accepted on the Meridian engagement without change order ran counter to the stated margin-protection priority, and (2) the acceleration of the [[proj-launch-marketing-plan]] staffing ahead of the Q2 close of the ongoing [[proj-buyer-side-dd]] engagement created a sequencing tension that has not been surfaced in any leadership discussion this week.

  **Proposed for leadership attention:** The sequencing tension between launch readiness and acquisition readiness is not visible in any current idea. Consider surfacing it as a strategic_link candidate before it becomes a resource conflict in May.

  **Status:** Awaiting [[anna-korsgaard]]'s review. Draft idea and strategic_link candidates not yet generated — will generate on request or after review sign-off.

- **2026-04-11 (Friday, 17:00)** — 4 material decisions tracked. All aligned with stated priorities. No drift flagged. Reviewed and acknowledged by [[anna-korsgaard]] 2026-04-11 evening. Importance score: 0.18.

- **2026-04-04 (Friday, 17:00)** — 3 material decisions tracked. One divergence flagged: delayed response to a prospective client inquiry that fell within the stated "respond within 48h" commitment. Reviewed and acknowledged 2026-04-05. Importance score: 0.44.`,
  },
];

// ══════════════════════════════════════════════════════════
// DELIVERABLE PAGES
// ══════════════════════════════════════════════════════════

export const DELIVERABLE_PAGES: PromoPage[] = [
  // ── Portfolio-tree: Brand + Messaging ──────────────────
  {
    slug: "del-positioning-statement",
    pageType: "project_deliverable",
    title: "Positioning Statement",
    properties: {
      status: "planned",
      stage: "intelligence",
      parent_project: "proj-brand-messaging",
      assigned_to: "camilla-ravn",
      risk_count: 0,
    },
    content: `# Positioning Statement

## Objective

Produce a single-sentence positioning statement and supporting narrative that captures who the target buyer is, what category the service plays in, what makes it different, and why that difference matters now. Anchors every downstream asset and campaign.

## Content

Analysis pending. Data gathering in progress.

## Evidence & Sources

- Target buyer interviews (5-8 conversations planned with [[martin-bach]]'s accounts)
- Competitor positioning scan (see [[del-competitor-comparison]])
- Customer outcome data from existing engagements
- Founding narrative session with [[anna-korsgaard]]

## Completeness

Not started. Target completion: 2026-06-15.

## Risks & Findings

- Interview availability from target buyers is the gating factor. If scheduling slips past late May, the deliverable compresses against the Brand + Messaging lock date.
- Category framing is contested: "operational intelligence" vs. "AI COO" vs. "situation monitoring" — decision needed early to align with [[del-competitor-comparison]].

## Review Status

Not yet in review. Primary reviewer: [[martin-bach]]. Final sign-off: [[anna-korsgaard]].

## Decisions

No decisions logged yet.`,
  },

  {
    slug: "del-messaging-pillars",
    pageType: "project_deliverable",
    title: "Messaging Pillars & Voice Guidelines",
    properties: {
      status: "planned",
      stage: "intelligence",
      parent_project: "proj-brand-messaging",
      assigned_to: "camilla-ravn",
      risk_count: 0,
    },
    content: `# Messaging Pillars & Voice Guidelines

## Objective

Produce 3-5 messaging pillars (the core claims repeated across every asset and channel) and a voice guideline document (tone, vocabulary, sentence patterns to use and avoid). Output lands in the sales deck, website, and outreach sequences as repeat-ready language.

## Content

Analysis pending. Data gathering in progress.

## Evidence & Sources

- Positioning statement from [[del-positioning-statement]] as foundational input
- Interview transcripts with existing customers
- Sales objection log from [[martin-bach]] and [[ida-frost]]
- Brand voice benchmarks from 3-5 admired companies in adjacent categories

## Completeness

Not started. Target completion: 2026-06-25. Depends on positioning statement landing first.

## Risks & Findings

- Voice guidelines need sales adoption — if [[martin-bach]] and [[ida-frost]] don't buy in early, outreach sequences drift off-brand and asset consistency breaks.
- Pillars must resolve the top 3 objections in the sales log. If they don't, they're not ready.

## Review Status

Not yet in review. Sales validation session planned 2026-06-20 with [[martin-bach]] and [[ida-frost]].

## Decisions

No decisions logged yet.`,
  },

  {
    slug: "del-competitor-comparison",
    pageType: "project_deliverable",
    title: "Competitor Comparison Matrix",
    properties: {
      status: "planned",
      stage: "intelligence",
      parent_project: "proj-brand-messaging",
      assigned_to: "camilla-ravn",
      risk_count: 0,
    },
    content: `# Competitor Comparison Matrix

## Objective

Produce a structured comparison across 5-8 competitors covering category positioning, target buyer, pricing tier, core capabilities, and visible gaps. Identifies where to amplify differentiation and where competitors are stronger.

## Content

Analysis pending. Data gathering in progress.

## Evidence & Sources

- Competitor websites, public demos, pricing pages
- G2, Capterra, product-hunt listings
- Customer conversations where competitors were also evaluated
- Analyst coverage (Gartner, Forrester) where available

## Completeness

Not started. Target completion: 2026-05-30. Output feeds [[del-positioning-statement]] and [[del-messaging-pillars]].

## Risks & Findings

- Competitor set is partially unknown — two stealth companies may launch in the same window. If one lands first with similar positioning, matrix needs rapid update.
- Differentiation claims must be defensible; any claim in messaging must be backable by the matrix.

## Review Status

Not yet in review. Primary reviewer: [[martin-bach]] for sales-realism check.

## Decisions

No decisions logged yet.`,
  },

  // ── Portfolio-tree: Launch Asset Production ────────────
  {
    slug: "del-website",
    pageType: "project_deliverable",
    title: "Launch Website",
    properties: {
      status: "planned",
      stage: "intelligence",
      parent_project: "proj-launch-asset-production",
      assigned_to: "camilla-ravn",
      risk_count: 0,
    },
    content: `# Launch Website

## Objective

Produce the launch marketing site: home, solution pages segmented by buyer, pricing, about, lead capture flow. Must reflect locked positioning and messaging, host the launch assets, and route qualified traffic to sales.

## Content

Analysis pending. Data gathering in progress.

## Evidence & Sources

- Locked positioning from [[del-positioning-statement]]
- Messaging pillars from [[del-messaging-pillars]]
- Teardown of 5-7 comparable launch sites
- Vendor-provided design system (pending vendor selection)

## Completeness

Not started. Target completion: 2026-08-15 for v1 preview, 2026-08-31 for production-ready.

## Risks & Findings

- Vendor dependency — creative and web dev vendor selection must complete by end of April. Every week slipped compresses the build timeline.
- Content capacity — [[camilla-ravn]] is primary copy author while also running Brand + Messaging. Cross-project context load is a real risk.
- Lead capture integration requires CRM wiring before launch. Cannot launch without this loop closed.

## Review Status

Not yet in review. Final approval: [[anna-korsgaard]].

## Decisions

No decisions logged yet.`,
  },

  {
    slug: "del-sales-deck",
    pageType: "project_deliverable",
    title: "Sales Deck",
    properties: {
      status: "planned",
      stage: "intelligence",
      parent_project: "proj-launch-asset-production",
      assigned_to: "martin-bach",
      risk_count: 0,
    },
    content: `# Sales Deck

## Objective

Produce the sales deck used in discovery and qualification conversations post-launch. 12-18 slides covering problem framing, category framing, product overview, differentiation, pricing anchor, customer evidence, next steps. Must land cleanly in 20-minute customer calls.

## Content

Analysis pending. Data gathering in progress.

## Evidence & Sources

- Messaging pillars from [[del-messaging-pillars]]
- Positioning statement from [[del-positioning-statement]]
- Sales objection log and win/loss notes from [[martin-bach]]
- 2-3 anonymised customer-story candidates from existing engagements

## Completeness

Not started. Target completion: 2026-08-10 for v1, 2026-08-25 for production-ready.

## Risks & Findings

- Customer evidence availability — only 2-3 engagements are appropriate for story use. If any decline, the evidence section is thin.
- Length discipline — past decks have crept to 25+ slides. Enforcing the 12-18 slide cap is a discipline risk.

## Review Status

Not yet in review. [[martin-bach]] authors; [[anna-korsgaard]] final sign-off.

## Decisions

No decisions logged yet.`,
  },

  {
    slug: "del-one-pager",
    pageType: "project_deliverable",
    title: "Service One-Pager",
    properties: {
      status: "planned",
      stage: "intelligence",
      parent_project: "proj-launch-asset-production",
      assigned_to: "camilla-ravn",
      risk_count: 0,
    },
    content: `# Service One-Pager

## Objective

Produce a single-page summary of the service offering for first-touch conversations, follow-up emails, and partner/advisor packs. Must communicate core value, target buyer, and next-step CTA in <60 seconds of reading.

## Content

Analysis pending. Data gathering in progress.

## Evidence & Sources

- Positioning statement from [[del-positioning-statement]]
- Messaging pillars from [[del-messaging-pillars]]
- Price anchor from [[del-sales-deck]]
- Visual system from design vendor

## Completeness

Not started. Target completion: 2026-08-20.

## Risks & Findings

- Content density — compressing positioning, differentiation, and CTA onto one page risks either too sparse (vague) or too dense (skipped). Needs 3-5 iteration passes.

## Review Status

Not yet in review. Primary reviewer: [[martin-bach]] for sales-usability.

## Decisions

No decisions logged yet.`,
  },

  // ── Portfolio-tree: Beachhead Campaign ─────────────────
  {
    slug: "del-target-account-list",
    pageType: "project_deliverable",
    title: "Target Account List",
    properties: {
      status: "planned",
      stage: "intelligence",
      parent_project: "proj-beachhead-campaign",
      assigned_to: "martin-bach",
      risk_count: 0,
    },
    content: `# Target Account List

## Objective

Produce a curated list of 50-100 target accounts for the beachhead campaign. Each account has firmographic fit score, account owner assignment, named-stakeholder mapping, and outreach channel mix. Entry point for [[del-outreach-sequences]] and the paid targeting plan.

## Content

Analysis pending. Data gathering in progress.

## Evidence & Sources

- ICP definition (to be refined from existing customer patterns)
- Firmographic data from public sources and sales databases
- [[martin-bach]]'s existing prospect pipeline
- Exclusion list (existing customers, active prospects, lost deals <12 months)

## Completeness

Not started. Target completion: 2026-08-31.

## Risks & Findings

- ICP precision — without 20+ existing customer data points, firmographic fit scoring is heuristic. Expect re-scoring after first response wave.
- Data source coverage — Nordic mid-market accounts are often missing from standard databases. Manual research required.

## Review Status

Not yet in review. Primary reviewer: [[anna-korsgaard]] for target-market alignment.

## Decisions

No decisions logged yet.`,
  },

  {
    slug: "del-outreach-sequences",
    pageType: "project_deliverable",
    title: "Outreach Sequences",
    properties: {
      status: "planned",
      stage: "intelligence",
      parent_project: "proj-beachhead-campaign",
      assigned_to: "ida-frost",
      risk_count: 0,
    },
    content: `# Outreach Sequences

## Objective

Produce sequenced outreach templates (email + LinkedIn + phone touchpoints) for the target account list. 3 sequence variants to test: problem-framing, category-framing, customer-story. Each sequence runs over 14-21 days with 5-7 touches.

## Content

Analysis pending. Data gathering in progress.

## Evidence & Sources

- Messaging pillars from [[del-messaging-pillars]]
- Target account list structure from [[del-target-account-list]]
- Sales playbook archives from [[martin-bach]]'s prior engagements
- Benchmark sequences from analogous categories

## Completeness

Not started. Target completion: 2026-09-10.

## Risks & Findings

- Personalisation vs. scale — highly personalised sequences convert better but cap scale. Decide which 20-30% of accounts get deep personalisation.
- Channel rotation — spam filters and LinkedIn algorithm changes affect deliverability. Sequences need monitoring from day 1.

## Review Status

Not yet in review. Primary reviewer: [[martin-bach]] for sales-tone check.

## Decisions

No decisions logged yet.`,
  },

  {
    slug: "del-content-calendar",
    pageType: "project_deliverable",
    title: "Content Calendar",
    properties: {
      status: "planned",
      stage: "intelligence",
      parent_project: "proj-beachhead-campaign",
      assigned_to: "camilla-ravn",
      risk_count: 0,
    },
    content: `# Content Calendar

## Objective

Produce a 6-week content calendar spanning launch through end of October. Formats: blog, LinkedIn posts, newsletter, short-form video. Each piece mapped to a messaging pillar and a target buyer segment. Provides the steady-state content flow supporting outreach sequences.

## Content

Analysis pending. Data gathering in progress.

## Evidence & Sources

- Messaging pillars from [[del-messaging-pillars]]
- Sales objection log — each objection becomes a piece of content
- Customer story inventory
- Industry calendar (events, holidays, reporting periods) affecting Nordic mid-market audience

## Completeness

Not started. Target completion: 2026-09-10.

## Risks & Findings

- Production capacity — 3-4 pieces of original content per week is aggressive. Needs clear short-form vs. long-form allocation.
- Video — short-form video requires either in-house talent (limited) or vendor support (cost).

## Review Status

Not yet in review. Primary reviewer: [[ida-frost]] for customer-voice alignment.

## Decisions

No decisions logged yet.`,
  },

  // ── Portfolio-tree: Launch Event ───────────────────────
  {
    slug: "del-event-plan",
    pageType: "project_deliverable",
    title: "Event Plan & Run-of-Show",
    properties: {
      status: "planned",
      stage: "intelligence",
      parent_project: "proj-launch-event",
      assigned_to: "camilla-ravn",
      risk_count: 0,
    },
    content: `# Event Plan & Run-of-Show

## Objective

Produce the complete operational plan for the launch event: venue, logistics, catering, AV, agenda with timing, run-of-show document, staffing assignments, contingency plan. The single source of truth for event-day operations.

## Content

Analysis pending. Data gathering in progress.

## Evidence & Sources

- Venue shortlist (3-5 Copenhagen options under evaluation)
- Agenda template from past internal events
- Standard event-production checklist
- Benchmarks from adjacent-company launch events

## Completeness

Not started. Target completion: 2026-09-20.

## Risks & Findings

- Venue availability — preferred venues book 8-12 weeks out; contract must be signed by mid-September. If first-choice falls through, fallbacks are less central.
- Catering allergen and dietary coverage — at 40-60 attendees, coverage gaps are common if not explicitly surveyed in RSVP.

## Review Status

Not yet in review. Primary reviewer: [[anna-korsgaard]] for narrative alignment.

## Decisions

No decisions logged yet.`,
  },

  {
    slug: "del-invite-list",
    pageType: "project_deliverable",
    title: "Invitation List",
    properties: {
      status: "planned",
      stage: "intelligence",
      parent_project: "proj-launch-event",
      assigned_to: "martin-bach",
      risk_count: 0,
    },
    content: `# Invitation List

## Objective

Produce the curated invitation list for the launch event. 80-120 invitees to yield 40-60 attendees after attrition. Mix: first-wave customers (priority), warm prospects from [[del-target-account-list]], partners/advisors, a small press contingent.

## Content

Analysis pending. Data gathering in progress.

## Evidence & Sources

- Customer CRM records
- Target account list from [[del-target-account-list]]
- Partner and advisor network from [[anna-korsgaard]]
- Press contact list (to be assembled — limited existing relationships)

## Completeness

Not started. Target completion: 2026-09-12.

## Risks & Findings

- RSVP attrition — first-wave events typically see 25-40% decline from invite to attend. Over-invite by 2x the attendee target.
- Press coverage — no existing press relationships means cold outreach; expect low conversion.

## Review Status

Not yet in review. Primary reviewer: [[anna-korsgaard]] for customer-relationship appropriateness.

## Decisions

No decisions logged yet.`,
  },

  {
    slug: "del-presentation-deck",
    pageType: "project_deliverable",
    title: "Presentation Deck",
    properties: {
      status: "planned",
      stage: "intelligence",
      parent_project: "proj-launch-event",
      assigned_to: "anna-korsgaard",
      risk_count: 0,
    },
    content: `# Presentation Deck

## Objective

Produce the keynote deck for the launch event. 25-35 slides, 35-minute delivery: origin story, problem framing, category framing, product reveal, early customer outcomes, roadmap tease. Visually cohesive with website and sales deck.

## Content

Analysis pending. Data gathering in progress.

## Evidence & Sources

- Sales deck from [[del-sales-deck]] (overlapping content)
- Anna's founding narrative
- Visual design system from website build
- Rehearsal feedback from dry runs

## Completeness

Not started. Target completion: 2026-09-30.

## Risks & Findings

- Rehearsal time — [[anna-korsgaard]] running board cycle concurrently. Protected rehearsal windows must be scheduled.
- Live product demo vs. pre-recorded — live demo risks technical failure, pre-recorded feels less authentic. Decision needed.

## Review Status

Not yet in review. [[anna-korsgaard]] owns content; [[camilla-ravn]] owns visual consistency.

## Decisions

No decisions logged yet.`,
  },

  // ── DD Deliverables (12 — proj-buyer-side-dd) ──────────
  {
    slug: "del-dd-revenue-quality",
    pageType: "project_deliverable",
    title: "Revenue Quality Assessment",
    properties: {
      status: "in_progress",
      stage: "workboard",
      parent_project: "proj-buyer-side-dd",
      assigned_to: "lars-eriksen",
      generation_mode: "ai_assisted",
      confidence: "high",
      risk_count: 3,
    },
    content: `# Revenue Quality Assessment

## Objective

Assess the quality of target-company revenue: recurring vs. one-time, customer concentration, contract length, seasonality, and growth trajectory. Informs go/no-go and valuation reconciliation. Output: revenue quality memo with concentration risk, stickiness signals, and adjusted recurring revenue baseline.

## Content

Initial findings (2026-04-14):

- **Top-3 customer concentration: 61%** of trailing 12-month revenue. Top-1 alone: 32%. Above comfort threshold; material driver of risk.
- **Recurring vs. one-time:** 74% recurring (multi-year contracts or annual auto-renew), 26% one-time project revenue. Recurring base is stable for 2026.
- **Contract length:** weighted-average 2.3 years remaining on recurring contracts. Longest top-10: 4.1 years. Shortest: 0.7 years.
- **Growth trajectory:** CAGR 18% over last 3 years, but latest year's growth driven by expansion at top-3 customers, not new logos.

Deeper analysis needed in: new-logo acquisition rate, churn in mid-market tier, cross-sell rates within the book.

## Evidence & Sources

- Target-company financial data room (accessed 2026-04-10)
- Contract register and customer agreements (partial — see [[del-dd-contract-portfolio]])
- Last 3 years of audited financials
- Revenue recognition policy notes (footnotes to 2025 financials)

## Completeness

~60% complete. Remaining: new-logo acquisition rate, churn by tier, cross-sell pattern. Target completion: 2026-04-22.

## Risks & Findings

- **Concentration risk: elevated** — top-3 at 61% is high. Loss of top-1 alone would shift the target from growing to shrinking. Correlates with findings in [[del-dd-customer-concentration]].
- **New-logo momentum weakening** — growth comes from existing-customer expansion. If that plateaus, overall growth collapses.
- **Revenue recognition** — no red flags in policy, but two large 2025 deals had unusual milestone structures. Flagged for follow-up with target CFO.

## Review Status

In progress. Draft memo to be circulated to [[anna-korsgaard]] 2026-04-23. Cross-reference points with [[del-dd-customer-concentration]] being reconciled.

## Decisions

No decisions logged at deliverable level. Contributes to final go/no-go.`,
  },

  {
    slug: "del-dd-ebitda-normalization",
    pageType: "project_deliverable",
    title: "EBITDA Normalization",
    properties: {
      status: "in_progress",
      stage: "workboard",
      parent_project: "proj-buyer-side-dd",
      assigned_to: "lars-eriksen",
      generation_mode: "ai_assisted",
      confidence: "medium",
      risk_count: 3,
    },
    content: `# EBITDA Normalization

## Objective

Normalise target-company EBITDA by removing one-time items, owner-operator adjustments, and non-recurring costs to derive run-rate profitability for valuation. Output: normalised EBITDA bridge with itemised adjustments and defensible run-rate number.

## Content

Initial findings (2026-04-14):

- **Reported EBITDA FY2025:** DKK 8.4M.
- **Identified adjustments (preliminary):**
  - Owner salary above market: +DKK 1.2M (owner-operator pays himself below market; bring to market rate)
  - One-time settlement (litigation): +DKK 0.6M
  - Deferred rent concession (COVID-era): +DKK 0.3M
  - IT migration consulting: +DKK 0.4M
- **Preliminary normalised EBITDA:** DKK 10.9M (+30% vs. reported).

Further adjustments pending: R&D capitalisation policy, Q3-2025 inventory write-down, ERP implementation cost (capex vs. opex).

## Evidence & Sources

- Target-company P&L (3-year audited)
- Payroll records (owner and key-person compensation)
- Litigation settlement documents
- Rent agreements and amendment letters
- IT vendor contracts

## Completeness

~55% complete. Remaining: R&D and ERP treatment, inventory adjustment, working-capital impact reconciliation. Target completion: 2026-04-25.

## Risks & Findings

- **Normalisation delta is large** — +30% swing from reported to normalised is material. Requires defensible documentation for each adjustment.
- **Owner-operator compensation** — adjustment assumes future hire at market rate. If target intends to retain current owner post-close, adjustment may not stand.
- **Inventory write-down** — Q3-2025 write-down of DKK 0.5M is partly discontinued SKUs. Needs classification call.

## Review Status

In progress. Working with target CFO on adjustment documentation. Confidence "medium" — high on major items, unresolved on R&D/ERP treatment.

## Decisions

No decisions logged yet.`,
  },

  {
    slug: "del-dd-working-capital",
    pageType: "project_deliverable",
    title: "Working Capital Analysis",
    properties: {
      status: "planned",
      stage: "intelligence",
      parent_project: "proj-buyer-side-dd",
      assigned_to: "lars-eriksen",
      generation_mode: "ai_assisted",
      risk_count: 0,
    },
    content: `# Working Capital Analysis

## Objective

Analyse target-company working capital: AR days, AP days, inventory turns, seasonality. Derive a minimum working-capital requirement at close. Output: WC run-rate, seasonal adjustment curve, close-date WC target.

## Content

Analysis pending. Data gathering in progress.

## Evidence & Sources

- Monthly balance sheets (36 months, to be requested)
- AR and AP aging reports
- Inventory records and turnover data
- Cash flow statements

## Completeness

Not started. Target completion: 2026-05-05.

## Risks & Findings

None identified yet. Initial concern from adjacent workstreams: inventory buildup in late 2025 may distort simple averages.

## Review Status

Not yet in review. Primary reviewer: [[anna-korsgaard]].

## Decisions

No decisions logged yet.`,
  },

  {
    slug: "del-dd-debt-liabilities",
    pageType: "project_deliverable",
    title: "Debt & Liabilities Review",
    properties: {
      status: "planned",
      stage: "intelligence",
      parent_project: "proj-buyer-side-dd",
      assigned_to: "lars-eriksen",
      generation_mode: "ai_assisted",
      risk_count: 0,
    },
    content: `# Debt & Liabilities Review

## Objective

Review target-company debt and liability structure: bank debt, lease obligations, deferred consideration from prior acquisitions, employee benefit liabilities, contingent liabilities. Output: total indebtedness bridge at close, pension/benefit gap, contingent-liability register.

## Content

Analysis pending. Data gathering in progress.

## Evidence & Sources

- Debt schedule from target
- Lease register (IFRS 16)
- Pension plan actuarial reports
- Litigation log
- Board minutes referencing commitments

## Completeness

Not started. Target completion: 2026-05-10.

## Risks & Findings

None identified yet. Early signal from [[del-dd-contract-portfolio]]: two contracts reference potential earn-out obligations from prior acquisition.

## Review Status

Not yet in review.

## Decisions

No decisions logged yet.`,
  },

  {
    slug: "del-dd-customer-concentration",
    pageType: "project_deliverable",
    title: "Customer Concentration Analysis",
    properties: {
      status: "in_progress",
      stage: "workboard",
      parent_project: "proj-buyer-side-dd",
      assigned_to: "martin-bach",
      generation_mode: "ai_assisted",
      confidence: "high",
      risk_count: 3,
    },
    content: `# Customer Concentration Analysis

## Objective

Quantify customer concentration and assess stickiness of top customers. Informs go/no-go and valuation discount for concentration risk. Output: concentration curve, top-10 customer dossiers, churn/retention profile.

## Content

Initial findings (2026-04-14):

- **Top-1 customer: 32%** of revenue. Relationship duration: 6 years. Contract renewal in 18 months. Relationship health per interviews: strong but not contractual exclusivity.
- **Top-3: 61%.** Top-5: 74%. Top-10: 88%.
- **Mid-market tier (revenue <DKK 200K/yr):** long tail of 40+ customers, low switching cost, moderate churn (~12%/year).
- **Retention:** logo retention 92% over trailing 3 years. Revenue retention (including expansion): 108%. Strong signal, but skewed by top-1 growth.

Customer interviews requested for top-5. One scheduled for 2026-04-20 with top-1 customer's COO.

## Evidence & Sources

- Target-company revenue-by-customer data (3 years)
- Customer contract register (partial)
- Customer interview notes (2 completed, 3 scheduled)
- Market benchmark data on concentration norms in the sector

## Completeness

~50% complete. Remaining: top-5 interviews, deep-dive on top-1 contract structure, churn model for mid-market tail. Target completion: 2026-04-28.

## Risks & Findings

- **Top-1 dependency is existential** — losing top-1 shifts target from growing to declining. Contract renewal in 18 months is a material deal-structure consideration (earn-out? holdback?).
- **No exclusivity or multi-year commitment** from top-1; renewal is boilerplate.
- **Mid-market churn** — 12%/year is high for a sticky service offering. Suggests either value gap or weak onboarding in the tail.

## Review Status

In progress. Cross-referenced with [[del-dd-revenue-quality]]. Draft due 2026-04-28.

## Decisions

No decisions logged at deliverable level.`,
  },

  {
    slug: "del-dd-contract-portfolio",
    pageType: "project_deliverable",
    title: "Contract Portfolio Review",
    properties: {
      status: "planned",
      stage: "intelligence",
      parent_project: "proj-buyer-side-dd",
      assigned_to: "martin-bach",
      generation_mode: "ai_assisted",
      risk_count: 0,
    },
    content: `# Contract Portfolio Review

## Objective

Review the target-company contract portfolio: term lengths, renewal clauses, change-of-control provisions, pricing mechanisms, SLAs, indemnity. Flag any contracts unusually onerous, at-risk on change of control, or materially affecting valuation.

## Content

Analysis pending. Data gathering in progress.

## Evidence & Sources

- Target contract register (in data room — partial access)
- Full contract set for top-20 customers (requested)
- Template master service agreements
- Amendment letters and side letters

## Completeness

Not started. Target completion: 2026-05-12.

## Risks & Findings

- **Data room gap:** two contract amendments referenced in the register have not been located. Request pending with target counsel.
- Change-of-control clauses not yet reviewed — expected to be a major concern for top-3 customers.

## Review Status

Not yet in review. External counsel will review legal provisions in parallel.

## Decisions

No decisions logged yet.`,
  },

  {
    slug: "del-dd-employee-keyperson",
    pageType: "project_deliverable",
    title: "Employee & Key Person Risk",
    properties: {
      status: "in_progress",
      stage: "workboard",
      parent_project: "proj-buyer-side-dd",
      assigned_to: "sofie-nielsen",
      generation_mode: "ai_assisted",
      confidence: "medium",
      risk_count: 3,
    },
    content: `# Employee & Key Person Risk

## Objective

Assess employee and key-person risk: organisation structure, key-person dependencies, retention risk at close, compensation competitiveness, employment contracts. Output: key-person register, retention plan recommendation, compensation gap analysis.

## Content

Initial findings (2026-04-14):

- **Total headcount:** 47 FTE + 6 contractors.
- **Key-person register (preliminary):** 5 individuals identified as critical. Owner-CEO (clearly critical), CTO (architectural + customer-facing), Head of Customer Success (top-3 relationship owner), senior ops lead, lead engineer.
- **Compensation:** CTO and lead engineer paid 15-20% below market. Risk of loss in 6 months post-close unless retention plan in place.
- **Employment contracts:** Owner-CEO has no non-compete. CTO has 12-month non-compete. Lead engineer has 6-month non-compete. Other key people: no non-compete.
- **Culture signal:** moderate turnover in 2024 (12%), low in 2025 (5%). Could indicate stabilisation or pre-deal cohesion.

Interviews with 3 of 5 key persons scheduled. Retention plan draft in progress.

## Evidence & Sources

- Target-company HR data (payroll, contracts, org structure)
- Employment agreements (top-10 employees)
- Benchmark compensation data (Nordic mid-market sector)
- Key-person interview notes

## Completeness

~50% complete. Remaining: 2 key-person interviews, retention plan draft, compensation gap quantification. Target completion: 2026-04-30.

## Risks & Findings

- **Owner-CEO transition** is the single biggest people risk. No non-compete, no post-close commitment agreed. Must be in deal structure.
- **Compensation gap on technical talent** — 15-20% gap creates real retention risk during integration.
- **Customer Success role** carries top-3 relationship. Loss cascades into concentration risk.

## Review Status

In progress. Draft memo to [[anna-korsgaard]] by 2026-04-30.

## Decisions

No decisions logged yet.`,
  },

  {
    slug: "del-dd-tech-stack",
    pageType: "project_deliverable",
    title: "Technology Stack Assessment",
    properties: {
      status: "planned",
      stage: "intelligence",
      parent_project: "proj-buyer-side-dd",
      assigned_to: "sofie-nielsen",
      generation_mode: "ai_assisted",
      risk_count: 0,
    },
    content: `# Technology Stack Assessment

## Objective

Assess the target-company technology stack: architecture, tech debt, scalability, security posture, third-party dependencies. Inform integration approach and surface any material tech-risk affecting valuation or post-close plan.

## Content

Analysis pending. Data gathering in progress.

## Evidence & Sources

- Architecture diagrams (requested)
- Code repository access (pending NDA)
- Security audit reports (last 2 years)
- Cloud infrastructure bills (AWS, third-party SaaS)
- Developer interviews

## Completeness

Not started. Target completion: 2026-05-15.

## Risks & Findings

None identified yet. Early signal from [[del-dd-employee-keyperson]]: CTO has been the sole architect — single point of knowledge failure is probable.

## Review Status

Not yet in review.

## Decisions

No decisions logged yet.`,
  },

  {
    slug: "del-dd-tax-compliance",
    pageType: "project_deliverable",
    title: "Tax Compliance Review",
    properties: {
      status: "planned",
      stage: "intelligence",
      parent_project: "proj-buyer-side-dd",
      assigned_to: "lars-eriksen",
      generation_mode: "ai_assisted",
      risk_count: 0,
    },
    content: `# Tax Compliance Review

## Objective

Review target-company tax compliance: corporate income tax, VAT, payroll tax, transfer pricing (if applicable), indirect taxes, tax-audit history. Flag any unresolved tax exposures, non-compliance risks, or uncertain tax positions.

## Content

Analysis pending. Data gathering in progress.

## Evidence & Sources

- Corporate tax filings (last 5 years)
- VAT returns
- Payroll tax filings
- Tax audit correspondence
- Transfer pricing documentation (if applicable)

## Completeness

Not started. Target completion: 2026-05-18. Will coordinate with external tax counsel.

## Risks & Findings

None identified yet. Standard tax DD scope applies.

## Review Status

Not yet in review. External tax counsel will co-review.

## Decisions

No decisions logged yet.`,
  },

  {
    slug: "del-dd-regulatory-license",
    pageType: "project_deliverable",
    title: "Regulatory & License Audit",
    properties: {
      status: "planned",
      stage: "intelligence",
      parent_project: "proj-buyer-side-dd",
      assigned_to: "sofie-nielsen",
      generation_mode: "ai_assisted",
      risk_count: 0,
    },
    content: `# Regulatory & License Audit

## Objective

Audit target-company regulatory status and license portfolio: industry-specific licenses, data protection compliance (GDPR/NIS2), certifications (ISO, SOC2), any open regulatory correspondence. Flag any non-compliance or upcoming renewal risks.

## Content

Analysis pending. Data gathering in progress.

## Evidence & Sources

- License register (requested)
- Regulatory correspondence (last 3 years)
- GDPR Article 30 records
- Certification documents
- Data processor agreements

## Completeness

Not started. Target completion: 2026-05-18.

## Risks & Findings

None identified yet. NIS2 applicability to the sector will be assessed.

## Review Status

Not yet in review. External regulatory counsel will co-review if material.

## Decisions

No decisions logged yet.`,
  },

  {
    slug: "del-dd-vendor-dependency",
    pageType: "project_deliverable",
    title: "Vendor Dependency Analysis",
    properties: {
      status: "planned",
      stage: "intelligence",
      parent_project: "proj-buyer-side-dd",
      assigned_to: "sofie-nielsen",
      generation_mode: "ai_assisted",
      risk_count: 0,
    },
    content: `# Vendor Dependency Analysis

## Objective

Analyse target-company critical vendor dependencies: cloud infrastructure providers, SaaS platforms, key service vendors. Identify single-source vendors, contract terms, substitution difficulty, and any vendor-risk material to valuation or integration.

## Content

Analysis pending. Data gathering in progress.

## Evidence & Sources

- Vendor register (requested)
- Top-20 vendor contracts
- Cloud infrastructure bills
- IT and service spend by vendor

## Completeness

Not started. Target completion: 2026-05-20.

## Risks & Findings

None identified yet. Early signal from [[del-dd-tech-stack]]: AWS is the primary infrastructure vendor (single-source, but standard risk).

## Review Status

Not yet in review.

## Decisions

No decisions logged yet.`,
  },

  {
    slug: "del-dd-ip-patent",
    pageType: "project_deliverable",
    title: "IP & Patent Analysis",
    properties: {
      status: "planned",
      stage: "intelligence",
      parent_project: "proj-buyer-side-dd",
      assigned_to: "sofie-nielsen",
      generation_mode: "ai_assisted",
      risk_count: 0,
    },
    content: `# IP & Patent Analysis

## Objective

Assess target-company intellectual property: owned IP (software, content, trademarks), licensed IP, open-source usage, pending or granted patents, IP freedom-to-operate. Flag any IP risks affecting valuation or post-close integration.

## Content

Analysis pending. Data gathering in progress.

## Evidence & Sources

- IP register (requested)
- Patent applications and grants
- Trademark registrations
- Open-source license audit
- Employee IP assignment agreements

## Completeness

Not started. Target completion: 2026-05-20.

## Risks & Findings

None identified yet. External IP counsel will coordinate for patent freedom-to-operate analysis.

## Review Status

Not yet in review. External IP counsel will co-review.

## Decisions

No decisions logged yet.`,
  },
];

// ══════════════════════════════════════════════════════════
// ALL PAGES combined
// ══════════════════════════════════════════════════════════

export const ALL_PROMO_PAGES: PromoPage[] = [
  ...SITUATION_PAGES,
  ...SITUATION_TYPE_PAGES,
  ...DOMAIN_PAGES,
  ...PERSON_PAGES,
  ...CLIENT_PAGES,
  ...PROCESS_PAGES,
  ...IDEA_PAGES,
  ...PROJECT_PAGES,
  ...SYSTEM_JOB_PAGES,
  ...DELIVERABLE_PAGES,
];
