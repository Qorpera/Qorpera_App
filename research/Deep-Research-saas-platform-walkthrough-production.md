# SaaS Platform Walkthrough Video Production

**Researched:** 2026-03-22
**Prompt:** How should Qorpera produce professional UI walkthrough videos for the Platformen page? Cover the full production pipeline: planning, recording, editing, narration, and hosting. Focus on what works for B2B professional tools targeting SMB decision-makers (not consumer SaaS).

## Key Findings

- **Scroll-triggered animated mockups outperform embedded video on product pages.** None of the 8 best-in-class B2B SaaS companies (Linear, Attio, Notion, etc.) rely on traditional video as their primary product page format. The trend is animated product previews that activate on scroll — lighter, faster, mobile-friendly, and keeps visitors in the page flow.
- **Interactive demos convert 2x better than video walkthroughs** and leads close 20–25% faster. Website visitors who interact with a product demo convert at 24.35% — nearly 8x the site-wide average. However, only 4% of companies use them today, and top-tier brands build custom animations instead of using tools like Arcade/Navattic.
- **For a rapidly evolving UI, screenshot-based interactive demos (Supademo, Arcade) are easiest to maintain.** HTML-capture tools (Navattic, HowdyGo) produce more realistic demos but require re-capture when the UI changes. Screenshot tools re-record in minutes.
- **If producing video, Screen Studio ($9/mo) + Descript ($16/mo) = $25/mo total** for professional output. A solo founder can produce 5–7 polished 60–90s walkthrough videos in a focused weekend.
- **88% of software buyers won't book a sales call without seeing the product first.** Having any demo is vastly better than having none. B2B SMB buyers are forgiving of production quality as long as the product is visible, audio is clear, and the value is communicated in the first 30 seconds.
- **Bunny.net Stream ($1–5/mo) is the best hosting option for bootstrapped startups.** YouTube for SEO content, but not for product pages (competitor recommendations, ads). Wistia only makes sense once you have a marketing team + CRM attribution pipeline.

## Full Research

### 1. Format Decision: Video vs Interactive Demo vs Hybrid

#### Format Comparison Matrix

| Dimension | Traditional Video | Interactive Demo | Animated Mockups | Hybrid |
|---|---|---|---|---|
| **Engagement** | Passive viewing; 50% drop at 90s | 2x higher than video; 67% completion | Scroll-driven, continuous | Best of both |
| **Conversion impact** | Moderate | 24.35% conversion (8x avg) | High (keeps scroll flow) | Highest |
| **Production cost** | $25/mo tools | $0–159/mo tools | Engineering time (custom) | Sum of parts |
| **Update difficulty** | Re-record + re-edit | Re-capture screenshots/HTML | Update code/animations | Medium |
| **Mobile experience** | OK (but autoplay issues) | 52% have mobile strategy | Excellent (CSS/JS) | Good |
| **SEO value** | High (YouTube) or none | Low (iframe content not indexed) | Part of page (indexed) | Mixed |
| **Time to produce** | Weekend (5–7 videos) | Hours per demo | Days–weeks (engineering) | Longer |
| **Buyer preference** | Top-of-funnel awareness | Mid-funnel evaluation | Product page browsing | Full funnel |

#### Traditional Video Walkthroughs

**When they're still the right choice:**
- Top-of-funnel content marketing (YouTube SEO, social media clips)
- Sales enablement deep-dives for prospects in evaluation
- Product launch announcements and update videos
- When you need narration to explain non-obvious concepts
- Resource centers and demo hubs (separate from the product page)

**Pros:** Highest SEO potential (YouTube), works for all complexity levels, can convey emotion and narrative, cheap to produce with modern tools, reusable across channels (social, email, blog).

**Cons:** Passive viewing, rapid drop-off (33% leave after 30s, 50% after 90s), hard to update when UI changes, interrupts page scroll flow, autoplay restrictions on mobile, dated quickly.

#### Interactive Product Demos

**Tools ranked for bootstrap budget:**

