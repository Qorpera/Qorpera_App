# Day 29: Connector Architecture Refactor

**Date:** 2026-03-12
**Branch:** Day29ReFactor

## Overview

This refactor splits connectors into two categories — **Company** (HubSpot, Stripe) and **Personal** (Google unified) — and removes the `ConnectorDepartmentBinding` model entirely. Company connectors are operator-level and managed in Settings. Personal connectors (Google) are per-user and managed on the Account page.

Previously, every connector had to be manually bound to a department via `ConnectorDepartmentBinding`, and Gmail/Drive/Calendar/Sheets were separate providers. Now Google is a single unified OAuth flow granting all scopes at once, and data routing happens automatically through entity resolution rather than manual bindings.

---

## Database Schema Changes

### `prisma/schema.prisma`

**Removed:**
- `ConnectorDepartmentBinding` model (entire model deleted — ~20 lines)
- `connectorDepartmentBindings` relation on `Operator`
- `connectorBindings` relation on `Entity`
- `departmentBindings` relation on `SourceConnector`

**Added:**
- `userId String?` on `SourceConnector` — null means company connector, set means personal
- `user User? @relation(...)` on `SourceConnector` with `onDelete: Cascade`
- `connectors SourceConnector[]` on `User`

**Updated:**
- `SourceConnector.provider` comment changed from `"google-sheets", "hubspot", "stripe", "gmail"` to `"google", "hubspot", "stripe"`

### Migration: `prisma/migrations/20260312_connector_refactor/migration.sql`

```sql
DROP TABLE IF EXISTS "ConnectorDepartmentBinding";
DELETE FROM "ContentChunk" WHERE "sourceType" != 'uploaded_doc';
DELETE FROM "ActivitySignal";
DELETE FROM "SyncLog";
DELETE FROM "Event";
DELETE FROM "ActionCapability" WHERE "connectorId" IS NOT NULL;
DELETE FROM "SourceConnector";
ALTER TABLE "SourceConnector" ADD COLUMN "userId" TEXT REFERENCES "User"("id") ON DELETE CASCADE;
```

This is a destructive migration — all connector-related data is wiped since there are no real customers yet. The ConnectorDepartmentBinding table is dropped before the SourceConnector deletes to avoid FK constraint violations.

---

## New Files

### `src/lib/connectors/google-provider.ts` — Unified Google Provider

Replaces the old `gmail-provider.ts` with a single provider that handles all Google services through scope-based routing:

- **`googleProvider`**: `ConnectorProvider` with `id: "google"`, `name: "Google"`
- **`sync(config, since?)`**: AsyncGenerator that checks granted scopes and delegates:
  - Gmail scopes → `syncGmail()` — full message listing, batch fetching, body extraction, newsletter detection, entity creation via `upsertEntity()`, thread-based response time calculation
  - Drive scopes → `syncDrive()` (skeleton)
  - Calendar scopes → `syncCalendar()` (skeleton)
  - Sheets scopes → `syncSheets()` (skeleton)
- **`getGoogleAccessToken(config)`**: Token refresh helper (delegates to `google-auth.ts`)
- **Gmail sync features:**
  - Fetches messages via `messages.list` + `messages.get` with `format=full`
  - Extracts plain text body from MIME parts (handles multipart/alternative, base64 decoding)
  - Newsletter detection via `List-Unsubscribe` header + body pattern matching (unsubscribe links in bottom 20%)
  - Creates contact entities with email identity properties for sender/recipients
  - Calculates thread response times by comparing sent vs received timestamps
  - Yields `SyncYield` events (type `email_received`/`email_sent`/`newsletter_received`), content chunks, and activity signals (`email_response_time`)

### `src/app/api/connectors/google/auth/route.ts` — Unified Google OAuth Start

- Requests all 5 scopes: `gmail.readonly`, `gmail.send`, `drive.readonly`, `calendar.readonly`, `spreadsheets.readonly`
- CSRF state via `google_oauth_state` cookie (32-byte random hex)
- Optional `?from=onboarding` param stored in `google_oauth_return` cookie
- Returns `{ url }` for the frontend to redirect to

### `src/app/api/connectors/google/callback/route.ts` — Unified Google OAuth Callback

- Exchanges authorization code for tokens via `https://oauth2.googleapis.com/token`
- Fetches Gmail profile for display email
- Creates/updates a **personal** `SourceConnector` with `provider: "google"`, `userId: user.id`
- Stores `access_token`, `refresh_token`, `token_expiry`, `email_address`, `scopes` in encrypted config
- Upserts: if user already has a Google connector, updates it rather than creating a duplicate
- Redirects to `/account` by default, or `/onboarding` if the `google_oauth_return` cookie was set

