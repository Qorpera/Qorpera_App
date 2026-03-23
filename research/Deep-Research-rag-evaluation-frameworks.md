# RAG Evaluation Frameworks & Metrics

**Researched:** 2026-03-20
**Prompt:** Research RAG evaluation frameworks, metrics for retrieval and generation quality, open-source eval tools (RAGAS, DeepEval, Braintrust, LangSmith, Phoenix/Arize), automated eval pipelines, and practical approaches to measuring per-section context contribution to reasoning quality — specifically for a system assembling context from multiple data sources (activity timeline, communication context, cross-department signals) and correlating with human approval/rejection.

## Key Findings

- **NDCG@10 + Recall@20** is the recommended starting metric pair for retrieval quality — NDCG penalizes burying critical evidence, Recall ensures coverage. Target NDCG@10 > 0.8, Recall@20 > 0.8.
- **Hallucination rates of ~25-30%** persist even with good retrieval (per multiple benchmarks). Faithfulness and hallucination rate are the most actionable generation quality metrics — they directly measure whether reasoning is grounded in the assembled context.
- **DeepEval** is the only major eval framework with native TypeScript/npm support, making it the clear choice for a Next.js/Vitest stack. Arize Phoenix complements it for citation tracking and observability.
- **Ablation testing** (systematically removing context sections and measuring quality drop) is the most rigorous approach to measuring per-section contribution — sections causing >0.15 drop are critical, <0.05 drop are noise candidates for pruning.
- **Human approval correlation** closes the loop: logging context contributions per situation and correlating with approval/rejection rates reveals which context sections actually predict user trust, not just model confidence.

## Full Research

### 1. Standard Retrieval Quality Metrics

#### Precision@k

What fraction of the top-k retrieved items are relevant.

```
Precision@k = (# relevant items in top-k) / k
```

**Use when:** You care equally about all positions. Best for broad searches where showing some relevant items matters. Target: 0.7+ for narrow domains.

#### Recall@k

What fraction of all relevant items were retrieved in top-k.

```
Recall@k = (# relevant items in top-k) / (total # relevant items in corpus)
```

**Use when:** You need to ensure comprehensive coverage. Best when missing relevant context is costly. Target: 0.8+ for comprehensive retrieval.

#### Mean Reciprocal Rank (MRR)

Where does the first relevant result appear.

```
MRR = (1/N) * Σ(1/rank_i) where rank_i is position of first relevant item for query i
```

**Use when:** First-match speed matters (e.g., "did we surface the critical context immediately?"). Ranges 0-1. MRR of 0.5 means first relevant item is at position 2 on average.

#### NDCG@k (Normalized Discounted Cumulative Gain)

Are relevant items ranked correctly AND positioned well.

```
DCG@k = Σ(relevance_i / log2(i+1))  for i=1 to k
NDCG@k = DCG@k / IDCG@k              (normalized by ideal ranking)
```

**Use when:** Ranking quality matters — you need the MOST relevant context highest. This is the most important metric for RAG because it penalizes burying critical evidence. Target NDCG@10 > 0.8.

#### Recommended Starting Point

Start with **NDCG@10** (are the top sections ranked correctly?) + **Recall@20** (did we miss any critical context?). These together measure both ranking quality and coverage.

---

### 2. Generation Quality Metrics Given Retrieved Context

#### Faithfulness

Are generated claims supported by the retrieved context?

**Calculation:** LLM-as-judge breaks the answer into atomic claims, then verifies each against context:

```
Faithful claims / Total claims = Faithfulness score (0-1)
```

**Method:** Load the response + context into an LLM with this instruction:
> "Given the context below, mark each claim in the response as SUPPORTED, CONTRADICTED, or NOT_INFERABLE. A claim is SUPPORTED only if it directly follows from the context."

RAGAS uses this approach. For multi-source context systems, each claim should be tracked with the context sections that supported it.

#### Context Relevancy

Does each retrieved chunk actually help answer the question?

**Calculation:** For each chunk, an LLM scores relevance to the query/question:

```
Average relevance score of all chunks
```

