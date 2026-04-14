# Qorpera — CLAUDE.md

## What This Is
Multi-tenant B2B SaaS platform providing AI-powered operational intelligence for SMBs (10-50 people). The AI detects situations across connected business tools, reasons about them with evidence-based analysis, and gradually earns autonomy to act. Trust gradient: Observe → Propose → Act.

## Architecture Overview
- **Next.js App Router** with Prisma ORM, PostgreSQL (Neon, Frankfurt region), pgvector for embeddings
- **Multi-tenant**: Every data query scopes by `operatorId`. No exceptions.
- **Auth**: Session-based. Roles: superadmin (cross-operator), admin, member. UserScope controls department visibility.
- **AI providers**: Per-function routing (reasoning, copilot, embedding, orientation). Config cascade: per-function AppSettings → global AppSettings → env vars. Use `getAIConfig()`, never query AppSettings directly.

## Data Flow
```
Connector Sync → yields { kind: "event" | "content" | "activity" }
  ├── Events (HubSpot/Stripe) → Materializer → Entity creation/update
  ├── Content (all connectors) → ingestContent() → ContentChunk + pgvector embedding
  │     └── Communication content (email/slack/teams) → evaluateContentForSituations()
  │           └── Creates Situation (source: "content_detected") → fires reasoning
  └── Activity (Gmail/Slack/Teams/Drive/Calendar) → ActivitySignal creation
        └── Used by context assembly for timelines + pattern detection

Cron (5min) → situation-detector.ts
  └── Per SituationType with mode: "structured" | "natural" | "hybrid"
        → detect entities matching conditions → create Situation → fire reasoning

Situation created → reasoning-engine.ts
  ├── assembleSituationContext() builds full context:
  │     ├── Entity properties + related entities + recent events
  │     ├── loadActivityTimeline() — 30-day behavioral patterns
  │     ├── loadCommunicationContext() — pgvector retrieval of relevant content
  │     └── loadCrossDepartmentSignals() — external entities only
  ├── Route by token estimate:
  │     ├── <12K tokens → single-pass reasoning
  │     └── >12K tokens → multi-agent (3 specialists + coordinator)
  ├── Policy evaluation: governance checked BEFORE reasoning, verified AFTER
  └── Output → notification + status advancement + auto-execution (if autonomous)

Copilot → ai-copilot.ts
  └── Department-scoped tool calls (deptVisFilter on every data query)
```

## Commands
- Build: `npm run build`
- Dev: `npm run dev`
- Test: `npm test` (single run), `npm run test:watch`, `npm run test:coverage`
- DB migrate (dev): `npx prisma migrate dev --name <description>`
- DB push (test only): `npx prisma db push` — ONLY against local Postgres
- DB deploy (production): `npx prisma migrate deploy`
- DB studio: `npx prisma studio`
- Create superadmin: `npx tsx scripts/create-superadmin.ts`
- Stress seed: `npx tsx scripts/stress-seed.ts`

## Module Map

### Connectors
| File | Description |
|---|---|
| `src/lib/connectors/registry.ts` | Provider lookup and listing (maps provider ID to implementation) |
| `src/lib/connectors/types.ts` | ConnectorProvider interface, SyncEvent, ConnectorCapability types |
| `src/lib/connectors/sync-types.ts` | SyncYield discriminated union (event/content/activity) |
| `src/lib/connectors/google-auth.ts` | Google OAuth token refresh helper |
| `src/lib/connectors/google-provider.ts` | Unified Google connector: Gmail, Drive, Calendar, Sheets sync + write-back |
| `src/lib/connectors/google-sheets.ts` | Standalone Google Sheets connector (legacy, separate from unified Google) |
| `src/lib/connectors/microsoft-auth.ts` | Azure AD OAuth token refresh helper |
| `src/lib/connectors/microsoft-provider.ts` | Unified Microsoft connector: Outlook, OneDrive, Teams, Calendar + write-back |
| `src/lib/connectors/slack-provider.ts` | Slack bot connector: channel sync, thread grouping, write-back |
| `src/lib/connectors/hubspot-auth.ts` | HubSpot OAuth token refresh helper |
| `src/lib/connectors/hubspot.ts` | HubSpot connector: contacts, companies, deals event sync |
| `src/lib/connectors/stripe-auth.ts` | Stripe OAuth token refresh helper |
| `src/lib/connectors/stripe.ts` | Stripe connector: customers, invoices, payments event sync |