1. **Supademo** — Best value. Free tier (5 demos), Pro $27/mo. AI voiceovers, 15+ language translations, GIF/MP4/PDF export. Screenshot-based with optional HTML capture.
2. **Arcade** — Close second. Free tier (3 demos), Pro $32/mo. Screenshot/recording hybrid, version control, social media exports. Best for short punchy demos.
3. **Storylane** — $40/mo Starter (unlimited published demos). Screenshot-only at this tier; HTML capture requires $500/mo Growth plan.
4. **HowdyGo** — $159/mo, no free tier. True HTML capture with unlimited demos. Best "affordable HTML capture" if demo quality is a key differentiator.
5. **Navattic** — $500/mo Base. Excellent HTML capture but priced for funded marketing teams.
6. **Tourial** — $1,000/mo annual contract. Enterprise only.
7. **Walnut** — ~$9,000/year. Sales-team focused, enterprise pricing. Best AI features (EditsAI for bulk updates) but out of reach for bootstrappers.

**Conversion data:**
- Interactive demos generate 2x higher engagement than video
- Leads close 20–25% faster (self-educated buyers)
- Completion rates reach 67%
- Companies report up to 32% conversion improvement
- Adding one interactive tour = 1.7x more signups, 1.5x higher activation (PLG products)

**Update difficulty by capture method:**
- Screenshot-based (Arcade, Supademo): Re-record affected steps in minutes. AI auto-generates new annotations.
- HTML/CSS capture (Navattic, HowdyGo, Walnut): Re-capture required for structural UI changes. Minor text/data edits possible in-place.

#### Animated UI Mockups (the Market Leader Approach)

This is what the best-performing B2B SaaS companies actually do on their product pages:

- **Linear**: Scroll-triggered CSS/JS animations on dark background. No video. Product UI previews activate as you scroll via `requestAnimationFrame`.
- **Attio**: Animated product previews with a dark-to-light transition effect. Scroll-driven component reveals with cubic bezier curves.
- **Monday.com**: Animated board transformations showing "before chaos / after clarity" contrasts.
- **Intercom**: Mixed real UI + hand-drawn illustrations + animated elements.

**Pros:** Best performance (no heavy iframe/video loads), keeps users in scroll flow, works perfectly on mobile, fully brandable, indexed by search engines as part of the page.

**Cons:** Requires engineering time to build, harder to update than re-recording a video, not reusable across channels (blog, email, social).

#### Recommendation for Qorpera

**Phase 1 (now — UI still evolving):** Use **Supademo** (free tier, 5 demos) or **Arcade** (free tier, 3 demos) for interactive demos on the Platformen page. Screenshot-based demos are fast to create and easy to update when the UI changes. Supplement with 2–3 short narrated videos for the resource center / YouTube.

**Phase 2 (UI stabilized):** Build custom scroll-triggered animated product mockups for the Platformen page (the Linear/Attio approach). Move interactive demos to a dedicated Demo Hub. Use narrated video for content marketing and sales enablement.

**Phase 3 (traction):** Consider HowdyGo ($159/mo) for high-fidelity HTML-capture interactive demos. Add Wistia for video if CRM attribution matters.

---

### 2. Video Production Playbook for Solo Founders

#### Recording Tools

| Tool | Price | Platform | Key Feature | Best For |
|---|---|---|---|---|
| **Screen Studio** | $9/mo (annual) | Mac only | Auto-zoom follows cursor, smooth cursor effects | Most professional output with zero editing |
| **Tella** | $12/mo (annual) | Cross-platform | Browser-based, webcam + screen compositing, custom backgrounds | Webcam + screen layouts |
| **Loom** | Free (5 min, 25 videos) | Cross-platform | Fastest path to shared video, cam bubble | Quick internal videos, not polished demos |
| **OBS** | Free | Cross-platform | Unlimited capability, scene management | Users who already know it |
| **mmhmm** | Free / $10/mo | Cross-platform | Virtual camera for meetings | Meeting presentations, not product demos |

**Winner:** Screen Studio produces the most professional output with minimal editing. The auto-zoom and smooth cursor effects instantly make recordings look professionally produced. If on Mac, this is the clear choice.

#### Editing Software

| Tool | Price | Key Feature | Efficiency |
|---|---|---|---|
| **Descript** | $16/mo Hobbyist, $24/mo Creator | Edit video by editing text transcript | Fastest for narration-heavy content |
| **DaVinci Resolve** | Free | Full NLE + color + audio + VFX | Overpowered; steep learning curve |
| **CapCut** | Free / $7.99/mo Pro | Multi-track timeline, AI features | Good free option for basic editing |

**Winner for 5–7 short videos:** Descript. Text-based editing is dramatically faster than timeline editing. Record rough narration, delete mistakes by deleting text, auto-remove filler words, export. A solo founder saves hours per video compared to DaVinci Resolve.

