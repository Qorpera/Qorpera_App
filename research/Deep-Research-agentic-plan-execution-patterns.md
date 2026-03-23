# Agentic Plan Execution Patterns: How Leading AI Systems Handle Multi-Step Plans

**Researched:** 2026-03-20
**Prompt:** Research how leading agentic AI systems (Devin, Cursor Agent, OpenAI Operator, Anthropic Computer Use, Google Project Mariner, Adept) handle multi-step plan execution — task decomposition, failure recovery, re-planning, execution patterns (ReAct/plan-and-execute/tree-of-thought), tool call dependency management, and human-in-the-loop approval gates. Include academic papers and production framework architectures.

## Key Findings

- **Every production system uses plan-and-execute with ReAct inner loops** — none rely on pure ReAct alone for multi-step execution. The consensus architecture: an expensive model creates an explicit plan, a cheaper/deterministic executor runs each step, and a replanner adjusts when steps fail. Devin, Cursor, and Adept all have explicit plan-approval phases; Claude Code and OpenAI Operator let the model decide implicitly when to plan vs act.

- **DAG-based parallel execution is the production standard, delivering 3.7x latency speedup and 6.7x cost savings over sequential ReAct** (LLMCompiler, Kim et al., ICML 2024). However, most real-world business plans are naturally sequential — conditional branching covers 95% of needs without full DAG complexity.

- **Human-in-the-loop is universally policy-driven and risk-tiered, not blanket**. OpenAI Operator uses risk-proportional safeguards (low/medium/high); Devin has two non-negotiable checkpoints (plan approval + PR review); Cursor creates automatic checkpoints before every change; Anthropic Computer Use gates "Points of No Return" with confirmation prompts. All systems allow modification-on-resume, not just approve/reject.

- **Error recovery is the biggest differentiator between systems**. Cursor detects "unrecoverable agent model looping" and halts; Devin auto-iterates with a self-verification layer (Devin Review); Claude Code classifies errors and fixes root causes incrementally; Google Mariner is the weakest — frequently enters action loops requiring user intervention. The emerging best practice: classify errors as transient (retry) → permanent (replan) → catastrophic (escalate to human).

- **The field is converging on 8 architectural principles**: (1) separate planning from execution, (2) DAGs over linear sequences, (3) durable state with checkpointing, (4) policy-driven HITL gates, (5) idempotent steps with compensation (saga pattern), (6) layered error handling, (7) deterministic orchestration with non-deterministic reasoning, (8) observability as a first-class concern.

## Full Research

### 1. Devin (Cognition AI)

**Architecture**: Plan-and-execute at the macro level, ReAct-style iteration at the micro level within each step.

**Task Decomposition**: Plan-first architecture. Before writing code, Devin enters a "Planner" mode:
- Proactively scans the codebase (automatic indexing every few hours produces architecture diagrams, wikis, dependency maps)
- Produces a step-by-step plan with code citations and links to relevant files
- User inspects and approves before execution begins
- Sweet spot: tasks of 1–6 hours of human work, decomposed into clear steps
- Multi-agent operation: one Devin can dispatch subtasks to other Devin instances running in parallel, each in an isolated VM

**Failure Detection & Recovery**:
- Reads error logs, iterates on code, retries autonomously until builds pass
- Devin Review (v2.2): self-verification layer that analyzes PRs for bugs and auto-fixes them in a feedback loop
- 72% of passing SWE-bench tests take >10 minutes, indicating multi-cycle error recovery is core
- Known failure mode: can get stuck in infinite loops on complex recursive problems
- Devin 2.0 completes 83% more tasks per ACU than Devin 1.x
- Real-world testing (Answer.AI, month-long evaluation): 14 failures out of 20 tasks in early version; similar tasks can yield wildly different outcomes

**Re-planning**:
- Devin 3.0 (2026): dynamic re-planning — alters strategy without human intervention when hitting roadblocks
- Users can intervene mid-execution to provide clarifications; Devin updates its plan accordingly
- Checkpoint restore: scrub timeline, roll back to a prior state (files + memory)
- Sessions can sleep and resume later, preserving full state including authenticated sessions

**Human-in-the-Loop — Two Non-Negotiable Checkpoints**:
1. **Planning Checkpoint**: Devin generates plan, waits 30 seconds for human feedback (configurable; can require explicit approval)
2. **PR Checkpoint**: Work submitted as PR for human review before merging
- Mid-execution: users can message Devin during execution with clarifications
- Confidence levels: red (probable bugs), yellow (warnings), gray (FYI)
- Devin's 2025 Performance Review reports 4x faster completion and 67% PR merge rate

**Tool Management**: Sandboxed cloud environment with shell, code editor, browser. MCP integration for external tools (Sentry, Datadog, Slack, Figma, Stripe, etc.). REST API for programmatic session triggers.

**Published architecture**: No formal academic papers. Architecture is proprietary. Technical details from blog posts and documentation only.

---

### 2. Cursor Agent (Anysphere)

**Architecture**: ReAct loop with a 6-phase harness, complemented by explicit Plan Mode.

**Six-Phase Harness**:
1. **Pre-check and compaction** — evaluate context window state, compress if needed
2. **Thinking** — model reasons about next action
3. **Self-critique** — model evaluates its own proposed action
4. **Action** — model selects a tool call
5. **Tool execution** — harness executes tool, collects results
6. **Post-processing** — results processed and fed back into loop

**Task Decomposition**: Explicit Plan Mode generates a reviewable Markdown implementation plan before execution. The plan serves as a contract — user can modify before approving. Cursor recommends Plan Mode before Agent Mode for complex tasks, treating the plan as a "pre-flight checklist."

**Failure Detection & Recovery**:
- After changes, runs terminal commands (builds, tests, linters) and inspects output
- If build/test fails: reads error output, diagnoses, attempts fix — loops until tests pass
- Detects "unrecoverable agent model looping" and halts execution
- Official recommendation when stuck: revert changes and refine the plan rather than trying to fix through follow-up prompts — starting from a clean state with a better plan is faster and produces cleaner results

**Re-planning**: Self-critique phase allows dynamic adjustment. After each action, checks environment state before deciding next step. Context from tool results feeds back for dynamic re-planning.

**Parallelism**:
- Read-only tools run in parallel (thread pool, up to 5 concurrent)
- Write tools run sequentially to prevent conflicts
- 15+ specialized tools: `semantic_search`, `grep`, `find_definition`, `edit_file`, `terminal_command`, `browser_control`, etc.
- **Subagents** (Cursor 2.4): main agent spawns multiple concurrent subagents, each with isolated context window and potentially different models. Multiple `spawn_subagent` calls in same response trigger automatic parallel execution. Default subagents for codebase research, terminal commands, and parallel work streams.
- **Background Agents**: Git worktrees for full isolation, up to 8 parallel agents on separate branches. Orchestrated by Anyrun, a Rust service handling process isolation on AWS EC2 with Firecracker VMs.

