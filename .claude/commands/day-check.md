---
allowed-tools: Read, Grep, Glob, Bash(npm test:*), Bash(npx tsc --noEmit:*), Bash(npx prisma validate:*), Bash(npm run build:*), Bash(git diff:*), Bash(git log:*), Bash(grep -r:*)
description: End-of-day integration check — tests, build, types, schema, patterns
---

## What changed today
!`git log --oneline --since="12 hours ago"`

## Full diff
!`git diff HEAD~1 --stat`

## Integration Check Instructions

Run a full integration verification of today's work against the Qorpera codebase. This is the final gate before tagging and pushing.

### Step 1: Test Suite (BLOCKING)
```
npm test
```
If any test fails, report the exact failure and stop. Do not proceed to further steps. Tests are the first gate — everything else is meaningless if tests fail.

### Step 2: Build Verification (BLOCKING)
Run each command and report results:
```
npx prisma validate
npx prisma generate
npx tsc --noEmit
npm run build
```
If any step fails, report the exact error and stop. Do not proceed to pattern checks.

### Step 3: Pattern Compliance Scan

Run these scans and report any violations:

**Auth & isolation:**
```
grep -rn "operatorId.*req\|operatorId.*body\|operatorId.*params" src/app/api/ --include="*.ts" | grep -v "getSessionUser"
```
Flag: any route accepting operatorId from request instead of session.

**ContentChunk select:**
```
grep -rn "contentChunk.create" src/ --include="*.ts" | grep -v "select:"
```
Flag: any ContentChunk create missing `select: { id: true }`.

**pgvector injection surface:**
```
grep -rn '\$queryRaw\|executeRaw' src/ --include="*.ts" | grep -v "Prisma.sql\|tagged template"
```
Flag: any raw SQL that uses string concatenation instead of tagged templates.

**Dead imports from situation-executor:**
```
grep -rn "situation-executor\|executeSituationAction" src/ --include="*.ts" | grep -v "\.test\." | grep -v "node_modules"
```
Flag: any non-test file importing from situation-executor.ts.

**Legacy notification pattern in new code:**
Check today's diff for any new `prisma.notification.create` calls. New code must use `sendNotification()` from `notification-dispatch.ts`.
```
git diff HEAD~1 -- src/ | grep "+.*notification.create" | grep -v "sendNotification\|notification-dispatch\|\.test\."
```
Flag: new code using direct notification creation.

**Password/token exposure:**
```
grep -rn "passwordHash" src/app/api/ --include="*.ts" | grep -v "select:" | grep -v "omit"
grep -rn "console.log" src/ --include="*.ts" | grep -iE "token|secret|key|password"
```
Flag: passwordHash in API responses or secrets in console.log.

**Superadmin in user lists:**
Check any user-listing query added today for superadmin exclusion:
```
git diff HEAD~1 -- src/ | grep -A5 "findMany.*user\|findMany.*User" | grep -v "superadmin"
```
Flag: user lists missing `role: { not: "superadmin" }` filter.

### Step 4: Phase 3 Specific Checks

**Execution path integrity:**
- Verify no new code imports `executeSituationAction` or calls it directly
- Verify any new plan creation goes through `createExecutionPlan`
- Verify any new step advancement goes through `advanceStep`

**Reasoning output format:**
- If reasoning-engine.ts was modified, verify output uses `actionPlan` (array), not `chosenAction`
- If any frontend file was modified, verify it handles `actionPlan` array format, not old `.action`/`.justification` fields

**Department scope:**
- If any new GET endpoint returns department-scoped data, verify `getVisibleDepartmentIds` is used for member users

**Internal capability routing:**
- If execution-engine.ts was modified, verify `connectorId === null` check routes to `executeInternalCapability`

### Step 5: Dead Code Check

List any files that appear to be unused (imported by nothing):
```
for f in $(git diff --name-only HEAD~1 | grep "\.ts$"); do
  basename=$(echo $f | sed 's|.*/||' | sed 's|\.ts$||')
  count=$(grep -rn "$basename" src/ --include="*.ts" | grep -v "$f" | grep -v "node_modules" | wc -l)
  if [ "$count" -eq 0 ]; then
    echo "POSSIBLY DEAD: $f (no imports found)"
  fi
done
```

### Output Format

Report as a checklist:
- ✅ Passing checks (brief, one line each)
- ❌ Failing checks (with details and file:line references)
- ⚠️ Warnings (non-blocking but worth noting)

End with a clear verdict: **READY TO PUSH** or **NEEDS FIXES** (with specific items to address).
