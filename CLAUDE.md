# Qorpera

Operational intelligence platform for leadership. Next.js App Router + Prisma (PostgreSQL) + Tailwind CSS.

## Commands
- Build: `npm run build`
- Dev: `npm run dev`
- DB migrate (dev): `npx prisma migrate dev --name <description>`
- DB push (test only): `npx prisma db push` — ONLY against local Postgres
- DB deploy (production): `npx prisma migrate deploy`
- DB studio: `npx prisma studio`
- Create superadmin: `npx tsx scripts/create-superadmin.ts`
- Stress seed: `npx tsx scripts/stress-seed.ts`

## Database Workflow (CRITICAL)

Two databases, two workflows:

**Neon (production, persistent):**
- Used via `npm run dev` with `DATABASE_URL` pointing to Neon in `.env`
- Qorpera's own operator account lives here — never wipe this
- Schema changes: `npx prisma migrate dev --name <description>` generates migration files
- Review the generated SQL in `prisma/migrations/` before committing
- `prisma migrate deploy` applies pending migrations (used in Docker CMD)

**Local Docker Postgres (testing, disposable):**
- Used via `docker compose up` — defaults to local Postgres
- `docker compose down -v` is safe — wipes test data only
- Can use `prisma db push` for fast iteration during testing

**After any schema change in `prisma/schema.prisma`:**
1. Run `npx prisma migrate dev --name <short-description>` (generates SQL migration file)
2. Review the SQL in `prisma/migrations/<timestamp>_<name>/migration.sql`
3. Commit the migration file to git
4. `prisma migrate deploy` runs automatically in Docker on startup

**NEVER run `prisma db push` against Neon in production.**
**NEVER run `prisma migrate reset` against Neon.**

## Auth Pattern (Day 24 — CRITICAL)
- Every API route MUST call `getSessionUser(request)` from `src/lib/auth.ts` as its first operation
- The old auth pattern (`getOperatorId()` or direct cookie/session reading) is DEPRECATED — no route should use it
- `getSessionUser()` returns `{ user, operatorId, isSuperadmin, actingAsOperator }` or null
- Null session → return 401 for API routes, redirect to /login for pages
- `operatorId` from session is the EFFECTIVE operator (accounts for superadmin operator switching)
- All Prisma queries MUST filter by `operatorId` from session — never trust client-provided operatorId
- Never expose `passwordHash` in any API response

## Scope Filtering (Day 24 — CRITICAL)
- `getVisibleDepartments(operatorId, user)` from `src/lib/user-scope.ts` returns `string[] | "all"`
- Admin/superadmin always returns `"all"` — no filtering applied
- Members return array of department entity IDs from UserScope table
- Every GET route returning data MUST apply scope filtering:
  - Department list routes: filter to visible departments only
  - Department-specific routes: `canAccessDepartment()` check → 403 if not visible
  - Situation routes: apply `situationScopeFilter(visibleDepts)`
  - Learning routes: apply department scope to all queries
  - Copilot: thread real `visibleDepts` through tool execution
- Every mutation route MUST check role:
  - Admin-only: create/delete departments, manage connectors, create policies, invite users
  - Member allowed (within scope): approve/reject situations, upload documents, add team members

## Roles
- `superadmin`: Qorpera support (Jonas). Can enter any operator. Invisible to regular users.
- `admin`: Company leadership. Sees everything in their operator. Full CRUD.
- `member`: Employees. Scoped to departments via UserScope table. Can be granted additional departments.
- There is NO viewer role.

## Superadmin
- Has own operator ("Qorpera Admin") — no departments, just an account container
- `acting_operator_id` cookie controls which operator superadmin is viewing
- MUST be excluded from team lists, user counts, and any user-facing queries
- `/api/admin/*` endpoints MUST verify `role === "superadmin"` → 403 otherwise
- `/admin` page MUST redirect non-superadmins to `/map`

## Invite Flow
- Invites are entity-linked: admin creates account for a specific base entity in the org chart
- Admin sets the password (user does not choose their own)
- Invite stores: entityId, email, passwordHash, role, token, expiry
- Accepting invite creates User linked to entity, creates UserScope for entity's department
- Invited users skip onboarding (redirect to /map, not /onboarding)
- Duplicate prevention: one entity = one user account, one pending invite per entity

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
- CSP, X-Frame-Options, X-Content-Type-Options headers set in middleware
- Environment validation on startup (`src/lib/env-validation.ts`)
- Per-operator document storage isolation (`{DOCUMENT_STORAGE_PATH}/{operatorId}/`)
- Rate limiting on document upload (10/5min) and reprocess (5/5min)

## Data Model Key Relations
- Session → User → Operator (session resolution chain)
- User → Entity (optional, links account to org chart person)
- UserScope: junction table granting user access to departments
- Invite → Entity (invite is for a specific person in the org chart)
- ConnectorDepartmentBinding routes connector data to specific departments
- Digital entities linked to departments via `department-member` relationships (NOT parentDepartmentId)
- External entities have NO department — linked via relationship chains

## AI System
- Multi-provider: OpenAI, Anthropic, Ollama (configured via AI_PROVIDER env var)
- Closed-world reasoning: AI acts ONLY on provided evidence, never general knowledge
- RAG: documents chunked with embeddings, retrieved per-department (8 chunks per situation)
- Situation detection: cron-triggered, creates situations with reasoning + proposed actions
- Policy enforcement: double-check (before AND after reasoning)
- Trust gradient: Observe → Propose → Act (autonomy levels: supervised, notify, autonomous)

