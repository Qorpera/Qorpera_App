# Karpathy's Autoresearch Pattern — Applied to Qorpera's Self-Improving Loops

**Researched:** 2026-03-20
**Prompt:** Research Karpathy's autoresearch concept (three primitives: editable asset, scalar metric, time-boxed cycle), DSPy/TextGrad/ADAS and similar frameworks, and map the pattern to Qorpera's planned self-optimization loops — identifying additional loops, Goodhart safeguards, sample size thresholds, cold-start strategies, safety patterns, and cross-customer transfer learning.

## Key Findings

- **Karpathy's autoresearch** (March 2026, ~630 lines of Python) reduced val_bpb from 0.9979 to 0.9697 over 126 experiments on H100. The pattern generalizes wherever three conditions hold: measurable fitness signal, repeatable controlled experiments, and automatable keep/discard decisions. Shopify CEO reported 19% overnight gain.
- **DSPy's MIPROv2 optimizer is most effective at 200+ examples**, jointly optimizing instructions AND few-shot examples via Bayesian optimization. But lightweight optimization (BootstrapFewShot) is viable at just 20 examples — Qorpera should implement a tiered system starting much earlier than 200.
- **Two of Qorpera's three planned loops appear novel in published literature**: context assembly auto-weighting via citation-rate correlation, and detection rule refinement via confirmation rates. Neither has direct precedent in published systems.
- **Goodhart's Law is the primary risk**. Beyond action diversity tracking, the research strongly recommends: multi-metric composite scoring, KL divergence monitoring from original distributions (OpenAI found degradation at ~10 nats), reward capping per cycle, and trip wires (intentional failure cases to detect exploitation).
- **Cross-customer transfer should use the "tuned shared model" pattern**: expert-authored shared prompts as baseline, per-operator optimization as data accumulates, anonymized pattern transfer only (never raw situation data), with operator opt-out.

## Full Research

### 1. Karpathy's Autoresearch — The Original Pattern

Released March 7-8, 2026 on GitHub (github.com/karpathy/autoresearch). ~630 lines of Python built around three core primitives:

**Editable Asset**: The agent modifies only `train.py` — a single file containing model architecture, optimizer choices, hyperparameters, batch size, schedules, and training loop logic. It cannot touch `prepare.py` (evaluation harness) or `program.md` (strategy document). Confining the agent to one file keeps the search space interpretable and every hypothesis reviewable as a diff.

**Scalar Metric**: The single number `val_bpb` (validation bits-per-byte) determines whether a change was an improvement. It is vocab-size-independent so architectural changes are fairly compared. The metric is fixed in `prepare.py` and cannot be altered by the agent.

**Time-Boxed Cycle**: Every experiment trains for exactly 5 minutes of wall-clock training time (excluding startup/compilation), yielding ~12 experiments per hour or ~100 overnight. The fixed budget makes every experiment directly comparable.

#### The Loop Mechanics

Propose change to `train.py` → commit → run training for 5 min → parse metrics → keep if `val_bpb` improves (lower is better), otherwise `git reset` → record outcomes in `results.tsv` → repeat indefinitely per the "NEVER STOP" instruction in `program.md`.

#### The program.md File

What Karpathy calls "research org code written in English." Simultaneously carries three registers:
- **Instructions**: What variables the agent may explore
- **Constraints**: Parameters that must remain unchanged (cannot modify data pipeline or evaluation function, cannot install packages, simplicity criterion: "a tiny improvement that adds 50 lines of tangled code isn't worth keeping")
- **Stopping criteria**: "NEVER STOP" — the agent continues indefinitely until manually stopped

#### Documented Results

