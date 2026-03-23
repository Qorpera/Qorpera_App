# EU AI Act Compliance for Agentic B2B SaaS

**Researched:** 2026-03-20
**Prompt:** Research EU AI Act compliance requirements for a B2B SaaS platform that uses AI agents to make operational business decisions with graduated human oversight (Observe → Propose → Act). Cover risk classification, transparency obligations, Article 14 human oversight, record-keeping, timeline, and Danish-specific guidance.

## Key Findings

- **Qorpera's core use cases (overdue invoice detection, churn flagging, CRM updates, email drafting) fall under Limited Risk / Minimal Risk** — not High-Risk — provided the platform stays away from employment management, individual creditworthiness assessment, and profiling of natural persons. As the developer, Qorpera is the "provider" under the Act (heavier obligations); SMB customers are "deployers."
- **AI literacy obligations are already in effect** (since February 2, 2025). The main compliance deadline for transparency, human oversight, record-keeping, and enforcement is **August 2, 2026** (~17 months away). Penalties reach up to 35M EUR / 7% global turnover.
- **The Observe → Propose → Act trust gradient maps directly to Article 14 human oversight requirements** and is a genuine compliance advantage. Key gaps: emergency stop mechanism, automation bias mitigation in UI, and AI-generated content disclosure for Act-mode communications.
- **Denmark was the first EU member state to complete national AI Act implementation** (Law No. 467, effective August 2, 2025). Datatilsynet operates a Regulatory Sandbox for AI offering bespoke advisory engagements — a direct opportunity to validate Qorpera's compliance approach before enforcement.
- **Record-keeping requirements demand 6-month minimum retention for operational logs and 10-year retention for technical documentation.** Comprehensive audit logging of every reasoning chain, policy evaluation, human approval/rejection, and autonomous action execution is needed.

## Full Research

### 1. Risk Classification

#### Where Qorpera Likely Falls: Limited Risk / Minimal Risk (with potential High-Risk edges)

The EU AI Act establishes four risk tiers: **Unacceptable** (banned), **High Risk** (heavy obligations), **Limited Risk** (transparency obligations), and **Minimal Risk** (no specific obligations beyond AI literacy).

Qorpera's primary use cases — detecting overdue invoices, flagging churn risk, proposing CRM updates, drafting email responses — are general business operations AI. These do not appear in the exhaustive list of high-risk use cases in **Annex III**, which covers:

- Biometric identification
- Critical infrastructure management
- Education and vocational training
- Employment, workers management, access to self-employment
- Access to essential public/private services (credit scoring, emergency dispatch, health/life insurance)
- Law enforcement, migration, border control
- Administration of justice and democratic processes

#### Edge Cases That Could Trigger High-Risk Classification

1. **Employment/workers management (Annex III, point 4):** If Qorpera is ever used to monitor employee performance, assign tasks, or influence termination/promotion decisions, it crosses into high-risk territory. AI systems "intended to be used for making decisions on promotion and termination of work-related contractual relationships, for task allocation and for monitoring and evaluating performance and behavior of persons" are explicitly high-risk.

2. **Creditworthiness assessment (Annex III, point 5b):** If the system evaluates the creditworthiness of natural persons or establishes credit scores, it becomes high-risk. Flagging overdue invoices for business entities is different from assessing individual creditworthiness, but the line needs careful monitoring.

3. **Profiling of natural persons:** Article 6(3) states that even if a system falls under Annex III, it may claim a non-high-risk exception if it does not pose significant risk to fundamental rights. This exception never applies when the AI system performs profiling of natural persons. If Qorpera profiles individual contacts (e.g., churn risk scoring of individual customers), this could trigger the profiling provision.

#### The Article 6(3) Exception

Allows systems listed in Annex III to avoid high-risk classification if they: perform narrow procedural tasks, improve results of previously completed human activities, detect decision-making patterns without influencing outcomes, or perform preparatory tasks for assessments. If any Qorpera use case touches Annex III categories, this exception must be formally documented.

#### Use Case Classification Table

| Use Case | Likely Classification | Rationale |
|---|---|---|
| Detect overdue invoices | Minimal risk | Internal business process automation |
| Flag customer churn risk | Limited/Minimal risk | Business analytics, but watch profiling of natural persons |
| Propose pricing changes | Minimal risk | Internal business decision support |
| Draft/send customer emails | Limited risk | AI-generated content + human interaction transparency |
| Update CRM records | Minimal risk | Narrow procedural task |
| Auto-execute actions (Act mode) | Limited risk (minimum) | Autonomy increases regulatory scrutiny |