---

## Deleted Files

| File | Reason |
|------|--------|
| `src/app/api/auth/google/callback/route.ts` | Replaced by `/api/connectors/google/callback` |
| `src/app/api/connectors/gmail/auth-url/route.ts` | Replaced by `/api/connectors/google/auth` (existed in prior session) |
| `src/app/api/connectors/gmail/callback/route.ts` | Replaced by `/api/connectors/google/callback` (existed in prior session) |
| `src/app/api/connectors/[id]/bindings/route.ts` | ConnectorDepartmentBinding removed |
| `src/app/api/connectors/google-drive/discover/route.ts` | Drive discovery now part of unified Google provider |
| `src/app/api/connectors/google-sheets/auth-url/route.ts` | Sheets OAuth now part of unified Google auth |
| `src/app/api/departments/[id]/connectors/route.ts` | Department-connector binding CRUD removed |
| `src/app/api/departments/[id]/connectors/[bindingId]/route.ts` | Individual binding management removed |

---

## Modified Files — Detailed Changes

### Frontend Pages

#### `src/app/onboarding/page.tsx` (-345 lines net)

**Step 5 completely rewritten:**
- **Before:** Per-department accordion with binding management — each department expanded to show connected bindings with entity type filters, provider connect buttons, Google Sheets spreadsheet picker, and a Gmail standalone card
- **After:** Flat "Link your company tools" view with HubSpot and Stripe connect buttons, showing connected status. No department-level binding. Personal tools (Google) deferred to Account page.

**Removed:**
- `ConnectorBinding` type import
- `CONNECTOR_ENTITY_TYPES` import
- `bindingsPerDept` state, `expandedConnDept` state, `sheetsByConnector` state, `savingSheets` state, `manualSheetUrl` state
- `loadBindings()` callback (fetched `/api/departments/{id}/connectors`)
- OAuth return handler that created department bindings after connect
- `handleConnectProvider(providerId, deptId)` (replaced with `handleConnectProvider(providerId)`)
- `totalBindings`, `activeBindings`, `pendingBindings` calculations
- Gmail standalone card block (referenced deleted `/api/connectors/gmail/auth-url`)
- Per-department binding display with entity type filters
- Google Sheets spreadsheet picker inside bindings
- All `gmailConnector` references

**Added:**
- `companyConnectors` state (fetched from `/api/connectors` filtering `!userId`)
- `loadCompanyConnectors()` callback
- Flat provider cards with connect/connected status

**Updated:**
- Step 5 title: "Connect your tools" → "Link your company tools"
- Step 5 subtitle: mentions personal tools on Account page
- Step detection: removed `connectorCount`/binding dependency
- OAuth return detection: removed `google=connected` (personal flow goes to Account)
- Gate indicator: "Company tools are optional" message

#### `src/app/account/page.tsx` (+110 lines)

**Added "Connected Accounts" section:**
- Google connect button with OAuth flow via `/api/connectors/google/auth`
- Shows connector name and "Connected" badge when Google is linked
- Handles `?google=connected` and `?google=error` OAuth return params with toast notifications
- `loadGoogleConnector()` callback filters connectors by `provider === "google" && userId`
- Wrapped in `<Suspense>` for `useSearchParams()` compatibility

#### `src/app/map/[departmentId]/page.tsx` (-543 lines net)

**Massive binding cleanup:**
- Removed `ConnectorBinding` interface
- Removed `AvailableConnector` interface
- Removed `ProviderIcon` component
- Removed 11 binding-related state variables: `bindings`, `availableConnectors`, `showBindingModal`, `bindingModalStep`, `selectedConnector`, `selectedTypeFilter`, `providers`, `editingBindingId`, `editingFilter`, `removingBindingId`, `syncing`
- Removed 10 binding-related functions: `fetchBindings`, `fetchAvailableConnectors`, `fetchProviders`, `handleCreateBinding`, `triggerSync`, `handleToggleBinding`, `handleSaveBindingFilter`, `handleRemoveBinding`, `openBindingModal`, `handleConnectNewProvider`
- Removed OAuth return handler useEffect
- Removed "Connect Data Source" modal (2-step wizard)
- Removed "Remove Binding Confirmation" modal
- Replaced "Connected Data" section body with: "Connectors are now managed at the company level in Settings."
- Kept connected entities display (independent of bindings)