**Model Routing**: Classifies tasks as routine vs complex. Routine → proprietary Composer model (Mixture-of-Experts, RL-trained for agent-style tool calling, MXFP8 quantization). Complex → frontier models (Claude, GPT-4).

**Human-in-the-Loop**:
- **Checkpoints**: automatic before any changes; every request creates a checkpoint, every AI-initiated change creates another; users can revert to any checkpoint
- **Diff review**: multi-file diff in Composer panel (Apply All / Discard per file)
- **Terminal command approval**: pauses for confirmation by default
- **YOLO Mode**: opt-in auto-approval for terminal commands (recommended only for safe/reversible operations)

---

### 3. Claude Code (Anthropic)

**Architecture**: Pure ReAct loop — gather context → take action → verify results → repeat. No separate explicit planning phase baked into the harness; the model decides when to plan (by thinking/reasoning) vs when to act (by calling tools).

**Core Loop**:
1. Claude receives prompt + system prompt + tool definitions + conversation history
2. Evaluates current state, determines how to proceed
3. A "turn" = one round trip: Claude produces output with tool calls → SDK executes tools → results feed back automatically
4. Turns continue until Claude produces output with no tool calls (loop ends)

Extended thinking / adaptive reasoning (Opus 4.6) lets the model decide how much internal deliberation to do based on task difficulty.

**Error Recovery**:
- Tool exceptions caught and returned as `tool_result` with `is_error: true` (message only, not full stack traces)
- Claude reads the error, reasons about it, decides on corrective action
- For build/test failures: run full test suite, group failures by root cause, fix one root cause at a time, re-run tests after each fix
- Recommended pattern: run the type checker first (type errors are most common root cause after refactors), then fix incrementally

**Context Management**:
- **Auto-compaction** at ~75–92% token usage: summarizes history, discards verbose tool outputs, preserves critical info (file paths, function names, error messages)
- **Manual compaction** via `/compact` (e.g., `/compact Focus on the API changes`)
- **Tool Result Clearing**: old tool results deep in history cleared while keeping message structure
- Opus 4.6 supports 1M token context window (beta)

**Parallelism**:
- **Task tool**: up to 10 concurrent tasks with intelligent queuing, each with own context window
- **Subagents**: specialized agent configs as Markdown files in `.claude/agents/` with YAML frontmatter, custom system prompt, specific tool access, independent permissions
- **Agent Teams** (experimental, Opus 4.6): one session as team lead coordinating work, teammates work independently in own context windows
- Dispatch patterns: parallel dispatch for 3+ unrelated tasks; sequential for tasks with dependencies or shared files

**Human-in-the-Loop**:
- Permission prompts before terminal commands and file writes by default
- `/rewind` command for checkpoint rollback
- `--dangerously-skip-permissions` for autonomous mode
- All file edits shown as diffs for review

**Statistics (Q1 2026)**:
- 78% of Claude Code sessions involve multi-file edits (up from 34% in Q1 2025)
- Average session length: 23 minutes (up from 4 minutes in Q1 2025)
- Average of 21.2 independent tool calls per session without human intervention (116% increase in autonomy over 6 months)

---

### 4. OpenAI Operator (CUA)

**Architecture**: Iterative perception-reasoning-action loop powered by the Computer-Using Agent (CUA) model (GPT-4o vision + o3 reasoning + reinforcement learning).

**Core Loop**:
1. **Perception**: Screenshot of browser added to context
2. **Reasoning**: o3 chain-of-thought ("private chain of thought") evaluates observations, tracks intermediate steps, plans next actions, adapts dynamically
3. **Action**: Structured GUI actions (clicks with x/y coordinates, scrolling, typing) executed in cloud-based virtual browser on OpenAI's servers

Loop repeats until model determines task is complete or user input is needed.

**Three implementation modes** for developers using the API:
1. **Built-in computer use loop** — model returns structured UI actions
2. **Custom tool/harness** — integrates with Playwright, Selenium, VNC, or MCP-based harnesses
3. **Code-execution harness** — model writes and runs scripts, mixing visual and programmatic interaction

**Error Recovery**:
- Visual state verification: after each action, new screenshot analyzed; if state doesn't match expectations, model reasons about what went wrong and adjusts
- Secondary safety model runs in parallel, monitoring screenshots and halting execution if problematic content detected
- Automated detection pipelines identify suspicious access patterns, rapidly added to monitoring system
- Model considers both current and past screenshots for temporal context to detect unexpected environment changes

**Human-in-the-Loop — Risk-Proportional Safeguards**:
- Low-risk actions: standard monitoring, proceed automatically
- Medium-risk: human confirmation at key steps
- High-risk (e.g., stock trading): fully restricted
- **Specific confirmation triggers**: financial transactions (summary + explicit approval), emails (draft content + recipient verification), calendar/data modification (confirmation required)
- **Takeover mode**: on password/credit card fields, agent blacks out its vision and hands control to user. During takeover, Operator does not collect or screenshot information entered.
- Safety checks pause before certain form submissions

---

### 5. Anthropic Computer Use

**Architecture**: Full desktop interaction (not browser-only) via screenshot-based visual understanding + tool calls. Claude can interact with any desktop application, terminal commands, file systems, and complex software suites.

**Core Loop**: Screenshot → analyze pixels → identify fields/buttons/UI elements → calculate coordinate targets → execute action (clicks, typing, scrolling, key holds, triple-clicks, waits) → capture new screenshot → evaluate success → repeat.

**Planning**: Extended thinking with adaptive compute budget. Claude can toggle between near-instant answers and in-depth step-by-step reasoning within a single system, choosing how much thinking to apply based on task complexity. "Zoom" capability for high-resolution crops of specific screen regions (dense spreadsheets, fine print).

Supported actions: `left_click`, `right_click`, `double_click`, `triple_click`, `middle_click`, `scroll`, `type`, `key`, `hold_key`, `left_mouse_down`, `left_mouse_up`, `wait`, `screenshot`, `cursor_position`.

**Error Recovery**:
- Visual state verification after each action
- Recommended prompt pattern: "After each step, take a screenshot and carefully evaluate if you have achieved the right outcome. Explicitly show your thinking: 'I have evaluated step X...'. If not correct, try again."
- Generate-review-refine chaining: generate draft action → review against criteria → refine based on review (each step as separate API call)
- Tool result error handling: clear error messages in `tool_result` with `is_error: true`
- Example-based guidance: include example screenshots and tool calls of successful outcomes in prompt

**Claude Cowork** (announced January 12, 2026):
- Tasks execute inside a sandboxed Linux virtual machine (Apple VZVirtualMachine/AVF framework on macOS)
- Additional isolation via bubblewrap + seccomp inside the VM
- Decomposes complex tasks into subtasks, shows the plan, works through step by step
- Can spawn sub-agents (independent Claude instances with own context) for parallel work
- Master Agent Loop pattern: plan-act-feedback-correct
- Standardizes tool/data source access via MCP protocol

