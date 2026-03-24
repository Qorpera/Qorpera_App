// ---------------------------------------------------------------------------
// Content Chunks – ~120 entries of realistic seed data for a Danish digital agency
// ---------------------------------------------------------------------------

export type ContentChunkDef = {
  sourceType: string;
  content: string;
  connectorProvider: "gmail" | "google-calendar" | "google-drive" | "hubspot" | "e-conomic" | "slack";
  department?: string;
  personal: boolean;
  metadata?: Record<string, unknown>;
};

export const CONTENT_CHUNKS: ContentChunkDef[] = [
  // ── EMAIL (~30) ──────────────────────────────────────────────────────────
  {
    sourceType: "email",
    content: "Hi Mette, just confirming the Nordlys Media retainer renewal is signed. Søren Fabricius approved the updated scope on Thursday. We're good for another 12 months.",
    connectorProvider: "gmail",
    department: "Salg",
    personal: true,
    metadata: { from: "Jakob Friis", to: "Mette Lindberg", subject: "RE: Nordlys retainer renewal" },
  },
  {
    sourceType: "email",
    content: "Karen, we need to discuss the Dansk Energi timeline. The content pipeline migration is 2 weeks behind schedule and TK-302 is still open. Can we meet Friday?",
    connectorProvider: "gmail",
    department: "Levering",
    personal: true,
    metadata: { from: "Thomas Nørgaard", to: "Karen Holst", subject: "Dansk Energi Partners – project status" },
  },
  {
    sourceType: "email",
    content: "Anders, INV-2024-090 for Dansk Energi Partners (68,750 DKK) is now 12 days overdue. I've sent two reminders. Should we escalate to Karen Holst directly?",
    connectorProvider: "gmail",
    department: "Økonomi & Admin",
    personal: true,
    metadata: { from: "Louise Winther", to: "Anders Vestergaard", subject: "Overdue: INV-2024-090 Dansk Energi" },
  },
  {
    sourceType: "email",
    content: "Anna, welcome to Test Company! I've attached the onboarding pack for GreenTech Nordic. Your dedicated team is Thomas (delivery) and Sofie (sales). Kick-off is next Tuesday.",
    connectorProvider: "gmail",
    department: "Salg",
    personal: true,
    metadata: { from: "Sofie Bech", to: "Anna Grøn", subject: "Welcome aboard – GreenTech Nordic onboarding" },
  },
  {
    sourceType: "email",
    content: "Kære Henrik, din kontrakt med os udløber om 6 uger. Vi vil gerne sende et fornyelsesforslag inden næste uge. Hvornår passer det at mødes?",
    connectorProvider: "gmail",
    department: "Salg",
    personal: true,
    metadata: { from: "Mette Lindberg", to: "Henrik Bygholm", subject: "Bygholm Consulting – kontraktfornyelse" },
  },
  {
    sourceType: "email",
    content: "Mette, I had a great intro call with Jens Matthiesen from Vestjysk Finans last week. They're looking for a full rebrand + website. Budget looks around 180k–220k DKK.",
    connectorProvider: "gmail",
    department: "Salg",
    personal: true,
    metadata: { from: "Oliver Kragh", to: "Mette Lindberg", subject: "New prospect: Vestjysk Finans" },
  },
  {
    sourceType: "email",
    content: "Tom, the final handover package for Roskilde Byg & Anlæg is ready. All assets, credentials, and documentation are in the shared Drive folder. Let me know if anything's missing.",
    connectorProvider: "gmail",
    department: "Levering",
    personal: true,
    metadata: { from: "Line Kjær", to: "Tom Andersen", subject: "Roskilde Byg – project handover" },
  },
  {
    sourceType: "email",
    content: "Kristaps, thanks for the referral! Baltic Digital Group's recommendation carried a lot of weight with GreenTech Nordic. Happy to discuss a reciprocal arrangement.",
    connectorProvider: "gmail",
    department: "Salg",
    personal: true,
    metadata: { from: "Mette Lindberg", to: "Kristaps Bērziņš", subject: "RE: GreenTech Nordic referral" },
  },
  {
    sourceType: "email",
    content: "Martin, we're seeing intermittent 502 errors on the Nordlys staging environment. Can CloudNine check the load balancer config? Ticket TK-301 has the details.",
    connectorProvider: "gmail",
    department: "Levering",
    personal: true,
    metadata: { from: "Kasper Dahl", to: "Martin Aarup", subject: "Nordlys staging issues – TK-301" },
  },
  {
    sourceType: "email",
    content: "Hi Pernille, great chatting yesterday about NextStep Education's digital strategy. I'll send over a lightweight proposal by end of week. Let's reconnect next Thursday.",
    connectorProvider: "gmail",
    department: "Salg",
    personal: true,
    metadata: { from: "Ida Holm", to: "Pernille Juul", subject: "Follow-up: NextStep Education intro" },
  },
  {
    sourceType: "email",
    content: "Simon, the Aarhus Creative Hub expansion proposal is attached. Phase 2 covers the event platform + member portal. Total estimate: 285,000 DKK over 4 months.",
    connectorProvider: "gmail",
    department: "Salg",
    personal: true,
    metadata: { from: "Jakob Friis", to: "Simon Krogh", subject: "ACH Phase 2 proposal" },
  },
  {
    sourceType: "email",
    content: "Team, reminder that INV-2024-094 for Aarhus Creative Hub (37,500 DKK) is 8 days past due. Peter, can you follow up with Simon Krogh's office?",
    connectorProvider: "gmail",
    department: "Økonomi & Admin",
    personal: true,
    metadata: { from: "Louise Winther", to: "Peter Steen", subject: "Overdue: INV-2024-094 Aarhus Creative Hub" },
  },
  {
    sourceType: "email",
    content: "Maja, it was a pleasure working with Copenhagen Bikes. The final analytics report shows a 34% increase in organic traffic since launch. Happy to reconnect if you need anything.",
    connectorProvider: "gmail",
    department: "Salg",
    personal: true,
    metadata: { from: "Sofie Bech", to: "Maja Winther", subject: "Copenhagen Bikes – project wrap-up" },
  },
  {
    sourceType: "email",
    content: "Lise, vi har ikke hørt fra jer i 8 måneder. Vil I stadig gerne have os til at kigge på den nye ejendomsportal? Vi holder gerne et kort opfølgningsmøde.",
    connectorProvider: "gmail",
    department: "Salg",
    personal: true,
    metadata: { from: "Oliver Kragh", to: "Lise Fjord", subject: "Fjordview Ejendomme – opfølgning" },
  },
  {
    sourceType: "email",
    content: "Thomas, the GreenTech onboarding guide (TK-303) is drafted and in review. Nanna will finalize it by Wednesday so we're ready for the kick-off.",
    connectorProvider: "gmail",
    department: "Levering",
    personal: true,
    metadata: { from: "Nanna Skov", to: "Thomas Nørgaard", subject: "TK-303 onboarding guide update" },
  },
  {
    sourceType: "email",
    content: "Anders, Q1 revenue landed at 1.42M DKK, slightly above forecast. Nordlys retainer and ACH expansion were the main contributors. Full breakdown attached.",
    connectorProvider: "gmail",
    department: "Økonomi & Admin",
    personal: true,
    metadata: { from: "Maria Thomsen", to: "Anders Vestergaard", subject: "Q1 revenue summary" },
  },
  {
    sourceType: "email",
    content: "Henrik, the API rate limit issue (TK-304) is resolved. We implemented request throttling and added a cache layer. Response times are back under 200ms.",
    connectorProvider: "gmail",
    department: "Levering",
    personal: true,
    metadata: { from: "Emil Bruun", to: "Henrik Bygholm", subject: "TK-304 resolved – API rate limits" },
  },
  {
    sourceType: "email",
    content: "Astrid, the Nordlys Media case study draft looks great. Can we add the 34% traffic uplift stat from Søren's latest report? Publishing target is next Monday.",
    connectorProvider: "gmail",
    department: "Marketing",
    personal: true,
    metadata: { from: "Frederik Lund", to: "Astrid Møller", subject: "Nordlys case study draft" },
  },
  {
    sourceType: "email",
    content: "Kasper, the mobile rendering bug on Aarhus Creative Hub (TK-305) needs to be fixed before Friday. Simon flagged it in his last email as a blocker for the launch event.",
    connectorProvider: "gmail",
    department: "Levering",
    personal: true,
    metadata: { from: "Thomas Nørgaard", to: "Kasper Dahl", subject: "TK-305 priority – ACH mobile bug" },
  },
  {
    sourceType: "email",
    content: "Jens, tak for den gode snak i fredags. Vedhæftet finder du vores credentials deck og to casestudier. Vi vender tilbage med et prisestimat inden onsdag.",
    connectorProvider: "gmail",
    department: "Salg",
    personal: true,
    metadata: { from: "Oliver Kragh", to: "Jens Matthiesen", subject: "Vestjysk Finans – opfølgning" },
  },
  {
    sourceType: "email",
    content: "Line, Roskilde Byg project closes officially this week. Tom Andersen confirmed receipt of all deliverables. Final invoice INV-2024-093 goes out tomorrow.",
    connectorProvider: "gmail",
    department: "Levering",
    personal: true,
    metadata: { from: "Thomas Nørgaard", to: "Line Kjær", subject: "Roskilde Byg – final close" },
  },
  {
    sourceType: "email",
    content: "Mette, Bygholm Consulting wants to add a data analytics dashboard to the renewal scope. Henrik estimates it would add ~45,000 DKK. Should I update the proposal?",
    connectorProvider: "gmail",
    department: "Salg",
    personal: true,
    metadata: { from: "Jakob Friis", to: "Mette Lindberg", subject: "Bygholm – expanded scope" },
  },
  {
    sourceType: "email",
    content: "All, the CloudNine hosting migration for Nordlys Media staging is complete. Martin Aarup confirmed the new infrastructure is stable. TK-301 can be closed.",
    connectorProvider: "gmail",
    department: "Levering",
    personal: true,
    metadata: { from: "Kasper Dahl", to: "team@testcompany.dk", subject: "Nordlys staging – migration done" },
  },
  {
    sourceType: "email",
    content: "Pernille, here's the lightweight proposal for NextStep Education. We suggest starting with a discovery sprint (3 weeks, 48,000 DKK) before committing to a full build.",
    connectorProvider: "gmail",
    department: "Salg",
    personal: true,
    metadata: { from: "Ida Holm", to: "Pernille Juul", subject: "NextStep Education – proposal" },
  },
  {
    sourceType: "email",
    content: "Camilla, the social media calendar for March is approved. I've scheduled the Nordlys case study teaser for next Tuesday and the GreenTech welcome post for Thursday.",
    connectorProvider: "gmail",
    department: "Marketing",
    personal: true,
    metadata: { from: "Astrid Møller", to: "Camilla Juhl", subject: "March social calendar" },
  },
  {
    sourceType: "email",
    content: "Karen, apologies for the delay on the content pipeline. We've identified the root cause — a misconfigured webhook — and TK-302 is now in progress. ETA: end of this week.",
    connectorProvider: "gmail",
    department: "Levering",
    personal: true,
    metadata: { from: "Emil Bruun", to: "Karen Holst", subject: "RE: Content pipeline status" },
  },
  {
    sourceType: "email",
    content: "Anders, I've drafted the partner agreement with Baltic Digital Group. Kristaps wants a 10% referral fee on qualified leads. Standard terms otherwise.",
    connectorProvider: "gmail",
    department: "Salg",
    personal: true,
    metadata: { from: "Mette Lindberg", to: "Anders Vestergaard", subject: "Baltic Digital – partner agreement" },
  },
  {
    sourceType: "email",
    content: "Anna, your GreenTech Nordic brand guidelines and design system are ready for review in the Drive folder. We've aligned everything with the sustainability palette you approved.",
    connectorProvider: "gmail",
    department: "Levering",
    personal: true,
    metadata: { from: "Line Kjær", to: "Anna Grøn", subject: "GreenTech – brand guidelines ready" },
  },
  {
    sourceType: "email",
    content: "Peter, INV-2024-089 for Nordlys Media (45,000 DKK) was paid last Tuesday. INV-2024-091 for Bygholm Consulting (35,000 DKK) is paid. Status update attached.",
    connectorProvider: "gmail",
    department: "Økonomi & Admin",
    personal: true,
    metadata: { from: "Maria Thomsen", to: "Peter Steen", subject: "Invoice status update" },
  },
  {
    sourceType: "email",
    content: "Mikkel, can you prepare the SEO audit report for Bygholm Consulting? Henrik wants to see current rankings before the renewal meeting. Need it by Thursday.",
    connectorProvider: "gmail",
    department: "Marketing",
    personal: true,
    metadata: { from: "Astrid Møller", to: "Mikkel Rask", subject: "Bygholm SEO audit" },
  },

  // ── MEETING NOTES (~20) ──────────────────────────────────────────────────
  {
    sourceType: "meeting_notes",
    content: "Standup: Kasper fixed TK-301 Nordlys staging login. Emil working on TK-302 content pipeline. Nanna finishing TK-303 onboarding guide for GreenTech. TK-305 ACH mobile bug now P1.",
    connectorProvider: "google-calendar",
    department: "Levering",
    personal: true,
    metadata: { title: "Delivery standup", attendees: ["Thomas Nørgaard", "Line Kjær", "Kasper Dahl", "Nanna Skov", "Emil Bruun"] },
  },
  {
    sourceType: "meeting_notes",
    content: "Nordlys retainer review with Søren Fabricius. Happy with Q4 results. Wants to increase content production by 30%. Budget approved for additional 15k DKK/month. Mette to draft amendment.",
    connectorProvider: "google-calendar",
    department: "Salg",
    personal: true,
    metadata: { title: "Nordlys Media – quarterly review", attendees: ["Mette Lindberg", "Søren Fabricius", "Jakob Friis"] },
  },
  {
    sourceType: "meeting_notes",
    content: "Dansk Energi status: content pipeline migration 2 weeks behind. Karen concerned about board deadline. Agreed to add Emil full-time to the project this sprint. Thomas to report daily.",
    connectorProvider: "google-calendar",
    department: "Levering",
    personal: true,
    metadata: { title: "Dansk Energi Partners – escalation meeting", attendees: ["Thomas Nørgaard", "Karen Holst", "Anders Vestergaard", "Emil Bruun"] },
  },
  {
    sourceType: "meeting_notes",
    content: "GreenTech Nordic kick-off. Anna Grøn introduced their team. Phase 1: brand identity + website (8 weeks). Line leads design, Kasper on dev. Weekly syncs every Tuesday at 10:00.",
    connectorProvider: "google-calendar",
    department: "Levering",
    personal: true,
    metadata: { title: "GreenTech Nordic – project kick-off", attendees: ["Thomas Nørgaard", "Line Kjær", "Kasper Dahl", "Anna Grøn", "Sofie Bech"] },
  },
  {
    sourceType: "meeting_notes",
    content: "Sales pipeline review. Vestjysk Finans (180–220k, 30% probability), NextStep Education (48k discovery, 50%), Bygholm renewal (est 190k, 80%). Fjordview dormant — Oliver to re-engage.",
    connectorProvider: "google-calendar",
    department: "Salg",
    personal: true,
    metadata: { title: "Weekly sales pipeline", attendees: ["Mette Lindberg", "Jakob Friis", "Oliver Kragh", "Sofie Bech", "Ida Holm"] },
  },
  {
    sourceType: "meeting_notes",
    content: "1:1 Thomas / Anders. Delivery team stretched thin — 3 active projects + 2 ramping up. Discussed hiring a junior dev. Anders approved posting the role next week.",
    connectorProvider: "google-calendar",
    department: "CompanyHQ",
    personal: true,
    metadata: { title: "1:1 Thomas / Anders", attendees: ["Thomas Nørgaard", "Anders Vestergaard"] },
  },
  {
    sourceType: "meeting_notes",
    content: "Bygholm Consulting renewal prep. Henrik wants analytics dashboard added. Jakob to price at 45k DKK. Renewal target: 190k total. Meeting with Henrik scheduled for next Wednesday.",
    connectorProvider: "google-calendar",
    department: "Salg",
    personal: true,
    metadata: { title: "Bygholm renewal prep", attendees: ["Mette Lindberg", "Jakob Friis"] },
  },
  {
    sourceType: "meeting_notes",
    content: "Marketing retro. Nordlys case study performing well (1.2k views). GreenTech welcome campaign planned. LinkedIn engagement up 18% month-over-month. Mikkel to start Bygholm SEO audit.",
    connectorProvider: "google-calendar",
    department: "Marketing",
    personal: true,
    metadata: { title: "Marketing weekly retro", attendees: ["Astrid Møller", "Frederik Lund", "Camilla Juhl", "Mikkel Rask"] },
  },
  {
    sourceType: "meeting_notes",
    content: "Finance review. Q1 at 1.42M DKK. Two overdue invoices: INV-2024-090 (Dansk Energi, 68.75k) and INV-2024-094 (ACH, 37.5k). Cash flow healthy but watch AR trend. Maria to prepare Q2 forecast.",
    connectorProvider: "google-calendar",
    department: "Økonomi & Admin",
    personal: true,
    metadata: { title: "Monthly finance review", attendees: ["Anders Vestergaard", "Louise Winther", "Peter Steen", "Maria Thomsen"] },
  },
  {
    sourceType: "meeting_notes",
    content: "ACH expansion planning with Simon Krogh. Phase 2 approved: event platform + member portal. 285k DKK, 4-month timeline. Kasper and Nanna assigned. Start date: April 1.",
    connectorProvider: "google-calendar",
    department: "Salg",
    personal: true,
    metadata: { title: "Aarhus Creative Hub – Phase 2 planning", attendees: ["Jakob Friis", "Simon Krogh", "Thomas Nørgaard"] },
  },
  {
    sourceType: "meeting_notes",
    content: "Roskilde Byg wrap-up. Tom Andersen confirmed all deliverables received. Final feedback positive. NPS: 9/10. Line to archive project files. Last invoice INV-2024-093 to be sent.",
    connectorProvider: "google-calendar",
    department: "Levering",
    personal: true,
    metadata: { title: "Roskilde Byg & Anlæg – project close", attendees: ["Thomas Nørgaard", "Line Kjær", "Tom Andersen"] },
  },
  {
    sourceType: "meeting_notes",
    content: "Vestjysk Finans discovery call. Jens Matthiesen wants a full rebrand — logo, website, digital marketing setup. Competitors: 3 other agencies pitching. Our edge: HubSpot expertise.",
    connectorProvider: "google-calendar",
    department: "Salg",
    personal: true,
    metadata: { title: "Vestjysk Finans – intro call", attendees: ["Oliver Kragh", "Jens Matthiesen", "Mette Lindberg"] },
  },
  {
    sourceType: "meeting_notes",
    content: "CloudNine infra review with Martin Aarup. All hosting stable. Nordlys migration complete. Discussed CDN upgrade for Bygholm — Martin to quote by Friday. Monthly cost: 8,200 DKK.",
    connectorProvider: "google-calendar",
    department: "Levering",
    personal: true,
    metadata: { title: "CloudNine monthly review", attendees: ["Kasper Dahl", "Martin Aarup"] },
  },
  {
    sourceType: "meeting_notes",
    content: "All-hands: Anders shared Q1 results (1.42M DKK). GreenTech onboarding going well. Dansk Energi back on track. Hiring junior dev. Company offsite planned for May.",
    connectorProvider: "google-calendar",
    department: "CompanyHQ",
    personal: true,
    metadata: { title: "All-hands monthly update", attendees: ["All staff"] },
  },
  {
    sourceType: "meeting_notes",
    content: "NextStep Education intro. Pernille Juul wants a learning platform for vocational schools. Early stage — need discovery first. Ida to send proposal for 3-week sprint at 48k DKK.",
    connectorProvider: "google-calendar",
    department: "Salg",
    personal: true,
    metadata: { title: "NextStep Education – intro meeting", attendees: ["Ida Holm", "Pernille Juul"] },
  },
  {
    sourceType: "meeting_notes",
    content: "Baltic Digital Group partnership sync. Kristaps confirmed 2 more leads in the pipeline for Q2. Agreed on 10% referral fee. Mette drafting formal partnership agreement.",
    connectorProvider: "google-calendar",
    department: "Salg",
    personal: true,
    metadata: { title: "Baltic Digital Group – partner sync", attendees: ["Mette Lindberg", "Kristaps Bērziņš"] },
  },
  {
    sourceType: "meeting_notes",
    content: "Delivery planning. Capacity: 3 active (Nordlys, Dansk Energi, GreenTech), 1 wrapping (Roskilde), ACH Phase 2 starting April. Need the junior hire before ACH starts.",
    connectorProvider: "google-calendar",
    department: "Levering",
    personal: true,
    metadata: { title: "Delivery capacity planning", attendees: ["Thomas Nørgaard", "Anders Vestergaard"] },
  },
  {
    sourceType: "meeting_notes",
    content: "1:1 Mette / Sofie. Sofie onboarded GreenTech smoothly. Next: support Jakob on Bygholm renewal and shadow Oliver on Vestjysk Finans pitch. Performance review in 6 weeks.",
    connectorProvider: "google-calendar",
    department: "Salg",
    personal: true,
    metadata: { title: "1:1 Mette / Sofie", attendees: ["Mette Lindberg", "Sofie Bech"] },
  },
  {
    sourceType: "meeting_notes",
    content: "Copenhagen Bikes retrospective. Project completed on time and under budget. Maja Winther gave positive testimonial. Astrid to use it in marketing materials. Lessons learned documented.",
    connectorProvider: "google-calendar",
    department: "CompanyHQ",
    personal: true,
    metadata: { title: "Copenhagen Bikes – retrospective", attendees: ["Thomas Nørgaard", "Sofie Bech", "Astrid Møller"] },
  },
  {
    sourceType: "meeting_notes",
    content: "TK-304 post-mortem. Bygholm API rate limits caused by unthrottled batch sync. Emil added request queuing + Redis cache. No client impact since fix deployed Thursday. Henrik satisfied.",
    connectorProvider: "google-calendar",
    department: "Levering",
    personal: true,
    metadata: { title: "TK-304 post-mortem", attendees: ["Thomas Nørgaard", "Emil Bruun", "Kasper Dahl"] },
  },

  // ── SLACK MESSAGES (~25) ─────────────────────────────────────────────────
  {
    sourceType: "slack_message",
    content: "FYI — Søren from Nordlys just confirmed the retainer renewal. 12 more months locked in 🎉",
    connectorProvider: "slack",
    department: "Salg",
    personal: false,
    metadata: { channel: "#salg", author: "Jakob Friis" },
  },
  {
    sourceType: "slack_message",
    content: "TK-302 update: found the broken webhook in the Dansk Energi pipeline. Deploying fix now. Should be green by end of day.",
    connectorProvider: "slack",
    department: "Levering",
    personal: false,
    metadata: { channel: "#levering", author: "Emil Bruun" },
  },
  {
    sourceType: "slack_message",
    content: "Anyone have bandwidth to help with the GreenTech brand guidelines review? Line could use a second pair of eyes before sending to Anna.",
    connectorProvider: "slack",
    department: "Levering",
    personal: false,
    metadata: { channel: "#levering", author: "Nanna Skov" },
  },
  {
    sourceType: "slack_message",
    content: "heads up — Vestjysk Finans pitch deck needs to go out by Wednesday. Oliver, do you need design support from marketing?",
    connectorProvider: "slack",
    department: "Salg",
    personal: false,
    metadata: { channel: "#salg", author: "Mette Lindberg" },
  },
  {
    sourceType: "slack_message",
    content: "Yes please! @Camilla can you pull together 3-4 slides with our fintech case studies? Jens Matthiesen specifically asked about regulated industry experience.",
    connectorProvider: "slack",
    department: "Salg",
    personal: false,
    metadata: { channel: "#salg", author: "Oliver Kragh" },
  },
  {
    sourceType: "slack_message",
    content: "Nordlys case study just hit 1.2k views on LinkedIn. Best performing content this quarter. Nice work @Frederik!",
    connectorProvider: "slack",
    department: "Marketing",
    personal: false,
    metadata: { channel: "#marketing", author: "Astrid Møller" },
  },
  {
    sourceType: "slack_message",
    content: "Quick reminder: two overdue invoices still outstanding. INV-2024-090 (Dansk Energi) and INV-2024-094 (ACH). Finance team following up today.",
    connectorProvider: "slack",
    department: "CompanyHQ",
    personal: false,
    metadata: { channel: "#general", author: "Louise Winther" },
  },
  {
    sourceType: "slack_message",
    content: "TK-305 fixed! The ACH mobile bug was a viewport meta tag issue. Tested on iPhone and Android — looks clean now. @Thomas can you confirm with Simon?",
    connectorProvider: "slack",
    department: "Levering",
    personal: false,
    metadata: { channel: "#levering", author: "Kasper Dahl" },
  },
  {
    sourceType: "slack_message",
    content: "Confirmed with Simon. He's happy. TK-305 closed. 🙌",
    connectorProvider: "slack",
    department: "Levering",
    personal: false,
    metadata: { channel: "#levering", author: "Thomas Nørgaard" },
  },
  {
    sourceType: "slack_message",
    content: "Roskilde Byg officially wrapped. Tom signed off on everything. Another one in the books! Final invoice going out tomorrow.",
    connectorProvider: "slack",
    department: "CompanyHQ",
    personal: false,
    metadata: { channel: "#general", author: "Line Kjær" },
  },
  {
    sourceType: "slack_message",
    content: "GreenTech kick-off went really well. Anna and her team are super engaged. First design sprint starts Monday.",
    connectorProvider: "slack",
    department: "Levering",
    personal: false,
    metadata: { channel: "#levering", author: "Line Kjær" },
  },
  {
    sourceType: "slack_message",
    content: "Bygholm SEO audit is done. Rankings are solid but we're missing 4 high-value keywords. Report in the shared drive if anyone wants to peek.",
    connectorProvider: "slack",
    department: "Marketing",
    personal: false,
    metadata: { channel: "#marketing", author: "Mikkel Rask" },
  },
  {
    sourceType: "slack_message",
    content: "Lunch today? The new ramen place on Vesterbrogade has a 4.8 rating 🍜",
    connectorProvider: "slack",
    department: "CompanyHQ",
    personal: false,
    metadata: { channel: "#general", author: "Frederik Lund" },
  },
  {
    sourceType: "slack_message",
    content: "Just got off the phone with Kristaps from Baltic Digital. Two warm leads coming our way — one in logistics, one in healthcare. Details in CRM.",
    connectorProvider: "slack",
    department: "Salg",
    personal: false,
    metadata: { channel: "#salg", author: "Mette Lindberg" },
  },
  {
    sourceType: "slack_message",
    content: "CloudNine CDN quote for Bygholm came in at 1,400 DKK/month. Reasonable given the traffic spike they had last month. Thomas what do you think?",
    connectorProvider: "slack",
    department: "Levering",
    personal: false,
    metadata: { channel: "#levering", author: "Kasper Dahl" },
  },
  {
    sourceType: "slack_message",
    content: "Approved. Add it to the Bygholm renewal scope so Henrik sees the full picture. @Jakob make sure it's in the proposal.",
    connectorProvider: "slack",
    department: "Levering",
    personal: false,
    metadata: { channel: "#levering", author: "Thomas Nørgaard" },
  },
  {
    sourceType: "slack_message",
    content: "Q1 numbers are in: 1.42M DKK revenue, 23% margin after costs. Solid quarter everyone! 🚀 Full breakdown in the finance review notes.",
    connectorProvider: "slack",
    department: "CompanyHQ",
    personal: false,
    metadata: { channel: "#general", author: "Anders Vestergaard" },
  },
  {
    sourceType: "slack_message",
    content: "Ida, how's the NextStep Education proposal coming? Pernille seemed keen on the discovery sprint idea.",
    connectorProvider: "slack",
    department: "Salg",
    personal: false,
    metadata: { channel: "#salg", author: "Mette Lindberg" },
  },
  {
    sourceType: "slack_message",
    content: "Sent it over yesterday! She's reviewing with her board this week. Fingers crossed 🤞",
    connectorProvider: "slack",
    department: "Salg",
    personal: false,
    metadata: { channel: "#salg", author: "Ida Holm" },
  },
  {
    sourceType: "slack_message",
    content: "Dansk Energi pipeline fix deployed and verified. Content syncing correctly now. Closing TK-302.",
    connectorProvider: "slack",
    department: "Levering",
    personal: false,
    metadata: { channel: "#levering", author: "Emil Bruun" },
  },
  {
    sourceType: "slack_message",
    content: "Company offsite confirmed for May 16–17 in Skagen. Two days of strategy + team building. Save the date!",
    connectorProvider: "slack",
    department: "CompanyHQ",
    personal: false,
    metadata: { channel: "#general", author: "Anders Vestergaard" },
  },
  {
    sourceType: "slack_message",
    content: "GreenTech onboarding guide (TK-303) published to the client portal. Anna's team has access. One less ticket on the board!",
    connectorProvider: "slack",
    department: "Levering",
    personal: false,
    metadata: { channel: "#levering", author: "Nanna Skov" },
  },
  {
    sourceType: "slack_message",
    content: "Marketing calendar for April drafted. Main campaigns: GreenTech launch teaser, Bygholm renewal content, LinkedIn thought leadership series. Review in tomorrow's retro.",
    connectorProvider: "slack",
    department: "Marketing",
    personal: false,
    metadata: { channel: "#marketing", author: "Camilla Juhl" },
  },
  {
    sourceType: "slack_message",
    content: "Has anyone heard back from Lise at Fjordview? Oliver pinged her two weeks ago but no response. Should we move them to 'lost' in the CRM?",
    connectorProvider: "slack",
    department: "Salg",
    personal: false,
    metadata: { channel: "#salg", author: "Sofie Bech" },
  },
  {
    sourceType: "slack_message",
    content: "Give it one more week. I'll try calling her directly. If nothing by next Friday, we move them to dormant.",
    connectorProvider: "slack",
    department: "Salg",
    personal: false,
    metadata: { channel: "#salg", author: "Oliver Kragh" },
  },

  // ── DOCUMENTS (~15) ──────────────────────────────────────────────────────
  {
    sourceType: "document",
    content: "Client Onboarding SOP v3.2: 1) Sales handover (Salg→Levering), 2) Kick-off meeting within 5 business days, 3) Brand audit, 4) Technical setup, 5) Weekly cadence established.",
    connectorProvider: "google-drive",
    department: "Levering",
    personal: true,
    metadata: { title: "Client Onboarding SOP", version: "3.2" },
  },
  {
    sourceType: "document",
    content: "GreenTech Nordic – Project Brief: Sustainability-focused brand identity + responsive website. Budget: 165,000 DKK. Timeline: 8 weeks. Key contact: Anna Grøn (CEO).",
    connectorProvider: "google-drive",
    department: "Levering",
    personal: true,
    metadata: { title: "GreenTech Nordic Project Brief" },
  },
  {
    sourceType: "document",
    content: "Bygholm Consulting Renewal Proposal (DRAFT): Continued website maintenance + new analytics dashboard. Proposed: 190,000 DKK/year. Includes CDN upgrade at 1,400 DKK/month via CloudNine.",
    connectorProvider: "google-drive",
    department: "Salg",
    personal: true,
    metadata: { title: "Bygholm Consulting Renewal Proposal", status: "draft" },
  },
  {
    sourceType: "document",
    content: "Vestjysk Finans – Pitch Deck: Full rebrand (logo, visual identity, website, digital marketing). Competitive analysis included. Estimated budget: 180,000–220,000 DKK.",
    connectorProvider: "google-drive",
    department: "Salg",
    personal: true,
    metadata: { title: "Vestjysk Finans Pitch Deck" },
  },
  {
    sourceType: "document",
    content: "ACH Phase 2 – Scope Document: Event management platform + member portal. Tech stack: Next.js, Prisma, Tailwind. 4-month delivery. Assigned: Kasper Dahl, Nanna Skov.",
    connectorProvider: "google-drive",
    department: "Levering",
    personal: true,
    metadata: { title: "Aarhus Creative Hub Phase 2 Scope" },
  },
  {
    sourceType: "document",
    content: "Invoice Handling Process: Net 30 terms standard. Reminder at +7 days, escalation at +14 days, CEO involvement at +21 days. Exceptions require Anders' approval.",
    connectorProvider: "google-drive",
    department: "Økonomi & Admin",
    personal: true,
    metadata: { title: "Invoice Handling Process", version: "2.1" },
  },
  {
    sourceType: "document",
    content: "Nordlys Media Retainer – Scope Amendment: Content production increased by 30%. Additional 15,000 DKK/month. Effective from next billing cycle. Approved by Søren Fabricius.",
    connectorProvider: "google-drive",
    department: "Salg",
    personal: true,
    metadata: { title: "Nordlys Retainer Amendment" },
  },
  {
    sourceType: "document",
    content: "NextStep Education – Discovery Sprint Proposal: 3-week UX research + technical feasibility study. Deliverables: user journey map, wireframes, architecture doc. Price: 48,000 DKK.",
    connectorProvider: "google-drive",
    department: "Salg",
    personal: true,
    metadata: { title: "NextStep Education Discovery Proposal" },
  },
  {
    sourceType: "document",
    content: "Baltic Digital Group – Partner Agreement (DRAFT): 10% referral fee on qualified leads. Non-exclusive. 12-month term with auto-renewal. Both parties retain IP rights.",
    connectorProvider: "google-drive",
    department: "Salg",
    personal: true,
    metadata: { title: "Baltic Digital Partner Agreement", status: "draft" },
  },
  {
    sourceType: "document",
    content: "Copenhagen Bikes A/S – Case Study: 34% organic traffic increase, 22% conversion rate improvement. Project delivered on time, 8% under budget. Client testimonial from Maja Winther included.",
    connectorProvider: "google-drive",
    department: "Marketing",
    personal: true,
    metadata: { title: "Copenhagen Bikes Case Study" },
  },
  {
    sourceType: "document",
    content: "Developer Hiring Brief – Junior Frontend: Next.js + TypeScript required. Tailwind preferred. Start date: before April 1 (ACH Phase 2). Salary range: 28,000–32,000 DKK/month.",
    connectorProvider: "google-drive",
    department: "CompanyHQ",
    personal: true,
    metadata: { title: "Junior Developer Hiring Brief" },
  },
  {
    sourceType: "document",
    content: "Dansk Energi Partners – Content Pipeline Architecture: Headless CMS → webhook → staging preview → approval workflow → production. Issue TK-302 traced to webhook misconfiguration.",
    connectorProvider: "google-drive",
    department: "Levering",
    personal: true,
    metadata: { title: "Dansk Energi Content Pipeline Doc" },
  },
  {
    sourceType: "document",
    content: "Roskilde Byg & Anlæg – Handover Package: All source files, CMS credentials, DNS records, hosting docs, analytics access. Transferred to Tom Andersen on project close.",
    connectorProvider: "google-drive",
    department: "Levering",
    personal: true,
    metadata: { title: "Roskilde Byg Handover Package" },
  },
  {
    sourceType: "document",
    content: "Company Offsite Agenda – May 16–17, Skagen: Day 1: H1 review, product roadmap, client strategy. Day 2: team workshops, beach activity, dinner at Ruths Hotel.",
    connectorProvider: "google-drive",
    department: "CompanyHQ",
    personal: true,
    metadata: { title: "Company Offsite Agenda" },
  },
  {
    sourceType: "document",
    content: "SEO Audit – Bygholm Consulting: Domain authority 42. Ranking for 67 keywords. Missing 4 high-value terms: 'management consulting DK', 'strategirådgivning', 'business advisory', 'ledelseskonsulent'.",
    connectorProvider: "google-drive",
    department: "Marketing",
    personal: true,
    metadata: { title: "Bygholm SEO Audit Report", author: "Mikkel Rask" },
  },

  // ── CALENDAR (~10) ───────────────────────────────────────────────────────
  {
    sourceType: "calendar",
    content: "Nordlys Media quarterly review – Søren Fabricius, Mette Lindberg, Jakob Friis. Retainer renewal signed. Content scope expanded. Next review in 3 months.",
    connectorProvider: "google-calendar",
    department: "Salg",
    personal: true,
    metadata: { title: "Nordlys quarterly review", date: "last Thursday", duration: "60 min" },
  },
  {
    sourceType: "calendar",
    content: "GreenTech Nordic weekly sync – Anna Grøn, Thomas Nørgaard, Line Kjær. Brand guidelines in review. Design sprint starting Monday. On track for 8-week timeline.",
    connectorProvider: "google-calendar",
    department: "Levering",
    personal: true,
    metadata: { title: "GreenTech weekly sync", date: "Tuesday", duration: "30 min", recurring: true },
  },
  {
    sourceType: "calendar",
    content: "Bygholm renewal meeting – Henrik Bygholm, Jakob Friis, Mette Lindberg. Scheduled for next Wednesday. Agenda: renewal terms, analytics dashboard add-on, CDN pricing.",
    connectorProvider: "google-calendar",
    department: "Salg",
    personal: true,
    metadata: { title: "Bygholm renewal meeting", date: "next Wednesday", duration: "45 min" },
  },
  {
    sourceType: "calendar",
    content: "Dansk Energi daily check-in – Thomas Nørgaard, Emil Bruun. Content pipeline fix verified. Project back on schedule as of Friday. Downgrading to weekly cadence.",
    connectorProvider: "google-calendar",
    department: "Levering",
    personal: true,
    metadata: { title: "Dansk Energi daily check-in", date: "today", duration: "15 min" },
  },
  {
    sourceType: "calendar",
    content: "Vestjysk Finans pitch – Oliver Kragh, Mette Lindberg, Jens Matthiesen. Pitch deck sent ahead. Discuss rebrand scope, timeline, and competitive positioning.",
    connectorProvider: "google-calendar",
    department: "Salg",
    personal: true,
    metadata: { title: "Vestjysk Finans pitch presentation", date: "this Friday", duration: "60 min" },
  },
  {
    sourceType: "calendar",
    content: "All-hands March – full team. Q1 results, GreenTech update, hiring plans, offsite announcement. Anders presenting.",
    connectorProvider: "google-calendar",
    department: "CompanyHQ",
    personal: true,
    metadata: { title: "All-hands March", date: "last Monday", duration: "45 min" },
  },
  {
    sourceType: "calendar",
    content: "Baltic Digital partner call – Mette Lindberg, Kristaps Bērziņš. Discussed Q2 referral pipeline and formalized partnership terms.",
    connectorProvider: "google-calendar",
    department: "Salg",
    personal: true,
    metadata: { title: "Baltic Digital partner call", date: "last week", duration: "30 min" },
  },
  {
    sourceType: "calendar",
    content: "NextStep Education follow-up – Ida Holm, Pernille Juul. Scheduled for next Thursday to discuss discovery sprint proposal. Board feedback expected by then.",
    connectorProvider: "google-calendar",
    department: "Salg",
    personal: true,
    metadata: { title: "NextStep follow-up", date: "next Thursday", duration: "30 min" },
  },
  {
    sourceType: "calendar",
    content: "CloudNine infrastructure review – Kasper Dahl, Martin Aarup. Monthly check-in. Nordlys migration post-mortem. CDN quote for Bygholm discussed.",
    connectorProvider: "google-calendar",
    department: "Levering",
    personal: true,
    metadata: { title: "CloudNine monthly review", date: "last Wednesday", duration: "30 min" },
  },
  {
    sourceType: "calendar",
    content: "Company offsite planning – Anders Vestergaard, Thomas Nørgaard, Mette Lindberg. Finalizing Skagen agenda. Budget approved at 45,000 DKK for 18 people.",
    connectorProvider: "google-calendar",
    department: "CompanyHQ",
    personal: true,
    metadata: { title: "Offsite planning", date: "yesterday", duration: "30 min" },
  },

  // ── FINANCIAL (~10) ──────────────────────────────────────────────────────
  {
    sourceType: "financial",
    content: "Q1 Revenue Summary: Total 1,420,000 DKK. Nordlys retainer 375k, Dansk Energi project 280k, ACH Phase 1 225k, Copenhagen Bikes 195k, Bygholm maintenance 145k, other 200k.",
    connectorProvider: "e-conomic",
    department: "Økonomi & Admin",
    personal: false,
    metadata: { reportType: "revenue_summary", period: "Q1 2024" },
  },
  {
    sourceType: "financial",
    content: "Overdue AR: INV-2024-090 Dansk Energi Partners 68,750 DKK (12 days), INV-2024-094 Aarhus Creative Hub 37,500 DKK (8 days). Total overdue: 106,250 DKK.",
    connectorProvider: "e-conomic",
    department: "Økonomi & Admin",
    personal: false,
    metadata: { reportType: "accounts_receivable", status: "overdue" },
  },
  {
    sourceType: "financial",
    content: "INV-2024-089 Nordlys Media ApS: 45,000 DKK – PAID (last Tuesday). INV-2024-091 Bygholm Consulting: 35,000 DKK – PAID. INV-2024-092 GreenTech Nordic: 23,750 DKK – PAID.",
    connectorProvider: "e-conomic",
    department: "Økonomi & Admin",
    personal: false,
    metadata: { reportType: "invoice_status" },
  },
  {
    sourceType: "financial",
    content: "Monthly operating costs March: Salaries 680,000 DKK, CloudNine hosting 8,200 DKK, Software licenses 12,400 DKK, Office 28,000 DKK, Marketing 15,500 DKK. Total: 744,100 DKK.",
    connectorProvider: "e-conomic",
    department: "Økonomi & Admin",
    personal: false,
    metadata: { reportType: "operating_costs", period: "March 2024" },
  },
  {
    sourceType: "financial",
    content: "INV-2024-093 Roskilde Byg & Anlæg: 16,250 DKK – sent last Friday. Payment terms: Net 30. INV-2024-095 Nordlys Media ApS retainer March: 45,000 DKK – sent on the 1st.",
    connectorProvider: "e-conomic",
    department: "Økonomi & Admin",
    personal: false,
    metadata: { reportType: "invoice_status" },
  },
  {
    sourceType: "financial",
    content: "Cash flow forecast: Current balance 892,000 DKK. Expected inflows (30 days): 287,000 DKK. Expected outflows: 744,000 DKK. Projected: 435,000 DKK. Comfortable position.",
    connectorProvider: "e-conomic",
    department: "Økonomi & Admin",
    personal: false,
    metadata: { reportType: "cash_flow_forecast" },
  },
  {
    sourceType: "financial",
    content: "INV-2024-096 Dansk Energi Partners: 68,750 DKK – pending send. Follow-up on outstanding account.",
    connectorProvider: "e-conomic",
    department: "Økonomi & Admin",
    personal: false,
    metadata: { reportType: "invoice_status", status: "pending_send" },
  },
  {
    sourceType: "financial",
    content: "Gross margin Q1: 23.4%. Revenue 1.42M DKK, COGS 1.088M DKK (primarily salaries + contractor costs). Target margin: 25%. Slight miss due to Dansk Energi overruns.",
    connectorProvider: "e-conomic",
    department: "Økonomi & Admin",
    personal: false,
    metadata: { reportType: "profitability", period: "Q1 2024" },
  },
  {
    sourceType: "financial",
    content: "Client revenue ranking Q1: 1) Nordlys Media 375k, 2) Dansk Energi 280k, 3) ACH 225k, 4) Copenhagen Bikes 195k, 5) Bygholm 145k. Top 5 clients = 86% of revenue.",
    connectorProvider: "e-conomic",
    department: "Økonomi & Admin",
    personal: false,
    metadata: { reportType: "client_revenue_ranking", period: "Q1 2024" },
  },
  {
    sourceType: "financial",
    content: "Budget vs actual Q1: Revenue +3.2% over target. Salaries on budget. Marketing spend -12% (underspend). Hosting +8% due to Nordlys migration. Net: favorable by 44,000 DKK.",
    connectorProvider: "e-conomic",
    department: "Økonomi & Admin",
    personal: false,
    metadata: { reportType: "budget_variance", period: "Q1 2024" },
  },

  // ── CRM (~10) ────────────────────────────────────────────────────────────
  {
    sourceType: "crm",
    content: "Deal: Nordlys Media Retainer Renewal – Stage: Closed Won. Value: 540,000 DKK/year. Owner: Mette Lindberg. Signed last Thursday. 12-month term, auto-renew.",
    connectorProvider: "hubspot",
    department: "Salg",
    personal: false,
    metadata: { dealId: "D-2024-031", stage: "closed_won", value: 540000 },
  },
  {
    sourceType: "crm",
    content: "Deal: Vestjysk Finans Rebrand – Stage: Proposal Sent. Value: 200,000 DKK (est). Owner: Oliver Kragh. Pitch meeting this Friday. 3 competing agencies.",
    connectorProvider: "hubspot",
    department: "Salg",
    personal: false,
    metadata: { dealId: "D-2024-034", stage: "proposal_sent", value: 200000, probability: 30 },
  },
  {
    sourceType: "crm",
    content: "Deal: Bygholm Consulting Renewal – Stage: Negotiation. Value: 190,000 DKK. Owner: Mette Lindberg. Meeting next Wednesday. Analytics dashboard add-on under discussion.",
    connectorProvider: "hubspot",
    department: "Salg",
    personal: false,
    metadata: { dealId: "D-2024-032", stage: "negotiation", value: 190000, probability: 80 },
  },
  {
    sourceType: "crm",
    content: "Deal: NextStep Education Discovery – Stage: Qualification. Value: 48,000 DKK. Owner: Sofie Bech. Proposal sent. Awaiting board approval. Follow-up next Thursday.",
    connectorProvider: "hubspot",
    department: "Salg",
    personal: false,
    metadata: { dealId: "D-2024-035", stage: "qualification", value: 48000, probability: 50 },
  },
  {
    sourceType: "crm",
    content: "Deal: ACH Phase 2 – Stage: Closed Won. Value: 285,000 DKK. Owner: Mette Lindberg. Start date April 1. Event platform + member portal. 4-month timeline.",
    connectorProvider: "hubspot",
    department: "Salg",
    personal: false,
    metadata: { dealId: "D-2024-033", stage: "closed_won", value: 285000 },
  },
  {
    sourceType: "crm",
    content: "Contact: Søren Fabricius (Nordlys Media ApS) – CEO. Primary contact for retainer. Last activity: retainer renewal signed Thursday. Relationship health: Excellent.",
    connectorProvider: "hubspot",
    department: "Salg",
    personal: false,
    metadata: { contactType: "client", company: "Nordlys Media ApS", role: "CEO" },
  },
  {
    sourceType: "crm",
    content: "Contact: Karen Holst (Dansk Energi Partners) – CEO. Concerned about timeline. Last activity: escalation meeting this week. Relationship health: At Risk.",
    connectorProvider: "hubspot",
    department: "Salg",
    personal: false,
    metadata: { contactType: "client", company: "Dansk Energi Partners", role: "CEO", health: "at_risk" },
  },
  {
    sourceType: "crm",
    content: "Contact: Lise Fjord (Fjordview Ejendomme) – Director. Dormant 8 months. Last outreach: Oliver emailed 2 weeks ago, no response. Consider re-engagement or archive.",
    connectorProvider: "hubspot",
    department: "Salg",
    personal: false,
    metadata: { contactType: "client", company: "Fjordview Ejendomme", role: "Director", health: "dormant" },
  },
  {
    sourceType: "crm",
    content: "Pipeline summary: 4 open deals, total weighted value 289,400 DKK. Vestjysk Finans (60k weighted), Bygholm renewal (152k), NextStep (24k), Fjordview re-engage (53.4k est).",
    connectorProvider: "hubspot",
    department: "Salg",
    personal: false,
    metadata: { reportType: "pipeline_summary" },
  },
  {
    sourceType: "crm",
    content: "Contact: Kristaps Bērziņš (Baltic Digital Group) – Managing Partner. Active referral partner. 2 qualified leads delivered in Q1. Partnership agreement in draft. 10% referral terms.",
    connectorProvider: "hubspot",
    department: "Salg",
    personal: false,
    metadata: { contactType: "partner", company: "Baltic Digital Group", role: "Managing Partner" },
  },
];

