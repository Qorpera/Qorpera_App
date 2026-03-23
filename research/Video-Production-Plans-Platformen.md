# Video Production Plans — Platformen Page

**Created:** 2026-03-22
**For:** 7 section videos + 1 hero overview for qorpera.com/platform
**Format:** Screen recordings with voiceover narration (Danish)
**Tools:** Screen Studio ($9/mo) + Descript ($16/mo) + Bunny.net Stream (~$2/mo)

---

## Seed Data: The Demo Company

All videos use the same fictional company for continuity. Prepare this data before recording anything.

### Company: Meridian Teknik ApS

- **Industry:** Technical services / facility management
- **Size:** 32 employees across 4 departments
- **Connected tools:** Gmail, Google Calendar, Google Drive, HubSpot, Stripe, Slack

### Departments

| Department | Head | Members |
|---|---|---|
| **Salg** (Sales) | Mikkel Rahbek | Sofie Lund, Kasper Holm, Nadia Al-Rashid |
| **Drift** (Operations) | Camilla Vestergaard | Jonas Bech, Emilie Poulsen, Rasmus Kjær, Lena Friis, Anders Møller |
| **Økonomi** (Finance) | Thomas Winther | Maria Skov, Peter Dalsgaard |
| **Kundeservice** (Support) | Katrine Nørgaard | Julie Henriksen, Sebastian Gram, Amira Hassan |

### Entities in the System

**Contacts (from HubSpot):**
- NordByg A/S — Jens Fabricius (CEO), active deal "Serviceaftale 2026" (DKK 485.000)
- Roskilde Kommune — Anne-Mette Olsen (indkøber), deal "Vedligehold Q2" (DKK 192.000)
- GreenTech Solutions — Mark Sørensen, churning customer with overdue invoice
- Vestjysk Energi — Helle Kristensen, new prospect

**Invoices (from Stripe):**
- INV-2024-0891 — GreenTech Solutions — DKK 47.500 — **42 dage forfalden**
- INV-2024-0903 — NordByg A/S — DKK 128.000 — betalt
- INV-2024-0915 — Roskilde Kommune — DKK 64.000 — afventer

**Recent emails (Gmail):**
- Jens Fabricius → Mikkel Rahbek: "Vi overvejer at udvide aftalen"
- GreenTech (Mark Sørensen): 3 ubesvarede mails over 2 uger
- Anne-Mette Olsen → Camilla Vestergaard: "Kan I starte mandag?"

**Slack messages:**
- #salg: Mikkel: "NordByg vil gerne tale om udvidelse næste uge"
- #drift: Jonas: "GreenTech-opgaven mangler stadig bekræftelse"
- #general: Camilla: "Husk fredagsbar kl 15"

### Pre-Built Situations

1. **Frafaldrisiko: GreenTech Solutions** — Severity: high (0.82). Evidence: 42-day overdue invoice + 3 unanswered emails + no activity in 18 days + contract renewal in 6 weeks. Proposed action: Escalation email from Katrine to Mark.
2. **Udvidelsesmulighed: NordByg A/S** — Severity: medium (0.55). Evidence: CEO email about expansion + active deal + strong payment history. Proposed action: Schedule meeting via Mikkel's calendar.
3. **Ressourcekonflikt: Drift** — Severity: medium (0.48). Evidence: Roskilde wants Monday start + 3 technicians already booked + GreenTech tasks unconfirmed. Proposed action: Notify Camilla with calendar conflict summary.

### Policies

1. "Kræv godkendelse på alle eksterne mails" — effect: REQUIRE_APPROVAL
2. "Blokér sletning af kontakter" — effect: DENY
3. "Tillad automatisk kalenderopdatering" — effect: ALLOW, scope: Drift department

### Autonomy Levels

- "Forfalden faktura" situation type: **notify** (82% approval rate, 14 streak)
- "Udvidelsesmulighed": **supervised** (new type, 3 proposed)
- "Ressourcekonflikt": **supervised** (67% approval rate)
- "Ubesvaret henvendelse": **notify** (91% approval rate, 22 streak)