#### Provider vs. Deployer Role

As the company that develops and places the AI system on the market under its own name, Qorpera is the **"provider"** under Article 3. Qorpera's B2B customers (the SMBs) are **"deployers."** This means Qorpera bears the heavier set of obligations.

---

### 2. Transparency Obligations

#### Article 50: Transparency for AI-Interacting Systems

**When the AI sends emails or messages on behalf of users (Act mode):**
- Recipients who are natural persons must be informed they are interacting with an AI system "at the latest at the time of the first interaction or exposure" — unless it is already obvious from the circumstances.
- AI-generated text published to inform the public must be disclosed as AI-generated, though this has an exception when a natural person holds editorial responsibility (i.e., human review before sending).
- Propose mode (human approves before sending) may satisfy this editorial control exception, but Act mode (auto-execute) likely requires explicit disclosure to recipients.

**Practical implications:**
- Emails sent autonomously by AI agents should include a clear disclosure (e.g., footer: "This message was drafted/sent with AI assistance")
- Slack messages sent by AI should be identifiable as AI-generated
- The trust gradient matters: Observe and Propose modes have lighter obligations because a human reviews/approves; Act mode triggers the full disclosure requirement

#### Article 13: Transparency to Deployers (Qorpera's Customers)

As the provider, Qorpera must supply deployers with clear instructions including:
- Identity and contact details of the provider
- Characteristics, capabilities, and limitations of the AI system
- Intended purpose and foreseeable misuse scenarios
- Performance metrics (accuracy, robustness, cybersecurity levels)
- How to interpret the system's output
- Human oversight measures available
- Expected lifetime and maintenance/update procedures
- Computational and hardware resource requirements

#### Article 4: AI Literacy (Already in Effect)

Since **February 2, 2025**, Qorpera must ensure sufficient AI literacy among its own staff and must help deployers (customers) understand the AI systems they are using:
- Training staff who operate, maintain, or develop the AI system
- Providing awareness materials to customer organizations
- Considering the technical knowledge and context of use
- No formal certification required, but internal records of training should be maintained

---

### 3. Human Oversight Requirements (Article 14) and the Trust Gradient

Article 14 requires high-risk AI systems to be designed for effective human oversight. Even if Qorpera is not classified as high-risk, its trust gradient model maps to Article 14's framework, and implementing these measures proactively is both a competitive advantage and regulatory insurance.

#### Trust Gradient Mapping to Article 14

| Article 14 Requirement | Qorpera's Trust Gradient | Gap Analysis |
|---|---|---|
| **(a)** Properly understand capacities and limitations, monitor operation, detect anomalies | **Observe mode**: AI detects situations, presents evidence and reasoning | Ensure reasoning transparency is sufficient for non-technical users |
| **(b)** Remain aware of automation bias risk | **Propose mode**: Human reviews AI proposals before execution | Add explicit automation bias warnings in the UI |
| **(c)** Correctly interpret AI output | Situation context assembly provides evidence | Ensure confidence scores and uncertainty indicators are visible |
| **(d)** Decide not to use or disregard AI output | Policy governance allows blocking actions | Ensure any user can override/reject any AI proposal at any time |
| **(e)** Interrupt or stop the system ("kill switch") | Policy rules can restrict autonomy | Need a clear, accessible emergency stop mechanism per AI agent |

#### Specific Technical Measures Needed

1. **Override capability at every level:** Users must be able to reject any AI proposal, revoke autonomous permissions instantly, and pause all AI activity for a department or operator.

2. **Automation bias mitigation:** When presenting AI proposals, display confidence levels, alternative interpretations, and explicit prompts like "Do you want to review the evidence before approving?"

3. **Anomaly detection and alerting:** The system should flag when AI behavior deviates from established patterns (e.g., sudden spike in autonomous actions, unusual reasoning outputs).

4. **Graduated autonomy as a compliance feature:** The Observe → Propose → Act model is strong Article 14 alignment. The graduation thresholds (approval rates, time periods) should be documented as part of the human oversight design. Key addition: **ensure demotion is equally easy** — any single override should be able to demote an AI agent back from Act to Propose.

5. **Competence requirements for oversight personnel:** Article 14(4) requires that human overseers have "the necessary competence, training and authority." Deployers should assign qualified oversight personnel (admins/managers, not junior staff who might rubber-stamp).