### Data Pipeline
| File | Description |
|---|---|
| `src/lib/connector-sync.ts` | Sync orchestrator — dispatches SyncYield items, runs post-sync hooks (identity resolution, content situation detection) |
| `src/lib/content-pipeline.ts` | Universal content ingestion: chunk → embed → store as ContentChunk with pgvector |
| `src/lib/activity-pipeline.ts` | ActivitySignal ingestion: resolve actor/target emails to entities, derive department routing |
| `src/lib/event-materializer.ts` | Event → Entity materialization: creates/updates entities from HubSpot/Stripe events, triggers situation detection |
| `src/lib/identity-resolution.ts` | ML entity merge pipeline: pgvector candidate generation, weighted scoring, transactional merge |
| `src/lib/sync-scheduler.ts` | 1-minute tick scheduler: per-provider intervals, 3-failure error threshold, concurrency limits |

### Reasoning & Detection
| File | Description |
|---|---|
| `src/lib/situation-detector.ts` | Cron-triggered detection: structured/natural/hybrid modes, entity property evaluation |
| `src/lib/content-situation-detector.ts` | Communication-triggered detection: LLM evaluates email/Slack/Teams for action-required situations |
| `src/lib/reasoning-engine.ts` | Core reasoning: context assembly → policy check → LLM reasoning → action proposal → execution |
| `src/lib/multi-agent-reasoning.ts` | High-context reasoning: 3 specialist agents (Financial, Communication, Process) + coordinator |
| `src/lib/reasoning-prompts.ts` | Prompt builders for reasoning LLM calls (system + user prompts) |
| `src/lib/reasoning-types.ts` | Shared Zod schema for ReasoningOutput (used by both single-pass and multi-agent) |
| `src/lib/context-assembly.ts` | Builds full situation context: entity data, activity timeline, communication excerpts, cross-department signals, RAG |
| `src/lib/policy-evaluator.ts` | Pre/post-reasoning governance: evaluates PolicyRules, determines permitted/blocked actions, effective autonomy |
| `src/lib/policy-engine.ts` | CRUD operations for PolicyRule records |
| `src/lib/json-helpers.ts` | Shared JSON extraction from LLM responses (extractJSON, extractJSONArray, extractJSONAny) |
| `src/lib/situation-prefilter.ts` | LLM-generated structured pre-filters for natural language situation types |
| `src/lib/situation-audit.ts` | Audit loop: compares pre-filter vs LLM detection accuracy, regenerates pre-filters |
| `src/lib/situation-cron.ts` | Starts detection + audit cron intervals (registered in instrumentation.ts) |
| `src/lib/situation-resolver.ts` | Auto-resolves open situations when contradicting events arrive (e.g. invoice paid) |
| `src/lib/situation-scope.ts` | Checks if an entity is within a department-scoped situation type's boundary |

### Auth & Permissions
| File | Description |
|---|---|
| `src/lib/auth.ts` | Session management, password hashing, `getSessionUser()` for all API routes |
| `src/lib/user-scope.ts` | Department visibility: `getVisibleDepartmentIds()`, `canAccessDepartment()`, `situationScopeFilter()` |

### Knowledge Graph
| File | Description |
|---|---|
| `src/lib/entity-resolution.ts` | Entity CRUD: upsert, resolve by identity, relate entities, search by keyword |
| `src/lib/entity-model-store.ts` | EntityType/Property CRUD, entity listing with filters, graph data queries |
| `src/lib/graph-traversal.ts` | BFS multi-hop graph traversal from a starting entity |
| `src/lib/entity-data.ts` | GraphNode/GraphEdge TypeScript interfaces for graph visualization |
| `src/lib/hardcoded-type-defs.ts` | Built-in entity type definitions (contact, invoice, deal, etc.) with identity roles |
| `src/lib/structural-extraction.ts` | LLM extraction of people/roles from uploaded documents (org charts) |

### RAG & Embeddings
| File | Description |
|---|---|
| `src/lib/rag/chunker.ts` | Text chunking with overlap for document ingestion |
| `src/lib/rag/embedder.ts` | Embedding generation via configured AI provider (text-embedding-3-small) |
| `src/lib/rag/embedding-queue.ts` | Background embedding queue for batch processing |
| `src/lib/rag/pipeline.ts` | Document processing pipeline: extract text → chunk → embed → store |
| `src/lib/rag/retriever.ts` | pgvector similarity search for ContentChunks and uploaded documents |

