# src/lib/ — Shared Infrastructure

Every file in this directory is shared infrastructure used by multiple API routes and features. Changes here have wide blast radius.

## Critical Rules
1. Every database query MUST include `operatorId` in the where clause
2. Every Entity query in API responses MUST exclude `entityEmbedding` via explicit select
3. Every ContentChunk.create() MUST use `select: { id: true }`
4. Use `getAIConfig()` for AI provider resolution, never direct AppSettings queries

## File Descriptions

| File | Description |
|---|---|
| `activity-pipeline.ts` | ActivitySignal ingestion — resolves actor/target emails to entities, derives department routing |
| `ai-copilot.ts` | Copilot chat engine — 11 tools (lookup, search, email, docs, messages, activity, connector actions), department-scoped, streaming |
| `ai-provider.ts` | Multi-provider AI abstraction (OpenAI/Anthropic/Ollama) — callLLM, streamLLM, getAIConfig with per-function cascade |
| `api-validation.ts` | Reusable Zod schemas for API request validation (cuidId, paginationParams, entity schemas) |
| `auth.ts` | Session management — getSessionUser(), createSession, password hashing (bcrypt), cookie management |
| `autonomy-graduation.ts` | PersonalAutonomy graduation/demotion — configurable thresholds, creates Notification on graduation |
| `business-context.ts` | Loads business context from completed OrientationSession (business summary, pain points, rules) |
| `connector-sync.ts` | Sync orchestrator — dispatches SyncYield items by kind, runs identity resolution + content situation detection post-hooks |
| `content-pipeline.ts` | Universal content ingestion — chunk text, embed via text-embedding-3-small, store as ContentChunk with pgvector |
| `content-situation-detector.ts` | Communication action detection — LLM evaluates batched email/Slack/Teams content, creates Situations with mode: "content" |
| `context-assembly.ts` | Builds full SituationContext — entity data, related entities, activity timeline, communication excerpts (pgvector), cross-department signals, RAG references |
| `db.ts` | Prisma client singleton with globalThis HMR guard |
| `document-slots.ts` | Document slot type definitions (org-chart extracts entities, playbook is context-only) |
| `encryption.ts` | AES-256-GCM encrypt/decrypt for OAuth tokens using ENCRYPTION_SECRET env var |
| `entity-data.ts` | TypeScript interfaces for graph visualization (GraphNode, GraphEdge, GraphData) |
| `entity-model-store.ts` | EntityType/Property/Entity CRUD operations, entity listing with category/type filters, graph data queries |
| `entity-resolution.ts` | Entity upsert with identity matching, resolve by email/externalId, relate entities, keyword search |
| `env-validation.ts` | Startup validation of required environment variables (DATABASE_URL, ENCRYPTION_SECRET, AI_PROVIDER, etc.) |
| `event-materializer.ts` | Event → Entity materialization — HubSpot/Stripe events create/update entities, triggers situation detection |
| `event-retention.ts` | 90-day cleanup of processed events and their SituationEvent joins |
| `fetch-api.ts` | Client-side fetch wrapper — detects session-expired redirects to /login |
| `graph-traversal.ts` | BFS multi-hop traversal from a starting entity, returns reachable nodes + edges |
| `hardcoded-type-defs.ts` | Built-in entity types (contact, invoice, deal, etc.) with properties and identity roles; CATEGORY_PRIORITY for merge survivor selection |
| `identity-resolution.ts` | ML entity merge pipeline — pgvector nearest-neighbor candidates, weighted scoring (email/domain/phone/embedding), transactional merge with snapshot for reversal |
| `multi-agent-reasoning.ts` | High-context reasoning — 3 specialists (Financial, Communication, Process/Compliance) run in parallel, coordinator synthesizes findings |
| `orientation-prompts.ts` | System prompts for onboarding copilot sessions, department data context builder |
| `policy-engine.ts` | CRUD for PolicyRule records (list, create, update, delete) |
| `policy-evaluator.ts` | Pre/post-reasoning governance — evaluates actions against PolicyRules, determines permitted/blocked, resolves effective autonomy (personal overrides global) |
| `rate-limiter.ts` | In-memory sliding-window rate limiter (not distributed — single-instance only) |
| `reasoning-engine.ts` | Core reasoning orchestrator — load situation → assemble context → evaluate policies → LLM reasoning → propose/execute action |
| `reasoning-prompts.ts` | Prompt builders for reasoning (system + user), formats entity data, evidence, policies, and action capabilities |
| `reasoning-types.ts` | Shared Zod schema for ReasoningOutput (analysis, evidence, considered/chosen actions, confidence) |
| `seed.ts` | Database seed script — creates default operator |
| `situation-audit.ts` | Audit loop — compares pre-filter accuracy vs LLM ground truth, regenerates inaccurate pre-filters |
| `situation-cron.ts` | Starts 5-minute detection interval + audit interval via setInterval with globalThis HMR guard |
| `situation-detector.ts` | Cron-triggered detection — structured/natural/hybrid modes, property evaluation, LLM confirmation, fires reasoning |
| `situation-executor.ts` | Executes approved situation actions via connector providers (decrypts config, calls provider action) |
| `situation-prefilter.ts` | LLM-generated structured pre-filters for natural language situation types (reduces LLM calls) |
| `situation-resolver.ts` | Auto-resolves open situations when contradicting events arrive (e.g. invoice paid resolves overdue situation) |
| `situation-scope.ts` | Department scope check — determines if an entity falls within a situation type's department boundary |
| `structural-extraction.ts` | LLM extraction of people/roles/hierarchy from uploaded documents (org charts, team rosters) |
| `sync-scheduler.ts` | 1-minute tick scheduler — per-provider sync intervals, 3-failure error threshold, max 3 concurrent syncs per operator |
| `types.ts` | Shared TypeScript types — DataType, IdentityRole, EntityStatus, PolicyEffect, PolicyScope, etc. |
| `user-scope.ts` | Department visibility — getVisibleDepartmentIds(), canAccessDepartment(), canAccessEntity(), situationScopeFilter(), departmentScopeFilter() |

## Data Flow Through These Files

```
Connector sync (connector-sync.ts) → routes yields to:
  - content-pipeline.ts (ContentChunk creation + embedding)
  - activity-pipeline.ts (ActivitySignal creation)
  - event-materializer.ts (Entity creation from events)
  Post-sync hooks:
  - identity-resolution.ts (entity merge — fire-and-forget)
  - content-situation-detector.ts (communication action detection — fire-and-forget)

Situation creation → reasoning-engine.ts → context-assembly.ts → multi-agent-reasoning.ts (if >12K tokens)

Copilot queries → ai-copilot.ts → tool functions that query ContentChunk, ActivitySignal, Entity
```
