---
allowed-tools: Read, Grep, Glob, Bash(git diff:*), Bash(grep -r:*)
description: Qorpera security review — auth, encryption, injection, data isolation
---

## Changed Files
!`git diff --name-only HEAD~1`

## Detailed Changes
!`git diff HEAD~1`

## Security Review Instructions

Review the changes above for security vulnerabilities specific to Qorpera's architecture. This is a multi-tenant B2B SaaS platform where data isolation between operators is the highest-priority security concern.

### Priority 1: Data Isolation (Operator Leaks)

Qorpera is multi-tenant by `operatorId`. A single missing filter can expose one company's data to another.

- Every Prisma query on operator-owned tables MUST include `where: { operatorId }` from session
- Check for any query that accepts `operatorId` from request body/params instead of session
- Check for joins or includes that could traverse across operator boundaries
- Check that `getSessionUser(request)` is the ONLY source of `operatorId`

### Priority 2: Auth Bypass

- Every API route MUST call `getSessionUser(request)` first and return 401 on null
- Check for routes that skip auth or have conditional auth paths
- Check that admin-only routes verify `user.role === "admin"` or `isSuperadmin`
- Check that superadmin routes verify `role === "superadmin"` specifically (not just `isSuperadmin`)
- Check the middleware (`src/middleware.ts`) for CSRF origin validation on mutating methods

### Priority 3: Injection Surface

Qorpera uses `prisma.$queryRaw` for pgvector operations. This is a SQL injection vector.

- Check all `$queryRaw` and `$executeRaw` calls for parameterized queries (tagged template literals)
- Flag any string concatenation or interpolation in raw SQL that isn't using Prisma's `Prisma.sql` tagged template
- Check for command injection in any `exec()` or `spawn()` calls
- Check document upload paths for path traversal (`../` in filenames)

### Priority 4: Token & Secret Handling

- OAuth tokens (HubSpot, Stripe, Google) MUST be encrypted via AES-256-GCM before storage
- Check `encrypt()`/`decrypt()` usage in connector auth flows
- `ENCRYPTION_KEY` must come from env, never hardcoded
- Session tokens must be httpOnly, secure (in production), sameSite: lax
- No `passwordHash` should appear in any API response
- No API keys or tokens should appear in console.log or error messages

### Priority 5: Input Validation

- Check that API routes validate request body shape before using it
- Check for missing `parseInt()` or validation on numeric URL params
- Check that file uploads validate MIME type and size
- Check that entity/department IDs from URL params are verified to belong to the operator

### Scan Commands
Run these and report findings:
```
grep -rn "passwordHash" src/app/api/ --include="*.ts" | grep -v "select:" | grep -v "omit"
grep -rn '\$queryRaw' src/ --include="*.ts"
grep -rn '\$executeRaw' src/ --include="*.ts"
grep -rn "console.log" src/ --include="*.ts" | grep -i "token\|secret\|key\|password"
grep -rn "operatorId.*req\|operatorId.*body\|operatorId.*params" src/app/api/ --include="*.ts"
```

### Output Format
List findings by severity:
- **CRITICAL**: Exploitable now — data leak, auth bypass, injection
- **HIGH**: Exploitable under specific conditions
- **MEDIUM**: Defense-in-depth gap
- **LOW**: Best practice improvement

If no findings: say "No security issues found" and stop.
