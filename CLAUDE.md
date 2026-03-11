# Qorpera

Operational intelligence platform for leadership. Next.js App Router + Prisma (PostgreSQL) + Tailwind CSS.

## Commands
- Build: `npm run build`
- Dev: `npm run dev`
- DB push: `npx prisma db push`
- DB studio: `npx prisma studio`
- Create superadmin: `npx tsx scripts/create-superadmin.ts`
- Stress seed: `npx tsx scripts/stress-seed.ts`

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

## Bug Fixing Protocol

When a bug is reported, do NOT start by trying to fix it.

Instead:
1. Write a test that reproduces the bug and confirms it fails
2. Spawn subagents to attempt fixes
3. The fix is only accepted when the test passes

Commit the test and the fix together.