---

## Recording Setup Checklist

Before recording any video:

- [ ] Close all notifications (macOS: Focus Mode)
- [ ] Set display to 1920×1080
- [ ] Open Qorpera in Chrome, logged in as admin of Meridian Teknik
- [ ] Clear browser tabs except Qorpera
- [ ] Seed database with all Meridian data (run seed script)
- [ ] Verify all situations, entities, policies are present
- [ ] Screen Studio: recording area = browser window only (no OS chrome)
- [ ] Screen Studio: enable smooth cursor + click highlights
- [ ] Test recording: 10 seconds, verify quality

---

## Video 0: Hero Overview

> Shown at the top of the Platformen page as the primary introduction.

**Label on page:** (no current placeholder — this is the page hero)
**Target length:** 75–90 seconds
**Narrative style:** Story-driven — follow one situation through the entire system
**Narration language:** Danish

### Story Thread

Follow the GreenTech churn-risk situation from detection to resolution, touching every product area in one continuous flow.

### Shot List

| # | Duration | Screen | Action | Narration (DA) |
|---|---|---|---|---|
| 1 | 0:00–0:08 | Map page — full org chart | Slow pan across the org chart. Hover over Drift department to show member count. | "Meridian Teknik har 32 medarbejdere, fire afdelinger, og data der flyder fra fem systemer." |
| 2 | 0:08–0:18 | Map → zoom to GreenTech entity | Click GreenTech in the entity list or graph. Show the entity card with overdue invoice badge and linked contacts. | "GreenTech Solutions har en forfalden faktura, ubesvarede mails, og en fornyelse om seks uger. Det er spredt over tre systemer." |
| 3 | 0:18–0:30 | Situations page — list | Click to Situations. Show the situation list with GreenTech at the top, severity dot red. Click to open detail. | "Qorpera har allerede set mønstret. Den kombinerer signalerne til én situation — med bevisspor." |
| 4 | 0:30–0:42 | Situation detail — evidence + reasoning | Scroll through the context snapshot: invoice data, email timeline, activity gap. Show the reasoning section with analysis text. | "Faktura 42 dage forfalden. Tre mails uden svar. Ingen aktivitet i 18 dage. Fornyelse om seks uger. Konklusion: frafaldrisiko." |
| 5 | 0:42–0:52 | Situation detail — proposed action | Scroll to the action section. Show the draft email from Katrine to GreenTech with the provider dot. | "AI'en foreslår en handling — en opfølgningsmail. Men den sender den ikke selv." |
| 6 | 0:52–1:00 | Approvals — click approve | Show the approve button. Click it. Show the confirmation. | "I godkender. Eller I tilpasser. Eller I afviser — og AI'en lærer af beslutningen." |
| 7 | 1:00–1:10 | Copilot — quick question | Switch to Copilot. Type "Hvordan går det med GreenTech?" Show the streaming response with source references. | "Og I kan altid spørge. Rådgiveren svarer med data — aldrig gætværk." |
| 8 | 1:10–1:20 | Governance — trust gradient | Switch to Governance. Show the trust gradient bar. Hover over "Forfalden faktura" showing 82% approval rate. | "Efterhånden som I godkender, stiger tilliden. AI'en går fra at foreslå — til at handle selv." |

**Total:** ~80 seconds

### Recording Notes
- Record in one continuous browser session — the story should feel like one flow
- Use Screen Studio zoom to focus on key elements (entity card, severity dot, draft email, approve button)
- Keep mouse movements deliberate and slow
- Pause briefly (1–2s) on each key reveal before narrating
- Speed up navigation transitions (switching pages) to 2x in post

---

## Video 1: Opsætning og Onboarding

> Section: "Kom i gang" — "Opsætning på under 10 minutter."

**Placeholder label:** "Opsætning og onboarding"
**Target length:** 60–75 seconds
**Narrative style:** Setup walkthrough — show how fast you go from zero to running
**Narration language:** Danish

### Shot List