**Use when:** Detects over-retrieval (getting 10 chunks when 3 matter).

#### Answer Relevancy

Is the response actually answering the question?

**Calculation:** Reverse-engineer synthetic questions from the answer; measure similarity to original:

```
Mean cosine similarity(original_query, generated_questions)
```

**LLM-as-Judge Alternative:** Simpler — ask: "Does this answer directly address the question?" Score 0-10.

#### Hallucination Rate

What % of claims are unsupported or contradicted?

```
(Contradicted claims + Not-inferable claims) / Total claims
```

Research shows ~25-30% of statements in RAG outputs lack proper support even with good retrieval. Expect this and set thresholds accordingly.

#### Recommended Tracking Per Situation

1. **Faithfulness** of the reasoning output (is the recommendation grounded?)
2. **Context relevancy** of each section (activity timeline vs communication vs cross-dept signals)
3. **Hallucination rate** (% of reasoning claims unsupported by any context)
4. **Citation coverage** — % of key reasoning steps that cite their source context

---

### 3. Open-Source Eval Tools

#### RAGAS (Python-first, research-backed)

**Strengths:**
- Purpose-built for RAG evaluation
- Metrics grounded in academic research (papers cited in production)
- Synthetic test dataset generation built-in
- Growing multi-modal support

**Node.js/TypeScript Support:** Limited. Primary API is Python. Options:
- Run RAGAS as a microservice and call via REST
- Community wrappers exist (search "ragas-node-wrapper")
- Better to use DeepEval for native Node.js

**Key Metrics:** Faithfulness, Answer Relevancy, Context Precision, Context Recall

**Synthetic data generation example (Python):**
```python
from ragas.testset.generator import TestsetGenerator
generator = TestsetGenerator.from_default()
dataset = generator.generate_with_llamaindex_docs(documents, test_size=100)
```

#### DeepEval (TypeScript-native, pytest-style)

**Strengths:**
- Full TypeScript support with `deepeval-ts` npm package
- Pytest-like syntax — tests integrate directly into CI
- 14+ metrics (RAGAS ported + custom metrics)
- Self-explaining scores (tells you *why* it failed)
- Confident AI platform for cloud dashboarding

**Node.js/TypeScript Support:** Full. Install:
```bash
npm install deepeval-ts
```

**Example test (TypeScript):**
```typescript
import { evaluate } from "deepeval-ts";
import { FaithfulnessMetric, AnswerRelevancyMetric } from "deepeval-ts/metrics";

const test = async () => {
  const faithfulness = new FaithfulnessMetric();
  const answer = "The invoice was paid on March 10";
  const context = "Invoice #123 paid on March 10, 2026";
  const question = "When was invoice #123 paid?";

  const result = await faithfulness.measure({
    output: answer,
    context: context,
    query: question
  });

  console.log(result.score); // 0.95
};
```

**CI Integration:** Works with pytest via wrapper, or directly in Node.js test runners (Vitest, Jest).

#### LangSmith (LangChain-native)

**Strengths:**
- Deep integration with LangChain/LangGraph
- Built-in tracing of every step
- Cloud dashboarding
- Pre-built evaluators for common tasks

**Node.js/TypeScript Support:** Yes, via `@langchain/core`

**Weaknesses:** Vendor lock-in if not using LangChain heavily. Per-trace pricing scales with traffic.

**When to use:** If entire pipeline is LangChain/LangGraph.

#### Arize Phoenix (Open-source observability)

**Strengths:**
- Fully open-source, run locally
- 50+ instrumentation options (not locked to LangChain)
- Strong emphasis on citation tracking
- Docker-deployable

**Node.js/TypeScript Support:** Yes, via `@arizeai/openinference` SDK

**Setup:**
```bash
docker run -p 6006:6006 arizephoenix/phoenix
npm install @arizeai/openinference
```

**When to use:** Need full observability infrastructure + citation analysis + want to own data.

#### Braintrust (Evaluation-first)

**Strengths:**
- Designed for dev-to-prod evaluation loops
- Automatic regression detection (new evals vs baselines)
- Unlimited users (no per-seat pricing)
- Strong on prompt experimentation