// ---------------------------------------------------------------------------
// Activity Signals – ~150 realistic signals across 4 weeks
// ---------------------------------------------------------------------------

export type ActivitySignalDef = {
  signalType: string;
  actorName?: string;
  targetNames?: string[];
  department?: string;
  metadata: Record<string, unknown>;
  daysAgo: number;
};

/**
 * Generate ~150 activity signals distributed over 4 weeks.
 * Week 0 (0–6 days) ~50, Week 1 (7–13) ~40, Week 2 (14–20) ~35, Week 3 (21–27) ~25.
 * 80 % weekday working hours (8–17), 15 % evening (17–20), 5 % weekends.
 */
export function generateActivitySignals(): ActivitySignalDef[] {
  const signals: ActivitySignalDef[] = [];

  // ── Helper: pick a weekday-biased fractional daysAgo within a range ──
  function dayInRange(minDay: number, maxDay: number): number {
    // Bias toward weekdays: try up to 5 times to land on Mon-Fri
    for (let attempt = 0; attempt < 5; attempt++) {
      const day = minDay + Math.random() * (maxDay - minDay);
      const date = new Date(Date.now() - day * 86_400_000);
      const dow = date.getDay(); // 0=Sun, 6=Sat
      if (dow >= 1 && dow <= 5) {
        // Apply working-hours bias via fractional part
        const r = Math.random();
        let hourFraction: number;
        if (r < 0.80) {
          // 8:00–17:00 → 0.33–0.71 of a day
          hourFraction = 8 / 24 + Math.random() * (9 / 24);
        } else if (r < 0.95) {
          // 17:00–20:00
          hourFraction = 17 / 24 + Math.random() * (3 / 24);
        } else {
          hourFraction = Math.random();
        }
        return Math.floor(day) + (1 - hourFraction); // invert so morning = larger fraction within the day
      }
    }
    // Fallback: accept whatever we got (covers the 5 % weekend case)
    return minDay + Math.random() * (maxDay - minDay);
  }

  function w0() { return dayInRange(0, 6.9); }
  function w1() { return dayInRange(7, 13.9); }
  function w2() { return dayInRange(14, 20.9); }
  function w3() { return dayInRange(21, 27.9); }

  // ═══════════════════════════════════════════════════════════════════════
  // email_sent (~40)
  // ═══════════════════════════════════════════════════════════════════════

  // Week 0 — 14
  signals.push(
    { signalType: "email_sent", actorName: "Jakob Friis", targetNames: ["Søren Fabricius", "Nordlys Media ApS"], department: "Salg", metadata: { subject: "RE: Nordlys retainer renewal" }, daysAgo: w0() },
    { signalType: "email_sent", actorName: "Thomas Nørgaard", targetNames: ["Karen Holst", "Dansk Energi Partners"], department: "Levering", metadata: { subject: "Project timeline update" }, daysAgo: w0() },
    { signalType: "email_sent", actorName: "Louise Winther", targetNames: ["Anders Vestergaard"], department: "Økonomi & Admin", metadata: { subject: "Overdue: INV-2024-090" }, daysAgo: w0() },
    { signalType: "email_sent", actorName: "Sofie Bech", targetNames: ["Anna Grøn", "GreenTech Nordic"], department: "Salg", metadata: { subject: "Welcome – GreenTech onboarding" }, daysAgo: w0() },
    { signalType: "email_sent", actorName: "Mette Lindberg", targetNames: ["Henrik Bygholm", "Bygholm Consulting"], department: "Salg", metadata: { subject: "Kontraktfornyelse" }, daysAgo: w0() },
    { signalType: "email_sent", actorName: "Oliver Kragh", targetNames: ["Jens Matthiesen", "Vestjysk Finans"], department: "Salg", metadata: { subject: "Opfølgning – Vestjysk Finans" }, daysAgo: w0() },
    { signalType: "email_sent", actorName: "Kasper Dahl", targetNames: ["Martin Aarup", "CloudNine Solutions"], department: "Levering", metadata: { subject: "TK-301 staging issues" }, daysAgo: w0() },
    { signalType: "email_sent", actorName: "Ida Holm", targetNames: ["Pernille Juul", "NextStep Education"], department: "Salg", metadata: { subject: "Discovery sprint proposal" }, daysAgo: w0() },
    { signalType: "email_sent", actorName: "Line Kjær", targetNames: ["Tom Andersen", "Roskilde Byg & Anlæg"], department: "Levering", metadata: { subject: "Project handover package" }, daysAgo: w0() },
    { signalType: "email_sent", actorName: "Emil Bruun", targetNames: ["Karen Holst", "Dansk Energi Partners"], department: "Levering", metadata: { subject: "Content pipeline fix update" }, daysAgo: w0() },
    { signalType: "email_sent", actorName: "Astrid Møller", targetNames: ["Frederik Lund"], department: "Marketing", metadata: { subject: "Nordlys case study draft" }, daysAgo: w0() },
    { signalType: "email_sent", actorName: "Nanna Skov", targetNames: ["Thomas Nørgaard"], department: "Levering", metadata: { subject: "TK-303 onboarding guide status" }, daysAgo: w0() },
    { signalType: "email_sent", actorName: "Jakob Friis", targetNames: ["Simon Krogh", "Aarhus Creative Hub"], department: "Salg", metadata: { subject: "ACH Phase 2 proposal" }, daysAgo: w0() },
    { signalType: "email_sent", actorName: "Maria Thomsen", targetNames: ["Anders Vestergaard"], department: "Økonomi & Admin", metadata: { subject: "Q1 revenue summary" }, daysAgo: w0() },
  );

  // Week 1 — 12
  signals.push(
    { signalType: "email_sent", actorName: "Mette Lindberg", targetNames: ["Kristaps Bērziņš", "Baltic Digital Group"], department: "Salg", metadata: { subject: "Partner agreement draft" }, daysAgo: w1() },
    { signalType: "email_sent", actorName: "Oliver Kragh", targetNames: ["Lise Fjord", "Fjordview Ejendomme"], department: "Salg", metadata: { subject: "Opfølgning" }, daysAgo: w1() },
    { signalType: "email_sent", actorName: "Thomas Nørgaard", targetNames: ["Karen Holst"], department: "Levering", metadata: { subject: "Dansk Energi weekly update" }, daysAgo: w1() },
    { signalType: "email_sent", actorName: "Sofie Bech", targetNames: ["Maja Winther", "Copenhagen Bikes A/S"], department: "Salg", metadata: { subject: "Project wrap-up" }, daysAgo: w1() },
    { signalType: "email_sent", actorName: "Line Kjær", targetNames: ["Anna Grøn", "GreenTech Nordic"], department: "Levering", metadata: { subject: "Brand guidelines for review" }, daysAgo: w1() },
    { signalType: "email_sent", actorName: "Kasper Dahl", targetNames: ["Martin Aarup"], department: "Levering", metadata: { subject: "CDN upgrade quote request" }, daysAgo: w1() },
    { signalType: "email_sent", actorName: "Louise Winther", targetNames: ["Peter Steen"], department: "Økonomi & Admin", metadata: { subject: "Overdue: INV-2024-094 ACH" }, daysAgo: w1() },
    { signalType: "email_sent", actorName: "Emil Bruun", targetNames: ["Henrik Bygholm", "Bygholm Consulting"], department: "Levering", metadata: { subject: "TK-304 resolved" }, daysAgo: w1() },
    { signalType: "email_sent", actorName: "Astrid Møller", targetNames: ["Camilla Juhl"], department: "Marketing", metadata: { subject: "March social calendar approved" }, daysAgo: w1() },
    { signalType: "email_sent", actorName: "Mette Lindberg", targetNames: ["Anders Vestergaard"], department: "Salg", metadata: { subject: "Baltic Digital referral fee terms" }, daysAgo: w1() },
    { signalType: "email_sent", actorName: "Thomas Nørgaard", targetNames: ["Kasper Dahl"], department: "Levering", metadata: { subject: "TK-305 ACH mobile – priority" }, daysAgo: w1() },
    { signalType: "email_sent", actorName: "Jakob Friis", targetNames: ["Mette Lindberg"], department: "Salg", metadata: { subject: "Bygholm expanded scope" }, daysAgo: w1() },
  );

  // Week 2 — 9
  signals.push(
    { signalType: "email_sent", actorName: "Oliver Kragh", targetNames: ["Mette Lindberg"], department: "Salg", metadata: { subject: "New prospect: Vestjysk Finans" }, daysAgo: w2() },
    { signalType: "email_sent", actorName: "Maria Thomsen", targetNames: ["Peter Steen"], department: "Økonomi & Admin", metadata: { subject: "Invoice status update" }, daysAgo: w2() },
    { signalType: "email_sent", actorName: "Nanna Skov", targetNames: ["Line Kjær"], department: "Levering", metadata: { subject: "GreenTech brand review request" }, daysAgo: w2() },
    { signalType: "email_sent", actorName: "Ida Holm", targetNames: ["Pernille Juul"], department: "Salg", metadata: { subject: "NextStep intro follow-up" }, daysAgo: w2() },
    { signalType: "email_sent", actorName: "Frederik Lund", targetNames: ["Astrid Møller"], department: "Marketing", metadata: { subject: "Case study performance stats" }, daysAgo: w2() },
    { signalType: "email_sent", actorName: "Kasper Dahl", targetNames: ["Thomas Nørgaard"], department: "Levering", metadata: { subject: "Nordlys staging migration complete" }, daysAgo: w2() },
    { signalType: "email_sent", actorName: "Louise Winther", targetNames: ["Karen Holst", "Dansk Energi Partners"], department: "Økonomi & Admin", metadata: { subject: "Payment reminder: INV-2024-090" }, daysAgo: w2() },
    { signalType: "email_sent", actorName: "Thomas Nørgaard", targetNames: ["Line Kjær"], department: "Levering", metadata: { subject: "Roskilde Byg final close" }, daysAgo: w2() },
    { signalType: "email_sent", actorName: "Mikkel Rask", targetNames: ["Astrid Møller"], department: "Marketing", metadata: { subject: "Bygholm SEO audit ready" }, daysAgo: w2() },
  );

  // Week 3 — 5
  signals.push(
    { signalType: "email_sent", actorName: "Mette Lindberg", targetNames: ["Søren Fabricius", "Nordlys Media ApS"], department: "Salg", metadata: { subject: "Retainer renewal terms" }, daysAgo: w3() },
    { signalType: "email_sent", actorName: "Sofie Bech", targetNames: ["Anna Grøn"], department: "Salg", metadata: { subject: "GreenTech welcome pack" }, daysAgo: w3() },
    { signalType: "email_sent", actorName: "Anders Vestergaard", targetNames: ["Thomas Nørgaard"], department: "CompanyHQ", metadata: { subject: "Junior dev hiring approval" }, daysAgo: w3() },
    { signalType: "email_sent", actorName: "Oliver Kragh", targetNames: ["Jens Matthiesen"], department: "Salg", metadata: { subject: "Initial credentials deck" }, daysAgo: w3() },
    { signalType: "email_sent", actorName: "Jakob Friis", targetNames: ["Simon Krogh"], department: "Salg", metadata: { subject: "ACH Phase 2 timeline draft" }, daysAgo: w3() },
  );

  // ═══════════════════════════════════════════════════════════════════════
  // email_received (~35)
  // ═══════════════════════════════════════════════════════════════════════

  // Week 0 — 12
  signals.push(
    { signalType: "email_received", actorName: "Søren Fabricius", targetNames: ["Jakob Friis", "Nordlys Media ApS"], department: "Salg", metadata: { subject: "Retainer approved" }, daysAgo: w0() },
    { signalType: "email_received", actorName: "Karen Holst", targetNames: ["Thomas Nørgaard", "Dansk Energi Partners"], department: "Levering", metadata: { subject: "RE: Timeline concerns" }, daysAgo: w0() },
    { signalType: "email_received", actorName: "Anna Grøn", targetNames: ["Sofie Bech", "GreenTech Nordic"], department: "Salg", metadata: { subject: "RE: Onboarding pack received" }, daysAgo: w0() },
    { signalType: "email_received", actorName: "Henrik Bygholm", targetNames: ["Mette Lindberg", "Bygholm Consulting"], department: "Salg", metadata: { subject: "RE: Renewal discussion" }, daysAgo: w0() },
    { signalType: "email_received", actorName: "Martin Aarup", targetNames: ["Kasper Dahl", "CloudNine Solutions"], department: "Levering", metadata: { subject: "RE: Staging fix confirmed" }, daysAgo: w0() },
    { signalType: "email_received", actorName: "Simon Krogh", targetNames: ["Jakob Friis", "Aarhus Creative Hub"], department: "Salg", metadata: { subject: "Phase 2 looks great" }, daysAgo: w0() },
    { signalType: "email_received", actorName: "Tom Andersen", targetNames: ["Line Kjær", "Roskilde Byg & Anlæg"], department: "Levering", metadata: { subject: "Deliverables confirmed" }, daysAgo: w0() },
    { signalType: "email_received", actorName: "Karen Holst", targetNames: ["Emil Bruun"], department: "Levering", metadata: { subject: "Thanks for the pipeline update" }, daysAgo: w0() },
    { signalType: "email_received", actorName: "Jens Matthiesen", targetNames: ["Oliver Kragh", "Vestjysk Finans"], department: "Salg", metadata: { subject: "Pitch meeting confirmed Friday" }, daysAgo: w0() },
    { signalType: "email_received", actorName: "Pernille Juul", targetNames: ["Ida Holm", "NextStep Education"], department: "Salg", metadata: { subject: "Board reviewing proposal" }, daysAgo: w0() },
    { signalType: "email_received", actorName: "Anna Grøn", targetNames: ["Line Kjær", "GreenTech Nordic"], department: "Levering", metadata: { subject: "Brand guidelines feedback" }, daysAgo: w0() },
    { signalType: "email_received", actorName: "Kristaps Bērziņš", targetNames: ["Mette Lindberg", "Baltic Digital Group"], department: "Salg", metadata: { subject: "RE: Partnership terms OK" }, daysAgo: w0() },
  );

  // Week 1 — 10
  signals.push(
    { signalType: "email_received", actorName: "Søren Fabricius", targetNames: ["Mette Lindberg", "Nordlys Media ApS"], department: "Salg", metadata: { subject: "Content scope increase approved" }, daysAgo: w1() },
    { signalType: "email_received", actorName: "Karen Holst", targetNames: ["Thomas Nørgaard"], department: "Levering", metadata: { subject: "Board deadline reminder" }, daysAgo: w1() },
    { signalType: "email_received", actorName: "Henrik Bygholm", targetNames: ["Emil Bruun", "Bygholm Consulting"], department: "Levering", metadata: { subject: "API issues — please fix ASAP" }, daysAgo: w1() },
    { signalType: "email_received", actorName: "Martin Aarup", targetNames: ["Kasper Dahl"], department: "Levering", metadata: { subject: "CDN quote: 1,400 DKK/mo" }, daysAgo: w1() },
    { signalType: "email_received", actorName: "Simon Krogh", targetNames: ["Thomas Nørgaard", "Aarhus Creative Hub"], department: "Levering", metadata: { subject: "Mobile bug blocking launch" }, daysAgo: w1() },
    { signalType: "email_received", actorName: "Maja Winther", targetNames: ["Sofie Bech", "Copenhagen Bikes A/S"], department: "Salg", metadata: { subject: "Testimonial attached" }, daysAgo: w1() },
    { signalType: "email_received", actorName: "Anna Grøn", targetNames: ["Thomas Nørgaard", "GreenTech Nordic"], department: "Levering", metadata: { subject: "Team excited about kick-off" }, daysAgo: w1() },
    { signalType: "email_received", actorName: "Kristaps Bērziņš", targetNames: ["Mette Lindberg"], department: "Salg", metadata: { subject: "Two new referral leads" }, daysAgo: w1() },
    { signalType: "email_received", actorName: "Pernille Juul", targetNames: ["Ida Holm"], department: "Salg", metadata: { subject: "Proposal looks promising" }, daysAgo: w1() },
    { signalType: "email_received", actorName: "Tom Andersen", targetNames: ["Thomas Nørgaard"], department: "Levering", metadata: { subject: "Final sign-off – thanks!" }, daysAgo: w1() },
  );

  // Week 2 — 8
  signals.push(
    { signalType: "email_received", actorName: "Henrik Bygholm", targetNames: ["Jakob Friis", "Bygholm Consulting"], department: "Salg", metadata: { subject: "Analytics dashboard interest" }, daysAgo: w2() },
    { signalType: "email_received", actorName: "Karen Holst", targetNames: ["Thomas Nørgaard"], department: "Levering", metadata: { subject: "Escalation needed" }, daysAgo: w2() },
    { signalType: "email_received", actorName: "Søren Fabricius", targetNames: ["Mette Lindberg"], department: "Salg", metadata: { subject: "Q4 results discussion" }, daysAgo: w2() },
    { signalType: "email_received", actorName: "Anna Grøn", targetNames: ["Sofie Bech"], department: "Salg", metadata: { subject: "Onboarding questions" }, daysAgo: w2() },
    { signalType: "email_received", actorName: "Jens Matthiesen", targetNames: ["Oliver Kragh"], department: "Salg", metadata: { subject: "Interested — send case studies" }, daysAgo: w2() },
    { signalType: "email_received", actorName: "Martin Aarup", targetNames: ["Kasper Dahl"], department: "Levering", metadata: { subject: "Migration schedule confirmed" }, daysAgo: w2() },
    { signalType: "email_received", actorName: "Pernille Juul", targetNames: ["Ida Holm"], department: "Salg", metadata: { subject: "Let's schedule an intro" }, daysAgo: w2() },
    { signalType: "email_received", actorName: "Simon Krogh", targetNames: ["Jakob Friis"], department: "Salg", metadata: { subject: "Phase 2 budget approved internally" }, daysAgo: w2() },
  );

  // Week 3 — 5
  signals.push(
    { signalType: "email_received", actorName: "Søren Fabricius", targetNames: ["Mette Lindberg"], department: "Salg", metadata: { subject: "Renewal terms look good" }, daysAgo: w3() },
    { signalType: "email_received", actorName: "Karen Holst", targetNames: ["Thomas Nørgaard"], department: "Levering", metadata: { subject: "Project kickoff confirmed" }, daysAgo: w3() },
    { signalType: "email_received", actorName: "Kristaps Bērziņš", targetNames: ["Mette Lindberg"], department: "Salg", metadata: { subject: "Referral: GreenTech Nordic" }, daysAgo: w3() },
    { signalType: "email_received", actorName: "Henrik Bygholm", targetNames: ["Jakob Friis"], department: "Salg", metadata: { subject: "Renewal timeline question" }, daysAgo: w3() },
    { signalType: "email_received", actorName: "Jens Matthiesen", targetNames: ["Oliver Kragh"], department: "Salg", metadata: { subject: "Initial meeting request" }, daysAgo: w3() },
  );

  // ═══════════════════════════════════════════════════════════════════════
  // meeting_held (~20)
  // ═══════════════════════════════════════════════════════════════════════

  // Week 0 — 8
  signals.push(
    { signalType: "meeting_held", actorName: "Thomas Nørgaard", targetNames: ["Karen Holst", "Anders Vestergaard", "Emil Bruun"], department: "Levering", metadata: { title: "Dansk Energi escalation", duration: 45 }, daysAgo: w0() },
    { signalType: "meeting_held", actorName: "Mette Lindberg", targetNames: ["Søren Fabricius", "Jakob Friis"], department: "Salg", metadata: { title: "Nordlys quarterly review", duration: 60 }, daysAgo: w0() },
    { signalType: "meeting_held", actorName: "Thomas Nørgaard", targetNames: ["Line Kjær", "Kasper Dahl", "Anna Grøn", "Sofie Bech"], department: "Levering", metadata: { title: "GreenTech kick-off", duration: 60 }, daysAgo: w0() },
    { signalType: "meeting_held", actorName: "Mette Lindberg", targetNames: ["Jakob Friis", "Oliver Kragh", "Sofie Bech", "Ida Holm"], department: "Salg", metadata: { title: "Weekly sales pipeline", duration: 30 }, daysAgo: w0() },
    { signalType: "meeting_held", actorName: "Anders Vestergaard", targetNames: ["Thomas Nørgaard"], department: "CompanyHQ", metadata: { title: "1:1 leadership", duration: 30 }, daysAgo: w0() },
    { signalType: "meeting_held", actorName: "Astrid Møller", targetNames: ["Frederik Lund", "Camilla Juhl", "Mikkel Rask"], department: "Marketing", metadata: { title: "Marketing retro", duration: 30 }, daysAgo: w0() },
    { signalType: "meeting_held", actorName: "Anders Vestergaard", targetNames: ["Louise Winther", "Peter Steen", "Maria Thomsen"], department: "Økonomi & Admin", metadata: { title: "Finance review", duration: 45 }, daysAgo: w0() },
    { signalType: "meeting_held", actorName: "Thomas Nørgaard", targetNames: ["Emil Bruun", "Kasper Dahl"], department: "Levering", metadata: { title: "TK-304 post-mortem", duration: 30 }, daysAgo: w0() },
  );

  // Week 1 — 6
  signals.push(
    { signalType: "meeting_held", actorName: "Jakob Friis", targetNames: ["Simon Krogh", "Thomas Nørgaard"], department: "Salg", metadata: { title: "ACH Phase 2 planning", duration: 45 }, daysAgo: w1() },
    { signalType: "meeting_held", actorName: "Kasper Dahl", targetNames: ["Martin Aarup"], department: "Levering", metadata: { title: "CloudNine monthly review", duration: 30 }, daysAgo: w1() },
    { signalType: "meeting_held", actorName: "Mette Lindberg", targetNames: ["Kristaps Bērziņš"], department: "Salg", metadata: { title: "Baltic Digital partner sync", duration: 30 }, daysAgo: w1() },
    { signalType: "meeting_held", actorName: "Thomas Nørgaard", targetNames: ["Line Kjær", "Tom Andersen"], department: "Levering", metadata: { title: "Roskilde Byg close", duration: 30 }, daysAgo: w1() },
    { signalType: "meeting_held", actorName: "Mette Lindberg", targetNames: ["Sofie Bech"], department: "Salg", metadata: { title: "1:1 Mette/Sofie", duration: 30 }, daysAgo: w1() },
    { signalType: "meeting_held", actorName: "Anders Vestergaard", targetNames: ["All staff"], department: "CompanyHQ", metadata: { title: "All-hands March", duration: 45 }, daysAgo: w1() },
  );

  // Week 2 — 4
  signals.push(
    { signalType: "meeting_held", actorName: "Oliver Kragh", targetNames: ["Jens Matthiesen", "Mette Lindberg"], department: "Salg", metadata: { title: "Vestjysk Finans intro", duration: 45 }, daysAgo: w2() },
    { signalType: "meeting_held", actorName: "Ida Holm", targetNames: ["Pernille Juul"], department: "Salg", metadata: { title: "NextStep Education intro", duration: 30 }, daysAgo: w2() },
    { signalType: "meeting_held", actorName: "Thomas Nørgaard", targetNames: ["Sofie Bech", "Astrid Møller"], department: "CompanyHQ", metadata: { title: "Copenhagen Bikes retrospective", duration: 30 }, daysAgo: w2() },
    { signalType: "meeting_held", actorName: "Thomas Nørgaard", targetNames: ["Anders Vestergaard"], department: "Levering", metadata: { title: "Delivery capacity planning", duration: 30 }, daysAgo: w2() },
  );

  // Week 3 — 2
  signals.push(
    { signalType: "meeting_held", actorName: "Mette Lindberg", targetNames: ["Jakob Friis"], department: "Salg", metadata: { title: "Bygholm renewal prep", duration: 30 }, daysAgo: w3() },
    { signalType: "meeting_held", actorName: "Thomas Nørgaard", targetNames: ["Line Kjær", "Kasper Dahl", "Nanna Skov", "Emil Bruun"], department: "Levering", metadata: { title: "Delivery standup", duration: 15 }, daysAgo: w3() },
  );

  // ═══════════════════════════════════════════════════════════════════════
  // deal_stage_changed (~12)
  // ═══════════════════════════════════════════════════════════════════════

  signals.push(
    { signalType: "deal_stage_changed", actorName: "Jakob Friis", targetNames: ["Nordlys Media ApS"], department: "Salg", metadata: { deal: "Nordlys Retainer Renewal", from: "Negotiation", to: "Closed Won", value: 540000 }, daysAgo: w0() },
    { signalType: "deal_stage_changed", actorName: "Jakob Friis", targetNames: ["Aarhus Creative Hub"], department: "Salg", metadata: { deal: "ACH Phase 2", from: "Proposal Sent", to: "Closed Won", value: 285000 }, daysAgo: w0() },
    { signalType: "deal_stage_changed", actorName: "Oliver Kragh", targetNames: ["Vestjysk Finans"], department: "Salg", metadata: { deal: "Vestjysk Finans Rebrand", from: "Qualification", to: "Proposal Sent", value: 200000 }, daysAgo: w0() },
    { signalType: "deal_stage_changed", actorName: "Ida Holm", targetNames: ["NextStep Education"], department: "Salg", metadata: { deal: "NextStep Discovery Sprint", from: "Initial Contact", to: "Qualification", value: 48000 }, daysAgo: w0() },
    { signalType: "deal_stage_changed", actorName: "Jakob Friis", targetNames: ["Bygholm Consulting"], department: "Salg", metadata: { deal: "Bygholm Renewal", from: "Proposal Sent", to: "Negotiation", value: 190000 }, daysAgo: w1() },
    { signalType: "deal_stage_changed", actorName: "Jakob Friis", targetNames: ["Aarhus Creative Hub"], department: "Salg", metadata: { deal: "ACH Phase 2", from: "Negotiation", to: "Proposal Sent", value: 285000 }, daysAgo: w1() },
    { signalType: "deal_stage_changed", actorName: "Oliver Kragh", targetNames: ["Vestjysk Finans"], department: "Salg", metadata: { deal: "Vestjysk Finans Rebrand", from: "Initial Contact", to: "Qualification", value: 200000 }, daysAgo: w2() },
    { signalType: "deal_stage_changed", actorName: "Ida Holm", targetNames: ["NextStep Education"], department: "Salg", metadata: { deal: "NextStep Discovery Sprint", from: "Lead", to: "Initial Contact", value: 48000 }, daysAgo: w2() },
    { signalType: "deal_stage_changed", actorName: "Jakob Friis", targetNames: ["Nordlys Media ApS"], department: "Salg", metadata: { deal: "Nordlys Retainer Renewal", from: "Proposal Sent", to: "Negotiation", value: 540000 }, daysAgo: w2() },
    { signalType: "deal_stage_changed", actorName: "Sofie Bech", targetNames: ["Copenhagen Bikes A/S"], department: "Salg", metadata: { deal: "Copenhagen Bikes Website", from: "Delivery", to: "Closed Won", value: 195000 }, daysAgo: w3() },
    { signalType: "deal_stage_changed", actorName: "Jakob Friis", targetNames: ["Bygholm Consulting"], department: "Salg", metadata: { deal: "Bygholm Renewal", from: "Qualification", to: "Proposal Sent", value: 190000 }, daysAgo: w3() },
    { signalType: "deal_stage_changed", actorName: "Jakob Friis", targetNames: ["Nordlys Media ApS"], department: "Salg", metadata: { deal: "Nordlys Retainer Renewal", from: "Qualification", to: "Proposal Sent", value: 540000 }, daysAgo: w3() },
  );

  // ═══════════════════════════════════════════════════════════════════════
  // invoice_created (~8)
  // ═══════════════════════════════════════════════════════════════════════

  signals.push(
    { signalType: "invoice_created", actorName: "Louise Winther", targetNames: ["Dansk Energi Partners"], department: "Økonomi & Admin", metadata: { invoiceRef: "INV-2024-096", amount: 68750, currency: "DKK" }, daysAgo: w0() },
    { signalType: "invoice_created", actorName: "Maria Thomsen", targetNames: ["Nordlys Media ApS"], department: "Økonomi & Admin", metadata: { invoiceRef: "INV-2024-095", amount: 45000, currency: "DKK" }, daysAgo: w0() },
    { signalType: "invoice_created", actorName: "Louise Winther", targetNames: ["Roskilde Byg & Anlæg"], department: "Økonomi & Admin", metadata: { invoiceRef: "INV-2024-093", amount: 16250, currency: "DKK" }, daysAgo: w1() },
    { signalType: "invoice_created", actorName: "Maria Thomsen", targetNames: ["Aarhus Creative Hub"], department: "Økonomi & Admin", metadata: { invoiceRef: "INV-2024-094", amount: 37500, currency: "DKK" }, daysAgo: w1() },
    { signalType: "invoice_created", actorName: "Louise Winther", targetNames: ["GreenTech Nordic"], department: "Økonomi & Admin", metadata: { invoiceRef: "INV-2024-092", amount: 23750, currency: "DKK" }, daysAgo: w2() },
    { signalType: "invoice_created", actorName: "Maria Thomsen", targetNames: ["Bygholm Consulting"], department: "Økonomi & Admin", metadata: { invoiceRef: "INV-2024-091", amount: 35000, currency: "DKK" }, daysAgo: w2() },
    { signalType: "invoice_created", actorName: "Louise Winther", targetNames: ["Dansk Energi Partners"], department: "Økonomi & Admin", metadata: { invoiceRef: "INV-2024-090", amount: 68750, currency: "DKK" }, daysAgo: w2() },
    { signalType: "invoice_created", actorName: "Maria Thomsen", targetNames: ["Nordlys Media ApS"], department: "Økonomi & Admin", metadata: { invoiceRef: "INV-2024-089", amount: 45000, currency: "DKK" }, daysAgo: w3() },
  );

  // ═══════════════════════════════════════════════════════════════════════
  // invoice_paid (~5)
  // ═══════════════════════════════════════════════════════════════════════

  signals.push(
    { signalType: "invoice_paid", actorName: "Nordlys Media ApS", targetNames: ["Nordlys Media ApS"], department: "Økonomi & Admin", metadata: { invoiceRef: "INV-2024-089", amount: 45000, currency: "DKK" }, daysAgo: w0() },
    { signalType: "invoice_paid", actorName: "Bygholm Consulting", targetNames: ["Bygholm Consulting"], department: "Økonomi & Admin", metadata: { invoiceRef: "INV-2024-091", amount: 35000, currency: "DKK" }, daysAgo: 0.3 },
    { signalType: "invoice_paid", actorName: "GreenTech Nordic", targetNames: ["GreenTech Nordic"], department: "Økonomi & Admin", metadata: { invoiceRef: "INV-2024-092", amount: 23750, currency: "DKK" }, daysAgo: w1() },
  );

  // ═══════════════════════════════════════════════════════════════════════
  // ticket_opened (~5)
  // ═══════════════════════════════════════════════════════════════════════

  signals.push(
    { signalType: "ticket_opened", actorName: "Kasper Dahl", targetNames: ["Nordlys Media ApS"], department: "Levering", metadata: { ticketRef: "TK-301", title: "Staging login broken", priority: "medium" }, daysAgo: w1() },
    { signalType: "ticket_opened", actorName: "Emil Bruun", targetNames: ["Dansk Energi Partners"], department: "Levering", metadata: { ticketRef: "TK-302", title: "Content pipeline broken", priority: "high" }, daysAgo: w1() },
    { signalType: "ticket_opened", actorName: "Nanna Skov", targetNames: ["GreenTech Nordic"], department: "Levering", metadata: { ticketRef: "TK-303", title: "Onboarding guide needed", priority: "medium" }, daysAgo: w1() },
    { signalType: "ticket_opened", actorName: "Emil Bruun", targetNames: ["Bygholm Consulting"], department: "Levering", metadata: { ticketRef: "TK-304", title: "API rate limits", priority: "high" }, daysAgo: w1() },
    { signalType: "ticket_opened", actorName: "Kasper Dahl", targetNames: ["Aarhus Creative Hub"], department: "Levering", metadata: { ticketRef: "TK-305", title: "Mobile rendering bug", priority: "critical" }, daysAgo: w1() },
  );

  // ═══════════════════════════════════════════════════════════════════════
  // ticket_resolved (~3)
  // ═══════════════════════════════════════════════════════════════════════

  signals.push(
    { signalType: "ticket_resolved", actorName: "Kasper Dahl", targetNames: ["Nordlys Media ApS"], department: "Levering", metadata: { ticketRef: "TK-301", title: "Staging login fixed", resolution: "CloudNine migration resolved the issue" }, daysAgo: w0() },
    { signalType: "ticket_resolved", actorName: "Emil Bruun", targetNames: ["Bygholm Consulting"], department: "Levering", metadata: { ticketRef: "TK-304", title: "API rate limits resolved", resolution: "Added request throttling + Redis cache" }, daysAgo: w0() },
    { signalType: "ticket_resolved", actorName: "Kasper Dahl", targetNames: ["Aarhus Creative Hub"], department: "Levering", metadata: { ticketRef: "TK-305", title: "Mobile bug fixed", resolution: "Viewport meta tag corrected" }, daysAgo: w0() },
  );

  // ═══════════════════════════════════════════════════════════════════════
  // document_shared (~8)
  // ═══════════════════════════════════════════════════════════════════════

  signals.push(
    { signalType: "document_shared", actorName: "Line Kjær", targetNames: ["Anna Grøn", "GreenTech Nordic"], department: "Levering", metadata: { title: "Brand guidelines v1", type: "google-drive" }, daysAgo: w0() },
    { signalType: "document_shared", actorName: "Jakob Friis", targetNames: ["Henrik Bygholm", "Bygholm Consulting"], department: "Salg", metadata: { title: "Renewal proposal draft", type: "google-drive" }, daysAgo: w0() },
    { signalType: "document_shared", actorName: "Oliver Kragh", targetNames: ["Jens Matthiesen", "Vestjysk Finans"], department: "Salg", metadata: { title: "Pitch deck + case studies", type: "google-drive" }, daysAgo: w0() },
    { signalType: "document_shared", actorName: "Ida Holm", targetNames: ["Pernille Juul", "NextStep Education"], department: "Salg", metadata: { title: "Discovery sprint proposal", type: "google-drive" }, daysAgo: w1() },
    { signalType: "document_shared", actorName: "Line Kjær", targetNames: ["Tom Andersen", "Roskilde Byg & Anlæg"], department: "Levering", metadata: { title: "Handover package", type: "google-drive" }, daysAgo: w1() },
    { signalType: "document_shared", actorName: "Astrid Møller", targetNames: ["Frederik Lund", "Camilla Juhl"], department: "Marketing", metadata: { title: "Copenhagen Bikes case study", type: "google-drive" }, daysAgo: w1() },
    { signalType: "document_shared", actorName: "Mikkel Rask", targetNames: ["Astrid Møller", "Jakob Friis"], department: "Marketing", metadata: { title: "Bygholm SEO audit report", type: "google-drive" }, daysAgo: w0() },
    { signalType: "document_shared", actorName: "Nanna Skov", targetNames: ["Anna Grøn", "GreenTech Nordic"], department: "Levering", metadata: { title: "Onboarding guide (TK-303)", type: "google-drive" }, daysAgo: w0() },
  );

  // ═══════════════════════════════════════════════════════════════════════
  // slack_message (~15)
  // ═══════════════════════════════════════════════════════════════════════

  signals.push(
    { signalType: "slack_message", actorName: "Jakob Friis", targetNames: ["Nordlys Media ApS"], department: "Salg", metadata: { channel: "#salg", snippet: "Nordlys retainer renewal confirmed" }, daysAgo: w0() },
    { signalType: "slack_message", actorName: "Emil Bruun", targetNames: ["Dansk Energi Partners"], department: "Levering", metadata: { channel: "#levering", snippet: "TK-302 fix deployed and verified" }, daysAgo: w0() },
    { signalType: "slack_message", actorName: "Kasper Dahl", targetNames: ["Aarhus Creative Hub"], department: "Levering", metadata: { channel: "#levering", snippet: "TK-305 mobile bug fixed" }, daysAgo: w0() },
    { signalType: "slack_message", actorName: "Louise Winther", targetNames: ["Dansk Energi Partners", "Aarhus Creative Hub"], department: "Økonomi & Admin", metadata: { channel: "#general", snippet: "Two overdue invoices outstanding" }, daysAgo: w0() },
    { signalType: "slack_message", actorName: "Anders Vestergaard", department: "CompanyHQ", metadata: { channel: "#general", snippet: "Q1: 1.42M DKK revenue, 23% margin" }, daysAgo: w0() },
    { signalType: "slack_message", actorName: "Mette Lindberg", targetNames: ["Baltic Digital Group"], department: "Salg", metadata: { channel: "#salg", snippet: "Two warm leads from Kristaps" }, daysAgo: w0() },
    { signalType: "slack_message", actorName: "Line Kjær", targetNames: ["GreenTech Nordic"], department: "Levering", metadata: { channel: "#levering", snippet: "GreenTech kick-off went great" }, daysAgo: w0() },
    { signalType: "slack_message", actorName: "Nanna Skov", targetNames: ["GreenTech Nordic"], department: "Levering", metadata: { channel: "#levering", snippet: "TK-303 onboarding guide published" }, daysAgo: w0() },
    { signalType: "slack_message", actorName: "Astrid Møller", department: "Marketing", metadata: { channel: "#marketing", snippet: "Nordlys case study: 1.2k LinkedIn views" }, daysAgo: w1() },
    { signalType: "slack_message", actorName: "Sofie Bech", targetNames: ["Fjordview Ejendomme"], department: "Salg", metadata: { channel: "#salg", snippet: "Any update from Lise at Fjordview?" }, daysAgo: w1() },
    { signalType: "slack_message", actorName: "Oliver Kragh", targetNames: ["Fjordview Ejendomme"], department: "Salg", metadata: { channel: "#salg", snippet: "Will try calling Lise directly" }, daysAgo: w1() },
    { signalType: "slack_message", actorName: "Kasper Dahl", targetNames: ["Bygholm Consulting", "CloudNine Solutions"], department: "Levering", metadata: { channel: "#levering", snippet: "CDN quote from CloudNine: 1,400/mo" }, daysAgo: w1() },
    { signalType: "slack_message", actorName: "Line Kjær", targetNames: ["Roskilde Byg & Anlæg"], department: "Levering", metadata: { channel: "#general", snippet: "Roskilde Byg officially wrapped" }, daysAgo: w1() },
    { signalType: "slack_message", actorName: "Anders Vestergaard", department: "CompanyHQ", metadata: { channel: "#general", snippet: "Company offsite May 16-17 in Skagen" }, daysAgo: w1() },
    { signalType: "slack_message", actorName: "Camilla Juhl", department: "Marketing", metadata: { channel: "#marketing", snippet: "April marketing calendar drafted" }, daysAgo: w0() },
  );

  return signals;
}