#### Narration Strategy

| Approach | When to Use |
|---|---|
| **Your own voice** | Primary hero demo and any trust-critical content. Founder voice signals conviction and authenticity in B2B. |
| **Hybrid** (rough narration during recording, re-record audio separately) | Best quality. Use rough take for timing, clean re-record for final audio. |
| **AI voiceover** (ElevenLabs) | Secondary feature walkthroughs, tooltips, multilingual versions. ElevenLabs at $5/mo is near-human quality (4.14/5.0 MOS). |
| **Descript Overdub** | Fix narration mistakes by retyping. Clone your voice from ~30s of audio. Available on all plans. |

**B2B acceptability of AI voice:** Growing (80% of buyers trust AI content at least sometimes), but for a primary product demo, your own voice builds more trust. Use AI for supplementary content.

#### Recording Best Practices

**Resolution & settings:**
- Record at **1920×1080 (1080p)**. Sharp enough for UI detail, manageable file sizes.
- **30 fps**. Standard for SaaS demos. 60 fps doubles file size with no perceptible gain.
- Close all notifications, clean desktop, set a neutral wallpaper.

**Seed data:**
- Use **Faker.js** or **Mockaroo** for realistic names, emails, companies, financial figures.
- Create a named fictional company with a coherent story (e.g., "Meridian Logistics" with 47 employees, specific departments, realistic revenue).
- Pre-populate enough data that the UI looks lived-in: dashboards with trends, inboxes with messages, task lists with varying statuses.
- Never use "Test User," "Lorem ipsum," or obviously fake data.

**Cursor and highlighting:**
- Screen Studio: Built-in smooth cursor and click highlighting.
- Mousepose (Mac, $10): Dims screen and spotlights cursor area with colored click circles.

**Background music:**
- Yes, but barely noticeable (10–15% volume). Fills silence during transitions, adds polish.
- **Free:** FreePD.com (public domain), Uppbeat (freemium), YouTube Audio Library.
- **Paid:** Epidemic Sound ($13/mo), Artlist ($9.99/mo).
- **Genre:** Lo-fi, ambient electronic, or light corporate. No lyrics, no strong rhythm.

#### Optimal Video Length

| Context | Length | Notes |
|---|---|---|
| Homepage hero / landing page | 60–90 seconds | 50% retention at 90s. Hook in first 30s. |
| Social media clip | 10–30 seconds | Hook in first 3 seconds. |
| Individual feature walkthrough | 30–90 seconds | Problem → feature → demo → outcome. |
| Full product demo (mid-funnel) | 2–5 minutes | For prospects already interested. |
| Sales deep-dive | 5–12 minutes | Deep in evaluation. |

**Pacing rules:**
- Front-load value. A third of viewers drop off after 30 seconds.
- Speed up repetitive actions (typing, loading, navigation) to 2–4x.
- Never show a loading spinner at real speed.
- Hold on key UI moments for 3–5 seconds with narration before moving on.
- Use zoom sparingly — too much is distracting.

**Multi-format strategy:** Record one long session, cut into: 30s social clip, 90s homepage hero, 2-min sales demo.

---

### 3. Content Structure Plan for Qorpera's Platformen Page

#### Current Sections

1. **The Map** — org structure, departments, entities, knowledge graph
2. **Situations** — cross-system pattern detection, evidence trails
3. **Advisor** — conversational AI interface
4. **Approvals** — review/approve/reject AI proposals
5. **Connections** — connector setup and management
6. **Learning** — autonomy progression, per-employee AI tracking
7. **Policies** — governance rules

#### Recommended Structure: One Short Demo Per Section

**Rationale:** All 8 best-in-class companies break their product into distinct feature sections. None use a single long walkthrough. Section-by-section lets visitors jump to what interests them and is dramatically easier to update when individual features change.