### Copilot
| File | Description |
|---|---|
| `src/lib/ai-copilot.ts` | Copilot chat engine: tool definitions, tool execution, department-scoped data access, streaming |
| `src/lib/ai-provider.ts` | Multi-provider AI abstraction: OpenAI/Anthropic/Ollama, per-function config cascade, streaming |
| `src/lib/orientation-prompts.ts` | System prompts and department context builders for onboarding copilot sessions |
| `src/lib/business-context.ts` | Loads business context from completed orientation sessions |

### Utilities
| File | Description |
|---|---|
| `src/lib/db.ts` | Prisma client singleton with HMR guard |
| `src/lib/encryption.ts` | AES-256-GCM encrypt/decrypt for OAuth tokens and API keys |
| `src/lib/env-validation.ts` | Startup environment variable validation |
| `src/lib/api-validation.ts` | Zod schemas for API request validation (reusable primitives) |
| `src/lib/rate-limiter.ts` | In-memory rate limiter for API routes (single-instance) |
| `src/lib/fetch-api.ts` | Client-side fetch wrapper with session-expiry redirect detection |
| `src/lib/document-slots.ts` | Document slot type definitions (org-chart, playbook) |
| `src/lib/event-retention.ts` | 90-day event cleanup for processed events |
| `src/lib/seed.ts` | Database seed script for default operator |
| `src/lib/types.ts` | Shared TypeScript types (DataType, EntityStatus, PolicyEffect, etc.) |

## Connector Inventory
| Connector | Type | Provider File | Yields | Write-back |
|---|---|---|---|---|
| HubSpot | Company (admin installs) | hubspot.ts | events | No |
| Stripe | Company | stripe.ts | events | No |
| Gmail | Personal (per-user) | google-provider.ts | content + activity | send_email, reply_to_thread |
| Google Drive | Personal | google-provider.ts | content + activity | create/append document, create/update spreadsheet |
| Google Calendar | Personal | google-provider.ts | content + activity | No |
| Google Sheets | Personal | google-provider.ts / google-sheets.ts | content + activity | No |
| Slack | Company | slack-provider.ts | content + activity | send_slack_message, react_to_message |
| Outlook | Personal | microsoft-provider.ts | content + activity | send_email, reply_to_thread |
| OneDrive | Personal | microsoft-provider.ts | content + activity | create/append document, create/update spreadsheet |
| Teams | Personal | microsoft-provider.ts | content + activity | No |
| Microsoft Calendar | Personal | microsoft-provider.ts | content + activity | No |

## Entity Model
Five categories (foundational > base > internal > digital > external). Category determines hierarchy, UI, and merge behavior. Every entity has `operatorId`, `parentDepartmentId`, `entityTypeId`. The `ai-agent` entity type is category "base" with `ownerUserId` linking to User.

## Key Patterns
- **ContentChunk.create()**: MUST use `select: { id: true }` — Prisma cannot deserialize native pgvector columns
- **Entity queries in API responses**: MUST use explicit `select` — never `include` without excluding `entityEmbedding`
- **AI config resolution**: Always use `getAIConfig(operatorId, functionName)` — never query AppSettings directly
- **OAuth callbacks**: Every callback route MUST be in `PUBLIC_PATHS` in middleware.ts AND use `APP_BASE` for redirect URIs
- **Connector sync yields**: Communication connectors yield content + activity. Outcome connectors (HubSpot/Stripe) yield events. Never yield events from communication connectors.
- **`mode: "content"` on SituationType**: Deliberately unrecognized by cron detector — content-detected types must not be re-evaluated by property-based detection

## CRITICAL: Anthropic API — maxTokens must ALWAYS exceed thinkingBudget

Every LLM call with `thinking: true` MUST have `maxTokens` strictly greater than
`thinkingBudget`. Equal values cause a 400 error. This applies to:

- `callLLM()` calls in any file
- Direct `client.messages.create()` / `client.messages.stream()` calls
- The `MAX_OUTPUT_TOKENS` map in `ai-provider.ts` (must exceed the largest
  thinking budget that uses each model)