**Node.js/TypeScript Support:** Yes, official SDK

**When to use:** Running frequent experimentation and need automated regression detection.

#### Tool Comparison

| Tool | Lang Support | Strength | Best For | Cost |
|---|---|---|---|---|
| RAGAS | Python-first | Academic rigor | Research-heavy teams | Free |
| DeepEval | TypeScript-native | Testing integration | Node.js CI/CD | Free + cloud option |
| LangSmith | JavaScript/Python | LangChain ecosystem | Agents & chains | Per-trace |
| Phoenix | Multi-lang | Citation tracking | Observability + audit | Free (self-hosted) |
| Braintrust | JavaScript/Python | Regression detection | Rapid experimentation | $249/mo base |

**Recommendation:** Start with **DeepEval** (TypeScript native, works in Vitest) + **Phoenix** (for citation/attribution analysis). This avoids Python dependencies and integrates cleanly with a Next.js stack.

---

### 4. Automated Eval Pipelines for CI Integration

#### Architecture

```
PR Merge → Trigger Eval Suite
  ├── Load test dataset (Q&A pairs with ground truth)
  ├── Run context assembly & reasoning pipeline
  ├── Evaluate outputs:
  │   ├── Faithfulness (claims vs context)
  │   ├── Answer relevancy
  │   ├── Context utilization (which sections cited?)
  │   └── Hallucination rate
  ├── Compare vs baseline (previous run)
  ├── Block merge if regressions detected
  └── Log results to dashboard
```

#### Step 1: Create Eval Dataset

Store test cases as JSON:
```json
[
  {
    "id": "situation_001",
    "query": "What is the status of invoice INV-2026-001?",
    "ground_truth_answer": "Invoice is overdue by 15 days",
    "context": {
      "entity_properties": "Invoice #INV-2026-001, amount $5000, due_date: 2026-03-05, status: unpaid",
      "activity_timeline": "Last email from customer 2026-03-15 asking for payment status",
      "communication": "Support ticket opened 2026-03-14 about payment issue"
    }
  }
]
```

#### Step 2: Build Eval Script (Vitest)

```typescript
// __tests__/eval/reasoning-eval.test.ts
import { describe, it, expect } from "vitest";
import { evaluate } from "deepeval-ts";
import { FaithfulnessMetric, AnswerRelevancyMetric } from "deepeval-ts/metrics";
import { reasoningEngine } from "@/lib/reasoning-engine";
import * as fs from "fs";

const testDataset = JSON.parse(fs.readFileSync("./eval-dataset.json", "utf-8"));

describe("Situation Reasoning Quality", () => {
  it("should maintain >0.85 faithfulness on reasoning output", async () => {
    const faithfulness = new FaithfulnessMetric({ threshold: 0.85 });
    let passCount = 0;

    for (const testCase of testDataset) {
      const { output, context } = await reasoningEngine(
        testCase.query,
        testCase.context
      );

      const result = await faithfulness.measure({
        output: output.reasoning,
        context: JSON.stringify(testCase.context),
        query: testCase.query
      });

      if (result.passed) passCount++;
    }

    expect(passCount / testDataset.length).toBeGreaterThan(0.85);
  });

  it("should cite context sections in reasoning", async () => {
    for (const testCase of testDataset) {
      const { output } = await reasoningEngine(
        testCase.query,
        testCase.context
      );

      const citationCount = output.citations?.length || 0;
      expect(citationCount).toBeGreaterThan(0);
    }
  });
});
```

#### Step 3: GitHub Actions Integration

```yaml
# .github/workflows/eval.yml
name: RAG Evaluation

on: [pull_request]

jobs:
  eval:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 20
      - run: npm ci
      - run: npm run test:eval
      - name: Compare to baseline
        run: |
          current=$(cat eval-results.json)
          baseline=$(git show origin/main:eval-results.json)
          node scripts/compare-evals.js "$current" "$baseline"
```

#### Step 4: Baseline Tracking