#### `src/app/settings/page.tsx` (-34 lines)

- Removed `connectorBindings` state and its `Record<string, Array<...>>` type
- Removed binding-loading loop inside `loadConnectors` (fetched `/api/connectors/{id}/bindings`)
- Removed `const bindings = connectorBindings[c.id] || [];`
- Removed "Department bindings" JSX section (department links or "Not bound" message)
- Removed `gmailParam` search param reader and Gmail toast effect
- Updated Google connected toast: "Configure your spreadsheet below" → "Google account connected successfully."

#### `src/app/login/page.tsx`
- Minor logo/branding update

#### `src/components/app-shell.tsx`
- Minor nav/branding adjustments

#### `src/components/qorpera-logo.tsx`
- Logo SVG refinements

#### `src/components/onboarding/types.ts`
- Removed `ConnectorBinding` interface (was 13 lines)

### API Routes

#### `src/app/api/connectors/route.ts`
- Added `userId: c.userId` to GET response items so frontend can distinguish company vs personal connectors

#### `src/app/api/connectors/providers/route.ts`
- Added `p.id === "google"` to the Google env-var availability check (alongside existing `google-sheets` and `gmail` checks)

#### `src/app/api/auth/hubspot/callback/route.ts`
- Removed `ConnectorDepartmentBinding` creation that auto-bound new HubSpot connector to a department

#### `src/app/api/auth/stripe/callback/route.ts`
- Removed `ConnectorDepartmentBinding` creation that auto-bound new Stripe connector to a department

#### `src/app/api/admin/create-test-company/route.ts`
- Removed `ConnectorDepartmentBinding` creation from test data seeding

#### `src/app/api/admin/operators/[id]/route.ts`
- Removed `connectorDepartmentBindings` from cascade delete

#### `src/app/api/departments/[id]/route.ts`
- Removed `connectorDepartmentBindings` from department detail include and delete cascade

#### `src/app/api/departments/route.ts`
- Removed `_count: { connectorDepartmentBindings }` from department list query
- Removed `connectorCount` from response mapping (was derived from binding count)

### Library Files

#### `src/lib/connectors/registry.ts`
- Added `googleProvider` import from `./google-provider`
- Updated `PROVIDERS` array: `[hubspotProvider, stripeProvider, googleProvider, googleSheetsProvider]`

#### `src/lib/connector-sync.ts`
- Added `config._operatorId = operatorId` after config decryption — makes operatorId available to providers that need it for entity creation (e.g., Gmail contact entities)

#### `src/lib/sync-scheduler.ts`
- Replaced `gmail: 5min`, `google-drive: 15min`, `google-calendar: 15min` with unified `google: 5min`
- Kept `google-sheets: 30min` for legacy standalone connectors

#### `src/lib/event-materializer.ts`
- Exported `ensureHardcodedEntityType()` (was private) — needed by Google provider for entity type auto-seeding
- Replaced `routeEntityToDepartments()` body with no-op comment — binding-based routing removed, entity resolution handles routing now

#### `src/lib/api-validation.ts`
- Removed `ConnectorDepartmentBinding` references from validation helpers

#### `src/lib/connector-entity-types.ts`
- Removed binding-related entity type references

#### `src/lib/ai-copilot.ts`
- Removed `ConnectorDepartmentBinding` references from AI context building

### Middleware

#### `src/middleware.ts`
- Removed `/api/auth/google/callback` and `/api/connectors/gmail/callback` from `PUBLIC_PATHS`
- Added `/api/connectors/google/callback` to `PUBLIC_PATHS`

---

## Architecture Summary

### Before (Binding-Based)
```
Operator
  └── SourceConnector (gmail, google-sheets, hubspot, stripe)
        └── ConnectorDepartmentBinding
              ├── departmentId (which department gets the data)
              ├── entityTypeFilter (which entity types to route)
              └── enabled (toggle on/off)
```

### After (User/Operator Split)
```
Operator
  └── SourceConnector (userId=null → company: hubspot, stripe)

User
  └── SourceConnector (userId=set → personal: google)
        └── Unified Google OAuth (Gmail + Drive + Calendar + Sheets)
```

Data routing is now handled by:
- **Entity resolution** (`src/lib/entity-resolution.ts`) — matches contacts/companies by email/domain
- **Department membership** — user's entity links to departments via relationships
- **No manual binding step** — connectors just sync, and the knowledge graph figures out where data belongs
