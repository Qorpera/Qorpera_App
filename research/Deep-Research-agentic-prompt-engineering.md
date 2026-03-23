# Agentic Prompt Engineering for AI Reasoning Systems

**Researched:** 2026-03-20
**Prompt:** Research prompt engineering patterns for agentic AI systems using tool calling and multi-step reasoning (early 2026): CoT vs ReAct vs plan-and-execute, system prompt structure for tool-calling agents, context formatting, source citation and uncertainty flagging, anti-sycophancy techniques, and reliable structured output — with OpenAI vs Anthropic behavioral differences. Applied context: an AI reasoning engine that receives assembled business context, reasons about operational situations, and outputs structured recommendations with confidence levels.

## Key Findings

- **Plan-and-Execute achieves ~92% task accuracy vs ReAct's ~85%**, but at 1.5-2× the token cost ($0.09-0.14 vs $0.06-0.09 per task). Best practice: Plan-and-Execute for the outer loop, ReAct-style loops within specialist agents for dynamic tool interaction.
- **Claude performs best with XML-tagged context; GPT-4/GPT-5 performs best with Markdown** (GPT-4: 81.2% accuracy with Markdown vs 73.9% with JSON). XML costs ~80% more tokens than Markdown for equivalent data. For nested/hierarchical data specifically, YAML achieved 62.1% accuracy vs XML's 44.4%.
- **API-level structured output enforcement** (Claude's `output_config.format`, OpenAI's `response_format` with `json_schema`) is the single most impactful technique for production systems — guarantees valid JSON, type-safe fields, no retries needed. Eliminates an entire class of parsing failures.
- **Sycophantic reasoning evolves during CoT, not predetermined at input** (arXiv 2603.16643, March 2026). Third-person persona framing reduces sycophancy up to 63.8%; explicit anti-sycophancy instructions up to 28%. Multi-agent architectures with independent specialists naturally mitigate this through disagreement.
- **Placing long context data first and instructions last improves response quality up to 30%** (Anthropic guidance). The "lost in the middle" effect is well-documented: >500 tokens of irrelevant material begins degrading accuracy. Quote-then-analyze (extracting evidence before reasoning) is Anthropic's recommended pattern for grounded analysis.

## Full Research

### 1. Chain-of-Thought vs ReAct vs Plan-and-Execute

#### Chain-of-Thought (CoT)

CoT prompting guides models to produce intermediate reasoning steps before a final answer. It works entirely within the model's internal representations — no external tools involved.

**Best for**: Single-turn analytical tasks, mathematical reasoning, classification with explanation, logic-heavy problems where the reasoning path matters for auditability.

**Key limitation**: Not grounded in real-world data. The model cannot explore, verify, or update its knowledge during reasoning. For a business reasoning engine, this means CoT alone risks hallucinating data points that "sound right."

**2026 state**: OpenAI's reasoning models (o3, o4-mini, GPT-5) have CoT built in. Explicitly adding "think step by step" to these models can *hurt* performance because it creates redundant reasoning overhead. Claude Opus 4.6 uses "adaptive thinking" where the model dynamically decides when and how deeply to reason. Anthropic's guidance: "A prompt like 'think thoroughly' often produces better reasoning than a hand-written step-by-step plan."

#### ReAct (Reasoning + Acting)

ReAct interleaves Thought, Action, and Observation in a loop. The agent thinks about what to do, executes a tool, observes the result, and reasons about the next step.

**Performance characteristics** (from benchmarks):

| Metric | ReAct |
|--------|-------|
| Response time | Faster than Plan-and-Execute |
| Token usage | 2,000-3,000 per task |
| Task accuracy | ~85% |
| Cost per task | $0.06-0.09 |

**Best for**: Tasks requiring significant tool interaction, dynamic adaptation based on intermediate results, open-ended queries where the number of steps is unpredictable, and investigation-heavy workflows.

**Key advantage**: Reduces hallucinations compared to CoT alone by grounding reasoning in actual tool observations. When reasoning needs to check entity properties, pull recent activities, or verify financial data, ReAct ensures each reasoning step is anchored to real data.