- **Session 1 (Discussion #32)**: val_bpb improved from 0.9979 to 0.9773 over 89 experiments on H100 80GB
- **Session 2 (Discussion #43)**: val_bpb improved from 0.9979 to 0.9697 over 126 experiments on H100 80GB
- **Extended run**: 700 experiments over 2 days, discovering 20 optimizations that yielded 11% speed improvement when transferred to a larger model
- **Shopify CEO Tobi Lutke**: Tested overnight, reported 37 experiments with 19% performance gain on internal data

Key wins discovered: halving batch size (more optimization steps in 5 minutes), increasing depth, tuning sliding window ratios, raising RoPE base frequency, weight decay applied to embeddings.

#### Karpathy Quotes

- "All LLM frontier labs will do this. It's the final boss battle."
- "Any metric reasonably efficient to evaluate can be autoresearched by an agent swarm."
- "The next step for autoresearch is that it has to be asynchronously massively collaborative for agents (think: SETI@home style). The goal is not to emulate a single PhD student, it's to emulate a research community of them."

#### Generalization Beyond ML Training

The pattern generalizes wherever three conditions hold: (1) a measurable fitness signal exists, (2) controlled experiments can run repeatedly and automatically, (3) keep/discard decisions can be automated.

Concrete applications already built:
- **AutoVoiceEvals**: Voice AI prompt optimization — improved scheduling agent success from 25% to 100% in 20 iterations
- **Cold email**: Reply rates from 2-4% baseline to 8-12% in 4-6 weeks
- **Landing pages**: 15-40% conversion improvements over 8-12 weeks
- **Other domains applied**: API response time, bundle size, headline CTR, system prompt quality, test pass rate, build speed, memory usage across 11+ tools

The Goodhart's Law concern is explicitly noted in the community: "Any metric that requires a committee to interpret, or that optimises a proxy rather than the actual outcome, will be exploited by an autonomous loop with relentless efficiency."

#### Eureka Labs Connection

Karpathy works independently while running Eureka Labs, an AI-native education startup launched July 2024. Flagship product is LLM101n. Autoresearch is a separate project, not directly applied at Eureka Labs.

---

### 2. DSPy (Stanford's Declarative Prompt Optimization)

Started at Stanford NLP in Feb 2022, first released as DSP in Dec 2022, evolved into DSPy by Oct 2023. Now at 160,000+ monthly downloads and 23,000+ GitHub stars.

#### How DSPy Handles the "Editable Asset"

DSPy optimizes three categories of assets:
1. **Few-shot examples**: BootstrapFewShot, LabeledFewShot, KNNFewShot automatically generate/select demonstrations
2. **Instructions**: COPRO, MIPROv2, SIMBA, GEPA refine natural-language instructions
3. **Model weights**: BootstrapFinetune distills prompt-based programs into weight updates

#### Which Granularity Works Best

Few-shot examples almost always get added from the training set and appear to be the main drivers of metric improvements. However, MIPROv2 (which optimizes both instructions AND examples together via Bayesian optimization) tends to be the most effective for 200+ examples.

DSPy recommendation ladder:
- ~10 examples: BootstrapFewShot
- 50+ examples: BootstrapFewShotWithRandomSearch
- 200+ examples: MIPROv2
- Need efficiency with large LM: BootstrapFinetune

#### MIPROv2 Mechanics

Uses Bayesian optimization (via Optuna's TPE sampler) to efficiently search the space of (instruction, demo_set) combinations. Builds a surrogate model of the objective function, predicts promising untried combinations, and evaluates them. Instruction generation is "data-aware and demonstration-aware."

#### SIMBA (Newer Optimizer)

Uses stochastic mini-batch sampling to identify challenging examples with high output variability, then uses the LLM to introspectively analyze its own failures and generate improvement rules. Shows superior sample efficiency compared to MIPROv2.

#### Production Deployment

- **Relevance AI**: DSPy-powered self-improving agents for outbound sales email. 80% of emails matched human quality, 6% exceeded human performance, 50% reduction in development time. Used progressive optimizers: BootstrapFewShot (<20 samples) → BootstrapFewShot with Random Search (~50 samples) → MIPROv2 (200+ samples).
- **Prompt evaluation study (2025)**: Accuracy rose from 46.2% to 64.0% on prompt evaluation task, 85.0% to 90.0% on routing.
- **Typical cost**: ~$2 USD and ~10-20 minutes per optimization run.

#### Overfitting Risk

One study found instruction-only optimization produced "very-specific overfitting" with instructions too narrowly tailored to training data. Using a separate, larger model for prompt generation (vs. the target model) produced better generalization.

---

### 3. TextGrad

Published in Nature. A framework performing automatic "differentiation" via text, using LLMs to backpropagate textual feedback to improve individual components of compound AI systems. Treats each AI system as a computation graph where variables are inputs/outputs of function calls, and feedback is provided as natural language criticism describing how variables should change. Mirrors PyTorch's syntax and abstraction.

#### Key Results

- GPT-4o zero-shot accuracy on Google-Proof QA: 51% → 55%
- LeetCode-Hard coding: 20% relative performance gain
- MMLU ML subset: 85.7% → 88.4%
- MMLU college physics: 91.2% → 95.1%

#### Comparison to DSPy

TextGrad excels at instance-level refinement for hard individual problems (coding, scientific Q&A). DSPy is superior for building robust, scalable, reusable systems. They are complementary — DSPy adds in-context demonstration examples, TextGrad optimizes system prompts. The combination can further improve results.

#### Extensions

- **REVOLVE** (second-order textual optimization): Up to 29.17% better than TextGrad on code
- **SPO** (Self-Supervised Prompt Optimization): Comparable to TextGrad at 1.1-5.6% of the cost

---

### 4. ADAS (Automated Design of Agentic Systems)

ICLR 2025 paper by Shengran Hu, Cong Lu, and Jeff Clune. A meta-agent iteratively programs new agents in code, tests performance, maintains an archive, and uses the archive to inform subsequent generations.

Since programming languages are Turing complete, this can theoretically learn any possible agentic system — novel prompts, tool use, workflows, and combinations. The "editable asset" is Python code defining agent forward passes.

#### Results

- ARC Challenge: Up to 14% accuracy improvement over CoT and Self-Consistency baselines
- DROP (reading comprehension): 13.6 F1 points improvement
- MGSM (math): 14.4% accuracy improvement

#### Cross-Domain Transfer

Agents discovered in the math domain outperformed or matched baselines when transferred to non-math tasks, demonstrating robustness and generality.

---

### 5. Google DeepMind: OPRO

OPRO (Optimization by PROmpting): LLMs as optimizers where the optimization task is described in natural language. In each step, the LLM generates new solutions from a prompt containing previous solutions with their values.

Best OPRO-optimized prompts outperformed human-designed prompts by up to 8% on GSM8K and up to 50% on Big-Bench Hard tasks.

Extensions: MOPrompt (multi-objective, prompt length reducible by >40% with <1% performance hit), AMPO (tree-structured multi-branch optimization), Adaptive-OPRO (online delayed-reward settings).

---

### 6. AutoPDL (AutoML 2025)

Frames agent prompt optimization as a structured AutoML problem over a combinatorial space of agentic and non-agentic prompting patterns. Uses successive halving to efficiently navigate this space. Results: consistent accuracy gains of 9.21 +/- 15.46 percentage points across three tasks and seven LLMs. Solutions are human-readable, editable PDL programs.

---

### 7. Anthropic: Constitutional AI

A self-improvement process where the system samples from an initial model, generates self-critiques and revisions based on a constitution (list of principles), and fine-tunes on revised responses. The RL phase trains a preference model from AI preferences (RLAIF).

Claude 3 (March 2024) incorporated Constitutional AI-based "character training." By 2025, evolved into hybrid approaches combining constitutional principles with RLHF. Constitutional Classifiers++ improved robustness with ~1% additional compute cost and lower refusal rates.

---

### 8. Production Systems Using Human Approve/Reject as Optimization Signal

**POHF (Prompt Optimization with Human Feedback)**: Optimizes prompts using only human pairwise preference feedback. Uses a neural network trained on preference comparisons plus upper confidence bound exploration. Reached strong performance by iteration 50-60 on instruction optimization. Generates 200 candidate prompts from seed information for initial diversity.

**PLHF (Prompt Learning from Few-Shot Human Feedback)**: Requires only a single round of human feedback. Achieved 92% accuracy with only 10-20 human feedback examples. On industrial SQL-QA: 74% baseline to 87.96% with only 30 labeled samples (10 positive, 20 negative). 18.92% improvement over baseline on industrial tasks.

**RLUF (Reinforcement Learning from User Feedback)**: Converts paired preference data into unpaired data by labeling "accepted" as 1 and "rejected" as 0, then trains reward models using binary cross entropy loss.

---

### 9. Additional Autoresearch Loops for Qorpera

Beyond the three planned loops (reasoning prompt optimization, context assembly weighting, detection rule refinement):

#### Action Selection Optimization

Research supports this strongly. AutoPDL shows that optimal prompting strategies (and therefore action selection patterns) vary across models and tasks. ADAS Meta Agent Search discovered novel agent architectures with different action patterns that transferred across domains. The autoresearch-as-a-skill pattern has been applied to tool selection routing.

For Qorpera: optimizing which actions (send_email vs. create_task vs. escalate) are proposed for which situation types, using confirmation rates as the metric.

**Editable asset**: Action selection weights/rules per situation type. **Scalar metric**: Action confirmation rate.

#### Entity Resolution Confidence Tuning

Production systems (Senzing, Tamr) already implement this. "Entity Centric Learning" allows systems to learn new patterns as records are combined, and when new information is learned, the system reviews if previous decisions could have been better and fixes them in real time. Confidence thresholds that drive automated merge vs. human review can be tuned based on correction rates.

**Editable asset**: Merge/split thresholds per entity type. **Scalar metric**: Merge correction rate.

#### Communication Style Adaptation

Active research area. The PAHF framework (ICLR 2025) enables continual personalization through a three-step loop: (1) seeking pre-action clarification, (2) grounding actions in preferences retrieved from memory, (3) integrating post-action feedback to update memory when preferences drift. Research shows users mirror agent communication style.

Viable but harder to define a scalar metric — embedding similarity to approved communications could work.

**Editable asset**: Tone, structure, detail level of notifications/proposals. **Scalar metric**: Click-through + time-to-approve.

#### Tool/Connector Usage Optimization

Less formalized in research, but AI-driven API management systems already optimize batch sizes, parallelization, and retries based on historical data. For Qorpera: auto-adjusting which connector data sources get weighted more heavily in context assembly, or optimizing sync frequencies based on information value yield.

**Editable asset**: Data source weights, sync frequencies. **Scalar metric**: Citations per sync cost.

**Assessment**: Action selection optimization and entity resolution confidence tuning are the most concrete additional loops, with clear scalar metrics and established precedent.

---

### 10. Goodhart's Law Safeguards

#### The Four Types (Manheim & Garrabrant Taxonomy)

1. **Regressional**: Maximizing proxy U also selects for the difference between U and true objective U*
2. **Extremal**: Optimization takes the agent outside the region where U and U* are correlated
3. **Causal**: Agent intervenes to maximize U in a way that doesn't affect U*
4. **Adversarial**: Agent has a different goal and exploits the proxy

For Qorpera, the primary risks:
- **Regressional**: Approval rates may not perfectly correlate with actual business value
- **Extremal**: At very high approval rates, the system may generate safe but unhelpful proposals that users approve by default

#### Best Practices Beyond Action Diversity and Coverage Monitoring

1. **Multi-metric composite scoring**: Approval rate PLUS action completion rate PLUS user engagement PLUS business outcome correlation. "It's much harder to game five metrics simultaneously than to game a single number."
2. **Decoupled approval**: Separate feedback collection from action execution to prevent self-corruption of reward signals (Uesato et al., 2020).
3. **Reward capping**: Limit maximum possible optimization gains per cycle to prevent extreme exploitation.
4. **Rotating metrics**: Periodically shift which metric drives optimization to discourage short-term gaming.
5. **"Goodhart tests"**: Stress test by asking "If we doubled the incentive on this metric, how would the system game it?" and "What will get worse while this gets better?"
6. **Separate learning vs. judgment metrics**: Don't optimize on the same metric used to evaluate the system.
7. **Trip wires**: Intentionally introduce known failure cases and monitor if the optimization loop ever "discovers" and exploits them.
8. **KL divergence monitoring**: OpenAI found that around 10 nats of KL divergence from the original distribution, the true objective starts decreasing. Track how far optimized prompts/behaviors drift from originals.
9. **Catastrophic Goodhart awareness**: When reward function error is heavy-tailed, some policies can obtain arbitrarily high reward while achieving no more utility than baseline — KL regularization alone does NOT prevent this.

---

### 11. Sample Sizes for Autonomous Optimization

#### Is 200+ Resolved Situations Per Type a Reasonable Threshold?

The research provides a nuanced answer — 200+ is well-supported for full optimization, but lighter methods work much earlier:

- **DSPy recommends MIPROv2 at 200+ examples** for full instruction + few-shot optimization. Aligns with the 200 threshold.
- **PLHF achieves strong results with only 10-30 labeled examples** (30 labeled samples produced 18.92% improvement on industrial data).
- **Relevance AI's progression**: BootstrapFewShot at <20 samples, Random Search at ~50, MIPROv2 at 200+.
- **POHF (pairwise preferences)**: Meaningful improvements appeared within 20-30 iterations.
- **Braintrust practical guidance**: "Start with 20-50 representative examples."
- **Business metric autoresearch**: Cold email needs 50+ sends per variation minimum; ads need 200+ impressions per variant; landing pages need 200-500 visitors per variant per cycle.
- **LLM output correlation**: A benchmark with 1,000 semantically similar prompts might only offer the statistical power of a few hundred truly independent samples.

#### Recommended Tiered System

| Resolved Situations | Method | What Gets Optimized |
|---|---|---|
| 20-50 | BootstrapFewShot | Select best-performing cases as few-shot examples |
| 50-100 | Random search across variants | Prompt structure, example selection |
| 200+ | Full Bayesian optimization (MIPROv2-style) | Instructions + examples jointly |
| 500+ | Statistical significance testing per step | Individual optimization decisions validated |

200+ is the right threshold for full autonomous optimization, but gains are left on the table by not doing lightweight optimization at 20-50.

---

### 12. Cold-Start Problem

How production systems optimize before enough data exists:

1. **Expert-authored initial prompts** (the `program.md` analog): Human domain knowledge as baseline. This is the starting state.
2. **Synthetic data bootstrapping**: Use a capable model to generate candidate training examples, validate with human review. POHF generates 200 candidate prompts from seed information via in-context learning.
3. **Rapid implicit signals**: Capture first-interaction events (which proposals users click on, how long they review before approving) before formal approve/reject data accumulates.
4. **Contextual features as proxy**: Use metadata signals (department type, industry vertical, company size) to infer likely patterns before behavioral data exists.
5. **Cross-customer warm-start**: Once some operators have sufficient data, transfer learnings to new operators as warm-start priors.
6. **Transfer from general to specific**: Pre-trained prompts from general domain, then per-operator fine-tuning as data accumulates. The DSPy "tuned shared models" pattern.

---

### 13. Safety Patterns for Optimization Loops

#### Canary Deployment for Prompt Changes

- Route 1-10% of situations to new prompt versions while monitoring quality metrics
- Expand only if metrics remain stable; stop immediately if degradation occurs
- Keep prior version deployable with instant revert scripted

#### A/B Testing AI Reasoning

- Run multiple prompt variants simultaneously against identical inputs
- Compare quality, latency, cost, and token usage
- Use golden datasets (50-200 curated test cases) as baseline quality signals

#### Prompt Rollback Mechanisms

- Decouple prompts from application releases — hotfix/revert without redeploying code
- Maintain immutable version history with unique IDs per prompt change
- Environment-based promotion: dev → staging → production with evaluation gates at each stage

#### Architectural Patterns for Safe Optimization

1. **Layered evaluation**: Deterministic checks + semantic assessment + LLM-as-judge + non-functional metrics
2. **Automated CI/CD gates**: Block promotion when scores fall below thresholds
3. **Human review for high-stakes**: Flag high-entropy decisions for human review
4. **Graduated autonomy for the optimization loop itself**:
   - Weeks 0-2: 100% human review of optimization proposals
   - Weeks 3-4: AI-as-judge for routine cases, human for structural changes
   - Month 2+: Advance autonomy only when Consequential-Action Detector Recall ≥ 95% and Approval-Rework Rate < 10%
5. **Shadow mode**: Run new prompts in parallel without executing actions, compare proposals to existing system before promoting

---

### 14. Cross-Customer Transfer Learning in Multi-Tenant SaaS

#### Three Architectural Approaches (Microsoft Azure Guidance)

| Approach | When to Use | Privacy Risk |
|---|---|---|
| Tenant-specific models | Sensitive data, unique patterns | None |
| Tuned shared models | Most SaaS scenarios | Moderate — model weights can leak |
| Fully shared models | Low sensitivity, high similarity | Highest |

#### How to Validate Cross-Tenant Transfer

- Start with shared model trained on aggregated, anonymized data
- Measure per-tenant performance metrics (accuracy, approval rate)
- If a tenant's performance drops below threshold, fall back to tenant-specific optimization
- A/B test shared vs. tenant-specific predictions per tenant

#### Privacy and Data Isolation

- "Ensure that tenants don't gain unauthorized or unwanted access to the data or models of other tenants. Treat models with a similar sensitivity to the raw data that trains them."
- When analyzing cross-tenant trends, anonymize and aggregate data first
- Consider what to do if a tenant objects to their data being used (opt-out mechanism)
- Never share raw training data across tenants — only share model weights or anonymized patterns

#### Federated Learning as Privacy-Preserving Alternative

- Each tenant trains locally, only shares model updates (gradients), not raw data
- Differential privacy adds noise to updates to prevent individual data reconstruction
- FedSA-LoRA-DP combines parameter-efficient approaches with differential privacy
- Market growing: $0.1B in 2025, projected $1.6B by 2035 at 27.3% CAGR

#### Recommended Approach for Qorpera

1. Start with expert-authored prompts shared across all operators (cold-start baseline)
2. As individual operators accumulate data, enable per-operator optimization
3. Periodically evaluate whether optimizations from high-data operators generalize
4. Share only anonymized pattern insights (e.g., "for situation type X, including Y context improves approval rates"), never raw situation data
5. Maintain strict `operatorId` scoping throughout — never let optimization queries cross tenant boundaries
6. Implement opt-out mechanism for operators declining participation in shared learning

Federated learning is the gold standard but overkill at current stage. "Tuned shared model" with anonymized pattern transfer is the pragmatic path.

---

### 15. Novelty Assessment

Two of Qorpera's three planned loops do not appear in published literature:

- **Context assembly auto-weighting via citation-rate correlation**: SELF-RAG (ICLR 2024) is the closest published work — it learns to retrieve, generate, and critique through self-reflection, deciding when retrieval is useful. But the specific pattern of tracking which context elements get cited in reasoning outputs and using that to auto-weight future context assembly does not appear in published literature.
- **Detection rule refinement via confirmation rates**: Implicitly covered by the autoresearch pattern (detection rule is the editable asset, confirmation rate is the scalar metric), but no published system does this for business situation detection specifically.

These are potential differentiators.

---

### 16. Mapping to Qorpera's Architecture

| Autoresearch Primitive | Karpathy's Implementation | Qorpera Analog |
|---|---|---|
| Editable asset | `train.py` | Reasoning prompts, detection rules, context weights, action selection rules |
| Scalar metric | `val_bpb` | Approval rate, confirmation rate, citation rate, merge correction rate |
| Time-boxed cycle | 5 min training | Per-situation resolution cycle |
| Constraint file | `program.md` | Policy rules (PolicyRule model) — governance that the optimization cannot violate |
| Results log | `results.tsv` | Situation + ReasoningOutput audit trail with approval/rejection outcomes |
| Keep/discard | `git reset` on failure | Prompt version rollback, A/B variant elimination |

## Sources

### Karpathy Autoresearch
- Karpathy autoresearch GitHub: https://github.com/karpathy/autoresearch
- Karpathy program.md: https://github.com/karpathy/autoresearch/blob/master/program.md
- Karpathy X post (SETI@home vision): https://x.com/karpathy/status/2030705271627284816
- Karpathy X post (original announcement): https://x.com/karpathy/status/2030371219518931079
- Kingy AI — Autoresearch Minimal Agent Loop: https://kingy.ai/ai/autoresearch-karpathys-minimal-agent-loop-for-autonomous-llm-experimentation/
- Fortune — The Karpathy Loop: https://fortune.com/2026/03/17/andrej-karpathy-loop-autonomous-ai-agents-future/
- Alexey on Data — Autoresearch Went Viral: https://alexeyondata.substack.com/p/karpathys-autoresearch-went-viral
- VentureBeat coverage: https://venturebeat.com/technology/andrej-karpathys-new-open-source-autoresearch-lets-you-run-hundreds-of-ai
- MindStudio — Optimize Any Business Metric: https://www.mindstudio.ai/blog/autoresearch-optimize-business-metrics-autonomously
- Mager.co — Blueprint for Self-Improving Agents: https://www.mager.co/blog/2026-03-14-autoresearch-pattern/
- DEV.to — Autoresearch as a Skill: https://dev.to/alireza_rezvani/i-turned-karpathys-autoresearch-into-a-skill-that-optimizes-anything-here-is-the-architecture-57j8
- AutoVoiceEvals GitHub: https://github.com/ArchishmanSengupta/autovoiceevals

### DSPy
- DSPy Official: https://dspy.ai/
- DSPy Optimizers: https://dspy.ai/learn/optimization/optimizers/
- DSPy GitHub: https://github.com/stanfordnlp/dspy
- DSPy MIPROv2: https://dspy.ai/api/optimizers/MIPROv2/
- DSPy SIMBA: https://dspy.ai/api/optimizers/SIMBA/
- DSPy in Production: https://dspy.ai/production/
- ZenML — Relevance AI case study: https://www.zenml.io/llmops-database/self-improving-agentic-systems-using-dspy-for-production-email-generation
- Pipelines & Prompt Optimization with DSPy: https://www.dbreunig.com/2024/12/12/pipelines-prompt-optimization-with-dspy.html
- Multi-Use Case Study: https://arxiv.org/html/2507.03620v1

### TextGrad
- TextGrad paper: https://arxiv.org/abs/2406.07496
- TextGrad GitHub: https://github.com/zou-group/textgrad
- Stanford HAI coverage: https://hai.stanford.edu/news/textgrad-autograd-text
- TextGrad vs DSPy comparison: https://medium.com/@jelkhoury880/textgrad-vs-dspy-revolutionizing-ai-system-optimization-through-automatic-text-based-58f8ee776447

### ADAS
- ADAS project page: https://www.shengranhu.com/ADAS/
- ADAS paper: https://arxiv.org/abs/2408.08435
- ADAS GitHub: https://github.com/ShengranHu/ADAS
- ADAS at ICLR 2025: https://openreview.net/forum?id=t9U3LW7JVX

### Google DeepMind OPRO
- OPRO paper: https://arxiv.org/abs/2309.03409
- OPRO GitHub: https://github.com/google-deepmind/opro

### AutoPDL
- AutoPDL paper: https://arxiv.org/abs/2504.04365

### Anthropic Constitutional AI
- Constitutional AI paper: https://www.anthropic.com/research/constitutional-ai-harmlessness-from-ai-feedback
- Constitutional AI arxiv: https://arxiv.org/abs/2212.08073
- Next-generation Constitutional Classifiers: https://www.anthropic.com/research/next-generation-constitutional-classifiers

### Human Feedback Optimization
- POHF paper: https://arxiv.org/abs/2405.17346
- PLHF paper: https://arxiv.org/abs/2505.07886
- RLUF paper: https://arxiv.org/html/2505.14946v1
- Cleverbridge — Agentic AI approval in B2B SaaS: https://grow.cleverbridge.com/blog/agentic-ai-b2b-saas-human-approval

### Goodhart's Law
- Goodhart taxonomy (Manheim & Garrabrant): https://arxiv.org/pdf/1803.04585
- OpenAI — Measuring Goodhart's Law: https://openai.com/index/measuring-goodharts-law/
- OpenAI — Scaling Laws for Reward Model Overoptimization: https://openai.com/index/scaling-laws-for-reward-model-overoptimization/
- Goodhart's Law in RL (ICLR 2024): https://proceedings.iclr.cc/paper_files/paper/2024/file/6ad68a54eaa8f9bf6ac698b02ec05048-Paper-Conference.pdf
- Lil'Log — Reward Hacking: https://lilianweng.github.io/posts/2024-11-28-reward-hacking/
- Catastrophic Goodhart paper: https://arxiv.org/html/2407.14503v1
- Alignment Forum — Goodhart taxonomy: https://www.alignmentforum.org/posts/yXPT4nr4as7JvxLQa/classifying-specification-problems-as-variants-of-goodhart-s

### Cross-Tenant Transfer & Safety
- Microsoft — AI/ML in Multitenant Solutions: https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/approaches/ai-ml
- AWS — Multi-tenant GenAI: https://aws.amazon.com/blogs/machine-learning/build-a-multi-tenant-generative-ai-environment-for-your-enterprise-on-aws/
- Google Cloud — Federated Learning: https://cloud.google.com/architecture/cross-silo-cross-device-federated-learning-google-cloud
- Federated Learning review (MDPI): https://www.mdpi.com/2079-9292/14/13/2512

### Prompt Safety & Versioning
- Braintrust — Prompt Versioning: https://www.braintrust.dev/articles/what-is-prompt-versioning
- Braintrust — A/B Testing LLM Prompts: https://www.braintrust.dev/articles/ab-testing-llm-prompts
- Canary Releases for Gen AI: https://medium.com/@deolesopan/canary-releases-for-gen-ai-safe-rollouts-for-prompts-models-policies-7dff688b2073
- DEV.to — A/B Testing Prompts Guide: https://dev.to/kuldeep_paul/ab-testing-prompts-a-complete-guide-to-optimizing-llm-performance-1442
- AWS — Prompt Lifecycle Management: https://docs.aws.amazon.com/prescriptive-guidance/latest/agentic-ai-serverless/prompt-agent-and-model.html
- Langfuse — Prompt Version Control: https://langfuse.com/docs/prompt-management/features/prompt-version-control
- Shaped — Cold Start Strategies: https://www.shaped.ai/blog/mastering-cold-start-challenges
- LangChain — Exploring Prompt Optimization: https://blog.langchain.com/exploring-prompt-optimization/

### Cold Start & RAG
- SELF-RAG (ICLR 2024): Referenced in context assembly discussion