#### GDPR Article 22 Intersection

GDPR Article 22 gives data subjects the right not to be subject to decisions based solely on automated processing that produces legal effects or similarly significant effects. When Qorpera's AI agents auto-execute actions affecting natural persons (sending emails, updating customer records), this right may be triggered. The trust gradient's human-in-the-loop design (Propose mode) is a natural safeguard, but Act mode requires careful attention to whether decisions "significantly affect" individuals.

---

### 4. Record-Keeping and Audit Trail Obligations

#### Article 12: Automatic Logging

High-risk AI systems must have automatic logging capabilities. Even for non-high-risk systems, implementing these is strongly recommended:

Required logging must cover:
- Events relevant to identifying risk situations
- Events facilitating post-market monitoring
- Events enabling monitoring of AI system operation

**Minimum retention: 6 months** (Article 19). Technical documentation must be retained for **10 years** after the system is placed on the market (Article 18).

#### Recommended Logging for Qorpera

| Data Point | Purpose |
|---|---|
| Every situation detection event | Traceability of AI decisions |
| Full reasoning chain (inputs, context, output) | Explainability and audit |
| Policy evaluation results (pre and post reasoning) | Governance compliance |
| Every autonomous action executed | Accountability trail |
| Every human approval/rejection of proposals | Human oversight evidence |
| Autonomy level changes (graduation/demotion) | Trust gradient audit trail |
| Model versions and configuration used | Reproducibility |
| Input data sources and versions | Data provenance |
| User identity for all oversight actions | Accountability |
| Timestamp and duration of every AI operation | Performance monitoring |

#### Article 18: Documentation Keeping

Providers must retain for **10 years** after the AI system is placed on the market:
- Technical documentation (Article 11)
- Documentation regarding the quality management system (Article 17)
- Documentation regarding changes approved by notified bodies (if applicable)
- Decisions and documents issued by notified bodies
- The EU declaration of conformity (Article 47)

#### Article 72: Post-Market Monitoring

Providers must establish a post-market monitoring system that:
- Actively and systematically collects, documents, and analyzes data on performance
- Is proportionate to the nature and risks of the AI system
- Forms part of the technical documentation
- Feeds back into the risk management system

#### Article 73: Serious Incident Reporting

If an AI system causes a serious incident (death, serious health harm, fundamental rights infringement, serious property/environment damage):
- Report to market surveillance authority within **15 days** (general)
- Within **10 days** if death occurs
- Within **2 days** for very serious/widespread incidents
- Initial incomplete reports are acceptable if followed up

---

### 5. Compliance Timeline

| Date | Milestone | Relevance to Qorpera |
|---|---|---|
| **August 1, 2024** | EU AI Act enters into force | Clock starts |
| **February 2, 2025** | Prohibited AI practices banned; AI literacy (Art. 4) and general provisions apply | **Already in effect.** Qorpera must have AI literacy measures and must not use any prohibited practices (social scoring, subliminal manipulation, etc.) |
| **August 2, 2025** | Rules for general-purpose AI models; governance structures; national authority designations | Denmark's supplementary law took effect. GPAI model providers must comply. Qorpera uses third-party models (OpenAI/Anthropic) — those providers must comply, but Qorpera should verify their compliance. |
| **August 2, 2026** | **Main compliance deadline.** Full enforcement of: high-risk obligations (Annex III), transparency obligations (Art. 50), deployer obligations (Art. 26), conformity assessment, post-market monitoring, incident reporting, penalties | **Critical deadline.** All transparency obligations, record-keeping, human oversight requirements, and any high-risk provisions fully enforceable. Fines up to 35M EUR / 7% global turnover. |
| **August 2, 2027** | Legacy systems must comply; GPAI models already on market must be brought into compliance | Covers any AI system or model placed on market before earlier deadlines |

#### Penalty Exposure

| Violation Type | Maximum Fine |
|---|---|
| Prohibited AI practices | 35M EUR or 7% global turnover |
| High-risk system obligations | 15M EUR or 3% global turnover |
| Incorrect information to authorities | 7.5M EUR or 1% global turnover |

For SMEs and startups, the lower of the two amounts (fixed amount vs. percentage) applies.

---

### 6. Danish / Nordic Specific Guidance

#### Denmark's Supplementary Provisions Act (Law No. 467, May 14, 2025)

Denmark was the **first EU member state** to complete national AI Act implementation, with the law taking effect on **August 2, 2025**.