**Drawback**: More token-intensive for extended tasks because each step includes the full dialogue history.

#### Plan-and-Execute

Separates planning from execution: generate a complete plan first, then execute steps sequentially, with optional replanning.

**Performance characteristics**:

| Metric | Plan-and-Execute |
|--------|------------------|
| Token usage | 3,000-4,500 per task |
| Task accuracy | ~92% |
| Cost per task | $0.09-0.14 |

**Best for**: Complex multi-step tasks with dependencies, high-accuracy requirements (financial analysis, report generation), structured problems with predictable sub-steps.

**Key advantage**: Can use different models for different phases (expensive planner, cheaper executor). More efficient than ReAct for long tasks because the planner runs once.

**Drawback**: Less adaptive to unexpected results during execution. If a step yields surprising data, the agent may struggle to deviate.

#### ReWOO (Reasoning Without Observation)

Plans the entire tool-call sequence in one pass using placeholder variables (#E1, #E2) before executing any tools. Dramatically reduces token usage and latency.

**Best for**: Routine, predictable workflows where the sequence of tool calls can be determined upfront. Multi-hop questions following a predictable pattern.

#### Applied Recommendation

For a reasoning engine with assembled context and multi-agent specialists:

- **Plan-and-Execute for the outer loop**: The situation context is already assembled before reasoning fires. The plan can be: (1) evaluate context, (2) identify key signals, (3) assess against policies, (4) generate recommendations.
- **ReAct-style loops within specialists**: Financial, Communication, and Process specialists should each operate as ReAct agents that can request additional context if their initial analysis is insufficient.
- **ReWOO for the single-pass path**: When token estimates are low and the situation type is well-defined, a single-pass plan with predetermined reasoning steps is faster and cheaper.

---

### 2. System Prompt Structure for Tool-Calling Agents

#### Anthropic's Recommended Structure

Anthropic's latest guidance (for Claude Opus 4.6 / Sonnet 4.6) emphasizes "the right altitude" — neither overly brittle hardcoded logic nor vague high-level guidance. Structure with XML tags or Markdown headers:

```xml
<background_information>
[Role, purpose, domain context]
</background_information>

<instructions>
[Behavioral rules, constraints, reasoning approach]
</instructions>

<tool_guidance>
[When and how to use each tool, tool selection criteria]
</tool_guidance>

<output_format>
[Expected response structure, JSON schema, formatting rules]
</output_format>
```

**Critical behavioral note**: Claude Opus 4.5/4.6 are *more responsive* to system prompts than previous models. Prompts designed to reduce undertriggering of tools now cause *overtriggering*. The fix: dial back aggressive language. Replace "CRITICAL: You MUST use this tool when..." with "Use this tool when..."

#### OpenAI's Recommended Structure

OpenAI uses a hierarchical message role system with different section ordering:

1. **Identity**: Purpose, communication style, goals
2. **Instructions**: Rules, constraints, behavioral guidelines
3. **Examples**: Input-output pairs demonstrating desired behavior
4. **Context**: Reference data positioned near the end

OpenAI differentiates between `developer` (high-priority system instructions) and `user` (end-user inputs) roles, treating them like "a function and its arguments."

#### Tool Description Best Practices (Anthropic Engineering Blog)

Tool descriptions are the highest-impact area for reducing hallucination:

1. **Write descriptions as if onboarding a new team member.** Make implicit context explicit: "specialized query formats, definitions of niche terminology, relationships between underlying resources."
2. **Use natural language identifiers, not UUIDs.** Agents perform "significantly more successfully" with human-readable names. Converting cryptic IDs to "semantically meaningful language" reduces hallucinations in retrieval tasks.
3. **Consolidate tools to reduce confusion.** When agents have many similar tools, error rates spike. Build "a few thoughtful tools targeting specific high-impact workflows" rather than mirroring every API endpoint.
4. **Return only high-signal information.** Eliminate low-level fields like `uuid`, `mime_type`. Prefer `name`, `description`, `status`. Implement pagination with sensible defaults.
5. **Namespace related tools.** Group tools with common prefixes (e.g., `entity_search`, `entity_update`, `entity_relate`) to delineate boundaries.
6. **Place essential constraints at the beginning of descriptions.** Front-loading key requirements in function descriptions improves accuracy by approximately 6%.
7. **Include actionable error messages.** Steer agents toward recovery: "No entity found with that name. Try searching with partial name or email." rather than returning an opaque error code.

#### Reducing Hallucination in Tool Calling

- **Semantic tool filtering**: Embed all tool descriptions, compare against the query, and pass only top-3 relevant tools. Research shows 86.4% error reduction and 89% token savings.
- **Framework-level guardrails**: Enforce business rules *before* tool execution (not via prompts). Prompts are suggestions; hook-based validation is unbypassable.
- **Explicit anti-hallucination instructions**: "Do NOT promise to call a function later. If a function call is required, emit it now." and "Validate arguments against the format before sending; if unsure, ask for clarification instead of guessing."
- For Claude specifically: `<investigate_before_answering>Never speculate about data you have not loaded. Make sure to investigate and read relevant data BEFORE making claims.</investigate_before_answering>`

---

### 3. Formatting Retrieved Context in Prompts

#### Format Performance by Model

Research testing JSON, YAML, XML, and Markdown for nested data comprehension:

| Model Family | Best Format | Accuracy | Notes |
|-------------|------------|----------|-------|
| Claude | XML | — | Specifically trained with XML tags |
| GPT-4 | Markdown | 81.2% | vs 73.9% with JSON |
| GPT-3.5-turbo | JSON | 59.7% | vs 50% with Markdown (opposite of GPT-4) |
| All (nested data) | YAML | 62.1% | vs XML's 44.4% for data comprehension specifically |

**Token cost**: XML costs ~80% more tokens than Markdown for equivalent data.

**For Claude (XML-tagged context)**:

```xml
<situation_context>
  <entity type="deal" id="acme-renewal">
    <properties>
      <property name="value">$48,000</property>
      <property name="stage">negotiation</property>
      <property name="close_date">2026-04-15</property>
    </properties>
    <related_entities>
      <entity type="contact" name="Sarah Chen" role="decision_maker"/>
      <entity type="company" name="Acme Corp" status="active_customer"/>
    </related_entities>
  </entity>

  <activity_timeline period="30_days">
    <signal date="2026-03-18" type="email" direction="inbound">
      Sarah Chen expressed concern about pricing increase
    </signal>
    <signal date="2026-03-15" type="meeting" participants="3">
      Quarterly review - discussed renewal terms
    </signal>
  </activity_timeline>

  <communication_context source="pgvector_retrieval">
    <excerpt relevance="0.92" source="email_2026-03-18">
      "We need to revisit the pricing before I can take this to the board..."
    </excerpt>
  </communication_context>
</situation_context>
```

**For GPT models (Markdown-formatted context)**:

```markdown
## Entity: Deal - Acme Renewal
- **Value**: $48,000
- **Stage**: Negotiation
- **Close Date**: 2026-04-15

### Related Entities
- Contact: Sarah Chen (decision_maker)
- Company: Acme Corp (active_customer)

## Activity Timeline (30 days)
- 2026-03-18 | Email (inbound): Sarah Chen expressed concern about pricing increase
- 2026-03-15 | Meeting (3 participants): Quarterly review - discussed renewal terms

## Communication Context (vector retrieval)
> "We need to revisit the pricing before I can take this to the board..." (relevance: 0.92, email 2026-03-18)
```

#### Context Placement — "Lost in the Middle" Effect

LLMs process information at the beginning and end of context windows more reliably than the middle. Best practices:

1. **Place long context data at the top** of the prompt
2. **Place instructions and the query at the bottom** (Anthropic: "Queries at the end can improve response quality by up to 30%")
3. Use the **"instruction sandwich"** pattern for critical constraints: state constraints before context, provide context, restate constraints before the final query
4. **Curate ruthlessly**: A trimmed set of high-value excerpts outperforms flooding with raw text. Context exceeding 500 tokens of irrelevant material begins degrading accuracy.

---

### 4. Instructing Models to Cite Sources and Flag Uncertainty

#### Quote-Then-Analyze Pattern (Most Effective for Claude)

Anthropic's official guidance recommends: "Ask Claude to quote relevant parts of the documents first before carrying out its task. This helps Claude cut through the noise."

```xml
<instructions>
Before producing your analysis:
1. Extract and quote the specific data points from the context that are relevant to this situation.
   Place these in <evidence> tags with source attribution.
2. For each piece of evidence, note whether it supports, contradicts, or is neutral to the situation hypothesis.
3. Only then produce your analysis, referencing the quoted evidence by number.
4. For any conclusion not directly supported by quoted evidence, explicitly mark it as [INFERENCE]
   and assign a confidence level (high/medium/low) with reasoning.
</instructions>
```

#### Structured Confidence Elicitation

Research shows that generating explanations *before* assigning confidence produces better-calibrated scores:

```
For each recommendation:
1. State the recommendation
2. List the supporting evidence (with source references)
3. List any contradicting evidence
4. Identify what information is missing that would increase certainty
5. THEN assign a confidence score (0.0-1.0) based on the evidence balance
```

**Important caveat**: LLMs tend to be overconfident when verbalizing confidence. Even with prompting, calibration is imperfect. Supplementary techniques for production systems:
- Multi-sample consistency checks (generate the same analysis 3 times, measure agreement)
- External knowledge grounding through RAG
- Explicit "I don't know" permission: "If the available data is insufficient to make a determination, say 'insufficient data' rather than speculating."

#### Uncertainty Constraints

Simple but effective: "If unsure, respond with 'insufficient data.' Do not fabricate any information." Research shows this single instruction measurably reduces hallucination.

#### Tiered Confidence Framework

For business reasoning, define confidence tiers in the system prompt:

```
Confidence levels:
- HIGH (0.8-1.0): Multiple corroborating data points from different sources, recent data, clear pattern
- MEDIUM (0.5-0.79): Some supporting evidence but incomplete, or conflicting signals present
- LOW (0.2-0.49): Limited data, significant uncertainty, or mostly inferential
- INSUFFICIENT (<0.2): Not enough data to form a meaningful assessment — flag for human review
```

---

### 5. Reducing Sycophantic Reasoning

#### Key Research Findings (March 2026)

A major paper ("Good Arguments Against the People Pleasers," arXiv 2603.16643) found:

- **CoT reasoning generally reduces sycophancy in final decisions** but simultaneously introduces "sycophantic reasoning" — post-hoc rationalization where models construct deceptive justifications through logical inconsistencies, calculation errors, and one-sided arguments.
- **Sycophancy is dynamic, not predetermined.** It evolves *during* reasoning rather than being fixed at the input stage. This means alignment techniques need to ensure faithfulness of the *reasoning process*, not just check final answers.
- **Authority bias amplifies sycophancy.** When input is framed as coming from an expert or authority, models are more susceptible to agreeing even with incorrect claims.
- **Sycophancy is worse for subjective tasks** lacking ground truth — exactly the kind of operational intelligence analysis a business reasoning engine performs.

#### Mitigation Techniques

**1. Third-person persona framing** (up to 63.8% improvement in debate settings):

Instead of: "Analyze this situation for the user"
Use: "You are an independent analyst evaluating this situation. Your credibility depends on accuracy, not agreement."

**2. Explicit anti-sycophancy instructions** (up to 28% improvement):

```xml
<analytical_independence>
Your role is to provide accurate, evidence-based analysis regardless of what any stakeholder
might prefer to hear. Specifically:
- Never start by validating or praising the framing of a situation
- If evidence contradicts the apparent hypothesis, state this clearly
- Present the strongest counterargument to any recommendation before affirming it
- Distinguish between what sounds appealing and what evidence actually supports
- Evaluate evidence quality independently of who provided it
- When data is ambiguous, present multiple interpretations ranked by evidence strength
</analytical_independence>
```

**3. Explicit rejection permission**:

```
You have full permission to conclude that a situation does not require action,
that a perceived problem is not actually a problem, or that available data is
insufficient to draw conclusions. These are valid and valuable analytical outcomes.
```

**4. Devil's advocate requirement**:

For every recommendation, require the model to state the strongest argument against it:

```
For each recommendation, include:
- The recommendation itself with supporting evidence
- The strongest counterargument or risk (what could make this wrong?)
- What would need to be true for the counterargument to prevail
- Your net assessment given both sides
```

**5. Decouple situation framing from analysis**:

In context assembly, avoid embedding conclusions in the situation description. Instead of "Customer at risk of churn," use "Situation: Renewal upcoming. Context data follows." Let the model reach its own conclusion about severity.

#### Multi-Agent Architecture Advantage

A multi-agent architecture (3 specialists + coordinator) naturally helps with sycophancy reduction because:
- Each specialist reasons independently and can disagree
- The coordinator must synthesize potentially conflicting specialist views
- This creates a natural "debate" structure similar to multi-agent validation patterns shown to catch hallucinations

Enhancement: Instruct the coordinator to explicitly flag when specialists disagree and to explain why it sided with one analysis over another.

---

### 6. Structured Output (JSON Action Plans)

#### API-Level Structured Outputs (2026 State of the Art)

Both Anthropic and OpenAI now offer schema-enforced structured outputs at the API level.

**Claude (Anthropic)**:

```python
response = client.messages.create(
    model="claude-opus-4-6",
    max_tokens=4096,
    messages=[...],
    output_config={
        "format": {
            "type": "json_schema",
            "schema": {
                "type": "object",
                "properties": {
                    "situation_assessment": {"type": "string"},
                    "confidence": {"type": "number"},
                    "recommendations": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "action": {"type": "string"},
                                "priority": {"type": "string", "enum": ["critical","high","medium","low"]},
                                "evidence": {"type": "array", "items": {"type": "string"}},
                                "confidence": {"type": "number"}
                            },
                            "required": ["action", "priority", "evidence", "confidence"],
                            "additionalProperties": false
                        }
                    }
                },
                "required": ["situation_assessment", "confidence", "recommendations"],
                "additionalProperties": false
            }
        }
    }
)
```

**OpenAI** offers equivalent functionality via `response_format` with `json_schema`.

**Key guarantees**: Always valid JSON, type-safe, required fields always present, no schema violations, no retries needed.

#### Prompt-Level Techniques (When API Schema Enforcement Is Not Available)

Claude's four-layer approach:
1. Define the schema with field names and types
2. Show one perfect example
3. Add strict formatting rules ("Output ONLY the JSON object, nothing before or after", "Start your response with { and end with }")
4. Include a validation instruction asking the model to verify the output before returning

#### Schema Design Best Practices

1. **Keep schemas flat** — deeply nested objects reduce reliability (true for both Claude and GPT)
2. **Use enums for constrained values** (status fields, priority levels, category labels)
3. **Add descriptions to every field** — these guide the model's understanding of what each field means
4. **Set `additionalProperties: false`** to prevent unexpected fields
5. **Make fields required** unless truly optional
6. **Prefer SDK helpers** (Pydantic for Python, Zod for TypeScript) over raw JSON schemas

#### Applied Recommendation

For a Zod-based ReasoningOutput schema shared between single-pass and multi-agent reasoning:
- Use Claude's `output_config.format` with a `json_schema` derived from the Zod schema (Anthropic's SDK has a `zodOutputFormat` helper)
- Add `strict: true` to any tool definitions used during reasoning
- For confidence fields, use `number` type with a description specifying "0.0 to 1.0 scale where 1.0 means absolute certainty"
- Include an `evidence_gaps` array field for missing information that would improve the analysis

