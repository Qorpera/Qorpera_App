# Qorpera Invariants

Rules that MUST hold across the entire codebase. Every item below has caused a production bug when violated. Before modifying any file in src/, check whether your change could violate any of these.

## 1. Multi-Tenant Isolation
Every Prisma query touching tenant data MUST include `operatorId` in the `where` clause. This includes: Entity, Relationship, Event, Connector, ContentChunk, ActivitySignal, Situation, SituationType, PersonalAutonomy, Notification, InternalDocument, Policy, CopilotMessage, EntityMergeLog. The ONLY exceptions are User (globally unique email), Session, and AppSettings (has its own operatorId field).

## 2. Entity Embedding Exclusion
Every API response returning Entity data MUST use explicit `select` fields — never bare `include` that would serialize `entityEmbedding`. The native pgvector column causes Prisma serialization errors and leaks a 1536-float vector to the client. Same applies to ContentChunk's `embedding` column.

## 3. ContentChunk Creation
Every `prisma.contentChunk.create()` call MUST include `select: { id: true }`. Prisma cannot deserialize native pgvector columns on write return. Omitting select causes a runtime crash.

## 4. Department Scoping on Copilot Tools
Every copilot tool that queries data (search_emails, search_documents, search_messages, get_email_thread, get_message_thread, get_activity_summary) MUST apply `deptVisFilter` — filtering results against the requesting user's visible departments from UserScope. A scoped member must never see content from departments they don't have access to.

## 5. OAuth Callback Registration
Every OAuth callback route (`/api/connectors/*/callback`) MUST be listed in `PUBLIC_PATHS` in `src/middleware.ts`. OAuth initiation routes MUST use `APP_BASE` (from NEXT_PUBLIC_APP_URL) for the `redirect_uri` parameter — not `req.url` (resolves to 0.0.0.0 in Docker).

## 6. AI Config Cascade
Always use `getAIConfig(operatorId, functionName)` from `ai-provider.ts` to resolve AI provider settings. Never query AppSettings directly for AI configuration. The cascade is: per-function AppSettings → global AppSettings → environment variables.

## 7. Connector Yield Types
Communication connectors (Gmail, Outlook, Slack, Teams, Drive, Calendar) yield `{ kind: "content" }` and `{ kind: "activity" }` only. Outcome connectors (HubSpot, Stripe) yield `{ kind: "event" }` only. Never yield events from communication connectors. This was an architectural correction made in Days 31-35.

## 8. Content Detection Type Isolation
Auto-created SituationTypes from content-situation-detector use `mode: "content"` in their detectionLogic. This mode is deliberately unrecognized by the cron-based situation detector, causing it to skip these types. Do not "fix" this — it's intentional. Content-detected types must not be re-evaluated by property-based detection.

## 9. Governance Before Reasoning
Policy evaluation happens BEFORE reasoning begins (to determine what the AI is allowed to do) and is verified AFTER reasoning completes (to confirm the proposed action doesn't violate constraints). Governance policies with `hasRequireApproval: true` force supervised mode regardless of autonomy level.

## 10. PersonalAutonomy Scope
PersonalAutonomy is per (situationType, aiEntity) — no department dimension. Learning transfers across departments. The reasoning engine uses highest-autonomy-wins when multiple users' AI entities are scoped to a situation. One well-trained user's AI unlocks autonomous behavior.

## 11. Reasoning Independence
AI reasons fresh from context each time. Prior reasoning text is NEVER fed forward into new reasoning calls. Learning flows through outcome signals (approval rates, PersonalAutonomy counters) and human corrections (editInstruction, priorFeedback) only. Feeding prior reasoning creates anchoring bias.

## 12. Communication Actor Logic
In content-situation-detector: for emails, `metadata.direction === "received"` means the org member is the actor (ball in their court). Sent emails are skipped. For Slack/Teams, `metadata.authorEmail` is excluded — the sender is not the person who needs to act.

## 13. instrumentationHook
`next.config.mjs` MUST have `instrumentationHook: true` (or `serverExternalPackages` config that enables instrumentation). Without this, `instrumentation.ts` never runs — meaning AI settings auto-seeding, situation detection cron, audit cron, and env validation all silently fail.

## 14. Prisma Migrate Safety
Never run `prisma migrate` from Claude Code — Prisma's AI agent safety guard blocks it. Use `npx prisma db push` manually. In Docker, the entrypoint handles migrations.
