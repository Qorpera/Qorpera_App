# src/app/api/ — API Routes

## Auth Patterns
- Most routes: `getSessionUser()` → returns user with operatorId, role, userId
- Admin routes: check `user.role === "admin" || user.role === "superadmin"`
- Superadmin routes: check `user.role === "superadmin"`
- Public routes: listed in PUBLIC_PATHS in middleware.ts (OAuth callbacks, webhooks, registration check)
- Member-scoped data: filter by UserScope visible departments

## Response Patterns
- Success: `NextResponse.json(data)` or `NextResponse.json(data, { status: 201 })`
- Error: `NextResponse.json({ error: "message" }, { status: 4xx })`
- Auth failure: `NextResponse.json({ error: "Unauthorized" }, { status: 401 })`

## Route Groups

### `auth/` — Authentication & session management
- `login` (POST) — email/password login with rate limiting
- `register` (POST) — first operator registration
- `registration-status` (GET) — checks if any operator exists
- `logout` (POST) — session invalidation
- `check` (GET) — session validation + first-run detection
- `me` (GET) — current user profile
- `hubspot/callback`, `stripe/callback` (GET) — OAuth callbacks (public)

### `admin/` — Superadmin operations
- `operators` (GET), `operators/[id]` (DELETE) — operator management
- `enter-operator` (POST), `exit-operator` (POST) — operator switching
- `create-test-company` (POST) — seed test operator with data
- `ai-learning-overview` (GET) — cross-operator AI learning stats
- `merge-log` (GET), `merge-log/[id]/reverse` (POST) — entity merge audit
- `merge-suggestions` (GET), `merge-suggestions/[id]/approve|dismiss` (POST) — identity merge review

### `connectors/` — Connector management & OAuth
- Root (GET, POST) — list/create connectors
- `[id]` (GET, PATCH, DELETE) — individual connector management
- `[id]/sync` (POST) — trigger single connector sync
- `sync-all` (POST) — trigger all active connectors
- `providers` (GET) — available connector providers
- `google/auth`, `google/callback` — Google OAuth flow
- `microsoft/auth`, `microsoft/callback` — Microsoft OAuth flow
- `slack/auth-url`, `slack/callback` — Slack OAuth flow
- `hubspot/auth-url` — HubSpot OAuth initiation
- `stripe/auth-url` — Stripe OAuth initiation
- `google-sheets/clone-pending` (POST) — legacy Sheets connector migration

### `departments/` — Department management & document uploads
- Root (GET, POST) — list (scoped) / create departments
- `[id]` (GET, PATCH, DELETE) — department CRUD (scope-checked)
- `[id]/members` (GET, POST), `[id]/members/[entityId]` (PATCH, DELETE) — team management
- `[id]/entities` (GET) — department entities (base + digital)
- `[id]/connected-entities` (GET) — entities from connectors bound to department
- `[id]/external-links` (GET) — external entities linked via relationships
- `[id]/documents/*` — document upload, extraction, confirmation, reprocessing

### `entities/` — Entity CRUD & relationships
- Root (GET, POST) — list (scoped) / create entities
- `[id]` (GET, PATCH, DELETE) — entity CRUD
- `[id]/relationships` (GET) — entity relationships
- `[id]/assign-department` (POST) — route entity to department
- `unrouted` (GET) — entities without department assignment

### `entity-types/` — Entity type schema management
- Root (GET, POST) — list / create entity types
- `[id]` (GET, PATCH, DELETE) — entity type CRUD
- `[id]/properties` (POST, PATCH, DELETE) — property management

### `situations/` — Situation lifecycle
- Root (GET) — list situations (scoped)
- `[id]` (GET, PATCH) — view / approve / reject situations
- `[id]/reason` (POST) — trigger reasoning for a situation
- `detect` (POST) — manual detection trigger
- `audit` (POST) — manual pre-filter audit trigger
- `status` (GET) — AI system status (cron running, provider configured)

### `copilot/` — AI assistant
- Root (POST) — send message / receive streamed response
- `sessions` (GET) — list conversation sessions
- `messages` (GET) — conversation history for a session
- `context` (GET) — available entity types for copilot context

### `learning/` — AI learning analytics
- `overview` (GET) — approval rates, detection counts, autonomy levels
- `departments` (GET) — per-department learning metrics
- `situation-types/[id]` (GET) — detailed type-level analytics
- `feedback-impact` (GET) — feedback effect on AI accuracy
- `export` (GET) — CSV export of learning data

### `users/` — User & invite management
- Root (GET) — list users (excludes superadmin)
- `[id]` (PATCH) — update user
- `[id]/role` (PUT) — change user role
- `[id]/scopes` (POST), `[id]/scopes/[scopeId]` (DELETE) — manage department access
- `invite` (POST, GET) — create / list invites
- `invite/[id]` (DELETE) — revoke invite
- `bulk-grant` (POST) — grant scopes to multiple users
- `export` (GET) — CSV export of user data

### Other
- `health` (GET) — database connectivity check (public)
- `operator` (GET, PATCH) — current operator profile
- `notifications` (GET, PATCH) — user notifications
- `policies` (GET, POST, PATCH, DELETE) — governance policy CRUD
- `settings` (GET, PUT) — global AppSettings (superadmin)
- `settings/test-ai` (POST) — test AI provider configuration
- `rag/search` (POST) — RAG document search (scoped)
- `orientation/*` — onboarding flow management
- `me/ai-entity` (GET) — current user's AI entity
- `graph/*` — knowledge graph visualization queries
- `relationship-types` (GET, POST) — relationship type management
- `relationships/[id]` (DELETE) — relationship deletion
- `situation-types` (GET) — list situation type definitions
- `action-capabilities` (GET) — list registered connector actions
- `events/*` — event management and processing
- `data/reset`, `data/seed` — test data management
- `webhooks/[connectorId]` (POST) — incoming webhooks from Stripe
- `invite/[token]` (GET), `invite/[token]/accept` (POST) — public invite acceptance

## Critical Routes
- `/api/situations/[id]` PATCH — approval/rejection flow. Updates SituationType telemetry counters (totalProposed, totalApproved, consecutiveApprovals, approvalRate).
- `/api/connectors/sync-all` — triggers sync for all active connectors. Fires post-sync hooks (identity resolution, content situation detection).
- `/api/invite/[token]/accept` — creates User, UserScope, and AI entity in single transaction.