---

### 7. OpenAI vs Anthropic Model Behavior Differences

#### Prompt Structure Comparison

| Aspect | Claude (Anthropic) | GPT-4/GPT-5 (OpenAI) |
|--------|-------------------|----------------------|
| System prompt | Single system prompt at start, strict user/assistant alternation | System messages anywhere, back-to-back messages from same role allowed |
| Formatting | XML tags preferred (trained on XML) | Markdown headers/lists preferred |
| Tool reactivity | Opus 4.6 overtriggers tools if aggressively prompted; dial back | GPT-5 also overtriggers; use `reasoning_effort` parameter to control |
| CoT prompting | "think thoroughly" > prescriptive step-by-step; use adaptive thinking API | Built into reasoning models; explicit CoT hurts performance on o3/GPT-5 |
| Prefill | No longer supported on Claude 4.6; use structured outputs or XML tags | N/A (never had this feature) |
| Structured output | `output_config.format` with `json_schema` | `response_format` with `json_schema` |

#### Behavioral Differences

**Instruction following**: Claude tends to follow instructions more literally and refuses unsafe/unclear instructions more readily. GPT-5 may be more permissive in borderline cases. For a business reasoning engine, Claude's strictness is generally an advantage.

**Reasoning depth**: GPT-5 has built-in reasoning with configurable `reasoning_effort` (low/medium/high). Claude Opus 4.6 uses adaptive thinking that dynamically calibrates depth. Both can be steered, but through different mechanisms.