| # | Duration | Screen | Action | Narration (DA) |
|---|---|---|---|---|
| 1 | 0:00–0:08 | Onboarding step 1 — company info | Show the clean form. Type "Meridian Teknik" as company name. Select "Teknisk service" from industry dropdown. Click continue. | "Start med jeres firmanavn og branche. Det tager ti sekunder." |
| 2 | 0:08–0:20 | Onboarding step 2 — departments | Show the visual department builder with HQ radiating outward. Click "+ Afdeling", type "Salg". Repeat quickly for "Drift". Show the visual node layout growing. | "Byg jeres afdelinger. De danner skelettet for alt det AI'en lærer." |
| 3 | 0:20–0:30 | Onboarding step 3 — team members | Show the accordion per department. Add "Mikkel Rahbek" to Salg with rolle "Salgschef". Show the member appearing in the list. | "Tilføj teammedlemmer med navn, mail og rolle." |
| 4 | 0:30–0:38 | Onboarding step 4 — documents | Show the file upload area. Drag a document (e.g., "Procesvejledning-2026.pdf") into the drop zone. Show upload progress. | "Upload playbooks og vejledninger. De bliver til søgbar viden for AI'en." |
| 5 | 0:38–0:50 | Onboarding step 5 — connectors | Show the OAuth button grid. Click "Google" — show the OAuth popup briefly (or a quick cut). Click "HubSpot". Show both appearing as "Connected". | "Forbind jeres værktøjer med ét klik. OAuth — ingen API-nøgler, ingen konfiguration." |
| 6 | 0:50–0:60 | Onboarding step 6 — sync | Show the real-time sync progress with event counts ticking up. Show "Events: 234", "Kontakter: 47", "Mails: 128" counting up. | "Data flyder ind med det samme. Inden for timer ser I de første situationer." |
| 7 | 0:60–0:68 | Redirect to Map page | Show the redirect to the org chart. Brief view of the populated map with departments and connected entities starting to appear. | "Klar. Jeres virksomhed er live." |

**Total:** ~68 seconds

### Recording Notes
- This video should feel FAST. Speed up typing to 2x in post-production.
- The progress bar at the top of onboarding should be visible — it communicates progress.
- For the OAuth popup: either show a quick flash of the Google consent screen or cut to the "connected" state. Don't dwell on OAuth details.
- The sync step is the "aha moment" — let the numbers tick up for a few seconds at real speed.
- End with a wide shot of the populated map to create anticipation for the next video.

---

## Video 2: Organisationskortet (The Map)

> Section: "Kortet" — "Jeres virksomhed, ét overblik."

**Placeholder label:** "Organisationskortet"
**Target length:** 50–65 seconds
**Narrative style:** Feature exploration — show the living org chart
**Narration language:** Danish

### Shot List

| # | Duration | Screen | Action | Narration (DA) |
|---|---|---|---|---|
| 1 | 0:00–0:10 | Map page — wide view | Start zoomed out showing the full org chart: HQ box center, 4 departments radiating, team members in grids. Slow zoom in. | "Jeres virksomhed som ét overblik. Afdelinger, medarbejdere, og alt der forbinder dem." |
| 2 | 0:10–0:20 | Map — hover Salg department | Hover over the Salg department card. Show the member count badge, situation count badge. Click to expand. Show Mikkel, Sofie, Kasper, Nadia. | "Klik ind i en afdeling. Se hvem der er der, hvad der sker, og hvilke situationer AI'en følger." |
| 3 | 0:20–0:30 | Map — entity detail | Click on Mikkel Rahbek's member card. Show the entity detail: role, email, linked contacts (NordByg, GreenTech), recent activity timeline. | "Hver person er forbundet til kontakter, deals og opgaver fra jeres systemer. Automatisk." |
| 4 | 0:30–0:40 | Map — external entities | Pan to show external entities (NordByg, GreenTech, Roskilde Kommune) floating outside the department structure. Click one to show relationship chains. | "Kunder og partnere flyder ind fra HubSpot og Stripe. De kobles til de rigtige afdelinger og personer." |
| 5 | 0:40–0:50 | Map — document upload | Show a document entity linked to Drift department. Click it to show the document properties — chunked, embedded, searchable. | "Dokumenter bliver til søgbar viden. AI'en bruger dem når den vurderer situationer i den afdeling." |
| 6 | 0:50–0:58 | Map — zoom out | Zoom back out to the full org chart. Brief pause on the complete picture. | "Ét overblik. Altid opdateret. Bygget af jer, beriget af AI'en." |