**Human-in-the-Loop**:
- Confirmation for significant actions (file deletion, email sending)
- "Points of No Return" require model to present plan and restate impact scope before critical actions
- Explicit "Allow" prompts before deletion or irreversible tasks
- Classifiers identify and mitigate potentially harmful actions
- VM sandbox limits blast radius independently of model behavior
- Anthropic notes API-level safety mechanisms designed for human-in-the-loop use cases; may not be ideal for fully autonomous scenarios

---

### 6. Google Project Mariner

**Architecture**: Observe-Plan-Act cognitive loop built on Gemini 2.0 (later Gemini 2.5 Computer Use model).

**Core Loop**:
- **Observe**: capture browser state — visual elements (pixels), text, code, images, forms
- **Plan**: analyze captured data, formulate sequence of actions
- **Act**: simulate user interactions (clicks, typing, scrolling, navigation)

Leverages Gemini's up-to-2M token context window for multi-step tasks spanning multiple websites.

**Architecture evolution** (2025-2026):
- Cloud-based operation: tasks run on VMs in the cloud, enabling up to 10 parallel task streams
- Teach & Repeat: users demonstrate workflow via screen recording with narration; Mariner extracts action list and repeats on similar sites
- Gemini 2.5 Computer Use model (October 2025): specialized model built on Gemini 2.5 Pro visual understanding

**Benchmarks**: WebVoyager: 83.5% (state-of-the-art at announcement as single-agent; subsequently surpassed by Browserable at 90.4% and Magnitude at 94%).

**Error Recovery**: Weakest of the surveyed systems:
- No robust automated recovery
- Frequently enters loops of repeated actions (repeatedly asking for confirmation or retrying same action without progress)
- Primary recovery path is user pausing and retrying
- CAPTCHAs, anti-automation measures, and minor interface changes confuse the agent
- Per-step safety assessment before execution (safety-focused, not error-recovery-focused)

**Human-in-the-Loop**:
- Hard-coded pauses before financial transactions, ToS acceptance, purchases (agent fills cart, requires human to finalize)
- Pause/resume/cancel via UI buttons at any time
- Input requests when agent needs information it can't determine (pauses, waits, auto-resumes)
- Google notes safety features "may not always function as anticipated"

**Published architecture**: No formal arXiv paper. Details from blog posts and API documentation only.

---

### 7. Adept AI (ACT-1/ACT-2/Fuyu)

**Context**: In June 2024, Amazon hired Adept's co-founders (CEO David Luan and others) and licensed its technology. Adept continues independently with roughly a third of its staff, focused on enterprise workflow automation. Amazon formed AGI SF Lab led by David Luan.

**Architecture**: Two-layer system combining deterministic workflow scaffolding (AWL) with dynamic AI reasoning (act() loop).

**Adept Workflow Language (AWL)**: Syntactic subset of JavaScript ES6 for composing multimodal web interactions.
- `click("element")`: locate elements on screen, generate function calls to interact
- `act("natural language instruction")`: invoke the agent reasoning loop — the core planning primitive

**The `act()` Reasoning Loop**:
- Takes a high-level natural language instruction
- Creates a dynamic plan at inference time
- Executes step-by-step, with agent reflecting on its last action, observing current screen state, confirming next step
- Plan is NOT pre-computed; dynamically assessed at each step based on outcomes of previous steps
- AWL provides deterministic scaffolding ("on rails") while `act()` handles dynamic, unstructured portions
- Deployed workflows with up to dozens of steps in mission-critical production environments

**Model Family**:
- **ACT-1** (2022): original model, Chrome extension, custom viewport rendering for cross-site generalization
- **ACT-2**: fine-tuned from Fuyu family, optimized for UI understanding + knowledge worker tasks
- **Fuyu-8B** (open-sourced October 2023): vanilla decoder-only transformer, no image encoder, image patches linearly projected into first layer, supports arbitrary image resolutions, response time under 100ms for large images
- **Fuyu-Heavy** (January 2024): ranked third globally on MMMU benchmark (behind only GPT-4V and Gemini Ultra, which are 10-20x larger)

**Error Recovery**: Agent described as "resilient to changes in execution environment, successfully carrying on despite variations." Dynamic assessment at each step provides implicit replanning. AWL deterministic scaffolding constrains agent to valid workflow paths. No published documentation of explicit retry limits, rollback mechanisms, or error classification.

**Human-in-the-Loop**:
- Step-by-step approval when creating/testing workflows
- Auto-run with full visibility in production mode (all actions visible)
- Final approval gates before critical actions (form submissions, emails)
- Information prompts when agent needs data rather than guessing
- Enterprise deployment designed for human-in-the-loop supervision

**Published architecture**: No formal arXiv papers for ACT-1, ACT-2, or Fuyu models. All technical information from blog posts. Fuyu-8B available on HuggingFace.

---

### 8. Foundational Academic Patterns

#### ReAct (Reason + Act) — Yao et al. 2022

Interleaves reasoning traces and task-specific actions in a loop: Thought → Action → Observation → repeat until final answer. The model generates a natural-language "thought" (reasoning about what to do next), selects an "action" (tool call/API request), observes the result, then reasons again.

**Strengths**:
- Interpretable: every step has explicit reasoning trace, making decision process auditable
- Dynamic adaptation: re-evaluates after each observation
- Grounding: actions retrieve real information, reducing hallucination vs pure chain-of-thought
- On HotpotQA (multi-hop QA), ReAct outperformed chain-of-thought alone by significant margin

**Weaknesses for multi-step execution**:
- Sequential bottleneck: every step requires full LLM call, making long chains slow and expensive
- No parallelism: independent sub-tasks can't run concurrently
- Context window pressure: thought-action-observation history grows, pushing out earlier context
- No explicit plan: model decides each next step myopically without global view, leading to inefficient exploration or loops
- Cumulative error: each step's errors compound with no built-in backtracking

**Production adaptations (2025-2026)**:
- REBACT (Zeng et al., 2025): 98.51% success in ALFWorld by reducing cumulative errors and call overhead
- Focused ReAct: improves sample efficiency by up to 530%, reduces runtime by 34%
- Most production frameworks use ReAct as the inner execution loop within larger orchestration patterns, not as sole architecture

**Key paper**: Yao, S. et al. (2022). "ReAct: Synergizing Reasoning and Acting in Language Models." arXiv:2210.03629. ICLR 2023.

#### Plan-and-Execute — Wang et al. 2023

Separates planning from execution into two distinct phases:
1. **Planning phase**: "planner" LLM decomposes high-level goal into structured list (or DAG) of sub-tasks
2. **Execution phase**: "executor" agent carries out each sub-task sequentially or in parallel, often using lighter-weight LLM or specialized tools
3. **Replanning phase**: after each step (or upon failure), "replanner" evaluates accumulated results (`past_steps`) and either refines remaining plan or produces final output

