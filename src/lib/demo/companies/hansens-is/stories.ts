// ── Hansens Flodeis ApS — Story Content (v3) ─────────────────────────
// ~165 hand-written signal content items: ~130 operational (Day 0-30)
// + ~35 foundational Drive documents. All content is natural Danish
// business language. Organized by day (most recent first).
//
// Items numbered 1-130 correspond to the v3 spec Part 3.
// Items numbered 23-35 (foundational docs) from v3 spec Part 4.
// Items 1-22 (foundational docs) from v2 spec section 11.

import type { SyntheticContent } from "../../synthetic-types";

function daysAgoDate(d: number): string {
  return new Date(Date.now() - d * 86400000).toISOString();
}

export const HANSENS_STORIES: SyntheticContent[] = [
  // ═══════════════════════════════════════════════════════════════════════
  // DAY 0 (today) — ~25 items (items 1-23)
  // ═══════════════════════════════════════════════════════════════════════

  // 1. Lotte → all-kontor: inspektion påmindelse
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 0,
    content:
      "Påmindelse: Fødevarestyrelses-inspektion kan komme HVORNÅR SOM HELST denne uge. Sørg for at produktionsområdet er i orden, temperatulogs er printet, og alle batchnumre er korrekt i Tracezilla.",
    metadata: {
      from: "lotte@hansens-is.dk",
      to: "kontor@hansens-is.dk",
      subject:
        "Påmindelse: Fødevarestyrelsen inspektion — denne uge",
      date: daysAgoDate(0),
    },
  },

  // 2. Lotte → Trine: HACCP underskrift mangler
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 0,
    content:
      "HACCP-planen er opdateret i udkast. Mangler din underskrift og Rasmus' godkendelse inden den er gyldig.",
    metadata: {
      from: "lotte@hansens-is.dk",
      to: "trine@hansens-is.dk",
      subject: "HACCP-plan udkast — mangler underskrift",
      date: daysAgoDate(0),
    },
  },

  // 3. Robert → Anders: 3 OOH-tilbud
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 0,
    content:
      "Tak Anders. Vedhæftet: 3 tilbud (cafe-kæde 35K/mnd, biograf 12K/mnd, museum 8K/mnd). Alle bruger OOH-prislisten. Kan leveres med egen kølbil.",
    metadata: {
      from: "rlw@hansens-is.dk",
      to: "anders@hansens-is.dk",
      subject: "3 OOH-tilbud klar til afsendelse",
      date: daysAgoDate(0),
    },
  },

  // 4. Peter → Lotte: leverandørskift rettet
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 0,
    content:
      "Forstået. Jeg har annulleret ordren hos Vanilla Trading og genbestilt hos vores faste leverandør. Leveringstid 2 uger.",
    metadata: {
      from: "peter.h@hansens-is.dk",
      to: "lotte@hansens-is.dk",
      subject: "RE: Vanilla Trading — annulleret",
      date: daysAgoDate(0),
    },
  },

  // 5. Trine → Rasmus: Coop-storordre status
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 0,
    content:
      "Status Coop-storordre: vi kan producere det med dobbeltskift + 2 tidlige sæsonfolk + ekstra Svanholm-levering. Logistik kræver Frigo Transport. Ekstra kostnad ca. 8.000 DKK. Godkender du?",
    metadata: {
      from: "trine@hansens-is.dk",
      to: "rasmus@hansens-is.dk",
      subject: "Coop-storordre SO-4826 — status og ekstra kostnad",
      date: daysAgoDate(0),
    },
  },

  // 6. Rasmus → Anders: Coop leverer som planlagt
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 0,
    content:
      "Anders — informer Coop at vi leverer som planlagt den 22. Vi kører dobbeltskift. Send ordrebekræftelse via EDI.",
    metadata: {
      from: "rasmus@hansens-is.dk",
      to: "anders@hansens-is.dk",
      subject: "Coop ordrebekræftelse — send via EDI",
      date: daysAgoDate(0),
    },
  },

  // 7. Camilla → Anders: Foodexpo haster
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 0,
    content:
      "Anders, Foodexpo er om 6 uger. Standbooking bekræftet men vi har ikke bestilt materialer endnu. Leveringstid er 3-4 uger. Det haster.",
    metadata: {
      from: "camilla@hansens-is.dk",
      to: "anders@hansens-is.dk",
      subject: "Foodexpo — materialer HASTER",
      date: daysAgoDate(0),
    },
  },

  // 8. Marie → Rasmus: Dagrofa overdue
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 0,
    content:
      "Dagrofa har stadig ikke betalt INV-2026-080. Nu 11 dage over forfald. Skal vi sætte leverancer på hold?",
    metadata: {
      from: "marie@hansens-is.dk",
      to: "rasmus@hansens-is.dk",
      subject: "Dagrofa INV-2026-080 — 11 dage overdue",
      date: daysAgoDate(0),
    },
  },

  // 9. Niels → #produktion: dagens produktion
  {
    sourceType: "slack_message",
    connectorProvider: "slack",
    daysAgo: 0,
    content:
      "Produktion i dag: 1.200 stk Vanille, 800 stk Chokolade. Svanholm-leverance modtaget kl 6:15, 8.000L. Alt OK. Kører dobbeltskift i morgen pga Coop-ordren.",
    metadata: {
      channel: "produktion",
      authorEmail: "niels@hansens-is.dk",
      authorName: "Niels Brandt",
    },
  },

  // 10. Jonas → #lager-logistik: fryselager 87%
  {
    sourceType: "slack_message",
    connectorProvider: "slack",
    daysAgo: 0,
    content:
      "Fryselager er på 87% kapacitet. Hvis Coop-ordren produceres inden fredag, skal vi bruge eksternt frostlager. Ringer til Constellation Cold.",
    metadata: {
      channel: "lager-logistik",
      authorEmail: "jonas.k@hansens-is.dk",
      authorName: "Jonas Kvist",
    },
  },

  // 11. Lotte → #kvalitet: inspektion varslet
  {
    sourceType: "slack_message",
    connectorProvider: "slack",
    daysAgo: 0,
    content:
      "Fødevarestyrelsen har varslet kontrol denne uge. Tjek alle temperatulogs, batch-godkendelser, og massebalance FØR de kommer. Niels — sørg for at Tracezilla er opdateret.",
    metadata: {
      channel: "kvalitet",
      authorEmail: "lotte@hansens-is.dk",
      authorName: "Lotte Friis",
    },
  },

  // 12. Robert → #salg: Kim svarer ikke
  {
    sourceType: "slack_message",
    connectorProvider: "slack",
    daysAgo: 0,
    content:
      "Kim — har du set mine mails? Cafe-kæden venter på svar og de overvejer Premier Is. Vi mister dem hvis vi ikke reagerer i denne uge.",
    metadata: {
      channel: "salg",
      authorEmail: "rlw@hansens-is.dk",
      authorName: "Robert Larsen",
    },
  },

  // 13. Lars Winther → #general: ny elev
  {
    sourceType: "slack_message",
    connectorProvider: "slack",
    daysAgo: 0,
    content:
      "Hej alle, jeg er Lars — starter som procesoperatørelev på mandag. Glæder mig!",
    metadata: {
      channel: "general",
      authorEmail: "lars.w@hansens-is.dk",
      authorName: "Lars Winther",
    },
  },

  // 14. Trine → #general: velkommen Lars
  {
    sourceType: "slack_message",
    connectorProvider: "slack",
    daysAgo: 0,
    content:
      "Velkommen Lars! Niels viser dig rundt mandag morgen. Husk sikkerhedssko og hårnæt.",
    metadata: {
      channel: "general",
      authorEmail: "trine@hansens-is.dk",
      authorName: "Trine Damgaard",
    },
  },

  // 15. Tracezilla: SO-4826 Coop storordre
  {
    sourceType: "erp_order",
    connectorProvider: "tracezilla",
    daysAgo: 0,
    content:
      "Salgsordre SO-4826 — Coop Danmark. 500 ks assorteret sommer-sortiment. Levering 22. april. Status: Bekræftet. BEMÆRK: Overstiger normal ugekapacitet.",
    metadata: {
      orderNumber: "SO-4826",
      customer: "Coop Danmark",
      status: "Bekræftet",
      deliveryDate: daysAgoDate(-10),
    },
  },

  // 16. Tracezilla: SO-4827 Salling pre-order
  {
    sourceType: "erp_order",
    connectorProvider: "tracezilla",
    daysAgo: 0,
    content:
      "Salgsordre SO-4827 — Salling Group. 400 ks sommer pre-order. Levering 28. april. Status: Kladde. Afventer prisbekræftelse.",
    metadata: {
      orderNumber: "SO-4827",
      customer: "Salling Group",
      status: "Kladde",
      deliveryDate: daysAgoDate(-16),
    },
  },

  // 17. Tracezilla: Lagerstatus
  {
    sourceType: "erp_order",
    connectorProvider: "tracezilla",
    daysAgo: 0,
    content:
      "Lagerstatus Jægerspris i dag: Vanille 500ml: 3.200 stk (1.800 reserveret). Chokolade: 1.400. Jordbær: 520. Salt Karamel: 680. O'Payo: 1.200. Nørgaard Pop: 1.800. Softice Vanille 10L: 145 dunke. Kapacitetsudnyttelse fryselager: 87%.",
    metadata: {
      reportType: "inventory_snapshot",
      location: "Jægerspris",
      capacityUtilization: "87%",
    },
  },

  // 18. Tracezilla: PO-1204 Svanholm mælk
  {
    sourceType: "erp_order",
    connectorProvider: "tracezilla",
    daysAgo: 0,
    content:
      "Indkøbsordre PO-1204 — Svanholm Gods. 8.000L økologisk råmælk. Ugentlig leverance. Status: Modtaget i dag.",
    metadata: {
      orderNumber: "PO-1204",
      supplier: "Svanholm Gods",
      status: "Modtaget",
    },
  },

  // 19. Shipmondo: SHP-8910 Coop planlagt
  {
    sourceType: "shipment",
    connectorProvider: "shipmondo",
    daysAgo: 0,
    content:
      "Forsendelse SHP-8910 — Hansens Jægerspris → Coop Centrallager Albertslund. 16 paller. Kølekontrolleret -18°C. Planlagt afhentning 22. april. Carrier: Frigo Transport.",
    metadata: {
      shipmentNumber: "SHP-8910",
      destination: "Coop Centrallager Albertslund",
      status: "Planlagt",
      carrier: "Frigo Transport",
    },
  },

  // 20. Shipmondo: SHP-8912 Stockholm afventer mærkning
  {
    sourceType: "shipment",
    connectorProvider: "shipmondo",
    daysAgo: 0,
    content:
      "Forsendelse SHP-8912 — Hansens Jægerspris → sthlmicecream AB, Stockholm. 2 paller. DHL Express Frost. Status: Afventer mærkning. Nørgaard Pop emballage ikke klar.",
    metadata: {
      shipmentNumber: "SHP-8912",
      destination: "sthlmicecream AB, Stockholm",
      status: "Afventer mærkning",
      carrier: "DHL Express Frost",
    },
  },

  // 21. Calendar: Bestyrelsesmøde 12 dage ude
  {
    sourceType: "calendar_note",
    connectorProvider: "google-calendar",
    daysAgo: -12,
    content:
      "Bestyrelsesmøde Hansens Flødeis — 24. april. Agenda: Q1 resultat, EBITDA-bridge, 13-ugers cash flow, social impact KPIs (GROW), ESG inkl. Scope 1+2, eksportstrategi. Materialer deadline: 18. april.",
    metadata: {
      title: "Bestyrelsesmøde Hansens Flødeis",
      attendees: [
        "rasmus@hansens-is.dk",
        "anders@hansens-is.dk",
        "annemette@dsk-invest.dk",
        "krh@dsk-invest.dk",
        "ljj@dsk-invest.dk",
      ],
      date: daysAgoDate(-12),
    },
  },

  // 22. Calendar: Fødevarestyrelsen inspektion (dato ukendt)
  {
    sourceType: "calendar_note",
    connectorProvider: "google-calendar",
    daysAgo: -5,
    content:
      "Fødevarestyrelsen inspektion — denne uge (dato ukendt). Kontrol af økologisk massebalance, HACCP-dokumentation, allergenoversigt, hygiejne- og rengøringsprocedurer.",
    metadata: {
      title: "Fødevarestyrelsen inspektion",
      attendees: [
        "lotte@hansens-is.dk",
        "trine@hansens-is.dk",
        "niels@hansens-is.dk",
      ],
      date: daysAgoDate(-5),
    },
  },

  // 23. Calendar: Ugentlig produktionsplanlægning
  {
    sourceType: "calendar_note",
    connectorProvider: "google-calendar",
    daysAgo: 0,
    content:
      "Ugentlig produktionsplanlægning. Gennemgang af ugeplan, Svanholm-leverance, ordrestatus, bemanding. Coop-storordre dominerer planlægningen.",
    metadata: {
      title: "Ugentlig produktionsplanlægning",
      attendees: [
        "trine@hansens-is.dk",
        "niels@hansens-is.dk",
        "jonas.k@hansens-is.dk",
      ],
      date: daysAgoDate(0),
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // DAY 1 (yesterday) — ~13 items (items 24-36)
  // ═══════════════════════════════════════════════════════════════════════

  // 24. Anders → Robert: Kim sygemeldt
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 1,
    content:
      "Robert, godt du skriver. Kim er sygemeldt — ved ikke hvor længe. Jeg overtager midlertidigt. Send mig tilbuddene, jeg godkender inden i morgen.",
    metadata: {
      from: "anders@hansens-is.dk",
      to: "rlw@hansens-is.dk",
      subject: "RE: OOH-leads — Kim sygemeldt",
      date: daysAgoDate(1),
    },
  },

  // 25. Anders → Rasmus: salgsorganisation
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 1,
    content:
      "Kim er sygemeldt. Robert har 3 leads der skal lukkes. Jeg tager over midlertidigt men vi skal snakke om salgsorganisationen.",
    metadata: {
      from: "anders@hansens-is.dk",
      to: "rasmus@hansens-is.dk",
      subject: "Kim sygemeldt — salgsorganisation",
      date: daysAgoDate(1),
    },
  },

  // 26. Claes → Anders: Stockholm hasteløsning
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 1,
    content:
      "Medio maj er for sent for Stockholm — sommersæsonen starter. Kan I sende med dansk mærkning og vi sætter svenske labels på her? Vi gør det for andre brands.",
    metadata: {
      from: "claes@sthlmicecream.se",
      to: "anders@hansens-is.dk",
      subject: "RE: Nørgaard Pop levering — hasteforslag",
      direction: "received",
      date: daysAgoDate(1),
    },
  },

  // 27. Jonas → Trine: kølbil-problem
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 1,
    content:
      "Problem: kølbil 1 er booket til Salling Group mandag. Coop-leverancen den 22. kræver 16 paller — det er Frigo Transport eller vi ommøblerer hele ugeplanen.",
    metadata: {
      from: "jonas.k@hansens-is.dk",
      to: "trine@hansens-is.dk",
      subject: "Logistik Coop-leverance — kølbil booket",
      date: daysAgoDate(1),
    },
  },

  // 28. Niels → Trine: dobbeltskift muligt
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 1,
    content:
      "Ja, vi kan nå 500 ks inden fredag HVIS vi starter 2 sæsonfolk mandag i stedet for onsdag. Og Peter skal bestille 4.000L ekstra fra Svanholm.",
    metadata: {
      from: "niels@hansens-is.dk",
      to: "trine@hansens-is.dk",
      subject: "RE: Coop 500 ks — dobbeltskift?",
      date: daysAgoDate(1),
    },
  },

  // 29. Peter → Søren: ekstra leverance
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 1,
    content:
      "Søren, vi har brug for en ekstra leverance onsdag — 4.000L ud over den faste mandagsleverance. Er det muligt?",
    metadata: {
      from: "peter.h@hansens-is.dk",
      to: "soeren@svanholm.dk",
      subject: "Ekstra mælkeleverance onsdag?",
      date: daysAgoDate(1),
    },
  },

  // 30. Søren → Peter: delleverance
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 1,
    content:
      "Vi kan levere 3.000L onsdag, resten torsdag morgen. OK?",
    metadata: {
      from: "soeren@svanholm.dk",
      to: "peter.h@hansens-is.dk",
      subject: "RE: Ekstra mælkeleverance onsdag?",
      direction: "received",
      date: daysAgoDate(1),
    },
  },

  // 31. Marie → Rasmus: Scope 1+2 CO2 udfordring
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 1,
    content:
      "Rasmus — nu er det Scope 1+2 CO₂ de også vil have. Ørsted-fakturaer har kWh, kølbil-diesel ved Jonas. Men omregning til CO₂-ækvivalenter har ingen af os gjort.",
    metadata: {
      from: "marie@hansens-is.dk",
      to: "rasmus@hansens-is.dk",
      subject: "Scope 1+2 data — ingen kan omregne",
      date: daysAgoDate(1),
    },
  },

  // 32. Jonas → #lager-logistik: kølbil booket
  {
    sourceType: "slack_message",
    connectorProvider: "slack",
    daysAgo: 1,
    content:
      "Kølbil 1 booket til Salling mandag. Coop-leverancen kræver ekstern vognmand. Har bedt Frigo Transport om pris.",
    metadata: {
      channel: "lager-logistik",
      authorEmail: "jonas.k@hansens-is.dk",
      authorName: "Jonas Kvist",
    },
  },

  // 33. Jonas → #lager-logistik: Stockholm blokeret
  {
    sourceType: "slack_message",
    connectorProvider: "slack",
    daysAgo: 1,
    content:
      "Stockholm-forsendelsen SHP-8912 kan ikke afsendes — Camilla siger emballagen mangler svensk mærkning.",
    metadata: {
      channel: "lager-logistik",
      authorEmail: "jonas.k@hansens-is.dk",
      authorName: "Jonas Kvist",
    },
  },

  // 34. Niels → #produktion: Coop 500 ks bekræftet
  {
    sourceType: "slack_message",
    connectorProvider: "slack",
    daysAgo: 1,
    content:
      "Coop-ordren til næste uge er bekræftet: 500 ks. Mere end normalt. Trine — kan vi starte 2 sæsonfolk mandag?",
    metadata: {
      channel: "produktion",
      authorEmail: "niels@hansens-is.dk",
      authorName: "Niels Brandt",
    },
  },

  // 35. Tracezilla: SO-4825 sthlmicecream eksport
  {
    sourceType: "erp_order",
    connectorProvider: "tracezilla",
    daysAgo: 1,
    content:
      "Salgsordre SO-4825 — sthlmicecream AB. 80 ks Vanille, 60 ks Chokolade, 40 ks Nørgaard Pop. Levering 25. april. Status: Under behandling. EKSPORT — kræver svensk mærkning.",
    metadata: {
      orderNumber: "SO-4825",
      customer: "sthlmicecream AB",
      status: "Under behandling",
      deliveryDate: daysAgoDate(-13),
    },
  },

  // 36. Tracezilla: Batch V018 karantæne
  {
    sourceType: "erp_order",
    connectorProvider: "tracezilla",
    daysAgo: 1,
    content:
      "Batch 2026-V018 — Vanille 500ml. 800 stk. Råmælk: Svanholm SM-0320. Vanille: lot VAN-2026-11 (NY LEVERANDØR). QA: KARANTÆNE — smagsafvigelse.",
    metadata: {
      batchNumber: "2026-V018",
      product: "Vanille 500ml",
      qaStatus: "KARANTÆNE",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // DAY 2 — ~9 items (items 37-45)
  // ═══════════════════════════════════════════════════════════════════════

  // 37. Robert → Anders: Kim svarer ikke
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 2,
    content:
      "Undskyld at jeg skriver direkte, men Kim har ikke svaret mine mails i 4 dage. Cafe-kæden alene er 35.000 DKK/mnd i sommersæsonen. Hvem godkender priser?",
    metadata: {
      from: "rlw@hansens-is.dk",
      to: "anders@hansens-is.dk",
      subject: "Kim svarer ikke — OOH priser?",
      date: daysAgoDate(2),
    },
  },

  // 38. Lotte → Rasmus: V018 tab
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 2,
    content:
      "V018 (800 stk Vanille) er i karantæne. Potentielt tab: ca. 25.000 DKK. Vi bør kassere batchen.",
    metadata: {
      from: "lotte@hansens-is.dk",
      to: "rasmus@hansens-is.dk",
      subject: "Batch V018 — kassering anbefalet",
      date: daysAgoDate(2),
    },
  },

  // 39. Rasmus → Lotte: kassér + leverandørgodkendelse
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 2,
    content:
      "Kassér V018. Peter — alle nye leverandører skal godkendes af Lotte inden bestilling.",
    metadata: {
      from: "rasmus@hansens-is.dk",
      to: "lotte@hansens-is.dk",
      cc: "peter.h@hansens-is.dk",
      subject: "RE: Batch V018 — kassering godkendt",
      date: daysAgoDate(2),
    },
  },

  // 40. Camilla → Anders: Mads Nørgaard sæson 2
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 2,
    content:
      "Mads Nørgaard vil lave sæson 2. PR-værdien er stor men direkte omsætning er beskeden (~45.000 DKK). Anbefaler vi fortsætter. Beslutning bør tages inden bestyrelsesmøde.",
    metadata: {
      from: "camilla@hansens-is.dk",
      to: "anders@hansens-is.dk",
      subject: "Mads Nørgaard sæson 2 — anbefaling",
      date: daysAgoDate(2),
    },
  },

  // 41. Rasmus → Marie: bestyrelsespakke deadline
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 2,
    content:
      "Marie — P&L og EBITDA-bridge til bestyrelsespakken. Og cash flow. Og social impact. Deadline er den 18.",
    metadata: {
      from: "rasmus@hansens-is.dk",
      to: "marie@hansens-is.dk",
      subject: "Board pack deadline 18. april",
      date: daysAgoDate(2),
    },
  },

  // 42. Marie → Rasmus: data mangler
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 2,
    content:
      "P&L kan jeg trække fra e-conomic. EBITDA-bridge kræver 2 dage manuelt. Social impact har vi IKKE indsamlet. Scope 1+2 har ingen opgjort.",
    metadata: {
      from: "marie@hansens-is.dk",
      to: "rasmus@hansens-is.dk",
      subject: "RE: Board pack deadline 18. april — status",
      date: daysAgoDate(2),
    },
  },

  // 43. Niels → #produktion: V018 smagsafvigelse
  {
    sourceType: "slack_message",
    connectorProvider: "slack",
    daysAgo: 2,
    content:
      "Batch V018 — smagstest viser afvigelse. Vanilleekstrakten fra ny leverandør smager anderledes. Batch i karantæne.",
    metadata: {
      channel: "produktion",
      authorEmail: "niels@hansens-is.dk",
      authorName: "Niels Brandt",
    },
  },

  // 44. Lotte → #kvalitet: V018 leverandør sporet
  {
    sourceType: "slack_message",
    connectorProvider: "slack",
    daysAgo: 2,
    content:
      "Batch V018 karantæne bekræftet. Vaniljeekstrakt lot VAN-2026-11 er fra Vanilla Trading GmbH — ikke vores godkendte leverandør.",
    metadata: {
      channel: "kvalitet",
      authorEmail: "lotte@hansens-is.dk",
      authorName: "Lotte Friis",
    },
  },

  // 45. Marie → #ledelse: EBITDA manuelt
  {
    sourceType: "slack_message",
    connectorProvider: "slack",
    daysAgo: 2,
    content:
      "Rasmus — P&L fra e-conomic kan jeg trække. Men EBITDA-bridge kræver at jeg manuelt matcher Tracezilla-data og det tager 2 dage. Social impact data har vi slet ikke indsamlet.",
    metadata: {
      channel: "ledelse",
      authorEmail: "marie@hansens-is.dk",
      authorName: "Marie Gade",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // DAY 3 — ~11 items (items 46-56)
  // ═══════════════════════════════════════════════════════════════════════

  // 46. Marie → Rasmus: likviditetsadvarsel
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 3,
    content:
      "Likviditetsadvarsel: Cash-position om 6 uger estimeret til 145.000 DKK — under minimumstærskel 200.000. Årsag: Svanholm ugentligt, Friis Holm 92.500 DKK, emballage 85.000, sæsonlønninger.",
    metadata: {
      from: "marie@hansens-is.dk",
      to: "rasmus@hansens-is.dk",
      subject: "Likviditetsadvarsel — cash under tærskel om 6 uger",
      date: daysAgoDate(3),
    },
  },

  // 47. Marie → Rasmus: 13-ugers forecast
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 3,
    content:
      "Vedhæftet 13-ugers cash flow forecast. Uge 22-24 er kritiske.",
    metadata: {
      from: "marie@hansens-is.dk",
      to: "rasmus@hansens-is.dk",
      subject: "13-ugers cash flow forecast vedhæftet",
      date: daysAgoDate(3),
    },
  },

  // 48. Trine → Rasmus: kapacitetsproblem
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 3,
    content:
      "Coop har bestilt 500 ks til 22. april. Normal ugekapacitet er 350. Vi kan ikke producere det med nuværende bemanding.",
    metadata: {
      from: "trine@hansens-is.dk",
      to: "rasmus@hansens-is.dk",
      subject: "Coop 500 ks — overstiger kapacitet",
      date: daysAgoDate(3),
    },
  },

  // 49. Rasmus → Trine: muligheder?
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 3,
    content: "Hvad er mulighederne? Kan vi køre ekstra skift?",
    metadata: {
      from: "rasmus@hansens-is.dk",
      to: "trine@hansens-is.dk",
      subject: "RE: Coop 500 ks — muligheder?",
      date: daysAgoDate(3),
    },
  },

  // 50. Trine → Niels: dobbeltskift?
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 3,
    content:
      "Kan vi nå 500 ks inden fredag hvis vi kører dobbeltskift onsdag-torsdag?",
    metadata: {
      from: "trine@hansens-is.dk",
      to: "niels@hansens-is.dk",
      subject: "Dobbeltskift onsdag-torsdag?",
      date: daysAgoDate(3),
    },
  },

  // 51. Lotte → Peter: uautoriseret leverandørskift
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 3,
    content:
      "Batch V018 — hvem godkendte leverandørskiftet til Vanilla Trading? Vores procedure kræver smagsprøve FØR produktion.",
    metadata: {
      from: "lotte@hansens-is.dk",
      to: "peter.h@hansens-is.dk",
      subject: "Vanilla Trading — hvem godkendte?",
      date: daysAgoDate(3),
    },
  },

  // 52. Peter → Lotte: forklaring
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 3,
    content:
      "De var 25% billigere. Jeg bestilte prøve og smagte den — den var fin. Men den opfører sig anderledes i isbasen.",
    metadata: {
      from: "peter.h@hansens-is.dk",
      to: "lotte@hansens-is.dk",
      subject: "RE: Vanilla Trading — hvem godkendte?",
      date: daysAgoDate(3),
    },
  },

  // 53. Robert → Kim: 2. påmindelse leads
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 3,
    content:
      "Kim, 2. påmindelse. Cafe-kæden overvejer Premier Is. Vi mister dem hvis vi ikke sender tilbud i denne uge.",
    metadata: {
      from: "rlw@hansens-is.dk",
      to: "kim.s@hansens-is.dk",
      subject: "RE: OOH-leads — 2. påmindelse HASTER",
      date: daysAgoDate(3),
    },
  },

  // 54. Rasmus → Marie: Danske Bank kassekredit
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 3,
    content:
      "Ja, kontakt Danske Bank og anmod om midlertidig forhøjelse til 4M i maj-juli. Brug cash flow forecast.",
    metadata: {
      from: "rasmus@hansens-is.dk",
      to: "marie@hansens-is.dk",
      subject: "RE: Likviditet — kontakt Danske Bank",
      date: daysAgoDate(3),
    },
  },

  // 55. Rasmus → #ledelse: bestyrelsesmøde
  {
    sourceType: "slack_message",
    connectorProvider: "slack",
    daysAgo: 3,
    content:
      "Bestyrelsesmøde den 24. april. Annemette har sendt agenda. Marie — finansielle data senest den 18.",
    metadata: {
      channel: "ledelse",
      authorEmail: "rasmus@hansens-is.dk",
      authorName: "Rasmus Eibye",
    },
  },

  // 56. Calendar: Bestyrelsesagenda modtaget
  {
    sourceType: "calendar_note",
    connectorProvider: "google-calendar",
    daysAgo: 3,
    content:
      "Bestyrelsesagenda modtaget — 24. april. Agenda inkluderer: Q1 resultat, EBITDA-bridge, 13-ugers cash flow, social impact KPIs (GROW), ESG-status.",
    metadata: {
      title: "Bestyrelsesmøde agenda modtaget",
      attendees: [
        "rasmus@hansens-is.dk",
        "anders@hansens-is.dk",
        "annemette@dsk-invest.dk",
      ],
      date: daysAgoDate(3),
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // DAY 4-5 — ~12 items (items 57-68)
  // ═══════════════════════════════════════════════════════════════════════

  // 57. Annemette → Rasmus + Anders: bestyrelsesagenda
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 5,
    content:
      "Kære Rasmus og Anders, vedhæftet agenda for bestyrelsesmøde. Vi forventer: Q1 resultat med EBITDA-bridge, 13-ugers cash flow, social impact (GROW), ESG inkl. Scope 1+2, og eksportstrategi.",
    metadata: {
      from: "annemette@dsk-invest.dk",
      to: "rasmus@hansens-is.dk",
      cc: "anders@hansens-is.dk",
      subject: "Bestyrelsesmøde 24/4 — agenda og forventninger",
      direction: "received",
      date: daysAgoDate(5),
    },
  },

  // 58. Lotte → Trine: massebalance afvigelse
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 5,
    content:
      "Massebalance Q1 viser 2,8% afvigelse. 1.750L mælk ikke redegjort for. Sandsynligvis CIP-svind der ikke er dokumenteret.",
    metadata: {
      from: "lotte@hansens-is.dk",
      to: "trine@hansens-is.dk",
      subject: "Massebalance Q1 — 2,8% afvigelse",
      date: daysAgoDate(5),
    },
  },

  // 59. Anders → Camilla: svensk emballage?
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 5,
    content:
      "Claes vil have Nørgaard Pop til Sverige. Har vi svensk emballage?",
    metadata: {
      from: "anders@hansens-is.dk",
      to: "camilla@hansens-is.dk",
      subject: "Nørgaard Pop Sverige — emballage?",
      date: daysAgoDate(5),
    },
  },

  // 60. Camilla → Anders: nej, 4-6 uger
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 5,
    content:
      "Nej. Custom print tager 4-6 uger hos Emballage Danmark.",
    metadata: {
      from: "camilla@hansens-is.dk",
      to: "anders@hansens-is.dk",
      subject: "RE: Nørgaard Pop Sverige — emballage?",
      date: daysAgoDate(5),
    },
  },

  // 61. Lotte → Anders: svensk mærkningskrav
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 4,
    content:
      "Sverige kræver 'djupfryst' ved produktnavnet per LIVSFS 2006:12. Plus allergener på svensk.",
    metadata: {
      from: "lotte@hansens-is.dk",
      to: "anders@hansens-is.dk",
      subject: "Sverige mærkningskrav — LIVSFS 2006:12",
      date: daysAgoDate(4),
    },
  },

  // 62. Rasmus → Trine: GROW-data
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 4,
    content:
      "Trine, kan du skaffe data til GROW-beregneren for marts?",
    metadata: {
      from: "rasmus@hansens-is.dk",
      to: "trine@hansens-is.dk",
      subject: "GROW-beregner data marts",
      date: daysAgoDate(4),
    },
  },

  // 63. Trine → Rasmus: GROW kræver lønsystem
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 4,
    content:
      "Navne og kategorier kan jeg give. Timer skal trækkes fra lønsystemet — Marie har adgang.",
    metadata: {
      from: "trine@hansens-is.dk",
      to: "rasmus@hansens-is.dk",
      subject: "RE: GROW-beregner data marts",
      date: daysAgoDate(4),
    },
  },

  // 64. Christian@DSK → Rasmus: Scope 1+2 reminder
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 4,
    content:
      "Reminder: Scope 1+2 CO₂-data indgår i kvartalsvis ESG-rapportering. Har I opgjort det?",
    metadata: {
      from: "christian@dsk-invest.dk",
      to: "rasmus@hansens-is.dk",
      subject: "ESG kvartal — Scope 1+2 data?",
      direction: "received",
      date: daysAgoDate(4),
    },
  },

  // 65. Anders → Kim: Dagrofa 30% ned
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 5,
    content:
      "Kim, Dagrofa bestiller 30% mindre end sidste år. Har vi et problem?",
    metadata: {
      from: "anders@hansens-is.dk",
      to: "kim.s@hansens-is.dk",
      subject: "Dagrofa ordrer — 30% ned",
      date: daysAgoDate(5),
    },
  },

  // 66. Kim → Anders: Dagrofa omstrukturering (Kims sidste mail)
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 5,
    content:
      "Nej, det er Dagrofas omstrukturering. Men hold øje.",
    metadata: {
      from: "kim.s@hansens-is.dk",
      to: "anders@hansens-is.dk",
      subject: "RE: Dagrofa ordrer — 30% ned",
      date: daysAgoDate(5),
    },
  },

  // 67. Marie → Pernille@Dagrofa: 2. påmindelse
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 4,
    content:
      "2. påmindelse: INV-2026-080 er nu 8 dage over forfald.",
    metadata: {
      from: "marie@hansens-is.dk",
      to: "pernille@dagrofa.dk",
      subject: "2. påmindelse: INV-2026-080",
      date: daysAgoDate(4),
    },
  },

  // 68. Pernille → Marie: betaling inden fredag (skete ikke)
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 4,
    content:
      "Vi beklager, nyt indkøbssystem. Betaling inden fredag.",
    metadata: {
      from: "pernille@dagrofa.dk",
      to: "marie@hansens-is.dk",
      subject: "RE: 2. påmindelse: INV-2026-080",
      direction: "received",
      date: daysAgoDate(4),
    },
  },

  // 69. Tracezilla: SO-4824 Joe and the Juice
  {
    sourceType: "erp_order",
    connectorProvider: "tracezilla",
    daysAgo: 4,
    content:
      "Salgsordre SO-4824 — Joe and the Juice. 30 ks Softice-base Vanille, 20 ks Chokolade. Levering 20. april. Status: Bekræftet.",
    metadata: {
      orderNumber: "SO-4824",
      customer: "Joe and the Juice",
      status: "Bekræftet",
      deliveryDate: daysAgoDate(-8),
    },
  },

  // 70. Tracezilla: Batch Nørgaard Pop
  {
    sourceType: "erp_order",
    connectorProvider: "tracezilla",
    daysAgo: 5,
    content:
      "Batch 2026-NP001 — Nørgaard Pop. 2.000 stk. Aroniabær: Thy. QA: Godkendt. VEGAN.",
    metadata: {
      batchNumber: "2026-NP001",
      product: "Nørgaard Pop",
      qaStatus: "Godkendt",
    },
  },

  // 71. Tracezilla: PO-1210 Friis Holm
  {
    sourceType: "erp_order",
    connectorProvider: "tracezilla",
    daysAgo: 4,
    content:
      "Indkøbsordre PO-1210 — Friis Holm Chokolade. 500 kg. 185 DKK/kg. Levering 20. april. Bekræftet.",
    metadata: {
      orderNumber: "PO-1210",
      supplier: "Friis Holm",
      status: "Bekræftet",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // DAY 6-7 — ~9 items (items 72-80)
  // ═══════════════════════════════════════════════════════════════════════

  // 72. Lotte → Trine: inspektion næste uge
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 6,
    content:
      "Fødevarestyrelsen har varslet kontrol i næste uge.",
    metadata: {
      from: "lotte@hansens-is.dk",
      to: "trine@hansens-is.dk",
      subject: "Fødevarestyrelsen — kontrol næste uge",
      date: daysAgoDate(6),
    },
  },

  // 73. Lotte → Niels: 3 batches uden QA
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 6,
    content:
      "3 batches uden QA-godkendelse i Tracezilla. Kan du bekræfte?",
    metadata: {
      from: "lotte@hansens-is.dk",
      to: "niels@hansens-is.dk",
      subject: "Tracezilla — 3 batches mangler QA",
      date: daysAgoDate(6),
    },
  },

  // 74. Niels → Lotte: 2 OK, 1 karantæne
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 6,
    content:
      "C009 og J004 er godkendt, glemte at lukke dem. V018 er karantæne.",
    metadata: {
      from: "niels@hansens-is.dk",
      to: "lotte@hansens-is.dk",
      subject: "RE: Tracezilla — 3 batches mangler QA",
      date: daysAgoDate(6),
    },
  },

  // 75. Robert → Kim: 1. påmindelse OOH-leads
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 7,
    content:
      "Kim, har du set de 3 OOH-leads jeg sendte mandag? Cafe-kæden er klar til at bestille.",
    metadata: {
      from: "rlw@hansens-is.dk",
      to: "kim.s@hansens-is.dk",
      subject: "OOH-leads — har du set dem?",
      date: daysAgoDate(7),
    },
  },

  // 76. Trine → Lars W: AMU hygiejnekursus
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 7,
    content:
      "Dit AMU hygiejnekursus er den 10. april. Er det bekræftet?",
    metadata: {
      from: "trine@hansens-is.dk",
      to: "lars.w@hansens-is.dk",
      subject: "AMU hygiejnekursus 10. april",
      date: daysAgoDate(7),
    },
  },

  // 77. Lars W → Trine: ikke bekræftet
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 7,
    content:
      "Har ikke fået bekræftelse fra AMU endnu.",
    metadata: {
      from: "lars.w@hansens-is.dk",
      to: "trine@hansens-is.dk",
      subject: "RE: AMU hygiejnekursus 10. april",
      date: daysAgoDate(7),
    },
  },

  // 78. Anders → Claes: mærkningsproblem
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 6,
    content:
      "Vi har et mærkningsproblem. Emballage med svensk tekst tager 4-6 uger. Realistisk leveringsdato: medio maj.",
    metadata: {
      from: "anders@hansens-is.dk",
      to: "claes@sthlmicecream.se",
      subject: "RE: Nørgaard Pop levering — forsinkelse",
      date: daysAgoDate(6),
    },
  },

  // 79. Niels → #produktion: Nørgaard Pop i morgen
  {
    sourceType: "slack_message",
    connectorProvider: "slack",
    daysAgo: 6,
    content:
      "I morgen kører vi Nørgaard Pop — 2.000 stk. Aroniabær modtaget fra Thy.",
    metadata: {
      channel: "produktion",
      authorEmail: "niels@hansens-is.dk",
      authorName: "Niels Brandt",
    },
  },

  // 80. Lotte → #kvalitet: massebalance 2,8%
  {
    sourceType: "slack_message",
    connectorProvider: "slack",
    daysAgo: 6,
    content:
      "Massebalance Q1: 2,8% afvigelse. 1.750L ikke redegjort for. Retter inden inspektion.",
    metadata: {
      channel: "kvalitet",
      authorEmail: "lotte@hansens-is.dk",
      authorName: "Lotte Friis",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // DAY 8-10 — ~16 items (items 81-96)
  // ═══════════════════════════════════════════════════════════════════════

  // 81. Claes → Anders: Stockholm bestilling
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 8,
    content:
      "Hej Anders, vi vil gerne bestille Nørgaard Pop + Vanille + Chokolade til Stockholm. Levering senest 25. april.",
    metadata: {
      from: "claes@sthlmicecream.se",
      to: "anders@hansens-is.dk",
      subject: "Bestilling: Nørgaard Pop + Vanille + Chokolade",
      direction: "received",
      date: daysAgoDate(8),
    },
  },

  // 82. Marie → Pernille@Dagrofa: 1. påmindelse
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 8,
    content:
      "Betalingspåmindelse: INV-2026-080 forfaldt den 20. marts.",
    metadata: {
      from: "marie@hansens-is.dk",
      to: "pernille@dagrofa.dk",
      subject: "Betalingspåmindelse: INV-2026-080",
      date: daysAgoDate(8),
    },
  },

  // 83. Peter → Rasmus: Friis Holm prisstigning
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 9,
    content:
      "Friis Holm chokolade er steget 12% — 185 DKK/kg mod budgetteret 165. 500 kg koster 92.500 vs budget 82.500.",
    metadata: {
      from: "peter.h@hansens-is.dk",
      to: "rasmus@hansens-is.dk",
      subject: "Friis Holm — 12% prisstigning",
      date: daysAgoDate(9),
    },
  },

  // 84. Rasmus → Peter: godkendt
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 9,
    content:
      "Vi har ikke alternativ. Godkendt. Noter til Marie.",
    metadata: {
      from: "rasmus@hansens-is.dk",
      to: "peter.h@hansens-is.dk",
      subject: "RE: Friis Holm — godkendt",
      date: daysAgoDate(9),
    },
  },

  // 85. Lotte → Rasmus: HACCP gammel
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 8,
    content:
      "HACCP-planen er fra februar 2025 — skulle revideres i februar 2026.",
    metadata: {
      from: "lotte@hansens-is.dk",
      to: "rasmus@hansens-is.dk",
      subject: "HACCP-plan — revision overskredet",
      date: daysAgoDate(8),
    },
  },

  // 86. Camilla → Rasmus: Foodexpo budget
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 8,
    content: "Foodexpo standbudget: 45.000 DKK. Godkendt?",
    metadata: {
      from: "camilla@hansens-is.dk",
      to: "rasmus@hansens-is.dk",
      subject: "Foodexpo 2026 — standbudget 45.000 DKK",
      date: daysAgoDate(8),
    },
  },

  // 87. Rasmus → Camilla: vent
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 8,
    content: "Vent til efter bestyrelsesmøde.",
    metadata: {
      from: "rasmus@hansens-is.dk",
      to: "camilla@hansens-is.dk",
      subject: "RE: Foodexpo 2026 — vent",
      date: daysAgoDate(8),
    },
  },

  // 88. Peter → Mikkel@Friis Holm: bestilling
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 9,
    content:
      "500 kg Uganda single origin. Kan du levere inden 20. april?",
    metadata: {
      from: "peter.h@hansens-is.dk",
      to: "mikkel@friisholm.com",
      subject: "Bestilling: 500 kg Uganda single origin",
      date: daysAgoDate(9),
    },
  },

  // 89. Mikkel@Friis Holm → Peter: prisstigning
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 9,
    content:
      "Priser steget 12% pga kakao-markedet. 185 DKK/kg.",
    metadata: {
      from: "mikkel@friisholm.com",
      to: "peter.h@hansens-is.dk",
      subject: "RE: Bestilling — prisjustering",
      direction: "received",
      date: daysAgoDate(9),
    },
  },

  // 90. Camilla → Anders: Trustpilot romkugle
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 8,
    content:
      "Trustpilot: 8 nye negative anmeldelser nævner romkugle-sagen. Score faldet til 4.2.",
    metadata: {
      from: "camilla@hansens-is.dk",
      to: "anders@hansens-is.dk",
      subject: "Trustpilot — romkugle-sagen påvirker os",
      date: daysAgoDate(8),
    },
  },

  // 91. Trine → Nina@Frederikssund: sæsonfolk
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 10,
    content:
      "Vi søger 2-3 personer til sæsonproduktion via løntilskud.",
    metadata: {
      from: "trine@hansens-is.dk",
      to: "nina@frederikssund.dk",
      subject: "Sæsonproduktion — løntilskud kandidater",
      date: daysAgoDate(10),
    },
  },

  // 92. Tracezilla: Batch V017 Vanille OK
  {
    sourceType: "erp_order",
    connectorProvider: "tracezilla",
    daysAgo: 8,
    content:
      "Batch 2026-V017 — Vanille. 1.100 stk. QA: Godkendt.",
    metadata: {
      batchNumber: "2026-V017",
      product: "Vanille",
      qaStatus: "Godkendt",
    },
  },

  // 93. Tracezilla: SO-4823 Nemlig leveret
  {
    sourceType: "erp_order",
    connectorProvider: "tracezilla",
    daysAgo: 8,
    content:
      "Salgsordre SO-4823 — Nemlig.com. 50 Vanille, 40 Chokolade, 30 Jordbær. Status: Leveret.",
    metadata: {
      orderNumber: "SO-4823",
      customer: "Nemlig.com",
      status: "Leveret",
    },
  },

  // 94. Tracezilla: PO-1215 Emballage Danmark
  {
    sourceType: "erp_order",
    connectorProvider: "tracezilla",
    daysAgo: 10,
    content:
      "Indkøbsordre PO-1215 — Emballage Danmark. 15.000 Vanille bægre, 10.000 Chokolade. Leveringstid: 6 uger. I produktion.",
    metadata: {
      orderNumber: "PO-1215",
      supplier: "Emballage Danmark",
      status: "I produktion",
    },
  },

  // 95. Shipmondo: SHP-8905 Dagrofa forsinket
  {
    sourceType: "shipment",
    connectorProvider: "shipmondo",
    daysAgo: 10,
    content:
      "Forsendelse SHP-8905 — Hansens Jægerspris → Dagrofa. 4 paller. Kølekontrolleret -18°C. Leveret. 1 dag forsinket. Carrier: Frigo Transport.",
    metadata: {
      shipmentNumber: "SHP-8905",
      destination: "Dagrofa",
      status: "Leveret",
      carrier: "Frigo Transport",
      delayed: true,
    },
  },

  // 96. Shipmondo: SHP-8911 Salling planlagt
  {
    sourceType: "shipment",
    connectorProvider: "shipmondo",
    daysAgo: 8,
    content:
      "Forsendelse SHP-8911 — Hansens Jægerspris → Salling Group Hasselager. 10 paller. Kølekontrolleret -18°C. Planlagt afhentning 18. april.",
    metadata: {
      shipmentNumber: "SHP-8911",
      destination: "Salling Group Hasselager",
      status: "Planlagt",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // DAY 11-14 — ~12 items (items 97-107)
  // ═══════════════════════════════════════════════════════════════════════

  // 97. Marie → Rasmus: økonomioverblik
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 11,
    content:
      "Økonomioverblik: 3 åbne forfaldne fakturaer, samlet 90.500 DKK.",
    metadata: {
      from: "marie@hansens-is.dk",
      to: "rasmus@hansens-is.dk",
      subject: "Økonomioverblik — 3 forfaldne fakturaer",
      date: daysAgoDate(11),
    },
  },

  // 98. Trine → Rasmus: Svanholm ingen buffer
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 12,
    content:
      "Svanholm advarer: ingen buffer til ekstra mælk i april pga kalvesæson.",
    metadata: {
      from: "trine@hansens-is.dk",
      to: "rasmus@hansens-is.dk",
      subject: "Svanholm — ingen buffer i april",
      date: daysAgoDate(12),
    },
  },

  // 99. Peter → Trine: alternativ leverandør
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 12,
    content:
      "Hvis vi producerer mere end planlagt, skal vi finde alternativ mælkeleverandør.",
    metadata: {
      from: "peter.h@hansens-is.dk",
      to: "trine@hansens-is.dk",
      subject: "Alternativ mælkeleverandør?",
      date: daysAgoDate(12),
    },
  },

  // 100. Trine → Rasmus: single-supplier risk
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 11,
    content:
      "Vi er afhængige af en mælkeleverandør. Ingen backup. Vi bør have nødaftale med f.eks. Thise.",
    metadata: {
      from: "trine@hansens-is.dk",
      to: "rasmus@hansens-is.dk",
      subject: "Single-supplier risiko — nødaftale?",
      date: daysAgoDate(11),
    },
  },

  // 101. Nina@Frederikssund → Trine: 2 kandidater
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 11,
    content:
      "2 kandidater: Mohammed (28, løntilskud) og Sarah (22, flexjob). CVs vedlagt.",
    metadata: {
      from: "nina@frederikssund.dk",
      to: "trine@hansens-is.dk",
      subject: "RE: Sæsonproduktion — 2 kandidater",
      direction: "received",
      date: daysAgoDate(11),
    },
  },

  // 102. Thomas@MadsNørgaard → Camilla: sæson 2?
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 12,
    content:
      "Vi er tilfredse med sæson 1. Skal vi planlægge sæson 2?",
    metadata: {
      from: "thomas@madsnorgaard.com",
      to: "camilla@hansens-is.dk",
      subject: "Nørgaard Pop sæson 2?",
      direction: "received",
      date: daysAgoDate(12),
    },
  },

  // 103. Peter → Søren@Svanholm: betalingsbetingelser
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 13,
    content:
      "Kan vi gå fra netto 30 til netto 45 i april-juni? Likviditeten er presset.",
    metadata: {
      from: "peter.h@hansens-is.dk",
      to: "soeren@svanholm.dk",
      subject: "Betalingsbetingelser april-juni",
      date: daysAgoDate(13),
    },
  },

  // 104. Anders → Rasmus: Mads Nørgaard anbefaling
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 11,
    content:
      "Mads Nørgaard sæson 2: PR-værdien er stor. Anbefaler vi fortsætter. Bør besluttes inden bestyrelsesmøde.",
    metadata: {
      from: "anders@hansens-is.dk",
      to: "rasmus@hansens-is.dk",
      subject: "Mads Nørgaard sæson 2 — anbefaling til bestyrelse",
      date: daysAgoDate(11),
    },
  },

  // 105. Tracezilla: SO-4810 Coop Islagkage leveret
  {
    sourceType: "erp_order",
    connectorProvider: "tracezilla",
    daysAgo: 12,
    content:
      "Salgsordre SO-4810 — Coop Danmark. 200 stk Smag Forskellen Islagkage. Status: Leveret. Faktura: INV-2026-084.",
    metadata: {
      orderNumber: "SO-4810",
      customer: "Coop Danmark",
      status: "Leveret",
    },
  },

  // 106. Tracezilla: Batch V016 OK
  {
    sourceType: "erp_order",
    connectorProvider: "tracezilla",
    daysAgo: 13,
    content:
      "Batch 2026-V016 — Vanille. 1.400 stk. QA: Godkendt.",
    metadata: {
      batchNumber: "2026-V016",
      product: "Vanille",
      qaStatus: "Godkendt",
    },
  },

  // 107. Tracezilla: Batch C008 OK
  {
    sourceType: "erp_order",
    connectorProvider: "tracezilla",
    daysAgo: 14,
    content:
      "Batch 2026-C008 — Chokolade. 900 stk. Friis Holm lot FH-2026-04. QA: Godkendt.",
    metadata: {
      batchNumber: "2026-C008",
      product: "Chokolade",
      qaStatus: "Godkendt",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // DAY 15-22 — ~15 items (items 108-122)
  // ═══════════════════════════════════════════════════════════════════════

  // 108. Lars Jannick@DSK → Rasmus: Scope 1+2 mangler
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 15,
    content:
      "Kære Rasmus, til bestyrelsesmødet og vores ESG-rapportering har vi brug for Scope 1 og Scope 2 CO₂-data for Hansens Flødeis. Scope 1: Direkte udledning fra jeres køleanlæg og dieselbrug til transport. Scope 2: Indirekte fra elforbrug. Hvem har de data? Og er de systematiseret? Med venlig hilsen, Lars Jannick, DSK Invest",
    metadata: {
      from: "ljj@dsk-invest.dk",
      to: "rasmus@hansens-is.dk",
      subject: "ESG-rapportering — Scope 1+2 CO₂-data mangler",
      direction: "received",
      date: daysAgoDate(15),
    },
  },

  // 109. Rasmus → Trine: energidata?
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 15,
    content:
      "Trine, Lars Jannick fra DSK spørger til CO₂-data. Hvem har overblikket over energidata — elforbrug, diesel, kølemiddel, solceller?",
    metadata: {
      from: "rasmus@hansens-is.dk",
      to: "trine@hansens-is.dk",
      subject: "Energidata — hvem har overblikket?",
      date: daysAgoDate(15),
    },
  },

  // 110. Trine → Rasmus: data spredt
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 16,
    content:
      "Ørsted-fakturaer i e-conomic. Kølbil-diesel ved Jonas. Omregning — ingen ved hvordan. Solcelleportalen logger ingen ind på. Data er spredt for alle vinde.",
    metadata: {
      from: "trine@hansens-is.dk",
      to: "rasmus@hansens-is.dk",
      subject: "RE: Energidata — hvem har overblikket?",
      date: daysAgoDate(16),
    },
  },

  // 111. Søren@Svanholm → Peter: kalvesæson
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 18,
    content:
      "Heads-up: lavere mælkeydelse i april pga kalvesæson. Ingen buffer ud over den faste leverance. Planlæg derefter.",
    metadata: {
      from: "soeren@svanholm.dk",
      to: "peter.h@hansens-is.dk",
      subject: "April leverance — kalvesæson, ingen buffer",
      direction: "received",
      date: daysAgoDate(18),
    },
  },

  // 112. Anders → Rasmus: DR kontakt
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 17,
    content:
      "DR Dårlig Stemning har kontaktet os for kommentar til romkugle-sagen. Journalist Line Vestergaard vil lave et indslag. Hvad gør vi?",
    metadata: {
      from: "anders@hansens-is.dk",
      to: "rasmus@hansens-is.dk",
      subject: "DR journalist — romkugle-sagen",
      date: daysAgoDate(17),
    },
  },

  // 113. Rasmus → Anders: lad være
  {
    sourceType: "email",
    connectorProvider: "gmail",
    daysAgo: 17,
    content:
      "Lad være med at puste til ilden. Skriv et høfligt nej-tak og henvis til at sagen er afgjort.",
    metadata: {
      from: "rasmus@hansens-is.dk",
      to: "anders@hansens-is.dk",
      subject: "RE: DR journalist — romkugle-sagen",
      date: daysAgoDate(17),
    },
  },

  // 114. Tracezilla: SO-4815 Coop leveret
  {
    sourceType: "erp_order",
    connectorProvider: "tracezilla",
    daysAgo: 16,
    content:
      "Salgsordre SO-4815 — Coop Danmark. 150 ks assorteret. Status: Leveret. Faktura: INV-2026-078.",
    metadata: {
      orderNumber: "SO-4815",
      customer: "Coop Danmark",
      status: "Leveret",
    },
  },

  // 115. Tracezilla: SO-4816 Salling leveret
  {
    sourceType: "erp_order",
    connectorProvider: "tracezilla",
    daysAgo: 17,
    content:
      "Salgsordre SO-4816 — Salling Group. 120 ks Vanille + Chokolade. Status: Leveret. Faktura: INV-2026-079.",
    metadata: {
      orderNumber: "SO-4816",
      customer: "Salling Group",
      status: "Leveret",
    },
  },

  // 116. Tracezilla: SO-4817 Nemlig leveret
  {
    sourceType: "erp_order",
    connectorProvider: "tracezilla",
    daysAgo: 18,
    content:
      "Salgsordre SO-4817 — Nemlig.com. 40 ks Vanille, 30 ks Jordbær, 20 ks O'Payo. Status: Leveret.",
    metadata: {
      orderNumber: "SO-4817",
      customer: "Nemlig.com",
      status: "Leveret",
    },
  },

  // 117. Tracezilla: SO-4818 Sticks'n'Sushi leveret
  {
    sourceType: "erp_order",
    connectorProvider: "tracezilla",
    daysAgo: 20,
    content:
      "Salgsordre SO-4818 — Sticks'n'Sushi. 25 ks Vanille, 15 ks Chokolade. Status: Leveret.",
    metadata: {
      orderNumber: "SO-4818",
      customer: "Sticks'n'Sushi",
      status: "Leveret",
    },
  },

  // 118. Tracezilla: SO-4819 Scandlines leveret
  {
    sourceType: "erp_order",
    connectorProvider: "tracezilla",
    daysAgo: 21,
    content:
      "Salgsordre SO-4819 — Scandlines. 60 ks assorteret. Status: Leveret. Faktura: INV-2026-057.",
    metadata: {
      orderNumber: "SO-4819",
      customer: "Scandlines",
      status: "Leveret",
    },
  },

  // 119. Shipmondo: SHP-8895 Coop leveret on-time
  {
    sourceType: "shipment",
    connectorProvider: "shipmondo",
    daysAgo: 16,
    content:
      "Forsendelse SHP-8895 — Hansens Jægerspris → Coop Centrallager Albertslund. 8 paller. Kølekontrolleret -18°C. Leveret on-time.",
    metadata: {
      shipmentNumber: "SHP-8895",
      destination: "Coop Centrallager Albertslund",
      status: "Leveret",
    },
  },

  // 120. Shipmondo: SHP-8897 Salling leveret on-time
  {
    sourceType: "shipment",
    connectorProvider: "shipmondo",
    daysAgo: 17,
    content:
      "Forsendelse SHP-8897 — Hansens Jægerspris → Salling Group Hasselager. 6 paller. Kølekontrolleret -18°C. Leveret on-time.",
    metadata: {
      shipmentNumber: "SHP-8897",
      destination: "Salling Group Hasselager",
      status: "Leveret",
    },
  },

  // 121. Shipmondo: SHP-8899 Nemlig leveret on-time
  {
    sourceType: "shipment",
    connectorProvider: "shipmondo",
    daysAgo: 18,
    content:
      "Forsendelse SHP-8899 — Hansens Jægerspris → Nemlig Brøndby. 4 paller. Egen kølbil. Leveret on-time.",
    metadata: {
      shipmentNumber: "SHP-8899",
      destination: "Nemlig Brøndby",
      status: "Leveret",
    },
  },

  // 122. Shipmondo: SHP-8900 sthlmicecream leveret on-time
  {
    sourceType: "shipment",
    connectorProvider: "shipmondo",
    daysAgo: 20,
    content:
      "Forsendelse SHP-8900 — Hansens Jægerspris → sthlmicecream AB, Stockholm. 2 paller. DHL Express Frost. ATP-certificeret. CMR-fragtbrev. Leveret on-time.",
    metadata: {
      shipmentNumber: "SHP-8900",
      destination: "sthlmicecream AB, Stockholm",
      status: "Leveret",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // DAY 23-30 — ~8 items (items 123-130)
  // ═══════════════════════════════════════════════════════════════════════

  // 123. Tracezilla: SO-4805 Coop leveret (ældre)
  {
    sourceType: "erp_order",
    connectorProvider: "tracezilla",
    daysAgo: 24,
    content:
      "Salgsordre SO-4805 — Coop Danmark. 180 ks Vanille + Jordbær + Chokolade. Status: Leveret. Faktura: INV-2026-072.",
    metadata: {
      orderNumber: "SO-4805",
      customer: "Coop Danmark",
      status: "Leveret",
    },
  },

  // 124. Tracezilla: SO-4806 Salling leveret (ældre)
  {
    sourceType: "erp_order",
    connectorProvider: "tracezilla",
    daysAgo: 25,
    content:
      "Salgsordre SO-4806 — Salling Group. 100 ks Vanille + Chokolade. Status: Leveret. Faktura: INV-2026-073.",
    metadata: {
      orderNumber: "SO-4806",
      customer: "Salling Group",
      status: "Leveret",
    },
  },

  // 125. Tracezilla: Batch V014 (ældre)
  {
    sourceType: "erp_order",
    connectorProvider: "tracezilla",
    daysAgo: 26,
    content:
      "Batch 2026-V014 — Vanille 500ml. 1.200 stk. Råmælk: Svanholm SM-0312. QA: Godkendt.",
    metadata: {
      batchNumber: "2026-V014",
      product: "Vanille",
      qaStatus: "Godkendt",
    },
  },

  // 126. Tracezilla: Batch C006 (ældre)
  {
    sourceType: "erp_order",
    connectorProvider: "tracezilla",
    daysAgo: 27,
    content:
      "Batch 2026-C006 — Chokolade 500ml. 700 stk. Friis Holm lot FH-2026-02. QA: Godkendt.",
    metadata: {
      batchNumber: "2026-C006",
      product: "Chokolade",
      qaStatus: "Godkendt",
    },
  },

  // 127. Shipmondo: SHP-8885 Coop leveret (ældre)
  {
    sourceType: "shipment",
    connectorProvider: "shipmondo",
    daysAgo: 24,
    content:
      "Forsendelse SHP-8885 — Hansens Jægerspris → Coop Centrallager. 6 paller. Leveret on-time.",
    metadata: {
      shipmentNumber: "SHP-8885",
      destination: "Coop Centrallager",
      status: "Leveret",
    },
  },

  // 128. Shipmondo: SHP-8887 Dagrofa leveret (ældre)
  {
    sourceType: "shipment",
    connectorProvider: "shipmondo",
    daysAgo: 25,
    content:
      "Forsendelse SHP-8887 — Hansens Jægerspris → Dagrofa. 3 paller. Leveret on-time.",
    metadata: {
      shipmentNumber: "SHP-8887",
      destination: "Dagrofa",
      status: "Leveret",
    },
  },

  // 129. Tracezilla: Lagerstatus (tidlig)
  {
    sourceType: "erp_order",
    connectorProvider: "tracezilla",
    daysAgo: 28,
    content:
      "Lagerstatus Jægerspris: Vanille 500ml: 1.800 stk (600 reserveret). Chokolade: 750. Jordbær: 280. Salt Karamel: 340. O'Payo: 600. Nørgaard Pop: 400. Softice Vanille 10L: 80 dunke. Kapacitetsudnyttelse fryselager: 52%.",
    metadata: {
      reportType: "inventory_snapshot",
      location: "Jægerspris",
      capacityUtilization: "52%",
    },
  },

  // 130. Tracezilla: Lagerstatus (uge 2)
  {
    sourceType: "erp_order",
    connectorProvider: "tracezilla",
    daysAgo: 21,
    content:
      "Lagerstatus Jægerspris: Vanille 500ml: 2.400 stk (900 reserveret). Chokolade: 1.050. Jordbær: 380. Salt Karamel: 500. O'Payo: 850. Nørgaard Pop: 1.100. Softice Vanille 10L: 110 dunke. Kapacitetsudnyttelse fryselager: 68%.",
    metadata: {
      reportType: "inventory_snapshot",
      location: "Jægerspris",
      capacityUtilization: "68%",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // FOUNDATIONAL DOCUMENTS (Drive, any age) — 35 items
  // Documents 1-22 from v2 spec section 11 + documents 23-35 from v3 Part 4
  // ═══════════════════════════════════════════════════════════════════════

  // Doc 1. HACCP Plan (gammel — trigger: 14 mdr)
  {
    sourceType: "drive_doc",
    connectorProvider: "google-drive",
    daysAgo: 45,
    content:
      "HACCP Plan — Hansens Flødeis ApS. Version 2.1, sidst revideret: februar 2025. Kritiske kontrolpunkter: CCP1: Pasteurisering (72°C / 15 sek). CCP2: Nedkøling (<6°C inden 2 timer). CCP3: Frysetemperatur -18°C. CCP4: Allergen-kontrol. Risikovurdering for 8 produktlinjer. Leverandører: Svanholm Gods (øko-mælk), Friis Holm (øko-chokolade), Solbærhaven (øko-bær). MANGLER: Ny vanilje-leverandør (skiftet nov 2025). MANGLER: Lakridsvariant tilføjet jan 2026. MANGLER: Opdaterede CIP-procedurer. Næste revision: februar 2026 — OVERSKREDET.",
    metadata: {
      fileName: "HACCP_Plan_Hansens_2025.pdf",
      author: "Lotte Friis",
      lastModified: daysAgoDate(45),
    },
  },

  // Doc 2. Allergenoversigt
  {
    sourceType: "drive_doc",
    connectorProvider: "google-drive",
    daysAgo: 20,
    content:
      "Hansens Flødeis — Allergenoversigt 2026. 14 allergener per EU 1169/2011. Vanille: mælk, æg. Chokolade: mælk, soja. Jordbær Sorbet: INGEN (vegan). Nørgaard Pop: INGEN (vegan). O'Payo: mælk. Salt Karamel: mælk. Islagkage: mælk, æg, gluten (vaffel). Sidst opdateret: marts 2026.",
    metadata: {
      fileName: "Allergenoversigt_2026.pdf",
      author: "Lotte Friis",
      lastModified: daysAgoDate(20),
    },
  },

  // Doc 3. Økologisk massebalance Q1 (afvigelse trigger)
  {
    sourceType: "drive_doc",
    connectorProvider: "google-drive",
    daysAgo: 5,
    content:
      "Økologisk massebalance Q1 2026. Indkøbt ØKO-mælk: 62.400L. Produceret ØKO-is: 48.200L (beregnet mælke-ækvivalent). Svind: 1.200L (dokumenteret). Afvigelse: 2,8% — over tærskelværdi. Forklaring mangler for 1.750L.",
    metadata: {
      fileName: "Oekologisk_Massebalance_Q1_2026.xlsx",
      author: "Lotte Friis",
      lastModified: daysAgoDate(5),
    },
  },

  // Doc 4. Bestyrelsesagenda
  {
    sourceType: "drive_doc",
    connectorProvider: "google-drive",
    daysAgo: 3,
    content:
      "Agenda — Bestyrelsesmøde 24. april 2026. 1) Godkendelse af Q1 regnskab. 2) EBITDA-bridge Q1. 3) 13-ugers cash flow forecast. 4) Status social impact KPIs (GROW). 5) ESG-opdatering (Scope 1+2, SBTi status). 6) Eksportstrategi Sverige/Tyskland. 7) Eventuelt. Materialer deadline: 18. april.",
    metadata: {
      fileName: "Bestyrelsesagenda_April_2026.docx",
      author: "Annemette Thomsen",
      lastModified: daysAgoDate(3),
    },
  },

  // Doc 5. Board Pack Template (halvtomt)
  {
    sourceType: "drive_doc",
    connectorProvider: "google-drive",
    daysAgo: 10,
    content:
      "Bestyrelsespakke — template. Faner: P&L (actual/budget/variance), Balance, EBITDA Bridge, Working Capital, Cash Flow 13-uger, Social Impact KPIs, ESG Metrics. Faner markeret GUL = mangler data. P&L og Balance halvudfyldt. Social Impact, ESG og Cash Flow er tomme.",
    metadata: {
      fileName: "Board_Pack_Template.xlsx",
      author: "Marie Gade",
      lastModified: daysAgoDate(10),
    },
  },

  // Doc 6. Forretningsplan 2025 (contradiction: "ingen internationalisering")
  {
    sourceType: "drive_doc",
    connectorProvider: "google-drive",
    daysAgo: 90,
    content:
      "Hansens Flødeis — Forretningsplan 2025. Mission: Levere den originale danske is. Vision: Danmarks foretrukne økologiske is. Mål: Omsætning 42M DKK. 35 helårs-medarbejdere. Fokusområder: kvalitet, bæredygtighed, lokal produktion. \"Vi har ingen planer om internationalisering.\"",
    metadata: {
      fileName: "Forretningsplan_2025_Endelig.pdf",
      author: "Rasmus Eibye",
      lastModified: daysAgoDate(90),
    },
  },

  // Doc 7. Forsikringspolice (contradiction: siger 35, reelt 49)
  {
    sourceType: "drive_doc",
    connectorProvider: "google-drive",
    daysAgo: 75,
    content:
      "Forsikringspolice — Tryg Erhverv. Hansens Flødeis ApS. CVR: 16509973. Dækning: 35 medarbejdere. Erhvervsansvar: 10M DKK. Produktansvar: 5M DKK. Bygning + maskiner: 18M DKK. Kølefaciliteter: 4M DKK. Transportforsikring: 2M DKK. Gyldig til 31.12.2026.",
    metadata: {
      fileName: "Forsikringspolice_2025.pdf",
      author: "Marie Gade",
      lastModified: daysAgoDate(75),
    },
  },

  // Doc 8. Firmaprofil (contradiction: siger 25, reelt 49)
  {
    sourceType: "drive_doc",
    connectorProvider: "google-drive",
    daysAgo: 100,
    content:
      "Firmaprofil — Hansens Flødeis ApS. CVR 16509973. Grundlagt 1922. 4. generation. 25 medarbejdere. Specialer: økologisk flødeis, sorbet, ispinde, islagkager. Certificeringer: Ø-mærket, EU økologi. Adresse: Landerslevvej 5-7, 3630 Jægerspris.",
    metadata: {
      fileName: "Firmaprofil_Hansens_2024.pdf",
      author: "Camilla Holt",
      lastModified: daysAgoDate(100),
    },
  },

  // Doc 9. Organisationsoversigt (contradiction: Hans Jørgen erstattet af Annemette)
  {
    sourceType: "drive_doc",
    connectorProvider: "google-drive",
    daysAgo: 100,
    content:
      "Organisationsoversigt januar 2025. Direktør: Rasmus Eibye. Medejer: Anders Eibye. Bestyrelsesformand: Hans Jørgen Eibye. Driftsdirektør: Trine Damgaard. Salgsdirektør: Kim Søgaard. Medarbejdere i alt: 32.",
    metadata: {
      fileName: "Organisationsoversigt_Jan2025.pdf",
      author: "Trine Damgaard",
      lastModified: daysAgoDate(100),
    },
  },

  // Doc 10. Produktspecifikation Vanille
  {
    sourceType: "drive_doc",
    connectorProvider: "google-drive",
    daysAgo: 60,
    content:
      "Produktspecifikation: Hansens Vanille Flødeis 500ml. SKU: HF-VAN-500. Ingredienser: økologisk mælk, økologisk fløde, rørsukker, vaniljeekstrakt, æggeblomme. Næringsindhold per 100g: energi 890kJ, fedt 12g, protein 3.8g. Allergener: MÆLK, ÆG. Holdbarhed: 24 mdr ved -18°C. Nettoindhold: 500ml. EAN: 5701234567890.",
    metadata: {
      fileName: "Produktspecifikation_Vanille_500ml.pdf",
      author: "Lotte Friis",
      lastModified: daysAgoDate(60),
    },
  },

  // Doc 11. Leverandørkontrakt Svanholm
  {
    sourceType: "drive_doc",
    connectorProvider: "google-drive",
    daysAgo: 85,
    content:
      "Leverandørkontrakt — Svanholm Gods <-> Hansens Flødeis. Gyldig 1.1.2026-31.12.2026. Levering: 8.000L/uge økologisk Jersey-mælk. Pris: 8,20 DKK/L (justeret +3% fra 2025). Betalingsbetingelser: Netto 30 dage. Leveringsdag: mandag. Kvalitetskrav: <100.000 CFU/mL, <400.000 SCC.",
    metadata: {
      fileName: "Leverandoerkontrakt_Svanholm_2026.pdf",
      author: "Peter Holm",
      lastModified: daysAgoDate(85),
    },
  },

  // Doc 12. DSK Social Impact Skabelon (GROW data tomme)
  {
    sourceType: "drive_doc",
    connectorProvider: "google-drive",
    daysAgo: 8,
    content:
      "Den Sociale Kapitalfond — Social Impact Rapporterings-skabelon. KPIs: Antal medarbejdere fra kanten (mål: 20%). Timer arbejdet per sårbar medarbejder. Lønudgift per kategori (elev, flexjob, løntilskud). GROW-beregner input felter. Alle felter tomme for marts 2026.",
    metadata: {
      fileName: "DSK_Social_Impact_Skabelon.xlsx",
      author: "Trine Damgaard",
      lastModified: daysAgoDate(8),
    },
  },

  // Doc 13. ESG Energidata (data gap trigger)
  {
    sourceType: "drive_doc",
    connectorProvider: "google-drive",
    daysAgo: 40,
    content:
      "Energiforbrug Hansens Flødeis 2025. Solcellepark: 150 MWh produceret. Elforbrug total: ~750 MWh. Andel vedvarende: 20%. Gas: 0 (helvarmepumpe). Scope 1: Kølbiler (diesel) — data mangler. Scope 2: El fra grid — beregning mangler. CO₂-total: IKKE OPGJORT.",
    metadata: {
      fileName: "ESG_Energidata_2025.xlsx",
      author: "Trine Damgaard",
      lastModified: daysAgoDate(40),
    },
  },

  // Doc 14. Sæsonansættelsesplan (onboarding gap)
  {
    sourceType: "drive_doc",
    connectorProvider: "google-drive",
    daysAgo: 6,
    content:
      "Sæsonansættelsesplan forår 2026. Planlagt: 15 nye sæsonmedarbejdere (produktion). Starttidspunkt: marts-april. Ansat per d.d.: 8 af 15. Dokumentation komplet: 5 af 8. Mangler: 3 personer mangler kontrakt/forsikring/hygiejnekursus. Lars Winther (elev) starter 14. april — hygiejnecertifikat ikke booket.",
    metadata: {
      fileName: "Saesonansaettelsesplan_2026.xlsx",
      author: "Trine Damgaard",
      lastModified: daysAgoDate(6),
    },
  },

  // Doc 15. Coop Smag Forskellen Aftale
  {
    sourceType: "drive_doc",
    connectorProvider: "google-drive",
    daysAgo: 35,
    content:
      "Samarbejdsaftale — Coop Smag Forskellen x Hansens Flødeis. Islagkager med Hansens-produceret is. Coop leverer branding/emballagedesign. Hansens producerer og leverer. Sæson: Q3-Q4 2026. Volume: ca. 5.000 stk. Eksklusivt for Kvickly og SuperBrugsen.",
    metadata: {
      fileName: "Coop_Smag_Forskellen_Aftale_2026.pdf",
      author: "Anders Eibye",
      lastModified: daysAgoDate(35),
    },
  },

  // Doc 16. Prisliste OOH 2026
  {
    sourceType: "drive_doc",
    connectorProvider: "google-drive",
    daysAgo: 30,
    content:
      "Hansens Flødeis — Prisliste OOH/Foodservice 2026. Vejledende priser excl. moms. Flødeis 500ml: 42 DKK. Ispinde assorteret: 15 DKK/stk. Softice-base 10L: 285 DKK. Minimumsordre: 2.000 DKK. Levering: Egen kølbil Kbh/Nordsjælland (gratis over 5.000 DKK), øvrige via Shipmondo.",
    metadata: {
      fileName: "Prisliste_OOH_2026.pdf",
      author: "Kim Søgaard",
      lastModified: daysAgoDate(30),
    },
  },

  // Doc 17. Trustpilot Monitoring
  {
    sourceType: "drive_doc",
    connectorProvider: "google-drive",
    daysAgo: 8,
    content:
      "Trustpilot oversigt marts 2026. 215 anmeldelser totalt. Score: 4.2/5. Seneste 30 dage: 12 nye, heraf 8 negative der nævner \"romkugle-sagen.\" Eksempler: \"Skam sig — mobber små virksomheder\", \"Vil aldrig købe Hansens igen.\" 4 positive: \"Stadig den bedste is.\"",
    metadata: {
      fileName: "Trustpilot_Monitoring_Mar2026.pdf",
      author: "Camilla Holt",
      lastModified: daysAgoDate(8),
    },
  },

  // Doc 18. GS1 EDI Opsætning
  {
    sourceType: "drive_doc",
    connectorProvider: "google-drive",
    daysAgo: 60,
    content:
      "GS1 Trade Transact — EDI opsætning for Hansens Flødeis. GLN: 5790001234567. Aktive forbindelser: Coop (EDIFACT ORDERS/ORDRSP/DESADV/INVOIC), Salling Group (EDIFACT), Dagrofa (EDIFACT). Format: EDIFACT D.96A. Seneste test: OK december 2025.",
    metadata: {
      fileName: "GS1_EDI_Opsaetning.pdf",
      author: "Jonas Kvist",
      lastModified: daysAgoDate(60),
    },
  },

  // Doc 19. Kvalitetskontrol Checkliste
  {
    sourceType: "drive_doc",
    connectorProvider: "google-drive",
    daysAgo: 15,
    content:
      "Daglig kvalitetskontrol-checkliste. Pasteuriseringstemperatur (mål: 72°C +/- 1°): ___. Nedkølingstid (mål: <2 timer): ___. Fryserlagertemperatur (mål: -24°C +/- 2°): ___. Smagsprøve batch ___: OK / Afvigelse. Håndvask-station: OK / Fejl. CIP-rengøring udført: Ja / Nej. Underskrift: ___.",
    metadata: {
      fileName: "Kvalitetskontrol_Checkliste.pdf",
      author: "Lotte Friis",
      lastModified: daysAgoDate(15),
    },
  },

  // Doc 20. Budget 2026
  {
    sourceType: "drive_doc",
    connectorProvider: "google-drive",
    daysAgo: 50,
    content:
      "Budget 2026 — godkendt af bestyrelse feb 2026. Omsætning mål: 48M DKK (2024 actual: 39M). Bruttomargin mål: 52%. Personaleomkostninger: 14M. Råvarer: 18M. Cash flow lavpunkt forventet: april (pre-sæson opbygning). Kreditfacilitet: 3M DKK.",
    metadata: {
      fileName: "Budget_2026_Godkendt.xlsx",
      author: "Marie Gade",
      lastModified: daysAgoDate(50),
    },
  },

  // Doc 21. Procesoperatør Elevplan (Lars Winther ref)
  {
    sourceType: "drive_doc",
    connectorProvider: "google-drive",
    daysAgo: 12,
    content:
      "Elevplan — Procesoperatørelev hos Hansens Is. 4-årig uddannelse. Praktikperiode 1: Ismejeri produktion (6 mdr). Teori: AMU-kursus i fødevarehygiejne, HACCP grundkursus, maskinbetjening. Krav inden praktikstart: Hygiejnecertifikat (AMU), helbredserklæring, straffeattest.",
    metadata: {
      fileName: "Procesoperatoer_Elevplan.pdf",
      author: "Trine Damgaard",
      lastModified: daysAgoDate(12),
    },
  },

  // Doc 22. CO2 Kørebil Log (Scope 1 data)
  {
    sourceType: "drive_doc",
    connectorProvider: "google-drive",
    daysAgo: 45,
    content:
      "Kørselslog Hansens kølbiler 2025. Bil 1 (Sprinter -20°C): 28.400 km. Bil 2 (Vito -18°C): 22.100 km. Estimeret diesel: 5.200L + 4.100L. CO₂-estimat: ~24 ton. Data ikke verificeret. Ørsted el-aftale: grøn strøm til mejeri.",
    metadata: {
      fileName: "CO2_Koerebil_Log_2025.xlsx",
      author: "Jonas Kvist",
      lastModified: daysAgoDate(45),
    },
  },

  // Doc 23. Økologisk Certifikat 2026
  {
    sourceType: "drive_doc",
    connectorProvider: "google-drive",
    daysAgo: 200,
    content:
      "Ø-mærket certifikat. Udstedt af Fødevarestyrelsen. Gyldig 1.1.2026-31.12.2026. Dækker: produktion af økologisk flødeis, sorbet, ispinde. Kontrolnr: DK-ØKO-100. Virksomhed: Hansens Flødeis ApS, CVR 16509973, Landerslevvej 5-7, 3630 Jægerspris.",
    metadata: {
      fileName: "Oekologisk_Certifikat_2026.pdf",
      author: "Fødevarestyrelsen",
      lastModified: daysAgoDate(200),
    },
  },

  // Doc 24. Vedtægter
  {
    sourceType: "drive_doc",
    connectorProvider: "google-drive",
    daysAgo: 400,
    content:
      "Vedtægter for Hansens Flødeis ApS. CVR 16509973. Formål: mejeri, en gros, detailsalg, produktion af flødeis. Selskabskapital: 200.000 DKK. Stiftet: 1922. Senest ændret: 2024.",
    metadata: {
      fileName: "Vedtaegter_Hansens_Floedeis.pdf",
      author: "Rasmus Eibye",
      lastModified: daysAgoDate(400),
    },
  },

  // Doc 25. Fødevaresikkerhedsmanual
  {
    sourceType: "drive_doc",
    connectorProvider: "google-drive",
    daysAgo: 180,
    content:
      "Fødevaresikkerhedsmanual v3. Hygiejneregler: personlig hygiejne, håndvask før og efter produktion, beklædning (hvid kittel, hårnæt, handsker). Adgang til produktion kun for autoriseret personale. Besøgsregler: gæster skal registreres, bære hairnet og overtrækssko. Sygdomspolitik: medarbejdere med mave-tarm symptomer må ikke arbejde i produktion.",
    metadata: {
      fileName: "Foedevaresikkerhedsmanual_v3.pdf",
      author: "Lotte Friis",
      lastModified: daysAgoDate(180),
    },
  },

  // Doc 26. Egenkontrolprogram 2025
  {
    sourceType: "drive_doc",
    connectorProvider: "google-drive",
    daysAgo: 250,
    content:
      "Egenkontrolprogram 2025. Daglig: temperaturlog (fryselager, produktion, pasteurisering), rengøring, skadedyrskontrol. Ugentlig: overfladeprobøver på produktionslinje. Månedlig: vandprøve fra produktionsvand. Årlig: fuld audit af hele programmet. Ansvarlig: Lotte Friis (QA).",
    metadata: {
      fileName: "Egenkontrolprogram_2025.pdf",
      author: "Lotte Friis",
      lastModified: daysAgoDate(250),
    },
  },

  // Doc 27. Leverandørcertifikater samling (Vanilla Trading IKKE PÅ LISTEN)
  {
    sourceType: "drive_doc",
    connectorProvider: "google-drive",
    daysAgo: 90,
    content:
      "Samling af leverandørcertifikater. Svanholm Gods: Ø-cert DK-ØKO-100 (gyldig). Friis Holm: UTZ/Rainforest Alliance + Ø (gyldig). Palsgaard: ISO 22000 (gyldig). Solbærhaven: Ø-cert (gyldig). Emballage Danmark: ISO 9001 (gyldig). Vanilla Trading GmbH: IKKE PÅ LISTEN.",
    metadata: {
      fileName: "Leverandoercertifikater_samling.pdf",
      author: "Lotte Friis",
      lastModified: daysAgoDate(90),
    },
  },

  // Doc 28. Ejeraftale DSK
  {
    sourceType: "drive_doc",
    connectorProvider: "google-drive",
    daysAgo: 380,
    content:
      "Ejeraftale mellem Den Sociale Kapitalfond Invest II og Anders + Rasmus Eibye Hansen. 60/40 fordeling (DSK 60%, Eibye 40%). Medarbejderejerskabsmodel planlagt. Rapporteringskrav: månedlig P&L, kvartalsvis board pack med social impact, årlig ESG-rapport.",
    metadata: {
      fileName: "Ejeraftale_DSK_2025.pdf",
      author: "Annemette Thomsen",
      lastModified: daysAgoDate(380),
    },
  },

  // Doc 29. Årsrapport 2024
  {
    sourceType: "drive_doc",
    connectorProvider: "google-drive",
    daysAgo: 120,
    content:
      "Årsrapport 2024 — Hansens Flødeis ApS. Bruttofortjeneste: 38.870 TDKK. Nettoresultat: 6.715 TDKK. Resultat betegnet \"meget tilfredsstillende.\" Omsætning steget 14% ift. 2023. Egenkapital: 18.200 TDKK.",
    metadata: {
      fileName: "Aarsrapport_2024_Godkendt.pdf",
      author: "Marie Gade",
      lastModified: daysAgoDate(120),
    },
  },

  // Doc 30. 3F Overenskomst Mejeri
  {
    sourceType: "drive_doc",
    connectorProvider: "google-drive",
    daysAgo: 300,
    content:
      "3F Overenskomst for mejeriarbejdere. Minimalløn: 145,50 DKK/time. Opsigelsesvarsel: 1-6 mdr afhængig af anciennitet. Normal arbejdstid: 37 timer/uge. Overtid: +50% første 3 timer, +100% derefter. Ferie: 25 dage + 5 feriefridage. Gyldig 2024-2027.",
    metadata: {
      fileName: "3F_Overenskomst_Mejeri.pdf",
      author: "Trine Damgaard",
      lastModified: daysAgoDate(300),
    },
  },

  // Doc 31. APV 2025
  {
    sourceType: "drive_doc",
    connectorProvider: "google-drive",
    daysAgo: 280,
    content:
      "Arbejdspladsvurdering 2025 — Hansens Flødeis. Risici: koldt arbejdsmiljø (-18°C fryselager, max 30 min ad gangen), løft af paller (max 25 kg), CIP-kemikalier (NaOH, syre — kræver handsker og briller), støj fra maskiner (80+ dB, høreværn påbudt). Handlingsplan: forbedret ventilation i fryseren (deadline: juni 2025), nye sikkerhedssko til alle (deadline: marts 2025). Status: ukendt.",
    metadata: {
      fileName: "APV_2025.pdf",
      author: "Trine Damgaard",
      lastModified: daysAgoDate(280),
    },
  },

  // Doc 32. GDPR Databehandleraftaler
  {
    sourceType: "drive_doc",
    connectorProvider: "google-drive",
    daysAgo: 350,
    content:
      "Databehandleraftaler med: e-conomic (Visma), Tracezilla, Shipmondo, Google Workspace. GDPR Art. 28 standardklausuler. Alle aftaler underskrevet og arkiveret. BEMÆRK: Pleo er IKKE inkluderet i databehandleraftaler.",
    metadata: {
      fileName: "GDPR_Databehandleraftaler.pdf",
      author: "Marie Gade",
      lastModified: daysAgoDate(350),
    },
  },

  // Doc 33. Brandplan Jægerspris
  {
    sourceType: "drive_doc",
    connectorProvider: "google-drive",
    daysAgo: 320,
    content:
      "Brandplan for Landerslevvej 5-7, 3630 Jægerspris. Flugtveje: 3 udgange (hovedindgang, bagindgang produktion, nødudgang lager). Samlingsplads: parkeringsplads foran bygning. Brandslukkere: 8 stk (placering markeret på kort). Brandøvelse: årlig. Sidst øvet: september 2025.",
    metadata: {
      fileName: "Brandplan_Jaegerspris.pdf",
      author: "Trine Damgaard",
      lastModified: daysAgoDate(320),
    },
  },

  // Doc 34. Recepter Oversigt (fortroligt)
  {
    sourceType: "drive_doc",
    connectorProvider: "google-drive",
    daysAgo: 60,
    content:
      "Receptoversigt 2026 (FORTROLIGT). Vanille: mælk 62%, fløde 28%, sukker 8%, vaniljeekstrakt 1.5%, æggeblomme 0.5%. Chokolade: mælk 55%, fløde 25%, sukker 10%, kakao 8%, emulgator 2%. O'Payo: mælk 60%, fløde 25%, sukker 8%, passionsfrugt 5%, emulgator 2%. Salt Karamel: mælk 58%, fløde 27%, sukker 9%, karamelsauce 5%, havsalt 1%. Jordbær Sorbet: jordbær 45%, vand 30%, sukker 20%, citronsaft 5% (VEGAN).",
    metadata: {
      fileName: "Recepter_Oversigt_2026.pdf",
      author: "Niels Brandt",
      lastModified: daysAgoDate(60),
    },
  },

  // Doc 35. ATP Certifikat Kølbiler
  {
    sourceType: "drive_doc",
    connectorProvider: "google-drive",
    daysAgo: 150,
    content:
      "ATP-certificering kølbiler. Mercedes Sprinter (reg. AB12345): ATP FRC, gyldig til 2027. Mercedes Vito (reg. CD67890): ATP FRC, gyldig til 2027. Krav: -18°C eller lavere under transport. Årlig inspektion påkrævet. Næste inspektion: oktober 2026.",
    metadata: {
      fileName: "ATP_Certifikat_Koelebiler.pdf",
      author: "Jonas Kvist",
      lastModified: daysAgoDate(150),
    },
  },
];