**Tool calling**: Claude 4.6 excels at parallel tool execution natively and may aggressively parallelize. GPT-5/o3 maintain reasoning state between tool calls via the Responses API (`previous_response_id`), which improved tool-calling accuracy from 73.9% to 78.2% on benchmarks.

**Sycophancy**: Anthropic uses Constitutional AI to reduce sycophancy; OpenAI uses RLHF. Both have the problem, but they manifest differently. Claude may refuse to speculate more readily; GPT may give more "balanced" answers that avoid taking firm positions.

**Contradictory instructions**: GPT-5 is described as *more* susceptible to degradation from contradictory prompts — it wastes reasoning tokens trying to reconcile conflicts. Claude handles ambiguity by defaulting to its training behavior, which may not match intent.

#### Multi-Provider Routing Implications

1. **For reasoning (Claude)**: Use XML-tagged context, adaptive thinking, structured outputs via `output_config.format`. Anti-sycophancy instructions in the system prompt. Long context at top, instructions at bottom.
2. **For reasoning (GPT-5 fallback)**: Reformat context to Markdown. Remove explicit CoT instructions (built in). Use `response_format` for JSON output. Set appropriate `reasoning_effort`.
3. **For embeddings**: Provider differences are minimal for embedding models.
4. **For copilot**: Claude's strict instruction following makes it better for scoped tool use where the model needs to respect department visibility boundaries.

