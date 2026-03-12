# Qorpera Review Guidelines

## Always flag
- Missing `getSessionUser(request)` in any API route
- Missing `operatorId` filter in Prisma queries (data isolation breach)
- `prisma.contentChunk.create()` without `select: { id: true }` (runtime crash)
- String concatenation in `$queryRaw` or `$executeRaw` (SQL injection)
- Raw OAuth tokens stored without `encrypt()` call
- `passwordHash` appearing in any API response
- Missing scope filtering on GET routes returning operator data
- Any new background task in `instrumentation.ts` without globalThis HMR guard

## Never flag
- Formatting, whitespace, or naming conventions
- Missing JSDoc comments
- Import ordering
- Console.log in development-only code paths
- File length (some files are large by design)

## Context
This is a multi-tenant B2B SaaS. Operator data isolation is the #1 security priority. Every API route must authenticate via `getSessionUser()` and filter all queries by the session's `operatorId`. Vector operations use pgvector via raw SQL — always check for parameterized queries.