**Designated authorities:**
- **Digitaliseringsstyrelsen** (Agency for Digital Government): Authorizing authority and central contact point
- **Datatilsynet** (Data Protection Agency): Market surveillance authority for data protection aspects
- **Domstolsstyrelsen** (Courts Administration): Market surveillance for judicial AI use

**Enforcement powers:** The Danish authorities can inspect, demand information, issue remedial orders, impose temporary bans on AI systems, and levy administrative fines.

#### Datatilsynet's AI Initiatives

1. **Regulatory Sandbox for AI:** Launched March 2024, co-run by Datatilsynet and Digitaliseringsstyrelsen. Provides organizations with bespoke advisory engagements to navigate GDPR and EU AI Act requirements before full-scale deployment. Initially focused on data protection/GDPR, with AI Act guidance being added. Qorpera should consider applying — it gives direct access to regulatory guidance before enforcement.

2. **Guidance for Public Authorities on AI:** Datatilsynet published "Offentlige myndigheders brug af kunstig intelligens: Inden I går i gang" (October 2023) with practical, stepwise recommendations. While aimed at public authorities, it provides useful frameworks for any Danish organization.

3. **2026 Supervisory Focus:** Datatilsynet has announced it will focus supervisory efforts on AI use in healthcare and citizen monitoring/control contexts. Business-to-business operational AI is not a stated priority, but could receive attention depending on complaints.

4. **AI Kompetence Pagten:** A national initiative for AI competence building.

5. **National Uptake Fund:** Funds available for AI pilots and upskilling.

#### Nordic Context

Denmark, along with other Nordic countries, tends toward pragmatic, technology-friendly regulation. The Danish approach emphasizes regulatory sandboxes and advisory engagement over punitive enforcement as a first step. However, once the EU AI Act's enforcement provisions are fully applicable (August 2026), the Danish authorities have full powers.

---

### 7. Actionable Compliance Requirements

#### IMMEDIATE (Already Required — as of February 2025)

1. **AI Literacy Program (Article 4)**
   - Train all Qorpera staff on AI capabilities, limitations, and risks
   - Create customer-facing educational materials about how the AI system works
   - Maintain internal records of training activities
   - No certification needed, but documentation is prudent

2. **Verify No Prohibited Practices (Article 5)**
   - Confirm Qorpera does not engage in: subliminal manipulation, exploitation of vulnerabilities, social scoring, or untargeted scraping for facial recognition databases
   - Document this assessment

#### BY AUGUST 2, 2026 (Main Compliance Deadline)

**A. Risk Classification Documentation**

3. **Formal risk classification assessment:** Document why each Qorpera use case is classified as minimal/limited risk (not high-risk). If any use case touches Annex III categories (employment management, creditworthiness), formally document the Article 6(3) exception analysis. This documentation must exist before the system is placed on the market.

4. **Use-case guardrails:** Implement technical controls to prevent customers from using Qorpera for high-risk purposes not covered by the classification (e.g., blocking use for employee performance evaluation or individual credit scoring unless additional compliance measures are implemented).

**B. Transparency Implementation**

5. **AI interaction disclosure:** When Qorpera's AI agents communicate with external parties (sending emails, Slack messages in Act mode), include clear disclosure that the communication was AI-generated or AI-assisted. In Propose mode where a human approves, the editorial control exception may apply, but disclosure is still best practice.

6. **Deployer documentation package:** Create comprehensive instructions for use covering: system capabilities and limitations, intended purpose, performance metrics, how to interpret outputs, human oversight measures, maintenance procedures, and foreseeable misuse scenarios.

7. **In-product transparency:** Ensure the UI clearly indicates when content is AI-generated, when situations were detected by AI, and when actions were proposed vs. auto-executed.

**C. Human Oversight Technical Measures**

8. **Emergency stop / kill switch:** Implement a one-click mechanism to immediately halt all autonomous AI activity for any department, AI agent, or entire operator. This must be accessible and fast.

9. **Override at every decision point:** Ensure any user with appropriate permissions can reject, modify, or override any AI proposal at any time, including during Act mode execution.

10. **Automation bias mitigation:** Add confidence indicators, alternative interpretations, and explicit "Review evidence before approving?" prompts in the Propose mode UI.

11. **Autonomy demotion:** Ensure that revoking an AI agent's autonomy (from Act back to Propose or Observe) is as easy as granting it. A single override should trigger consideration of demotion.