Before writing or modifying ANY LLM call with thinking enabled:
1. Check what `thinkingBudget` resolves to for that route/archetype
2. Verify `maxTokens` is AT LEAST 2x the thinking budget
3. If using `MAX_OUTPUT_TOKENS` default, verify the map entry exceeds the budget

Rule of thumb: maxTokens = 32,768 for any call that uses thinking. Never set
maxTokens equal to or below the thinking budget.

## Session Workflow
1. Read all project files and fetch latest GitHub tag before any work
2. Architecture discussion with Jonas before implementation
3. Split work into multiple focused prompts
4. `npm run build &&` gates every `git add -A && git commit`
5. Test-first for bugs: write failing test before fixing
6. No `prisma migrate` in Claude Code — use `npx prisma db push` manually

## Two-Database Workflow
- `npm run dev` → Neon (persistent dev/production data, Frankfurt)
- `docker compose up` → local Docker Postgres (throwaway testing)
- **NEVER run `prisma db push` against Neon in production.**
- **NEVER run `prisma migrate reset` against Neon.**

## Database Workflow (CRITICAL)

**After any schema change in `prisma/schema.prisma`:**

`prisma migrate dev` uses a shadow database that cannot install the `pgvector`
extension, so it always fails. Create migrations manually instead:

1. Create the migration directory: `mkdir -p prisma/migrations/<YYYYMMDD>_<short_description>`
2. Write the SQL by hand in `prisma/migrations/<YYYYMMDD>_<short_description>/migration.sql`
3. Mark it as applied locally: `npx prisma migrate resolve --applied <YYYYMMDD>_<short_description>`
4. Commit the migration file to git
5. `prisma migrate deploy` runs automatically in Docker on startup

## Auth Pattern (CRITICAL)
- Every API route MUST call `getSessionUser(request)` from `src/lib/auth.ts` as its first operation
- `getSessionUser()` returns `{ user, operatorId, isSuperadmin, actingAsOperator }` or null
- Null session → return 401 for API routes, redirect to /login for pages
- `operatorId` from session is the EFFECTIVE operator (accounts for superadmin operator switching)
- All Prisma queries MUST filter by `operatorId` from session — never trust client-provided operatorId
- Never expose `passwordHash` in any API response

## Scope Filtering (CRITICAL)
- `getVisibleDepartmentIds(operatorId, userId)` from `src/lib/user-scope.ts` returns `string[] | "all"`
- Admin/superadmin always returns `"all"` — no filtering applied
- Members return array of department entity IDs from UserScope table
- Every GET route returning data MUST apply scope filtering
- Every mutation route MUST check role (admin-only vs member-allowed)

## Roles
- `superadmin`: Qorpera support (Jonas). Can enter any operator. Invisible to regular users.
- `admin`: Company leadership. Sees everything in their operator. Full CRUD.
- `member`: Employees. Scoped to departments via UserScope table.

## Entity Categories
- foundational: departments (created by user in map builder)
- base: people, assets (created by user in department setup)
- internal: documents (uploaded, provide RAG context)
- digital: CRM records, invoices, tickets (from connectors)
- external: customers, partners, competitors (float outside department hierarchy)

## Security
- Connector OAuth tokens encrypted via AES-256-GCM (`src/lib/encryption.ts`)
- CSRF: Origin header validation on POST/PATCH/DELETE (`src/middleware.ts`)
- Session cookies: httpOnly, secure (production), sameSite: lax, 30-day expiry
- CSP, X-Frame-Options, X-Content-Type-Options headers in middleware
- Environment validation on startup (`src/lib/env-validation.ts`)
- Per-operator document storage isolation
- Rate limiting on document upload (10/5min) and reprocess (5/5min)

## Testing
- Vitest with TypeScript, `@/*` path alias resolved via `vitest.config.ts`
- Tests in `__tests__/` directory, mirroring `src/lib/` structure
- Mocking: `vi.mock("@/lib/db", () => ({ prisma: {} }))` before imports
- Bug fix protocol: write failing test → fix → verify → commit together

## Known Issues
- Settings connections tab still interactive (users could create rootless connectors)
- AI entity not created for pre-existing users (need migration script or lazy creation)
- Graduation notification not actionable (no inline promote button in UI)
- Non-atomic AI department mirroring (human membership and AI mirror not in transaction)
- Google scope upgrade: existing Google users need re-auth for write scopes