## File Structure
- `src/app/` — Next.js App Router pages and API routes
- `src/lib/` — shared libraries (auth, encryption, validation, AI, RAG)
- `src/lib/user-scope.ts` — permission/scope helpers
- `src/lib/auth.ts` — session management, password hashing, getSessionUser()
- `src/lib/ai/` — copilot tools, reasoning engine, orientation prompts
- `src/lib/rag/` — retriever, chunk cache, embedding queue
- `src/components/` — React components
- `prisma/schema.prisma` — data model
- `scripts/` — CLI tools (superadmin creation, stress seed)

## Known Issues (check these during review)
- Onboarding page is 1888 lines in a single file (should be split but works)
- Settings connections tab still interactive (users could create rootless connectors)
- Autonomy history shows current level only (no historical tracking)
- Step 6 double-advance could partially fail (recovers on refresh)

## Phase 2: Data Layer (Days 26–28)

### pgvector Pattern (CRITICAL)
- Database: PostgreSQL on Neon with pgvector extension enabled
- Prisma schema declares vector columns as `String?` — raw SQL handles the actual `vector(1536)` type
- ALL vector operations use `prisma.$queryRaw` with the `<=>` cosine distance operator
- HNSW indexes on `ContentChunk.embedding` and `Entity.entityEmbedding` (m=16, ef_construction=64)
- Embedding model: `text-embedding-3-small` (1536 dimensions)

### ContentChunk Create Pattern (CRITICAL)
- Every `prisma.contentChunk.create()` call MUST use `select: { id: true }`
- Prisma cannot deserialize native pgvector columns on return — omitting select causes runtime crash
- This applies everywhere: content-pipeline.ts, create-test-company, migrate-document-chunks, any future code

### Connector Interface (SyncYield)
- All connectors return `AsyncGenerator<SyncYield>` from their `sync()` method
- `SyncYield` is a discriminated union: `{ kind: "event" | "content" | "activity", data: ... }`
- Connector orchestrator (`connector-sync.ts`) routes each kind automatically:
  - `event` → event materializer (existing)
  - `content` → `ingestContent()` from content-pipeline.ts
  - `activity` → `ingestActivity()` from activity-pipeline.ts
- New connectors just yield SyncYield items — no orchestrator changes needed

### Identity Resolution
- `identity-resolution.ts` — ML-based entity merge pipeline
- Email exact match: +0.5, Domain: +0.15, Phone: +0.2, Embedding similarity >0.85: +0.15
- Same-source merging: hard block (-1.0 penalty)
- Thresholds: ≥0.8 auto-merge, 0.5–0.8 suggestion, <0.5 discard
- Merge is transactional: snapshot → additive property copy → relationship redirect → ContentChunk/ActivitySignal repoint
- Runs inline after sync (fire-and-forget, errors caught)
- `EntityMergeLog.snapshot` stores full pre-merge state for reversal

### Scheduled Sync
- `sync-scheduler.ts` — 1-minute tick, registered in `instrumentation.ts` with globalThis HMR guard
- Per-provider intervals: 5 min (Gmail, Slack), 15 min (Drive, Calendar, HubSpot, Stripe), 30 min (Sheets)
- Max 3 concurrent syncs per operator
- 3 consecutive failures → connector status "error" + admin Notification
- `consecutiveFailures` field on SourceConnector schema

### Phase 2 File Map
- `src/lib/content-pipeline.ts` — universal content ingestion (chunks + embeds)
- `src/lib/activity-pipeline.ts` — ActivitySignal ingestion with actor/target resolution
- `src/lib/sync-scheduler.ts` — scheduled sync system
- `src/lib/identity-resolution.ts` — ML entity merge pipeline
- `src/lib/connectors/sync-types.ts` — SyncYield type definitions
- `src/lib/rag/retriever.ts` — rewritten for pgvector (no more JS cosine similarity)

### Retention
- ActivitySignal: 90-day retention, daily cleanup tick in instrumentation.ts
- EntityMergeLog snapshots: indefinite (no automated expiry yet)

## Testing

### Framework
- Vitest with TypeScript, `@/*` path alias resolved via `vitest.config.ts`
- Tests in `__tests__/` directory, mirroring `src/lib/` structure
- Run: `npm test` (single run), `npm run test:watch` (watch mode), `npm run test:coverage`

### Mocking Pattern
- Modules that import `@/lib/db` but have testable pure functions: mock with `vi.mock("@/lib/db", () => ({ prisma: {} }))`
- Place `vi.mock()` BEFORE the import of the module under test
- Never mock the function under test — only its side-effect dependencies

### Writing New Tests
- Pure functions (no DB): write directly, no mocks needed
- Functions that import prisma but have pure sub-functions: mock `@/lib/db`
- Functions that ARE database operations: skip for now (integration tests later)
- Identity resolution scoring changes: update `__tests__/lib/identity-scoring.test.ts` spec weights to match

### Bug Fixing Protocol (updated)
When a bug is reported:
1. Write a test that reproduces the bug and confirms it fails
2. Spawn subagents to attempt fixes
3. The fix is only accepted when the test passes
4. Run `npm test` to confirm no regressions
5. Commit the test and the fix together