12. **Oversight role requirements:** In deployer documentation, specify that human overseers should have "necessary competence, training and authority" per Article 14. Recommend that customers assign managers (not junior staff) as AI oversight personnel.

**D. Record-Keeping and Audit**

13. **Comprehensive audit logging:** Ensure every AI decision chain is logged: situation detection trigger, context assembly inputs, reasoning output, policy evaluation, proposed action, human approval/rejection (with user identity), and final execution result. **Minimum retention: 6 months.**

14. **Technical documentation:** Prepare and maintain technical documentation covering: system description, development process, risk management measures, data governance, testing results, accuracy metrics, human oversight design, and cybersecurity measures. **Retain for 10 years.**

15. **Quality management system:** Document and maintain a QMS covering: regulatory compliance strategy, design and development procedures, testing and validation processes, data management policies, risk management processes, post-market monitoring plan, incident handling procedures, and communication with authorities.

**E. Post-Market Monitoring**

16. **Active monitoring system:** Implement systematic collection and analysis of data on AI system performance, accuracy, and any anomalies after deployment. Feed findings back into risk management.

17. **Incident reporting procedures:** Establish a process for identifying and reporting serious incidents to market surveillance authorities within the required timelines (2–15 days depending on severity).

**F. Conformity Assessment**

18. **Self-assessment (if high-risk):** For any use cases that fall into Annex III high-risk categories, conduct internal conformity assessment per Annex VI. This is a self-assessment (no notified body required for Annex III points 2–8) but must verify QMS compliance, technical documentation completeness, and risk management effectiveness.

19. **EU database registration:** If any Qorpera system qualifies as high-risk, register it in the EU database per Article 49 before placing it on the market.

**G. GDPR Alignment**

20. **Data Protection Impact Assessment (DPIA):** Where Qorpera processes personal data in ways likely to result in high risk to individuals, conduct DPIAs per GDPR Article 35. The AI Act's risk management and the GDPR DPIA can be coordinated.

21. **Automated decision-making safeguards (GDPR Article 22):** For Act mode decisions affecting natural persons, ensure: the right to human intervention, the right to contest the decision, and the right to obtain an explanation of the decision logic.

**H. Danish-Specific Actions**

22. **Consider the Datatilsynet Regulatory Sandbox:** Apply for an advisory engagement to get direct regulatory guidance on Qorpera's classification and compliance approach.

23. **Monitor Digitaliseringsstyrelsen guidance:** As the designated central contact point for AI Act matters in Denmark, watch for implementing guidance and codes of practice.

24. **Employee notification:** If Qorpera is used in workplace contexts by its customers, deployers must inform employee representatives. Include guidance on this obligation in deployer documentation.

#### SME Considerations

Qorpera's SMB customers (deployers) and potentially Qorpera itself may benefit from SME provisions:
- Simplified technical documentation format is available for SME providers
- Proportionate conformity assessment fees for SMEs
- Priority access to regulatory sandboxes for SMEs and EU-based startups
- No formal exemptions from substantive obligations exist, but the proportionality principle applies throughout

## Sources