**Advantages over pure ReAct**: Faster and cheaper (expensive planner runs once, cheap executor handles individual steps). Explicit inspectable/modifiable plan. Replanning prevents brittleness.

**LangGraph implementation**: `StateGraph` with three nodes: `planner` (entry point, generates initial task list) → `agent` (executes one task with tool access) → `replan` (evaluates past steps, decides whether to continue or end). Conditional edge from `replan` routes back to `agent` or to `END`.

**Replanning triggers**:
1. Step fails after exhausting retries
2. Step output contradicts assumptions made during planning
3. Accumulated model error exceeds confidence threshold
4. External conditions change (new information invalidates part of plan)
5. Human reviewer requests modification

**Replanning approaches**:
- **Full replan**: re-generate entire remaining plan given new information (simple but expensive)
- **Incremental replan**: only affected sub-graph replanned (more efficient, requires dependency tracking)
- **Reflection-based replan**: agent reflects on why failure occurred (Reflexion pattern), generates targeted fix (most token-efficient)

**Key paper**: Wang, L. et al. (2023). "Plan-and-Solve Prompting: Improving Zero-Shot Chain-of-Thought Reasoning by Large Language Models." arXiv:2305.04091. ACL 2023.

#### Tree-of-Thought (ToT) — Yao et al. 2023

Generalizes chain-of-thought into a tree structure:
1. At each reasoning step, generate multiple candidate "thoughts" (intermediate reasoning steps)
2. Evaluate each via scoring/voting mechanism (by LLM itself or external evaluator)
3. Search algorithm (BFS or DFS) explores tree, pruning low-scoring branches, expanding promising ones
4. Backtracking: if a branch leads to dead end, retreat to earlier node and try alternative

**Application to execution**: Useful at decision points ("which tool to call?", "which sub-task first?"). Lookahead: simulate future steps on each branch before choosing. Well-suited for problems with clear win/lose states (puzzles, code generation, mathematical proofs).