**Total:** ~58 seconds

### Recording Notes
- This is the most visual video — the org chart is Qorpera's signature UI element.
- Use Screen Studio's zoom to focus on cards and entity details during close-ups.
- The pan from internal departments to external entities floating outside is an important visual — it communicates how CRM data connects.
- Keep the mouse movement smooth and deliberate — this is a "tour" pace, not a "doing work" pace.
- Make sure entity cards show realistic data (real-looking names, actual deal values in DKK).

---

## Video 3: Situationer og Detektering

> Section: "Situationer" — "De ting I overser i dag."

**Placeholder label:** "Situationer og detektering"
**Target length:** 65–80 seconds
**Narrative style:** Problem-first — show how scattered signals become one actionable situation
**Narration language:** Danish

### Shot List

| # | Duration | Screen | Action | Narration (DA) |
|---|---|---|---|---|
| 1 | 0:00–0:10 | Situations page — list view | Show the situations sidebar with 3–5 situations. GreenTech at top with red severity dot. NordByg with amber dot. Others with gray. Filter tabs visible (alle/afventer/løst). | "Situationer er mønstre — sammensat af signaler fra flere systemer. Qorpera finder dem, så I ikke behøver lede." |
| 2 | 0:10–0:22 | Click GreenTech situation | Click the GreenTech situation. Detail pane opens. Show header: "Frafaldrisiko: GreenTech Solutions", severity badge 0.82, confidence %, status "Afventer". | "GreenTech Solutions: frafaldrisiko. Alvorlighedsgrad 82%. Lad os se hvorfor." |
| 3 | 0:22–0:38 | Scroll through evidence | Scroll the context snapshot section slowly. Show: (1) Invoice data — 42 dage forfalden, DKK 47.500. (2) Email timeline — 3 ubesvarede over 14 dage. (3) Activity gap — ingen aktivitet i 18 dage. (4) Contract data — fornyelse om 6 uger. | "Forfalden faktura. Tre ubesvarede mails. Ingen aktivitet i 18 dage. Fornyelse om seks uger. Fire signaler fra tre systemer — samlet i én situation." |
| 4 | 0:38–0:50 | Reasoning section | Scroll to the reasoning section. Show the analysis text explaining the churn risk pattern. Show the considered actions list (expandable) — escalation email, manager notification, calendar reminder. | "AI'en har vurderet situationen, overvejet tre mulige handlinger, og anbefalet den mest effektive." |
| 5 | 0:50–0:60 | Proposed action | Scroll to the action section. Show the draft email: from Katrine Nørgaard to Mark Sørensen at GreenTech. Show the email preview with professional Danish text. Provider dot for Gmail visible. | "En konkret handling — klar til gennemsyn. Med fuldt bevisspor, så I ved præcis hvorfor." |
| 6 | 0:60–0:72 | Switch to NordByg situation | Click NordByg in the sidebar list. Show a different situation type — "Udvidelsesmulighed" with amber severity. Briefly show the evidence: CEO email about expansion + active deal + payment history. | "Ikke kun risici. Også muligheder. En CEO der nævner udvidelse, en aktiv deal, og stærk betalingshistorik." |

**Total:** ~72 seconds

### Recording Notes
- The evidence scrolling (shot 3) is the money shot of this video. Pace it so each data point gets 3–4 seconds of screen time.
- Use Screen Studio zoom to focus on the severity badge, the invoice amount, the email count — the specific numbers that make it concrete.
- The contrast between GreenTech (risk, red) and NordByg (opportunity, amber) shows range. Don't skip the second situation.
- The draft email preview should look professional — make sure the seed data has a well-written Danish email, not placeholder text.
- Speed up the click transition between situations to 1.5x.

