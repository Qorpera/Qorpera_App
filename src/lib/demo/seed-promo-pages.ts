/**
 * Promo Demo Wiki Pages — All 36 pages as embedded constants.
 *
 * Each page has: slug, pageType, title, content (full markdown), properties (JSONB).
 * The seed runner creates KnowledgePage records from these.
 */

export interface PromoPage {
  slug: string;
  pageType: string;
  title: string;
  content: string;
  properties: Record<string, unknown>;
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
// INITIATIVES (3 pages)
// ══════════════════════════════════════════════════════════

export const INITIATIVE_PAGES: PromoPage[] = [
  {
    slug: "init-client-profitability",
    pageType: "initiative",
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
- 2026-04-14 — Initiative proposed`,
  },
  {
    slug: "init-reporting-automation",
    pageType: "initiative",
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
- 2026-04-14 — Initiative proposed`,
  },
  {
    slug: "init-scope-creep-process",
    pageType: "initiative",
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
- 2026-04-14 — Initiative proposed`,
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
  ...INITIATIVE_PAGES,
];