- [AI Risk Classification Guide](https://gdprlocal.com/ai-risk-classification/)
- [Article 6: Classification Rules](https://artificialintelligenceact.eu/article/6/)
- [Annex III: High-Risk AI Systems](https://artificialintelligenceact.eu/annex/3/)
- [B2B Tech at Risk? Europe's 2025 AI Laws](https://techresearchonline.com/blog/eu-uk-ai-regulations-saas-compliance/)
- [High-Risk AI Systems Full Guide](https://www.dpo-consulting.com/blog/high-risk-ai-systems)
- [Agentic AI: What businesses need to know (UK/EU)](https://www.kennedyslaw.com/en/thought-leadership/article/2025/agentic-ai-what-businesses-need-to-know-to-comply-in-the-uk-and-eu/)
- [How AI Agents Are Governed Under the EU AI Act](https://thefuturesociety.org/aiagentsintheeu/)
- [Provider or Deployer? Decoding Key Roles](https://haerting.de/en/insights/provider-or-deployer-decoding-the-key-roles-in-the-ai-act/)
- [Article 50: Transparency Obligations](https://artificialintelligenceact.eu/article/50/)
- [Article 13: Transparency and Provision of Information](https://artificialintelligenceact.eu/article/13/)
- [Limited-Risk AI: Deep Dive Into Article 50](https://www.wilmerhale.com/en/insights/blogs/wilmerhale-privacy-and-cybersecurity-law/20240528-limited-risk-ai-a-deep-dive-into-article-50-of-the-european-unions-ai-act)
- [AI Literacy: Article 4](https://artificialintelligenceact.eu/article/4/)
- [EU Commission AI Literacy Guidance](https://digital-strategy.ec.europa.eu/en/faqs/ai-literacy-questions-answers)
- [Article 14: Human Oversight](https://artificialintelligenceact.eu/article/14/)
- [EU AI Act Shines Light on Human Oversight Needs (IAPP)](https://iapp.org/news/a/eu-ai-act-shines-light-on-human-oversight-needs)
- [Human Oversight under Article 14 (SSRN)](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5147196)
- [Humans in Automated Decision-Making under GDPR and AI Act](https://www.cidob.org/en/publications/humans-automated-decision-making-under-gdpr-and-ai-act)
- [GDPR Article 22](https://gdpr-info.eu/art-22-gdpr/)
- [Article 12: Record-Keeping](https://artificialintelligenceact.eu/article/12/)
- [Article 19: Automatically Generated Logs](https://artificialintelligenceact.eu/article/19/)
- [Article 18: Documentation Keeping](https://artificialintelligenceact.eu/article/18/)
- [Article 72: Post-Market Monitoring](https://artificialintelligenceact.eu/article/72/)
- [Article 73: Reporting of Serious Incidents](https://artificialintelligenceact.eu/article/73/)
- [EU AI System Logging (VDE)](https://www.vde.com/topics-en/artificial-intelligence/blog/eu-ai-act--ai-system-logging)
- [Post-Market Monitoring Requirement (Naaia)](https://naaia.ai/post-market-monitoring-an-important-ai-act-requirement/)
- [EU AI Act Implementation Timeline](https://artificialintelligenceact.eu/implementation-timeline/)
- [EU AI Act Timeline (DataGuard)](https://www.dataguard.com/eu-ai-act/timeline)
- [EU AI Act Compliance Timeline 2025-2027](https://trilateralresearch.com/responsible-ai/eu-ai-act-implementation-timeline-mapping-your-models-to-the-new-risk-tiers)
- [EU AI Act 2026 Updates](https://www.legalnodes.com/article/eu-ai-act-2026-updates-compliance-requirements-and-business-risks)
- [Denmark AI Regulation Overview](https://regulations.ai/regulations/denmark-summary)
- [Denmark Published Its National AI Act Law](https://ai-regulation.com/eu-ai-act-implementation-denmark-published-its-national-law/)
- [Artificial Intelligence 2025 - Denmark (Chambers)](https://practiceguides.chambers.com/practice-guides/artificial-intelligence-2025/denmark/trends-and-developments)
- [AI Regulatory Horizon Tracker - Denmark (Bird & Bird)](https://www.twobirds.com/en/capabilities/artificial-intelligence/ai-legal-services/ai-regulatory-horizon-tracker/denmark)
- [Denmark: Datatilsynet Establishes Regulatory Sandbox](https://www.dataguidance.com/news/denmark-datatilsynet-establishes-regulatory-sandbox-ai)
- [New Rules on Responsible Use of AI (iuno.law)](https://www.iuno.law/en/iunoplus/technology/legal-news/new-rules-on-responsible-use-of-ai-have-entered-into-force/)
- [Denmark Sets Precedent with Early AI Act Implementation](https://ppc.land/denmark-sets-precedent-with-early-ai-act-implementation-legislation/)
- [Small Businesses' Guide to the AI Act](https://artificialintelligenceact.eu/small-businesses-guide-to-the-ai-act/)
- [Article 62: Measures for SMEs](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-62)
- [EU AI Act Penalties](https://www.holisticai.com/blog/penalties-of-the-eu-ai-act)
- [EU AI Act Compliance Guide (Grid Dynamics)](https://www.griddynamics.com/blog/eu-ai-act-compliance)
- [Provider vs Deployer Roles (A&O Shearman)](https://www.aoshearman.com/en/insights/ao-shearman-on-tech/zooming-in-on-ai-4-what-is-the-interplay-between-deployers-and-providers-in-the-eu-ai-act/)
- [Conformity Assessment Step-by-Step (FPF)](https://fpf.org/wp-content/uploads/2025/04/OT-comformity-assessment-under-the-eu-ai-act-WP-1.pdf)