---

## Video 4: Rådgiveren i Brug

> Section: "Rådgiver" — "Stil spørgsmål, få svar med kilde."

**Placeholder label:** "Rådgiveren i brug"
**Target length:** 50–65 seconds
**Narrative style:** Conversational demonstration — show real questions with sourced answers
**Narration language:** Danish

### Shot List

| # | Duration | Screen | Action | Narration (DA) |
|---|---|---|---|---|
| 1 | 0:00–0:08 | Copilot page — empty conversation | Show the clean chat interface. "Qorpera" label visible. Sidebar with history. New conversation started. | "Rådgiveren kender jeres virksomhed. Stil et spørgsmål — på dansk, i naturligt sprog." |
| 2 | 0:08–0:22 | Type + receive answer | Type: "Hvordan går det med GreenTech?" — show typing. Send. Show the streaming response with typewriter animation. Response mentions: overdue invoice (kilde: Stripe), unanswered emails (kilde: Gmail), churn risk situation (kilde: Situationer). Source references highlighted. | "Hvert svar har en kilde. Fakturadata fra Stripe. Mailhistorik fra Gmail. Den gætter aldrig." |
| 3 | 0:22–0:34 | Second question — broader | Type: "Hvilke deals er i risiko denne uge?" Send. Show response listing 2 deals with specific amounts and risk factors. Each with source references. | "Spørg bredt — den trækker på tværs af systemer. Kontakter, deals, fakturaer, mails, kalender." |
| 4 | 0:34–0:46 | Action request | Type: "Send en opfølgningsmail til Mark hos GreenTech." Send. Show response indicating the action requires approval — with a draft email preview and "Afventer godkendelse" status. | "Den kan også handle. Sende mails, opdatere CRM, oprette opgaver. Men kun med jeres tilladelse." |
| 5 | 0:46–0:58 | History sidebar | Click on a previous session in the sidebar. Show it loading with a different conversation topic (e.g., "Q1-rapport status"). Brief scroll through that conversation. | "Alt gemmes. Gå tilbage til tidligere samtaler. Jeres rådgiver husker konteksten." |

**Total:** ~58 seconds

### Recording Notes
- The typewriter streaming animation is key — let it play at real speed for the first response. It communicates that the AI is "thinking" and builds anticipation.
- For the second and third questions, speed up the typing to 2x but keep the response streaming at real speed.
- Source references (kilde: Stripe, kilde: Gmail) must be clearly visible. Use Screen Studio zoom to highlight them.
- The action request (shot 4) is important — it shows the advisor can DO things, not just answer. But the "Afventer godkendelse" status shows it respects governance. This bridges to the Approvals video.
- Pre-type the questions in a text file and paste them to avoid typos during recording. Then speed up the "typing" in post to look natural.

### Pre-Written Questions (paste during recording)

```
Hvordan går det med GreenTech?
Hvilke deals er i risiko denne uge?
Send en opfølgningsmail til Mark hos GreenTech.
```

### Pre-Written Copilot Responses (seed in system or have ready)

**Response 1 — GreenTech:**
> GreenTech Solutions har flere advarselstegn:
> - **Forfalden faktura** (42 dage, DKK 47.500) *(kilde: Stripe)*
> - **3 ubesvarede mails** fra Mark Sørensen over de seneste 14 dage *(kilde: Gmail)*
> - **Kontraktfornyelse** om 6 uger *(kilde: HubSpot)*
> - Der er oprettet en **frafaldrisiko-situation** med alvorlighedsgrad 82% *(kilde: Situationer)*
>
> Anbefaling: Eskalér med en personlig opfølgning fra kundeservice.

**Response 2 — Deals i risiko:**
> To deals har risikosignaler denne uge:
> 1. **GreenTech Solutions** — DKK 47.500 forfalden, frafaldrisiko 82% *(kilde: Stripe, Gmail)*
> 2. **Roskilde Kommune** — "Vedligehold Q2" afventer bekræftelse, Anne-Mette spørger om start mandag men drift har ressourcekonflikt *(kilde: Gmail, Kalender)*