| Section | Demo Length | Narrative Approach |
|---|---|---|
| **Overview / Hero** | 60–90s | "Follow an invoice anomaly through the system" — narrative that threads through Map → Situation → Advisor → Approval |
| **The Map** | 45–60s | Feature-focused: "Here's how your organization comes alive" — show entity creation, department setup, graph exploration |
| **Situations** | 60–90s | Problem-first: "An unusual pattern appears…" — show detection, evidence trail, severity assessment |
| **Advisor** | 45–60s | Conversational: "Ask your advisor about it" — show natural language query, context-aware response, suggested actions |
| **Approvals** | 30–45s | Action-focused: "You stay in control" — show proposal review, approve/reject, execution confirmation |
| **Connections** | 30–45s | Setup-focused: "Connect your tools in clicks" — show OAuth flow, sync status, data flowing in |
| **Learning** | 45–60s | Trust-building: "Watch autonomy grow" — show trust gradient, graduation events, before/after comparison |
| **Policies** | 30–45s | Governance: "Set the rules" — show policy creation, enforcement in action |

**Total:** 7 section demos (30–90s each) + 1 hero overview (60–90s) = ~8 demos

**Narrative vs. feature-focused:** Use a **narrative thread for the hero overview** ("follow a situation through the system") and **feature-focused for individual sections**. This gives visitors both the story and the details.

**Concept vs. UI balance:** Lead with the concept (2–3 seconds of problem statement text/narration), then show the UI doing it (majority of the time), then close with the outcome (1–2 seconds). Ratio: ~20% concept, ~70% UI, ~10% outcome.

---

### 4. Best-in-Class B2B Examples Analysis

#### Company-by-Company Findings

| Company | Primary Format | Theme | Video? | Interactive Demo? | Key Technique |
|---|---|---|---|---|---|
| **Linear** | Scroll-animated mockups | Dark | No | No | Scroll-driven animations via `requestAnimationFrame`; defined the "Linear design" aesthetic |
| **Notion** | Screenshots + illustrations + video | Light | Yes (hero + Demo Hub) | Demo Hub | Hand-drawn illustrations alongside real UI; separate Demo Hub for deep exploration |
| **Attio** | Animated product previews | Light→dark transition | No | No | Dashboard dark-to-light scroll transition; "Apple-like" whitespace |
| **Front** | Static screenshots + resource videos | Light | Resource center | No | Traditional approach — real screenshots, feature pages, copy-driven |
| **Clay** | Typography + logos first, then UI | Light | External only | External only | Trust-first: enterprise logos and outcomes before showing product UI |
| **HubSpot** | Hub-specific pages + video demos | Light (neutral) | Yes (dedicated page) | Via partners | Gold standard: Hub-specific pages, short demo videos per product, live demo request option |
| **Monday.com** | Animated UI + narrated video | Colorful | Yes (narrated) | External | "Before chaos / after clarity" transformation contrast |
| **Intercom** | Illustrations + animated UI | Light (teal) | Demo page | No | Art-directed illustration meets product UI; emotional brand warmth |

#### Patterns Across All 8

1. **No company uses Arcade/Navattic on their main product pages.** Top-tier brands build custom animated experiences. Interactive demo tools are more common in mid-market SaaS.

2. **Section-by-section is universal.** Every company breaks features into distinct sections with individual visual treatment.

3. **Embedded content is always silent.** Narrated videos live in dedicated demo pages or resource centers, not inline on the product page.

4. **Dark mode signals technical/developer audience.** Linear (dark) vs. Monday.com (colorful) = different audiences. Qorpera's dark UI theme aligns with the Linear/developer-tool aesthetic.

5. **One signature visual technique per brand.** Attio's dark-to-light transition, Linear's scroll animations, Intercom's illustrations. Having one memorable moment beats many generic effects.

6. **Trust-first works for complex products.** Clay deliberately hides the product UI from the hero section, leading with enterprise logos and outcome statements instead.

#### What This Means for Qorpera

Qorpera's dark UI theme and operational-intelligence positioning align most closely with the **Linear/Attio aesthetic**. The recommended approach:

- Dark background with purple accent animations (matches existing brand)
- Scroll-triggered product mockups for each Platformen section
- One signature visual technique (e.g., a "situation detection" animation where data flows in from connections and crystallizes into a situation card)
- Narrated demo videos in a separate Demo Hub, not inline on the product page
- Interactive Supademo/Arcade demos as a bridge until custom animations are built

---

### 5. Video Hosting and Embedding

#### Hosting Platform Comparison

