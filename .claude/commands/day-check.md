---
allowed-tools: Read, Grep, Glob, Bash(npx tsc --noEmit:*), Bash(npx prisma validate:*), Bash(npm run build:*), Bash(git diff:*), Bash(git log:*)
description: End-of-day integration check — build, types, schema, patterns
---

## What changed today
!`git log --oneline --since="12 hours ago"`

## Full diff
!`git diff HEAD~1 --stat`

## Integration Check Instructions

Run a full integration verification of today's work against the Qorpera codebase. This is the final gate before tagging and pushing.

### Step 1: Build Verification
Run and report results:
```
npx prisma validate
npx prisma generate
npm test
npx tsc --noEmit
npm run build
```
If any step fails, report the exact error and stop. Do not proceed to pattern checks.

### Step 2: Schema Consistency
- Compare `prisma/schema.prisma` against actual usage in today's changed files
- Check that any new model/field has a corresponding migration file in `prisma/migrations/`
- Verify no `prisma db push` was used against production (check git history for migration files)

### Step 3: Pattern Compliance (today's files only)
For each file changed today, verify:

**API routes:**
- [ ] `getSessionUser(request)` as first call
- [ ] operatorId from session, never from request body
- [ ] Scope filtering applied on GET routes
- [ ] Role check on mutation routes
- [ ] Superadmin excluded from user-facing queries

**Prisma operations:**
- [ ] ContentChunk creates use `select: { id: true }`
- [ ] Vector operations use `$queryRaw` with parameterized queries
- [ ] Multi-step mutations wrapped in `$transaction()` where atomicity matters

**Connectors (if changed):**
- [ ] sync() returns `AsyncGenerator<SyncYield>`
- [ ] SyncYield kinds match types in sync-types.ts
- [ ] OAuth tokens encrypted before storage

**General:**
- [ ] No unused imports or dead code introduced
- [ ] Error boundaries: async code has try/catch, errors logged not swallowed
- [ ] No console.log with sensitive data (tokens, passwords, keys)

### Step 4: Cross-cutting Concerns
- Check `instrumentation.ts` — if new background tasks were added, verify globalThis HMR guard
- Check `connector-sync.ts` — if SyncYield routing was modified, verify all three kinds still route correctly
- Check `identity-resolution.ts` — if merge logic was touched, verify snapshot is still stored before mutations

### Step 5: Dead Code Scan
```
grep -rn "TODO\|FIXME\|HACK\|XXX" src/ --include="*.ts" --include="*.tsx"
```
Report any new TODOs added today. Flag any that should be resolved before push.

### Output Format
Report as a checklist:
- ✅ Passing checks (brief, one line each)
- ❌ Failing checks (with details and file:line references)
- ⚠️ Warnings (non-blocking but worth noting)

End with a clear verdict: **READY TO PUSH** or **NEEDS FIXES** (with specific items to address).