---

## Video 5: Godkendelsesflowet

> Section: "Godkendelser" — "Godkend, tilpas eller afvis."

**Placeholder label:** "Godkendelsesflowet"
**Target length:** 40–50 seconds
**Narrative style:** Action-focused — show the three choices and what happens
**Narration language:** Danish

### Shot List

| # | Duration | Screen | Action | Narration (DA) |
|---|---|---|---|---|
| 1 | 0:00–0:08 | Situation detail — action section | Start on the GreenTech situation's proposed action. Show the draft email clearly: from, to, subject, body preview. Evidence summary visible above. | "AI'en har fundet en situation og foreslår en handling. I ser præcis hvad den vil gøre — og hvorfor." |
| 2 | 0:08–0:18 | Hover over three buttons | Show the three action buttons: Godkend (green), Tilpas (amber), Afvis (red). Hover over each to show tooltips or visual feedback. | "Tre valg. Godkend udfører handlingen. Tilpas lader jer justere teksten. Afvis fortæller AI'en at det ikke var den rigtige handling." |
| 3 | 0:18–0:26 | Click "Godkend" | Click the approve button. Show the confirmation animation/status change. The situation status changes to "Godkendt" or "Udført". | "Godkend. Mailen sendes via jeres eget login. Ingenting sker bag jeres ryg." |
| 4 | 0:26–0:36 | Switch to second situation — reject | Navigate to the NordByg situation. Show its proposed action (schedule meeting). Click "Afvis". Show the feedback form appearing — category dropdown + text field. Type brief feedback: "Vi venter til næste kvartal". | "Afvis? Skriv hvorfor. AI'en bruger jeres feedback til at blive bedre næste gang." |
| 5 | 0:36–0:46 | Governance page — track record | Quick cut to Governance page. Show the trust gradient bar. Point to "Forfalden faktura" type with 82% approval rate, 14 streak. | "Hver beslutning bygger track record. Over tid kan I give AI'en mere ansvar — eller trække det tilbage." |

**Total:** ~46 seconds

### Recording Notes
- This is the shortest video. It should feel decisive and snappy — three choices, clear consequences.
- The approve click and status change is satisfying — make sure the UI responds visually (animation, color change, status update).
- The feedback form after rejection is important — it shows the learning loop. Keep the typed feedback short.
- The quick cut to Governance at the end creates a bridge to Video 7 (Trust). It should feel like a natural "and this is where all those decisions add up."
- Speed up navigation transitions to 2x.

---

## Video 6: Tilslutning af Værktøjer

> Section: "Forbindelser" — "Jeres eksisterende værktøjer."

**Placeholder label:** "Tilslutning af værktøjer"
**Target length:** 35–45 seconds
**Narrative style:** Setup-focused — show how easy it is to connect + the permission model
**Narration language:** Danish

### Shot List

| # | Duration | Screen | Action | Narration (DA) |
|---|---|---|---|---|
| 1 | 0:00–0:08 | Settings → Connections tab | Show the connections list. Gmail, HubSpot, Stripe, Slack all showing green "Connected" status with last sync time. Calendar and Drive also visible. | "Gmail, HubSpot, Stripe, Slack — alle forbundet med OAuth. Ingen API-nøgler. Data synkroniserer løbende." |
| 2 | 0:08–0:18 | Connector detail | Click on the Gmail connector. Show: status green, last sync "3 minutter siden", event count, health indicator. Show the sync button. | "Hvert system viser status, sidste sync, og sundhed. I ser præcis hvad der flyder — og om der er problemer." |
| 3 | 0:18–0:28 | Per-employee vs company | Scroll the list to show the difference: Gmail/Calendar/Drive labeled "Per medarbejder" vs HubSpot/Stripe labeled "Hele organisationen". | "Personlige værktøjer — per medarbejder. Virksomhedsværktøjer — for hele organisationen. Hvert system matcher den rigtige kontekst." |
| 4 | 0:28–0:38 | Write access callout | Show a connector with write access toggle or indicator. Highlight that write access is a separate permission. Show the read-only default state. | "Skriveadgang er en separat tilladelse. AI'en kan kun røre jeres systemer hvis I eksplicit aktiverer det." |