| Platform | Price | Ads/Recommended | Analytics | Custom Player | Lead Capture | Best For |
|---|---|---|---|---|---|---|
| **YouTube** | Free | Yes — ads possible, related videos | YouTube Studio | Minimal params | No | SEO, content marketing, top-of-funnel |
| **Vimeo Standard** | ~$20–25/seat/mo | None | Engagement stats | Colors, logos, CTAs | Basic CTAs | Clean product page embeds |
| **Wistia Plus** | $19/mo (20 videos) | None | Heatmaps, viewer-level | Full customization | In-video forms, CRM | B2B demand gen with marketing team |
| **Bunny.net Stream** | ~$1–5/mo (pay-as-you-go) | None | Basic playback | Customizable + API | No | **Bootstrapped startups** |
| **Mux** | Free tier ($100/mo credit) | None | Real-time quality metrics | API-first | No | Developer teams building video into product |
| **Cloudflare Stream** | $5/mo base | None | Basic delivery | API-driven | No | Teams already on Cloudflare |
| **Self-hosted + CDN** | CDN cost only ($0–5/mo) | None | None (DIY) | Total control | DIY | 1–3 short hero videos |

**Recommendation:** **Bunny.net Stream** for product page videos ($1–5/mo). **YouTube** for content marketing (SEO discoverability). Avoid YouTube embeds on product pages — competitor recommendations and ads undermine trust.

**Vimeo risk note:** Bending Spoons acquired Vimeo for $1.38B in late 2025, followed by mass layoffs in Jan 2026. Expect pricing increases.

#### Embedding Best Practices

**Performance (Core Web Vitals):**
- A single YouTube embed loads 500KB–1MB of JavaScript even without user interaction.
- Use **lite-youtube-embed** web component (224x faster, reduces TBT from ~1366ms to ~567ms). React version: `react-lite-youtube-embed` on npm.
- Always use `loading="lazy"` on iframes below the fold.
- Set explicit `width` and `height` (or `aspect-ratio: 16/9`) on all video containers to prevent CLS.
- Never lazy-load the above-the-fold hero video — it's your LCP element.

**Video facade pattern (recommended):**
1. Render a static thumbnail + CSS play button overlay.
2. On click, replace with the actual `<iframe>` or `<video>` element.
3. Zero performance cost until user interaction.

**For multiple videos on one page:**
- Use Intersection Observer to load iframes only when scrolled into viewport.
- Consider popup/modal embeds for secondary demos — zero cost until click.
- Use `preload="none"` or `preload="metadata"` on `<video>` tags.

**Interactive demo embeds:**
- Arcade, Navattic, Supademo all use iframe-based embeds.
- Navattic offers a lazy-load overlay (static image until interaction).
- Set explicit dimensions to prevent layout shifts.
- Consider popup embeds for secondary demos.

**Video format for self-hosted:**
```html
<video>
  <source src="video.av1.webm" type="video/webm; codecs=av01">
  <source src="video.vp9.webm" type="video/webm; codecs=vp9">
  <source src="video.mp4" type="video/mp4">
</video>
```
H.264 MP4 for universal compatibility. AV1 saves 50–70% bandwidth on supporting browsers.

**Responsive embeds (modern CSS):**
```css
.video-container {
  width: 100%;
  aspect-ratio: 16 / 9;
}
.video-container iframe {
  width: 100%;
  height: 100%;
  border: 0;
}
```

**Mobile:**
- 64.2% of video plays are on mobile.
- Muted autoplay is always allowed: `autoplay muted loop playsinline`.
- Keep autoplay clips to 5–12 seconds.
- Use `object-fit: cover` on `<video>` elements.

---

### 6. Production Timeline and Budget

#### Weekend Production Plan

**Saturday Morning (3–4 hours): Preparation**
- Write bullet-point scripts for 7 section demos + 1 hero overview (not full scripts — bullet points keep delivery natural)
- Populate seed data: use Faker.js/Mockaroo for realistic company with coherent story
- Set up recording: close notifications, 1080p resolution, neutral desktop
- Do 2–3 test recordings to get comfortable with Screen Studio

**Saturday Afternoon (4–5 hours): Recording**
- Record all 8 demos in sequence while energy is fresh
- Screen Studio auto-polishes with zoom and smooth cursor
- Aim for 2–3 takes per demo, pick the best
- Record rough narration simultaneously (hybrid approach)

**Sunday (5–6 hours): Editing and Export**
- Import into Descript, text-based edit to cut mistakes
- Auto-remove filler words
- Add background music at 10–15% volume
- Export all videos
- Upload to Bunny.net Stream + YouTube
- Create thumbnails

