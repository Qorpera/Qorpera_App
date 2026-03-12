---
allowed-tools: Read, Grep, Glob, Bash(git diff:*), Bash(git log:*), Bash(npx prisma validate:*), Bash(npx tsc --noEmit:*)
description: Qorpera code review — logic errors, pattern violations, architectural drift
---

## Changed Files
!`git diff --name-only HEAD~1`

## Detailed Changes
!`git diff HEAD~1`

## Review Instructions

You are reviewing Qorpera, a Next.js App Router + Prisma + PostgreSQL (pgvector) operational intelligence platform. Focus ONLY on bugs, logic errors, and pattern violations. Do not comment on style, naming, or formatting.

### Mandatory Pattern Checks

1. **Auth pattern**: Every API route in `src/app/api/` MUST call `getSessionUser(request)` as its first operation. Flag any route that reads cookies directly, uses `getOperatorId()`, or skips auth entirely.

2. **Scope filtering**: Every GET route returning data MUST apply scope filtering via `getVisibleDepartments()`. Mutation routes MUST check role. Flag any route that returns unfiltered data.

3. **ContentChunk creates**: Every `prisma.contentChunk.create()` MUST use `select: { id: true }`. Missing this causes a runtime crash from Prisma trying to deserialize pgvector columns. This is a critical bug if missing.

4. **pgvector operations**: All vector queries MUST use `prisma.$queryRaw` with `<=>` operator. Flag any attempt to do cosine similarity in JavaScript or use Prisma's standard query API for vector columns.

5. **SyncYield contract**: Any new connector MUST yield `{ kind: "event" | "content" | "activity", data: ... }`. The orchestrator routes by kind — check that new yield kinds match expected types in `sync-types.ts`.

6. **Operator isolation**: Every Prisma query touching operator-owned data MUST filter by `operatorId` from session. Flag any query that could leak data across operators.

7. **Superadmin exclusion**: Superadmin users MUST be excluded from team lists, user counts, and any customer-facing query. Flag any user query that doesn't filter `role !== "superadmin"`.

8. **Identity resolution safety**: Same-source merging must be blocked. Merge operations must be transactional. Snapshot must be stored before any property changes.

9. **Encryption**: OAuth tokens MUST go through `encrypt()`/`decrypt()` from `src/lib/encryption.ts`. Flag any raw token storage.

10. **Dead code**: Flag any unused imports, unreachable code paths, or functions that are no longer called. Qorpera treats dead code removal as a priority.

### Also Check
- Schema changes: does `prisma/schema.prisma` match what the code expects? Run `npx prisma validate`.
- Type safety: run `npx tsc --noEmit` and report any type errors.
- Error handling: async operations in API routes should have try/catch. Sync scheduler errors must never crash the process.
- Prisma transactions: multi-step mutations that must be atomic should use `prisma.$transaction()`.

### Output Format
List findings by severity:
- **CRITICAL**: Will cause runtime crash, data leak, or data corruption
- **BUG**: Logic error that produces wrong results
- **PATTERN VIOLATION**: Breaks an established convention (may work but creates maintenance debt)
- **NOTE**: Observation worth considering but not blocking

If no findings: say "No issues found" and stop. Do not invent findings.