**Total:** ~38 seconds

### Recording Notes
- This is a straightforward "look how easy" video. The key message is: (1) one-click OAuth, (2) everything syncs automatically, (3) write access is opt-in.
- Show real connector names with recognizable logos (Gmail red, HubSpot orange, Stripe purple, Slack with logo).
- The "last sync: 3 minutter siden" timestamp makes it feel alive and real.
- Don't show the actual OAuth flow (that's in the onboarding video). Focus on the connected state and what you see day-to-day.
- Speed up scrolling to 1.5x.

---

## Video 7: Tillidsgradienten og Politikker

> Section: "Tillid" — "I bestemmer hvad Qorpera må."

**Placeholder label:** "Tillidsgradienten og politikker"
**Target length:** 50–65 seconds
**Narrative style:** Trust-building — show the progression from zero to autonomous
**Narration language:** Danish

### Shot List

| # | Duration | Screen | Action | Narration (DA) |
|---|---|---|---|---|
| 1 | 0:00–0:10 | Governance page — trust gradient | Show the horizontal trust gradient bar: dark segment (supervised), amber segment (notify), green segment (autonomous). Show the count badges. | "AI'en starter med nul ansvar. I bestemmer hvornår den må gøre mere. Det hedder tillidsgradienten." |
| 2 | 0:10–0:22 | Trust progression list | Show the situation types list sorted by approval rate. "Forfalden faktura": 82% approved, 14 streak, notify level. "Ubesvaret henvendelse": 91%, 22 streak, notify. "Udvidelsesmulighed": 3 proposed, supervised. | "Efterhånden som I godkender, stiger tilliden. 82% godkendelsesrate og 14 i træk — dén opgavetype er klar til mere ansvar." |
| 3 | 0:22–0:30 | Promote action | Click "Fremryk" (Promote) on "Forfalden faktura". Show the autonomy level changing from "notify" to "autonomous". Show confirmation. | "Fremryk den — og næste gang handler AI'en selv. I får stadig besked, men den venter ikke." |
| 4 | 0:30–0:42 | Policies section | Scroll to the policies section. Show the rules list: "Kræv godkendelse på alle eksterne mails" (REQUIRE_APPROVAL badge), "Blokér sletning af kontakter" (DENY badge), "Tillad automatisk kalenderopdatering" (ALLOW badge). | "Politikker er hårde regler. De trumfer altid autonominiveauet. Siger en politik 'kræv godkendelse' — går hver handling gennem jer." |
| 5 | 0:42–0:52 | Add a policy | Click "+ Tilføj regel". Show the form: name, effect dropdown (REQUIRE_APPROVAL selected), scope. Fill in "Kræv godkendelse på beløb over DKK 50.000". Save. Show it appear in the list. | "Tilføj nye regler når som helst. Specifikke, klare, og altid overholdt." |
| 6 | 0:52–0:60 | Demote action | Show a "Nedryk" (Demote) button on a situation type. Hover over it without clicking. | "Og I kan trække ansvar tilbage — øjeblikkeligt. I har altid det fulde overblik og den fulde kontrol." |

**Total:** ~60 seconds

### Recording Notes
- The trust gradient bar is the signature visual of this section — make sure it's clearly visible with the three colored segments.
- The promote action is the "wow" moment — autonomy level visibly changing from notify to autonomous. Make it prominent.
- Policies with colored effect badges (green ALLOW, amber REQUIRE_APPROVAL, red DENY) should be clearly readable.
- The contrast between "earned autonomy" (approval-rate-based promotion) and "hard rules" (policies always override) is the key message.
- End on the "you're always in control" note — this is the trust-building closer for the page.

---

## Production Schedule