**Limitations**: Expensive — each branch requires multiple LLM calls for generation and evaluation. Latency scales with tree depth x breadth. Less applicable to irreversible real-world actions (can't "undo" sending an email to explore alternative). Primarily suited for reasoning tasks, not physical execution.

**Recent developments (2024-2025)**: Replacing rule-based branching/evaluation with supervised or RL-optimized policies. Cost-efficient search through early stopping and hierarchical methods. Integration with Monte Carlo Tree Search (see LATS).

**Key paper**: Yao, S. et al. (2023). "Tree of Thoughts: Deliberate Problem Solving with Large Language Models." arXiv:2305.10601. NeurIPS 2023.

#### LLMCompiler — Kim et al. 2024

DAG-based parallel function calling:
1. Function Calling Planner generates a DAG of tasks with inter-dependencies
2. Task Fetching Unit dispatches tasks to an Executor in parallel based on dependency resolution
3. Results: **3.7x latency speedup, 6.7x cost savings**, ~9% accuracy improvement over ReAct

**Key paper**: Kim, S. et al. (2024). "An LLM Compiler for Parallel Function Calling." arXiv:2312.04511. ICML 2024.

#### LATS (Language Agent Tree Search) — Zhou et al. 2024

Unifies reasoning, acting, and planning via Monte Carlo Tree Search. 92.7% on HumanEval. Combines value function estimation with tree exploration.

**Key paper**: Zhou, A. et al. (2024). "Language Agent Tree Search Unifies Reasoning, Acting, and Planning in Language Models." arXiv:2310.04406. ICML 2024.

#### Reflexion — Shinn et al. 2023

Self-reflection loop: agent attempts task → evaluates own performance → generates verbal "reflection" → retries with reflection as additional context. 91% pass@1 on HumanEval.

**Key paper**: Shinn, N. et al. (2023). "Reflexion: Language Agents with Verbal Reinforcement Learning." arXiv:2303.11366. NeurIPS 2023.

---

### 9. Production Framework Architectures

#### LangGraph

Models agent workflows as **directed graphs**:
- **Nodes**: processing steps (LLM calls, tool executions, human review points)
- **Edges**: transitions between steps
- **Conditional edges**: branching based on node output — function evaluates upstream output, determines which node executes next
- **Cycles**: explicitly supported, enabling retry loops, iterative refinement, ReAct-style patterns within the graph
- **State**: typed object (TypedDict/Pydantic) flowing through graph, accumulating results

**Checkpointing**: Persists state at every node transition using configurable backends:
- `MemorySaver` (in-memory, for development)
- `SqliteSaver` (local persistence)
- `PostgresSaver` (production-grade)

If workflow fails at step 7 of 10, it resumes from step 7 rather than restarting.

**Human-in-the-Loop**:
- `interrupt_before` / `interrupt_after`: annotations on nodes that pause execution before or after a specific node
- `interrupt()` function: callable within any node to pause mid-execution
- State serialized → notification sent (webhook) → waits for approval/rejection/modification (hours/days) → resumes seamlessly
- Combined with PostgreSQL checkpointing in production

**Error recovery**: Nodes fail gracefully by updating state with error information. Conditional edges route to recovery paths. Automatic crash recovery: agents survive process restarts and resume from last checkpoint.

**Production adoption**: LinkedIn AI recruiter, Uber code testing, Klarna AI assistant (85M users, 80% reduction in resolution time).

#### CrewAI

Role-based agent organization into "crews" with defined roles, goals, and backstories:
- **Sequential**: tasks in order, each agent works autonomously; output of one feeds into next
- **Hierarchical**: manager agent coordinates, delegating based on capabilities; can override decisions and redistribute work
- **Parallel**: `async_execution=True` for concurrent tasks
- **Delegation**: agents with `allow_delegation=True` can delegate sub-tasks to other crew members
- **CrewAI Flows** (2025-2026): production-ready, event-driven workflows with fine-grained control over execution paths, conditional branching, error handling

Estimated to power ~70% of AI-native business workflows by January 2026 due to simplicity and role-based abstraction.

#### AutoGen / AG2

Conversation-centric multi-agent coordination (formerly Microsoft AutoGen):
- **ConversableAgent**: fundamental building block — generic agent exchanging messages; all agents inherit from this
- **GroupChat**: multiple agents in shared conversation thread; `GroupChatManager` selects who speaks next (round-robin, random, or LLM-selected based on context)
- AG2 v0.4+: event-driven core, async-first execution, pluggable orchestration strategies
- **HumanProxyAgent**: configurable agent injecting human responses at any point
- Coordination model: message-passing rather than task assignment; natural for collaborative reasoning, harder to enforce strict execution order

**Key paper**: Wu, Q. et al. (2023). "AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation." arXiv:2308.08155.

#### Temporal

Durable execution for long-running workflows:
- Separates deterministic orchestration (workflow code) from non-deterministic execution (activity functions / LLM calls)
- Event-sourced, fully replayable state
- Signal-based human interaction within durable workflows
- OpenAI Agents SDK integration (2025)
- Agents survive crashes, deployments, and multi-day workflows

#### Other Notable Frameworks

- **OpenAI Agents SDK**: replaced deprecated Assistants API (shutting down August 2026). Client-side orchestration model. Integrates with Temporal for durable execution.
- **Google Agent Development Kit (ADK)**: multi-agent patterns with sequential, parallel, and loop orchestration.
- **Anthropic tool use architecture**: computer use, programmatic tool calling, Model Context Protocol (MCP) for standardized tool integration.

---

### 10. Cross-System Comparison

| Dimension | Devin | Cursor Agent | Claude Code | OpenAI Operator | Anthropic CU | Mariner | Adept |
|---|---|---|---|---|---|---|---|
| **Core loop** | Plan-then-ReAct | 6-phase ReAct | Pure ReAct | Perception-Reasoning-Action | Screenshot-Action | Observe-Plan-Act | AWL + act() |
| **Explicit plan phase** | Yes (30s approval) | Yes (Plan Mode) | No (model decides) | No (implicit) | Yes (Cowork) | No (implicit) | Yes (AWL scaffolding) |
| **Error recovery** | Auto-iterate + Review | Auto-iterate + loop detection | Error-as-tool-result | Visual state diff + monitor model | Visual verify + self-correct | Weak (user intervention) | Inference-time adaptation |
| **Re-planning** | Dynamic (v3.0) | Self-critique phase | Model-driven | o3 reasoning | Extended thinking | Limited | Dynamic per-step |
| **Parallelism** | Multi-VM instances | Subagents + worktrees (8) | Task tool (10) + Agent Teams | Single loop | Sub-agents (Cowork) | Up to 10 concurrent | Not documented |
| **HITL gates** | Plan + PR checkpoints | Checkpoints + diff + approval | Permission prompts + /rewind | Risk-tiered + takeover | Confirmation + VM sandbox | Pause/resume + purchase gates | Step approval + final gates |
| **Rollback** | Checkpoint restore | Git checkpoints | /rewind | Not documented | VM isolation | Not documented | Not documented |
| **Scope** | Full dev environment | IDE/codebase | Terminal/codebase | Browser only (cloud) | Full desktop | Browser only | Browser/web apps |

---

### 11. Key Design Decisions for Production Plan Execution Engines

#### Plan Representation: DAGs vs Linear Sequences

**Linear sequences**: simpler to implement and debug, cannot express parallelism or complex dependencies. Most early implementations (BabyAGI, basic plan-and-execute) use ordered task lists. Appropriate only when steps are genuinely sequential.

**DAGs (Directed Acyclic Graphs)**: production standard. Each node represents a step; edges represent dependencies. Independent steps execute in parallel. LLMCompiler formalized this approach, achieving 3.7x latency speedup, 6.7x cost savings, and ~9% accuracy improvement over ReAct. LangGraph natively supports DAG-structured and cyclic graphs with conditional edges.

#### Step Dependency Management

- **Placeholder variables**: steps reference outputs of upstream steps via placeholders (e.g., `$step_3_result`). When a step completes, its output replaces placeholders in downstream steps before they execute.
- **Explicit dependency declaration**: each step declares its dependencies by step ID. Orchestrator uses topological sorting to determine execution order.
- **Dynamic dependencies**: some systems allow steps to declare dependencies at runtime based on intermediate results, enabling adaptive plan execution.

#### Failure Detection and Retry Strategies

Production patterns identified across frameworks:
- **Per-step retry with exponential backoff**: each tool call or LLM invocation has configurable retry count and backoff. Idempotent steps safely retried.
- **Idempotency tokens**: every inter-component message carries unique fingerprint to prevent duplicate side effects on retry.
- **Error classification**: distinguish transient errors (network timeout — retry), permanent errors (invalid input — replan), catastrophic errors (API removed — escalate to human).
- **Graceful failure propagation**: failed nodes update state with error information; conditional edges route to recovery paths rather than crashing entire workflow.
- **Circuit breakers**: after N consecutive failures of same type, halt execution and escalate rather than burning through retries.

#### Re-planning Triggers and Approaches

**Triggers**:
1. Step fails after exhausting retries
2. Step output contradicts assumptions made during planning
3. Accumulated model error exceeds confidence threshold
4. External conditions change (new information invalidates part of plan)
5. Human reviewer requests modification

**Approaches**:
- **Full replan**: re-generate entire remaining plan given new information (simple but expensive)
- **Incremental replan**: only affected sub-graph replanned (more efficient, requires dependency tracking)
- **Reflection-based replan**: agent reflects on why failure occurred (Reflexion pattern), generates targeted fix (most token-efficient)

#### Human Approval Gates Mid-Execution

Production-ready HITL patterns:
- **Checkpoint-based interrupts**: workflow persists state to durable store (PostgreSQL), pauses, notifies approver via webhook/email/Slack, releases all compute resources. On approval, resumes from checkpoint. Can wait hours or days.
- **Policy-driven gates**: rules define which actions require approval (e.g., "any external API call costing > $X", "any action affecting customer data"). Agent evaluates policies pre-execution, pauses only when required.
- **Tiered approval**: different actions require different approval levels (team lead vs VP), similar to trust gradient (Observe → Propose → Act).
- **Modification on resume**: approvers can not only approve/reject but also modify the proposed action or inject alternative instructions before resuming.

Key frameworks: LangGraph (`interrupt_before`/`interrupt()` + PostgresSaver), CrewAI (human agent role), Temporal (signal-based human interaction within durable workflows), HumanLayer SDK.

#### State Management Between Steps

- **Typed state objects**: LangGraph uses TypedDict or Pydantic models as state schema, ensuring type safety across steps.
- **Append-only state**: some implementations use append-only patterns (each step adds to state rather than modifying), providing full audit trail.
- **Serialization**: all state must be JSON-serializable for persistence and recovery. Schema-constrained packets with version identifiers enable backward compatibility.
- **Scoped state**: in multi-agent systems, each agent may have private state plus shared state visible to all.
- **Temporal's approach**: separates deterministic orchestration (workflow code) from non-deterministic execution (activity functions/LLM calls). Workflow state is event-sourced and fully replayable.

#### Rollback Capabilities

The hardest problem in agentic execution:

- **Reversible actions**: for actions within your system (database writes, file changes), maintain undo stack or use event-sourcing to reconstruct prior states.
- **Compensation patterns (Saga)**: for distributed/external actions (API calls, emails sent), define compensation actions (e.g., "if hotel booking fails after flight booking succeeded, cancel the flight"). Borrowed from microservices saga patterns.
- **Snapshot-based rollback**: Rubrik Agent Rewind (released August 2025) creates immutable snapshots before each agent action, enabling rollback of file, database, configuration, and code changes.
- **Irreversible actions**: some actions (bank transfers, sent emails, published content) cannot be undone. Production systems must identify these and gate behind human approval.
- **Simulate before actuate**: run actions in sandbox first, commit only after verification.
- **Buffer pattern**: secondary agent collects new records into temporary buffer; human reviews and "commits" or "discards" before changes take effect.

---

### 12. Emerging Architectural Consensus

The field is converging on 8 principles:

1. **Separate planning from execution** — use an expensive model for planning and replanning, a cheaper model (or deterministic code) for execution.
2. **DAGs over linear sequences** — represent plans as dependency graphs to enable parallelism and explicit dependency tracking.
3. **Durable state with checkpointing** — persist state at every step transition (PostgreSQL or equivalent) to enable crash recovery, long-running workflows, and human approval gates.
4. **Policy-driven HITL gates** — define rules for which actions require human approval based on risk/cost/reversibility, rather than interrupting on every action.
5. **Idempotent steps with compensation** — design every action to be safely retryable; for irreversible external actions, define compensation logic (saga pattern).
6. **Layered error handling** — classify errors (transient/permanent/catastrophic) and handle each differently (retry/replan/escalate).
7. **Deterministic orchestration, non-deterministic reasoning** — use state machines or graph frameworks for control flow; confine LLM non-determinism to reasoning and planning nodes.
8. **Observability as a first-class concern** — log every reasoning trace, tool call, input/output, and state transition for audit and debugging.

---

### 13. Industry Statistics and Market Data

- Gartner prediction: 40% of enterprise applications will feature task-specific AI agents by end of 2026 (up from <5% in 2025); a third of agentic deployments will be multi-agent by 2027.
- CrewAI estimated to power ~70% of AI-native business workflows by January 2026.
- Klarna AI assistant (LangGraph-powered): 85M users, 80% reduction in resolution time.
- OpenAI Assistants API deprecated, shutting down August 2026; replaced by Responses API + Agents SDK.
- Claude Code Q1 2026: 78% of sessions involve multi-file edits (vs 34% Q1 2025); average session 23 minutes (vs 4 minutes Q1 2025); 21.2 independent tool calls per session (116% increase).
- Devin 2025 Performance Review: 4x faster completion, 67% PR merge rate.
- Devin 2.0: 83% more tasks per ACU than Devin 1.x.
- SWE-bench: 72% of Devin's passing tests take >10 minutes.
- Mariner WebVoyager benchmark: 83.5% (surpassed by Browserable at 90.4%, Magnitude at 94%).
- Fuyu-Heavy: ranked 3rd globally on MMMU (behind GPT-4V and Gemini Ultra, which are 10-20x larger).
- REBACT: 98.51% success in ALFWorld.
- Focused ReAct: up to 530% sample efficiency improvement, 34% runtime reduction.
- LLMCompiler: 3.7x latency speedup, 6.7x cost savings over ReAct.
- LATS: 92.7% on HumanEval.
- Reflexion: 91% pass@1 on HumanEval.

## Sources

### Foundational Papers

- Yao, S. et al. (2022). "ReAct: Synergizing Reasoning and Acting in Language Models." [arXiv:2210.03629](https://arxiv.org/abs/2210.03629). ICLR 2023.
- Wang, L. et al. (2023). "Plan-and-Solve Prompting." [arXiv:2305.04091](https://arxiv.org/abs/2305.04091). ACL 2023.
- Yao, S. et al. (2023). "Tree of Thoughts: Deliberate Problem Solving with Large Language Models." [arXiv:2305.10601](https://arxiv.org/abs/2305.10601). NeurIPS 2023.
- Shinn, N. et al. (2023). "Reflexion: Language Agents with Verbal Reinforcement Learning." [arXiv:2303.11366](https://arxiv.org/abs/2303.11366). NeurIPS 2023.
- Wu, Q. et al. (2023). "AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation." [arXiv:2308.08155](https://arxiv.org/abs/2308.08155).
- Kim, S. et al. (2024). "An LLM Compiler for Parallel Function Calling." [arXiv:2312.04511](https://arxiv.org/abs/2312.04511). ICML 2024.
- Zhou, A. et al. (2024). "Language Agent Tree Search Unifies Reasoning, Acting, and Planning." [arXiv:2310.04406](https://arxiv.org/abs/2310.04406). ICML 2024.

### 2025-2026 Surveys & Papers

- "A Practical Guide for Production-Grade Agentic AI Workflows." [arXiv:2512.08769](https://arxiv.org/abs/2512.08769). Dec 2025.
- "Agentic AI: Comprehensive Survey of Architectures, Applications, and Future Directions." [arXiv:2510.25445](https://arxiv.org/abs/2510.25445). Oct 2025 (Springer).
- "Agentic Reasoning for Large Language Models." [arXiv:2601.12538](https://arxiv.org/abs/2601.12538). Jan 2026.
- Bui, N. (2026). "Building Effective AI Coding Agents for the Terminal." [arXiv:2603.05344](https://arxiv.org/abs/2603.05344). Mar 2026.
- "PlanGenLLMs: Survey of LLM Planning Capabilities." [arXiv:2502.11221](https://arxiv.org/html/2502.11221v1). Feb 2025.
- "AI Agentic Programming: A Survey." [arXiv:2508.11126](https://arxiv.org/html/2508.11126v1). Aug 2025.
- "Evaluation and Benchmarking of LLM Agents: A Survey." [arXiv:2507.21504](https://arxiv.org/html/2507.21504v1). Jul 2025.
- "Survey on Evaluation of LLM-based Agents." [arXiv:2503.16416](https://arxiv.org/abs/2503.16416). Mar 2025.
- "Agentic AI: Architectures, Taxonomies, and Evaluation." [arXiv:2601.12560](https://arxiv.org/html/2601.12560v1). Jan 2026.
- "Deep Research: A Survey of Autonomous Research Agents." [arXiv:2508.12752](https://arxiv.org/html/2508.12752v1). Aug 2025.

### Devin (Cognition AI)

- [Introducing Devin](https://cognition.ai/blog/introducing-devin)
- [Devin 2.0](https://cognition.ai/blog/devin-2)
- [Introducing Devin 2.2](https://cognition.ai/blog/introducing-devin-2-2)
- [Devin's 2025 Performance Review](https://cognition.ai/blog/devin-annual-performance-review-2025)
- [How Cognition Uses Devin to Build Devin](https://cognition.ai/blog/how-cognition-uses-devin-to-build-devin)
- [Devin Review: AI to Stop Slop](https://cognition.ai/blog/devin-review)
- [SWE-bench Technical Report](https://cognition.ai/blog/swe-bench-technical-report)
- [Coding Agents 101](https://devin.ai/agents101)
- [Interactive Planning docs](https://docs.devin.ai/work-with-devin/interactive-planning)
- [MCP Marketplace docs](https://docs.devin.ai/work-with-devin/mcp)
- [Instructing Devin Effectively](https://docs.devin.ai/essential-guidelines/instructing-devin-effectively)
- [Session Tools docs](https://docs.devin.ai/work-with-devin/devin-session-tools)
- [Answer.AI — "Thoughts on a Month with Devin"](https://www.answer.ai/posts/2025-01-08-devin.html)
- [swyx — "Cognition: The Devin is in the Details"](https://www.swyx.io/cognition)
- [Agent-Native Development: A Deep Dive into Devin 2.0's Technical Design](https://medium.com/@takafumi.endo/agent-native-development-a-deep-dive-into-devin-2-0s-technical-design-3451587d23c0)
- [Contrary Research — Cognition Business Breakdown](https://research.contrary.com/company/cognition)
- [SWE-bench results repository (GitHub)](https://github.com/CognitionAI/devin-swebench-results)

### Cursor Agent (Anysphere)

- [Cursor Agent Mode docs](https://docs.cursor.com/chat/agent)
- [Cursor Plan Mode docs](https://cursor.com/docs/agent/plan-mode)
- [Best practices for coding with agents](https://cursor.com/blog/agent-best-practices)
- [Composer: Building a fast frontier model with RL](https://cursor.com/blog/composer)
- [Subagents docs](https://cursor.com/docs/subagents)
- [Parallel Agents / Worktrees docs](https://cursor.com/docs/configuration/worktrees)
- [Improving Cursor's agent for OpenAI Codex models](https://cursor.com/blog/codex-model-harness)
- [Designing high-performance agentic systems (architectural case study)](https://medium.com/@khayyam.h/designing-high-performance-agentic-systems-an-architectural-case-study-of-the-cursor-agent-ab624e4a0a64)
- [Cursor 2.0: Agent-First Architecture Complete Guide](https://www.digitalapplied.com/blog/cursor-2-0-agent-first-architecture-guide)
- [Cursor 2.0 Revolutionizes AI Coding with Multi-Agent Architecture](https://www.artezio.com/pressroom/blog/revolutionizes-architecture-proprietary/)
- [Real-world engineering challenges: building Cursor (Pragmatic Engineer)](https://newsletter.pragmaticengineer.com/p/cursor)
- [Cursor Changelog 2026](https://blog.promptlayer.com/cursor-changelog-whats-coming-next-in-2026/)

### Claude Code (Anthropic)

- [How Claude Code works](https://code.claude.com/docs/en/how-claude-code-works)
- [How the agent loop works (Claude Agent SDK)](https://platform.claude.com/docs/en/agent-sdk/agent-loop)
- [Claude Agent SDK overview](https://platform.claude.com/docs/en/agent-sdk/overview)
- [Building agents with the Claude Agent SDK](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk)
- [Claude Code best practices](https://code.claude.com/docs/en/best-practices)
- [Claude Code subagents docs](https://code.claude.com/docs/en/sub-agents)
- [Advanced tool use (Anthropic engineering)](https://www.anthropic.com/engineering/advanced-tool-use)
- [Tracing Claude Code's LLM Traffic (Medium)](https://medium.com/@georgesung/tracing-claude-codes-llm-traffic-agentic-loop-sub-agents-tool-use-prompts-7796941806f5)
- [Claude Code: Behind-the-scenes of the master agent loop](https://blog.promptlayer.com/claude-code-behind-the-scenes-of-the-master-agent-loop/)
- [Context engineering strategies for agents](https://newsletter.victordibia.com/p/context-engineering-101-how-agents)
- [2026 Agentic Coding Trends Report (Anthropic)](https://resources.anthropic.com/hubfs/2026%20Agentic%20Coding%20Trends%20Report.pdf)
- [Task Tool vs. Subagents in Claude Code](https://www.ibuildwith.ai/blog/task-tool-vs-subagents-how-agents-work-in-claude-code/)

### OpenAI Operator

- [Introducing Operator](https://openai.com/index/introducing-operator/)
- [Computer-Using Agent](https://openai.com/index/computer-using-agent/)
- [Operator System Card (PDF)](https://cdn.openai.com/operator_system_card.pdf)
- [o3 Operator System Card Addendum](https://openai.com/index/o3-o4-mini-system-card-addendum-operator-o3/)
- [Computer Use API docs](https://developers.openai.com/api/docs/guides/tools-computer-use)
- [CUA Sample App (GitHub)](https://github.com/openai/openai-cua-sample-app)
- [From Model to Agent: Equipping the Responses API](https://openai.com/index/equip-responses-api-computer-environment/)
- [OpenAI upgrades Operator with o3 (TechCrunch)](https://techcrunch.com/2025/05/23/openai-upgrades-the-ai-model-powering-its-operator-agent/)
- [Human-in-the-Loop (OpenAI Agents SDK)](https://openai.github.io/openai-agents-js/guides/human-in-the-loop/)

### Anthropic Computer Use

- [Computer Use Tool docs](https://docs.anthropic.com/en/docs/agents-and-tools/computer-use)
- [Computer Use Tool (platform docs)](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool)
- [Extended Thinking announcement](https://www.anthropic.com/news/visible-extended-thinking)
- [Building with Extended Thinking](https://platform.claude.com/docs/en/build-with-claude/extended-thinking)
- [Claude Think Tool](https://www.anthropic.com/engineering/claude-think-tool)
- [How We Built Our Multi-Agent Research System](https://www.anthropic.com/engineering/multi-agent-research-system)
- [Anthropic Computer Use vs OpenAI CUA (WorkOS)](https://workos.com/blog/anthropics-computer-use-versus-openais-computer-using-agent-cua)
- [Best Web Agents Comparison (Helicone)](https://www.helicone.ai/blog/browser-use-vs-computer-use-vs-operator)
- [Claude Cowork Architecture Deep Dive](https://claudecn.com/en/blog/claude-cowork-architecture/)
- [Claude Cowork Architecture Overview (TensorLake)](https://www.tensorlake.ai/blog-posts/claude-cowork-architecture-overview)
- [Cowork Security Architecture](https://claudecn.com/en/blog/claude-cowork-security-architecture/)

### Google Project Mariner

- [Project Mariner — Google DeepMind](https://deepmind.google/models/project-mariner/)
- [Project Mariner — Google DeepMind Technologies](https://deepmind.google/technologies/project-mariner/)
- [Introducing the Gemini 2.5 Computer Use model](https://blog.google/technology/google-deepmind/gemini-computer-use-model/)
- [Google I/O 2025: Gemini as a universal AI assistant](https://blog.google/innovation-and-ai/models-and-research/google-deepmind/gemini-universal-ai-assistant/)
- [Google introduces Gemini 2.0](https://blog.google/technology/google-deepmind/google-gemini-ai-update-december-2024/)
- [Computer Use API docs](https://ai.google.dev/gemini-api/docs/computer-use)
- [Project Mariner Guide (DataCamp)](https://www.datacamp.com/tutorial/project-mariner)
- [Google Project Mariner (AllAboutAI)](https://www.allaboutai.com/ai-agents/project-mariner/)
- [Google rolls out Project Mariner (TechCrunch)](https://techcrunch.com/2025/05/20/google-rolls-out-project-mariner-its-web-browsing-ai-agent/)
- [Google unveils Project Mariner (TechCrunch, Dec 2024)](https://techcrunch.com/2024/12/11/google-unveils-project-mariner-ai-agents-to-use-the-web-for-you/)
- [Gemini 2.5 Computer Use Guide (DataCamp)](https://www.datacamp.com/tutorial/gemini-2-5-computer-use-guide)
- [How to use Project Mariner (Google Labs)](https://support.google.com/labs/answer/16270604?hl=en)

### Adept AI

- [ACT-1: Transformer for Actions](https://www.adept.ai/blog/act-1/)
- [Building Powerful Agents with Adept](https://www.adept.ai/blog/adept-agents/)
- [Fuyu-8B: A Multimodal Architecture for AI Agents](https://www.adept.ai/blog/fuyu-8b/)
- [Adept Fuyu-Heavy: A new multimodal model](https://www.adept.ai/blog/adept-fuyu-heavy/)
- [Introducing Adept Experiments](https://www.adept.ai/blog/experiments/)
- [An update from Adept](https://www.adept.ai/blog/adept-update/)
- [Fuyu-8B on HuggingFace](https://huggingface.co/adept/fuyu-8b)
- [Amazon hires founders from Adept (TechCrunch)](https://techcrunch.com/2024/06/28/amazon-hires-founders-away-from-ai-startup-adept/)

### Framework Documentation

- [LangGraph GitHub](https://github.com/langchain-ai/langgraph)
- [LangGraph: Build Stateful Multi-Agent Systems (March 2026)](https://www.mager.co/blog/2026-03-12-langgraph-deep-dive/)
- [LangGraph Human-in-the-Loop docs](https://docs.langchain.com/oss/python/langchain/human-in-the-loop)
- [LangGraph Plan-and-Execute Tutorial](https://blog.langchain.com/planning-agents/)
- [Production Multi-Agent System with LangGraph](https://markaicode.com/langgraph-production-agent/)
- [LangGraph Interrupts and Commands](https://dev.to/jamesbmour/interrupts-and-commands-in-langgraph-building-human-in-the-loop-workflows-4ngl)
- [CrewAI](https://crewai.com/)
- [CrewAI Sequential Processes docs](https://docs.crewai.com/en/learn/sequential-process)
- [CrewAI Hierarchical Process docs](https://docs.crewai.com/how-to/hierarchical-process)
- [AG2 GitHub](https://github.com/ag2ai/ag2)
- [AG2 v0.9 GroupChat Release](https://docs.ag2.ai/latest/docs/blog/2025/04/28/0.9-Release-Announcement/)
- [Temporal + AI Agents](https://temporal.io/blog/build-resilient-agentic-ai-with-temporal)
- [Temporal + OpenAI Integration](https://temporal.io/blog/announcing-openai-agents-sdk-integration)
- [Temporal Durable Multi-Agent Architecture](https://temporal.io/blog/using-multi-agent-architectures-with-temporal)
- [OpenAI Agents SDK](https://openai.github.io/openai-agents-js/)
- [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/overview)
- [LLMCompiler GitHub](https://github.com/SqueezeAILab/LLMCompiler)

### General / Cross-cutting

- [Google Research Blog on ReAct](https://research.google/blog/react-synergizing-reasoning-and-acting-in-language-models/)
- [ReAct Prompting Guide](https://www.promptingguide.ai/techniques/react)
- [IBM: What is a ReAct Agent?](https://www.ibm.com/think/topics/react-agent)
- [ToT Prompting Guide](https://www.promptingguide.ai/techniques/tot)
- [Plan-and-Execute with LangGraph (Feb 2026)](https://medium.com/@okanyenigun/built-with-langgraph-33-plan-execute-ea64377fccb1)
- [AI Agent Frameworks Compared (2026)](https://designrevision.com/blog/ai-agent-frameworks)
- [LangGraph vs CrewAI vs AutoGen Guide (2026)](https://dev.to/pockit_tools/langgraph-vs-crewai-vs-autogen-the-complete-multi-agent-ai-orchestration-guide-for-2026-2d63)
- [Agent Orchestration 2026](https://iterathon.tech/blog/ai-agent-orchestration-frameworks-2026)
- [Google Cloud Agentic AI Design Patterns](https://docs.cloud.google.com/architecture/choose-design-pattern-agentic-ai-system)
- [State Machines for Deterministic Agentic AI](https://blog.logrocket.com/deterministic-agentic-ai-with-state-machines/)
- [Agentic Ops Rollback Challenges](https://medium.com/@mayankbohra.dev/the-agentic-ops-headache-when-rollback-means-complex-compensation-adcafd9f6754)
- [Rubrik Agent Rewind](https://www.rubrik.com/products/agent-rewind)
- [Human-in-the-Loop Best Practices (Permit.io)](https://www.permit.io/blog/human-in-the-loop-for-ai-agents-best-practices-frameworks-use-cases-and-demo)
- [Human-in-the-Loop Patterns (2026)](https://myengineeringpath.dev/genai-engineer/human-in-the-loop/)
- [20 Agentic AI Workflow Patterns (2025)](https://skywork.ai/blog/agentic-ai-examples-workflow-patterns-2025/)
- [Agentic AI Design Patterns (2026)](https://www.sitepoint.com/the-definitive-guide-to-agentic-design-patterns-in-2026/)
- [Agentic AI Planning Pattern (Analytics Vidhya)](https://www.analyticsvidhya.com/blog/2024/11/agentic-ai-planning-pattern/)
- [Deloitte Agentic AI Strategy](https://www.deloitte.com/us/en/insights/topics/technology-management/tech-trends/2026/agentic-ai-strategy.html)
- [Top 5 Agentic AI Frameworks (2026)](https://futureagi.substack.com/p/top-5-agentic-ai-frameworks-to-watch)
- [2025-2026 AI Computer-Use Benchmarks Guide (o-mega)](https://o-mega.ai/articles/the-2025-2026-guide-to-ai-computer-use-benchmarks-and-top-ai-agents)
- [Anthropic releases Claude Opus 4.6 (MarkTechPost)](https://www.marktechpost.com/2026/02/05/anthropic-releases-claude-opus-4-6-with-1m-context-agentic-coding-adaptive-reasoning-controls-and-expanded-safety-tooling-capabilities/)
