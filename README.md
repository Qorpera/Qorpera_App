# Qorpera

Decision-making intelligence for leadership. See your business without the meeting filter.

## Quick Start (Docker Compose)

```bash
# 1. Clone and configure
git clone <repo-url>
cp .env.example .env
# Edit .env with your AI provider keys and a strong ENCRYPTION_SECRET

# 2. Start
docker compose up -d

# 3. Run database migrations
docker compose exec app npx prisma migrate deploy

# 4. Open
# Visit http://localhost:3000
```

## Manual Setup (Development)

```bash
# Prerequisites: Node.js 20+, PostgreSQL 16+
npm install
cp .env.example .env
# Edit .env — point DATABASE_URL to your Postgres instance
npx prisma migrate deploy
npm run dev
```

## Architecture Overview

### Entity Categories

- **Foundational** — Departments and divisions that form the organizational skeleton. Created during onboarding, these are the top-level containers for all other entities.
- **Base** — Core business resources like team members, roles, and positions. Directly attached to departments and represent the people and structural roles within the organization.
- **Internal** — Operational artifacts generated within the business: documents, budgets, compensation records, and internal processes. Scoped to departments.
- **Digital** — Software tools, data sources, and connected systems. Represent the digital infrastructure the business runs on.
- **External** — Customers, vendors, partners, and other entities that exist outside the organization but interact with it. Visible across departments for linked context.

### Department Model

Departments are foundational entities that form the organizational skeleton. Each department contains team members (base entities), documents (internal entities), and can be bound to source connectors. The department structure is built by the user during onboarding and enriched by data from connected tools.

### Trust Gradient

Qorpera uses a three-level trust gradient for AI autonomy:

1. **Observe (Supervised)** — AI detects situations and proposes actions, but a human must approve every action before execution.
2. **Propose (Notify)** — AI detects and acts, but notifies the operator of what it did. The operator can review and provide feedback.
3. **Act (Autonomous)** — AI detects and acts without notification. Reserved for situation types with a proven track record of approved proposals.

Situation types graduate through these levels based on their approval rate and consecutive approval count.

### RAG Pipeline

Documents uploaded to departments are processed through a retrieval-augmented generation pipeline:
1. Text is extracted from PDF, DOCX, CSV, and TXT files
2. Text is split into overlapping chunks (~500 tokens each)
3. Chunks are embedded using the configured embedding provider
4. During situation reasoning, relevant chunks are retrieved via cosine similarity search

### Closed-World Reasoning

AI reasoning operates under a closed-world assumption: it acts only on evidence provided through connected data sources, uploaded documents, and materialized events. It never relies on general knowledge or assumptions about the business.

## Onboarding Walkthrough

The 6-step onboarding process configures your Qorpera instance:

1. **Name your company** — Set the company name and industry context
2. **Build departments** — Create at least 2 departments that represent your org structure
3. **Add team members** — Add at least 1 team member per department with roles and contact info
4. **Share knowledge** — Upload documents (org charts, budgets, rosters) to enrich department context (optional)
5. **Connect tools** — OAuth into HubSpot, Stripe, or Google Sheets to sync live business data
6. **Sync & orient** — AI learns your business through a guided conversation, discovering situation types and detection patterns

## Connector Setup Guides

### HubSpot

1. Create a HubSpot developer app at https://developers.hubspot.com
2. Set the redirect URI to `{YOUR_URL}/api/auth/hubspot/callback`
3. Required scopes: `crm.objects.contacts.read`, `crm.objects.deals.read`, `crm.objects.companies.read`
4. Set `HUBSPOT_CLIENT_ID` and `HUBSPOT_CLIENT_SECRET` in `.env`
5. Syncs: contacts, deals, companies, and associated activities

### Stripe

1. Get your Stripe API keys from https://dashboard.stripe.com/apikeys
2. Set the redirect URI to `{YOUR_URL}/api/auth/stripe/callback`
3. Set `STRIPE_CLIENT_ID` and `STRIPE_SECRET_KEY` in `.env`
4. Syncs: customers, invoices, subscriptions, charges, and balance transactions

### Google Sheets

1. Create a Google Cloud project and enable the Sheets API
2. Configure the OAuth consent screen (external or internal)
3. Create OAuth 2.0 credentials with redirect URI `{YOUR_URL}/api/auth/google/callback`
4. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`
5. Syncs: spreadsheet data from a configured Google Sheet, with folder-based discovery

## Configuration Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `ENCRYPTION_SECRET` | Yes | — | Secret for encrypting OAuth tokens and API keys (min 32 chars) |
| `AI_PROVIDER` | Yes | — | AI provider: `openai`, `anthropic`, or `ollama` |
| `AI_API_KEY` | No | — | API key for the AI provider (not needed for ollama) |
| `AI_MODEL` | No | `gpt-4o` | AI model name |
| `EMBEDDING_PROVIDER` | No | AI_PROVIDER | Embedding provider |
| `EMBEDDING_API_KEY` | No | AI_API_KEY | Embedding API key |
| `EMBEDDING_MODEL` | No | `text-embedding-3-small` | Embedding model name |
| `DOCUMENT_STORAGE_PATH` | No | `./uploads/documents` | Path for document storage |
| `NEXTAUTH_URL` | No | — | Base URL for the application |

## Known Limitations

- **Brute-force RAG** — Cosine similarity computed in JS, no vector database. Sufficient for <10K chunks per operator.
- **setInterval cron** — Not a proper job queue. Situation detection runs every 15 minutes, fine for pilot scale.
- **Single-instance deployment** — No horizontal scaling yet. One process, one instance.
- **No real-time updates** — UI uses polling, no WebSocket push.

## Health Check

`GET /api/health` — Returns system status, database connectivity, and storage writability.

```json
{
  "status": "ok",
  "timestamp": "2026-03-09T12:00:00.000Z",
  "version": "0.1.0",
  "database": "connected",
  "storage": "writable"
}
```