### Preparation (Saturday Morning — 3 hours)

| Time | Task |
|---|---|
| 09:00–09:30 | Run seed script to populate Meridian Teknik data |
| 09:30–10:00 | Verify all data: check map, situations, entities, policies, copilot responses |
| 10:00–10:30 | Write bullet-point narration cards (one index card per shot — just key phrases, not full scripts) |
| 10:30–10:45 | Set up Screen Studio: 1080p, smooth cursor on, click highlights on |
| 10:45–11:00 | Test recordings: 3 × 10-second clips to verify quality, zoom, and audio |
| 11:00–11:15 | Pre-type copilot questions in a text file for pasting |
| 11:15–12:00 | Buffer / fix any data issues |

### Recording (Saturday Afternoon — 4 hours)

Record in this order (grouped by product area to minimize context switching):

| Time | Video | Takes | Notes |
|---|---|---|---|
| 13:00–13:30 | Video 1: Onboarding | 2–3 takes | Record with a fresh onboarding state (separate test account or reset) |
| 13:30–14:00 | Video 2: Map | 2–3 takes | Already on the map after onboarding |
| 14:00–14:30 | Video 3: Situations | 2–3 takes | Navigate to situations — most complex video, may need more takes |
| 14:30–15:00 | Video 4: Advisor | 2–3 takes | Pre-paste questions; wait for streaming responses |
| 15:00–15:20 | Video 5: Approvals | 2 takes | Short video, flows from situations |
| 15:20–15:40 | Video 6: Connections | 2 takes | Settings page, straightforward |
| 15:40–16:10 | Video 7: Trust | 2–3 takes | Governance page, promote/demote actions |
| 16:10–17:00 | Video 0: Hero Overview | 3–4 takes | The hardest — continuous flow through all areas. Do last when most comfortable. |

### Editing (Sunday — 5 hours)

| Time | Task |
|---|---|
| 09:00–10:30 | Import all recordings into Descript. Select best takes. |
| 10:30–12:00 | Text-based editing: cut mistakes, remove filler words, tighten pacing |
| 12:00–13:00 | Lunch break |
| 13:00–14:00 | Re-record narration for any sections with poor audio (quiet room, separate audio track) |
| 14:00–14:30 | Add background music (FreePD.com — ambient electronic, 10-15% volume) |
| 14:30–15:00 | Export all 8 videos (1080p, H.264) |
| 15:00–15:30 | Upload to Bunny.net Stream + YouTube |
| 15:30–16:00 | Test embeds, create thumbnails |

---

## Thumbnail Design

Each video needs a thumbnail for the facade pattern (shown before video loads). Create these in Figma or directly as static frames from the recording.

| Video | Thumbnail Content |
|---|---|
| Hero Overview | Full org chart with a red situation dot glowing — text overlay: "Se Qorpera i praksis" |
| Onboarding | Onboarding step 2 (department builder) with progress bar — clean, inviting |
| Map | Full org chart zoomed to show departments + external entities |
| Situations | Situation detail view with GreenTech evidence trail visible |
| Advisor | Chat interface with a question and streaming answer, sources highlighted |
| Approvals | Three action buttons (Godkend/Tilpas/Afvis) in focus |
| Connections | Connector list with green status indicators |
| Trust | Trust gradient bar with the three colored segments |

---

## Quality Checklist (per video)

Before considering a video done:

- [ ] Audio is clear — no echo, no background noise, narration audible over music
- [ ] All seed data looks realistic — no "Test User", no lorem ipsum, amounts in DKK
- [ ] No personal information visible (bookmarks bar hidden, no personal tabs)
- [ ] Screen Studio zoom focuses on the right elements at the right time
- [ ] Transitions between pages are sped up (2x) — no watching pages load
- [ ] Video starts with value in the first 5 seconds — no long intros
- [ ] Video ends cleanly — no trailing silence or awkward cut
- [ ] Thumbnail is a clear, representative frame from the video
- [ ] Total length is within target range (±5 seconds)
- [ ] Narration matches on-screen action (audio synced to visual)