After each successful merge, save results:
```typescript
// scripts/save-eval-baseline.ts
const results = await runEvals();
fs.writeFileSync("eval-baseline.json", JSON.stringify({
  timestamp: new Date().toISOString(),
  metrics: results,
  commit: process.env.GITHUB_SHA
}));
```

#### Step 5: Regression Detection

```typescript
// scripts/compare-evals.ts
const current = JSON.parse(process.argv[2]);
const baseline = JSON.parse(process.argv[3]);

const regressions = [];
const metrics = ["faithfulness", "answerRelevancy", "contextRelevancy"];

for (const metric of metrics) {
  const drop = baseline[metric] - current[metric];
  if (drop > 0.05) { // 5% regression threshold
    regressions.push(`${metric}: ${baseline[metric]} → ${current[metric]}`);
  }
}

if (regressions.length > 0) {
  console.error("Regressions detected:", regressions);
  process.exit(1);
}
```

---

### 5. Per-Section Context Contribution Measurement

#### Approach 1: Citation-Based Attribution

Track every claim in reasoning output back to its source:

```typescript
interface ReasoningOutput {
  reasoning: string;
  claims: Array<{
    id: string;
    text: string;
    confidence: number;
    citations: Array<{
      source: "entity_properties" | "activity_timeline" | "communication" | "cross_dept";
      sectionId: string;
      relevanceScore: number;
      supportingText: string;
    }>;
  }>;
}
```

**Implementation:**

```typescript
// src/lib/reasoning-attribution.ts
export async function attachCitationsToReasoning(
  reasoning: string,
  assembledContext: ContextAssembly,
  llmResponse: string
): Promise<ReasoningOutput> {

  // Break reasoning into claims
  const claims = await extractClaims(reasoning);

  // For each claim, find supporting context
  const claimsWithCitations = await Promise.all(
    claims.map(async (claim) => {
      const citations = await findSupportingContext(
        claim,
        assembledContext,
        llmResponse
      );
      return { ...claim, citations };
    })
  );

  return {
    reasoning,
    claims: claimsWithCitations
  };
}

async function findSupportingContext(
  claim: Claim,
  context: ContextAssembly,
  llmResponse: string
): Promise<Citation[]> {
  const response = await claude.messages.create({
    model: "claude-opus-4-1",
    max_tokens: 500,
    messages: [{
      role: "user",
      content: `Given this claim from my reasoning:

"${claim.text}"

And this supporting context assembled from multiple sources:

Entity Properties: ${JSON.stringify(context.entityProperties)}
Activity Timeline: ${context.activityTimeline}
Communication Context: ${context.communicationContext}
Cross-Dept Signals: ${context.crossDeptSignals}

Which context sections (if any) support this claim? List the section type and the exact supporting text.`
    }]
  });

  return parseCitations(response.content[0].text, context);
}
```

#### Approach 2: Ablation Testing (Systematic Removal)

Remove each context section and measure impact:

```typescript
export async function measureContextContribution(
  query: string,
  fullContext: ContextAssembly,
  groundTruth: string
): Promise<Map<string, number>> {

  const baselineOutput = await reasoningEngine(query, fullContext);
  const baselineScore = await evaluateOutput(baselineOutput, groundTruth);

  const contributions = new Map<string, number>();

  const sections = [
    "entityProperties",
    "activityTimeline",
    "communicationContext",
    "crossDeptSignals"
  ];

  for (const section of sections) {
    const ablatedContext = {
      ...fullContext,
      [section]: null // Remove this section
    };

    const ablatedOutput = await reasoningEngine(query, ablatedContext);
    const ablatedScore = await evaluateOutput(ablatedOutput, groundTruth);

    // Contribution = performance drop when removed
    const contribution = baselineScore - ablatedScore;
    contributions.set(section, contribution);
  }

  return contributions;
}
```

**Results interpretation:**
- High value (0.15+) = Section is critical
- Medium value (0.05-0.15) = Section helps but not essential
- Low value (<0.05) = Section is noise (can be pruned)

#### Approach 3: Context Utilization Efficiency (CUE)

Track whether retrieved context is actually used:

```typescript
interface ContextMetrics {
  retrieved: number;        // How many chunks retrieved
  cited: number;            // How many actually cited
  efficiency: number;       // cited / retrieved (target: >0.6)
  accuracy: number;         // Reasoning correctness
  grounding: number;        // Are citations actually supporting claims?
}

export async function computeContextUtilization(
  output: ReasoningOutput
): Promise<ContextMetrics> {
  const citedSections = new Set(
    output.claims.flatMap(c => c.citations.map(ci => ci.source))
  );

  const validCitations = output.claims.filter(claim =>
    claim.citations.every(cit => cit.relevanceScore > 0.7)
  ).length;

  return {
    retrieved: output.claims.length,
    cited: citedSections.size,
    efficiency: citedSections.size / output.claims.length,
    accuracy: output.correctnessScore,
    grounding: validCitations / output.claims.length
  };
}
```

**Targets:**
- Efficiency > 0.6 (at least 60% of retrieved context is used)
- Grounding > 0.8 (80%+ of citations are valid)

#### Approach 4: Human Approval Correlation

Track which contexts correlate with human approvals vs rejections:

```typescript
interface SituationEvalRecord {
  situationId: string;
  reasoning: ReasoningOutput;
  contextContributions: Map<string, number>; // From ablation
  humanApproval: boolean;
  humanFeedback?: string;
}

export async function correlateContextWithApproval(
  records: SituationEvalRecord[]
): Promise<{
  sectionCorrelation: Map<string, number>;  // Pearson correlation
  approvalImprovementPlan: string[];
}> {

  const approved = records.filter(r => r.humanApproval);
  const rejected = records.filter(r => !r.humanApproval);

  const sectionCorrelation = new Map<string, number>();

  for (const section of ["entityProperties", "activityTimeline", "communicationContext"]) {
    const approvedMean = mean(approved.map(r => r.contextContributions.get(section) || 0));
    const rejectedMean = mean(rejected.map(r => r.contextContributions.get(section) || 0));

    // Higher value = more likely to be approved
    sectionCorrelation.set(section, approvedMean - rejectedMean);
  }

  return {
    sectionCorrelation,
    approvalImprovementPlan: generateImprovements(sectionCorrelation)
  };
}
```

---

### 6. Suggested Schema Addition

```prisma
model SituationEvaluation {
  id                    String   @id @default(cuid())
  situationId           String
  faithfulness          Float
  hallucinationRate     Float
  citationCoverage      Float
  contextContributions  Json     // { "entity_properties": 0.15, ... }
  humanApproved         Boolean?
  humanFeedback         String?
  createdAt             DateTime @default(now())
  @@index([situationId])
  @@index([createdAt])
}
```

---

### 7. Implementation Sequence

| Week | Focus |
|---|---|
| 1-2 | Add `ReasoningExecutionMetrics` to reasoning-engine.ts, install DeepEval, store baseline metrics |
| 2-3 | Citation tracking — modify reasoning output to include per-claim citations with source sections |
| 3-4 | Ablation testing endpoint, run across test dataset to identify low-value context sections |
| 4 | CI integration — DeepEval + Vitest eval suite, regression gating on PRs |

---

### 8. Recommended Tech Stack

| Task | Tool | Rationale |
|---|---|---|
| Test framework | Vitest | Already in stack |
| Evaluation | DeepEval (TypeScript) | Native support, CI-ready |
| Observability | Arize Phoenix | Citation tracking, open-source |
| Dataset management | RAGAS (Python microservice) | Synthetic data generation |
| Regression tracking | Custom (compare-evals.ts) | Lightweight, no new vendors |

## Sources