**Realistic output:** 8 videos of 30–90 seconds each at good (not perfect) quality.

#### Minimum Viable Budget

| Tool | Monthly Cost | Purpose |
|---|---|---|
| Screen Studio | $9/mo (annual) | Recording with auto-zoom |
| Descript Hobbyist | $16/mo | Text-based editing, filler removal |
| Bunny.net Stream | ~$2/mo | Ad-free video hosting |
| FreePD.com | Free | Background music |
| Faker.js | Free | Seed data |
| **Total** | **~$27/mo** | |

**If adding interactive demos:**

| Addition | Monthly Cost | What You Get |
|---|---|---|
| Supademo Free | $0 | 5 interactive demos |
| Supademo Pro | +$27/mo | Unlimited demos, AI voiceover, translations |
| Arcade Free | $0 | 3 interactive demos |
| Arcade Pro | +$32/mo | Unlimited demos, no watermark |

**Total with interactive demos:** $27/mo (video) + $0–32/mo (interactive) = **$27–59/mo**

#### The "Good Enough" Threshold

B2B SMB buyers expect:
1. **The product is clearly visible and understandable** — real UI, not mockups
2. **Audio is clear** — no echo, no background noise, audible narration
3. **Value is communicated in the first 30 seconds** — "how does this make my life easier?"

They do NOT expect:
- Hollywood production value
- Professional voiceover talent
- Elaborate motion graphics
- Background music (nice to have, not expected)

**The bar is:** clear screen recording + audible narration + no obvious mistakes. Smooth cursor effects and background music push you above average. Having any demo at all puts you ahead of most early-stage competitors — 88% of buyers won't book a call without seeing the product first.

#### When to Invest in Professional Production

| Revenue Stage | Recommendation |
|---|---|
| Pre-revenue / <$10K MRR | DIY with $27/mo toolset. Good enough. |
| $10K–50K MRR | Upgrade to Supademo Pro or Arcade Pro. Consider HowdyGo for HTML-capture demos. |
| $50K–100K MRR | Hire a freelance video editor for polish. Build custom scroll animations for the product page. |
| >$100K MRR | Consider a product marketing agency for the platform page. Add Wistia for CRM attribution. |

---

### 7. Recommended Approach for Qorpera

#### Immediate (Phase 1 — UI still evolving)

1. **Create 5 Supademo interactive demos** (free tier) for the Platformen page sections: Map, Situations, Advisor, Approvals, and Connections.
2. **Record 1 narrated hero video** (60–90s) using Screen Studio + Descript showing a situation flowing through the system end-to-end. Host on Bunny.net Stream.
3. **Upload the hero video to YouTube** with SEO-optimized title/description for discoverability.
4. **Embed with facades** — thumbnail + play button, load player on click. Use `lite-youtube-embed` for any YouTube embeds.
5. **Total cost:** $27/mo (Screen Studio + Descript + Bunny.net). Total time: one focused weekend.

#### Near-term (Phase 2 — UI stabilized after i18n/polish)

1. **Build custom scroll-triggered animations** for the Platformen page (the Linear/Attio approach). Dark background, purple accents, product UI that animates on scroll.
2. **Create a Demo Hub page** with per-section narrated walkthrough videos and interactive demos.
3. **Upgrade to Supademo Pro** ($27/mo) for unlimited demos with AI voiceover and translations (Danish + English).
4. **Invest in one signature animation** — e.g., a "situation detection" sequence where data streams from connections crystallize into a situation card.

#### Later (Phase 3 — traction and marketing investment)

1. **Consider HowdyGo** ($159/mo) for high-fidelity HTML-capture demos once the UI is stable.
2. **Add Wistia** when CRM pipeline attribution matters.
3. **Hire a freelance video editor** when revenue justifies the investment.

---

### Sources