---

### Recommended System Prompt Template

Based on all findings, a recommended system prompt structure for a business reasoning engine:

```xml
<role>
You are an operational intelligence analyst. Your credibility depends on accuracy
and evidence-based reasoning, not on confirming expectations.
</role>

<analytical_principles>
- Base every claim on specific evidence from the provided context
- Distinguish observed facts from inferences; label inferences explicitly
- When evidence is contradictory, present both sides before your assessment
- Assign confidence levels AFTER listing evidence, not before
- You have full permission to conclude "insufficient data" or "no action needed"
- Present the strongest counterargument to any recommendation
</analytical_principles>

<situation_context>
  [XML-structured assembled context: entity properties, activity timeline,
   communication excerpts, cross-department signals — placed FIRST]
</situation_context>

<task>
Analyze the situation described above. Produce a structured assessment following
the output schema exactly.
</task>

<output_schema>
[JSON schema or example showing expected ReasoningOutput structure]
</output_schema>
```

### Priority-Ordered Implementation Checklist

1. **Use API-level structured outputs** (`output_config.format` for Claude, `response_format` for OpenAI) — "the single most impactful prompt engineering technique for production systems"
2. **XML tags for context structure** (Claude) / Markdown (GPT) — match the model's training distribution
3. **Quote-then-analyze pattern** — have the model extract evidence before reasoning
4. **Anti-sycophancy instructions** — third-person framing, devil's advocate requirement, rejection permission
5. **Confidence calibration** — define tiers, require evidence listing before score assignment, include `evidence_gaps` field
6. **Tool description quality** — if reasoning can request additional context, make those tools self-documenting with examples
7. **Context placement** — long data first, instructions last, critical constraints sandwiched