- [Evaluation Metrics for Retrieval-Augmented Generation (RAG) Systems - GeeksforGeeks](https://www.geeksforgeeks.org/nlp/evaluation-metrics-for-retrieval-augmented-generation-rag-systems/)
- [RAG Evaluation: Metrics, Frameworks & Testing (2026)](https://blog.premai.io/rag-evaluation-metrics-frameworks-testing-2026/)
- [RAG Evaluation: 2026 Metrics and Benchmarks for Enterprise AI Systems](https://labelyourdata.com/articles/llm-fine-tuning/rag-evaluation)
- [Top 5 Open-Source LLM Evaluation Frameworks in 2026](https://dev.to/guybuildingai/-top-5-open-source-llm-evaluation-frameworks-in-2024-98m)
- [The 5 Best RAG Evaluation Tools You Should Know in 2026](https://www.getmaxim.ai/articles/the-5-best-rag-evaluation-tools-you-should-know-in-2026/)
- [How to Detect Hallucinations in Your LLM Applications](https://www.getmaxim.ai/articles/how-to-detect-hallucinations-in-your-llm-applications/)
- [Detecting hallucinations with LLM-as-a-judge](https://www.datadoghq.com/blog/ai/llm-hallucination-detection/)
- [Benchmarking LLM Faithfulness in RAG with Evolving Leaderboards](https://arxiv.org/html/2505.04847v2)
- [Ablation Studies: The Operating System for Trustworthy AI Decisions](https://medium.com/@adnanmasood/ablation-studies-the-operating-system-for-trustworthy-ai-decisions-b99300d3bd32)
- [Evidence Contextualization and Counterfactual Attribution for Conversational QA over Heterogeneous Data with RAG Systems](https://arxiv.org/abs/2412.10571)
- [Engineering the RAG Stack: A Comprehensive Review](https://arxiv.org/html/2601.05264v1)
- [Synthetic data for RAG evaluation: Why your RAG system needs better testing](https://developers.redhat.com/articles/2026/02/23/synthetic-data-rag-evaluation-why-your-rag-system-needs-better-testing)
- [RAGAS Metrics Documentation](https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/)
- [GitHub - DeepEval](https://github.com/confident-ai/deepeval)
- [DeepEval Getting Started](https://deepeval.com/docs/getting-started)
- [DeepEval Unit Testing in CI/CD](https://deepeval.com/docs/evaluation-unit-testing-in-ci-cd)
- [Unit Testing LLMs with DeepEval](https://dev.to/shannonlal/unit-testing-llms-with-deepeval-4ljl)
- [LLM-as-a-Judge: A Complete Guide to Using LLMs for Evaluations](https://www.evidentlyai.com/llm-guide/llm-as-a-judge)
- [LLM-as-a-Judge Evaluation: Complete Guide - Langfuse](https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge)
- [LLM as a Judge: A 2026 Guide to Automated Model Assessment](https://labelyourdata.com/articles/llm-as-a-judge)
- [LLM Citation Tracking: How AI Systems Choose Sources (2026 Research)](https://www.ekamoira.com/blog/ai-citations-llm-sources)
- [Document Attribution: Examining Citation Relationships using Large Language Models](https://arxiv.org/html/2505.06324v1)
- [Precision and recall at K in ranking and recommendations](https://www.evidentlyai.com/ranking-metrics/precision-recall-at-k)
- [Evaluation measures (information retrieval) - Wikipedia](https://en.wikipedia.org/wiki/Evaluation_measures_(information_retrieval))
- [Evaluation Metrics for Search and Recommendation Systems](https://weaviate.io/blog/retrieval-evaluation-metrics)
- [How to Evaluate Retrieval Quality in RAG Pipelines](https://towardsdatascience.com/how-to-evaluate-retrieval-quality-in-rag-pipelines-precisionk-recallk-and-f1k/)
- [Langfuse alternatives: Top 5 competitors compared (2026) - Braintrust](https://www.braintrust.dev/articles/langfuse-alternatives-2026)
- [7 best LLM tracing tools for multi-agent AI systems (2026) - Braintrust](https://www.braintrust.dev/articles/best-llm-tracing-tools-2026)
- [EVAL #006: LLM Evaluation Tools - RAGAS vs DeepEval vs Braintrust vs LangSmith vs Arize Phoenix](https://dev.to/ultraduneai/eval-006-llm-evaluation-tools-ragas-vs-deepeval-vs-braintrust-vs-langsmith-vs-arize-phoenix-3p11)
- [Arize Phoenix vs. Braintrust: Which stack fits your LLM evaluation & observability needs?](https://www.braintrust.dev/articles/arize-phoenix-vs-braintrust)