#### Interactive Demo Tools
- [Arcade Pricing](https://www.arcade.software/pricing) · [Arcade Embed Docs](https://docs.arcade.software/kb/build/interactive-demo/share/how-to-embed-your-arcades)
- [Navattic Pricing](https://www.g2.com/products/navattic/pricing) · [Navattic Embed Docs](https://docs.navattic.com/share/embed)
- [Supademo Pricing](https://supademo.com/pricing) · [Supademo Benchmarks 2026](https://supademo.com/blog/7-benchmarks-for-interactive-demos-in-2026)
- [HowdyGo Pricing](https://www.howdygo.com/product/pricing) · [HowdyGo Demo Comparison](https://www.howdygo.com/blog/interactive-product-demo-comparison)
- [Storylane Plans](https://www.storylane.io/plans) · [Storylane Screenshot vs HTML](https://www.storylane.io/plot/screenshot-or-html-picking-the-right-demo-format)
- [Walnut Pricing](https://www.vendr.com/marketplace/walnut) · [Walnut Interactive Demo Guide](https://www.walnut.io/blog/sales-tips/how-to-create-interactive-demos-best-practices-and-examples/)
- [Tourial Alternatives](https://demosmith.ai/blog/best-tourial-alternative-demo-platform)
- [Navattic State of Interactive Demo 2026](https://www.navattic.com/report/state-of-the-interactive-product-demo-2026)

#### Video Production
- [Screen Studio](https://screen.studio/) · [Screen Studio Pricing Review](https://matte.app/blog/screen-studio-review)
- [Tella Pricing](https://www.tella.com/pricing) · [Tella Review 2026](https://efficient.app/apps/tella)
- [Loom Pricing](https://www.atlassian.com/software/loom/pricing)
- [Descript Pricing](https://www.descript.com/pricing) · [Descript Review 2026](https://www.vidmetoo.com/descript-review/)
- [DaVinci Resolve](https://www.blackmagicdesign.com/products/davinciresolve)
- [CapCut Pricing 2026](https://www.gamsgo.com/blog/capcut-pricing)
- [ElevenLabs vs Murf.ai](https://murf.ai/compare/murf-ai-vs-elevenlabs)
- [Mousepose](https://boinx.com/mousepose/)
- [SaaS Demo Best Practices 2025](https://www.contentbeta.com/blog/product-demo-best-practices)
- [High-Converting SaaS Demo Videos Guide](https://www.videopulse.io/blog/how-to-create-high-converting-saas-demo-videos-2025-guide)
- [2025 B2B Buyer First Report](https://www.chilipiper.com/post/2025-b2b-buyer-first-report)

#### B2B Examples
- [Linear Design Trend](https://blog.logrocket.com/ux-design/linear-design/) · [The Linear Look](https://frontend.horse/articles/the-linear-look/)
- [Attio Design Analysis](https://www.designrush.com/best-designs/websites/attio-website-design) · [How Attio Does Design](https://strategybreakdowns.com/p/how-attio-does-design)
- [Notion Demo Hub](https://www.notion.com/product/demos)
- [HubSpot Video Demos](https://www.hubspot.com/video) · [HubSpot Design Blog](https://product.hubspot.com/blog/designing-for-your-next-decade-growth)
- [Intercom New Website](https://www.intercom.com/blog/new-website/)
- [SaaS Landing Page Trends 2026](https://www.saasframe.io/blog/10-saas-landing-page-trends-for-2026-with-real-examples)
- [Best B2B SaaS Websites 2026](https://www.vezadigital.com/post/best-b2b-saas-websites-2026)

#### Hosting & Embedding
- [Bunny.net Stream Pricing](https://bunny.net/pricing/stream/) · [Bunny.net Docs](https://docs.bunny.net/stream/pricing)
- [Mux Pricing](https://www.mux.com/pricing) · [Mux Video Docs](https://www.mux.com/docs/pricing/video)
- [Cloudflare Stream Pricing](https://developers.cloudflare.com/stream/pricing/)
- [Wistia Pricing](https://wistia.com/pricing) · [Wistia vs Vimeo](https://wistia.com/learn/marketing/wistia-vs-vimeo)
- [Vimeo Pricing Guide](https://www.uscreen.tv/blog/vimeo-pricing-guide/)
- [lite-youtube-embed](https://github.com/paulirish/lite-youtube-embed) · [react-lite-youtube-embed](https://github.com/ibrahimcesar/react-lite-youtube-embed)
- [YouTube Core Web Vitals](https://www.corewebvitals.io/pagespeed/perfect-youtube-core-web-vitals)
- [Third-Party Embed Best Practices](https://web.dev/articles/embed-best-practices)
- [Responsive Video Embedding](https://cloudinary.com/guides/video-effects/responsive-video-embedding-embed-video-iframe-size-relative-to-screen-size)
- [Video Codecs Comparison](https://www.cincopa.com/learn/vp9-codec-vs-av1-vs-h-264-comparison-for-web-video)
