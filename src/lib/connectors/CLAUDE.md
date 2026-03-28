# src/lib/connectors/ — Connector Providers

## Contract
Every connector provider exports a `sync()` method returning `AsyncGenerator<SyncYield>`.

SyncYield is `{ kind: "event" | "content" | "activity", data: ... }`:
- `event`: Outcome data materialized into entities via EVENT_MATERIALIZERS rules.
- `content`: Text content → ContentChunk with pgvector embedding. sourceType must be one of: "email", "slack_message", "teams_message", "drive_doc", "calendar_note"
- `activity`: Behavioral metadata → ActivitySignal. signalType must be one of: "email_sent", "email_received", "slack_message", "teams_message", "doc_edit", "doc_created", "doc_shared", "meeting_held", "meeting_frequency"

## Provider Files

| File | Type | APIs | Yields | Env Vars |
|---|---|---|---|---|
| `google-provider.ts` | Personal (per-user OAuth) | Gmail API, Drive API, Calendar API, Sheets API | content + activity | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| `google-auth.ts` | — | Token refresh helper for Google OAuth | — | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| `google-sheets.ts` | Personal (legacy standalone) | Sheets API | content + activity | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| `microsoft-provider.ts` | Personal (per-user Azure AD OAuth) | Graph API (Mail, OneDrive, Teams, Calendar) | content + activity | `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID` |
| `microsoft-auth.ts` | — | Token refresh helper for Azure AD | — | `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID` |
| `slack-provider.ts` | Company (bot token OAuth) | Slack Web API (conversations, users) | content + activity | `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` |
| `hubspot.ts` | Company (admin installs) | HubSpot CRM API (contacts, companies, deals) | events | `HUBSPOT_CLIENT_ID`, `HUBSPOT_CLIENT_SECRET` |
| `hubspot-auth.ts` | — | Token refresh helper for HubSpot OAuth | — | `HUBSPOT_CLIENT_ID`, `HUBSPOT_CLIENT_SECRET` |
| `stripe.ts` | Company (admin installs) | Stripe API (customers, invoices, payments) | events | `STRIPE_SECRET_KEY` |
| `stripe-auth.ts` | — | Token management for Stripe (API key based) | — | `STRIPE_SECRET_KEY` |
| `dynamics-bc-provider.ts` | Company (Azure AD OAuth) | Dynamics 365 Business Central API v2.0 | events | `DYNAMICS_BC_CLIENT_ID`, `DYNAMICS_BC_CLIENT_SECRET`, `DYNAMICS_BC_TENANT_ID` |
| `sap-provider.ts` | Company (Basic Auth) | SAP S/4HANA Cloud OData API | events | (none — credentials in connector config) |
| `oracle-erp-provider.ts` | Company (OAuth 2.0 Client Credentials) | Oracle ERP Cloud REST API | events | (none — credentials in connector config) |
| `maersk-provider.ts` | Company (OAuth 2.0 Client Credentials) | Maersk Track & Trace API | events | (none — credentials in connector config) |
| `cargowise-provider.ts` | Company (Basic Auth) | CargoWise eAdaptor XML | events | (none — credentials in connector config) |
| `registry.ts` | — | Provider lookup by ID, list all providers | — | — |
| `types.ts` | — | ConnectorProvider interface, SyncEvent, ConnectorCapability types | — | — |
| `sync-types.ts` | — | SyncYield discriminated union type definition | — | — |

## Sync Orchestration
connector-sync.ts dispatches by provider type. Post-sync hooks:
1. Identity resolution (fire-and-forget)
2. Content situation evaluation (fire-and-forget, communication content only)

## Common Patterns
- 429 retry with Retry-After header
- `lastSyncAt` cursor for incremental sync
- Entity creation for unresolved participants (sourceSystem set to connector name)
- Automated email filtering via `isAutomatedEmail()` in email syncs
- Write-back capabilities registered as ActionCapability records on connector creation
- Encrypted config storage: `encrypt(JSON.stringify(config))` on save, `JSON.parse(decrypt(config))` on read