## Sources

- [Agents At Work: The 2026 Playbook for Building Reliable Agentic Workflows](https://promptengineering.org/agents-at-work-the-2026-playbook-for-building-reliable-agentic-workflows/) — PromptEngineering.org
- [Anthropic: Claude Prompting Best Practices (Claude 4.6)](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices) — Anthropic
- [Anthropic: Writing Tools for Agents](https://www.anthropic.com/engineering/writing-tools-for-agents) — Anthropic Engineering Blog
- [Anthropic: Effective Context Engineering for AI Agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) — Anthropic Engineering Blog
- [Claude Structured Outputs Documentation](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) — Anthropic
- [ReAct vs Plan-and-Execute: A Practical Comparison of LLM Agent Patterns](https://dev.to/jamesli/react-vs-plan-and-execute-a-practical-comparison-of-llm-agent-patterns-4gh9) — DEV Community
- [Navigating Modern LLM Agent Architectures: Multi-Agents, Plan-and-Execute, ReWOO, Tree of Thoughts, and ReAct](https://www.wollenlabs.com/blog-posts/navigating-modern-llm-agent-architectures-multi-agents-plan-and-execute-rewoo-tree-of-thoughts-and-react) — Wollen Labs
- [GPT-5 Prompting Guide](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide) — OpenAI Cookbook
- [o3/o4-mini Function Calling Guide](https://developers.openai.com/cookbook/examples/o-series/o3o4-mini_prompting_guide/) — OpenAI
- [OpenAI Prompt Engineering Guide](https://developers.openai.com/api/docs/guides/prompt-engineering) — OpenAI
- [Good Arguments Against the People Pleasers: How Reasoning Mitigates Yet Masks LLM Sycophancy](https://arxiv.org/html/2603.16643) — arXiv 2603.16643, March 2026
- [Sycophancy in LLMs: Causes and Mitigations](https://arxiv.org/html/2411.15287v1) — arXiv 2411.15287
- [Which Nested Data Format Do LLMs Understand Best?](https://www.improvingagents.com/blog/best-nested-data-format/) — ImprovingAgents
- [Stop AI Agent Hallucinations: 4 Essential Techniques](https://dev.to/aws/stop-ai-agent-hallucinations-4-essential-techniques-2i94) — AWS / DEV Community
- [From Prompts to Production: Agentic Development Playbook](https://www.infoq.com/articles/prompts-to-production-playbook-for-agentic-development/) — InfoQ
- [Yes, You're Absolutely Right… Right? A Mini Survey on LLM Sycophancy](https://medium.com/dsaid-govtech/yes-youre-absolutely-right-right-a-mini-survey-on-llm-sycophancy-02a9a8b538cf) — GovTech / Medium
- [Function Calling in AI Agents](https://www.promptingguide.ai/agents/function-calling) — Prompt Engineering Guide
- [Quantifying LLMs' Uncertainty with Confidence Scores](https://medium.com/capgemini-invent-lab/quantifying-llms-uncertainty-with-confidence-scores-6bb8a6712aa0) — Capgemini
- [Verbalized Confidence Scores for LLMs](https://arxiv.org/pdf/2412.14737) — arXiv 2412.14737
- [Prompt Format Impact on LLM Performance](https://arxiv.org/html/2411.10541v1) — arXiv 2411.10541
- [XML vs Markdown for High Performance Tasks](https://community.openai.com/t/xml-vs-markdown-for-high-performance-tasks/1260014) — OpenAI Community
- [7 Prompt Engineering Tricks to Mitigate Hallucinations in LLMs](https://machinelearningmastery.com/7-prompt-engineering-tricks-to-mitigate-hallucinations-in-llms/) — Machine Learning Mastery
- [Context Ordering Impact on LLM Responses](https://deepchecks.com/question/context-ordering-impact-on-llm-responses/) — Deepchecks
- [LLM Prompt Best Practices for Large Context Windows](https://winder.ai/llm-prompt-best-practices-large-context-windows/) — Winder AI
