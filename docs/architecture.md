# Qorpera Architecture

## System Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ CONNECTOR SYNC PIPELINE                                                     │
│                                                                             │
│ sync-scheduler.ts (1min tick)                                               │
│   └── connector-sync.ts (orchestrator)                                      │
│         ├── connectors/google-provider.ts    → yields content + activity    │
│         ├── connectors/microsoft-provider.ts → yields content + activity    │
│         ├── connectors/slack-provider.ts     → yields content + activity    │
│         ├── connectors/hubspot.ts            → yields events               │
│         └── connectors/stripe.ts             → yields events               │
│                                                                             │
│   Dispatch by kind:                                                         │
│     event    → event-materializer.ts → entity-resolution.ts (upsert)       │
│     content  → content-pipeline.ts   → rag/chunker.ts → rag/embedder.ts   │
│     activity → activity-pipeline.ts  → entity-resolution.ts (resolve)      │
│                                                                             │
│   Post-sync hooks (fire-and-forget):                                        │
│     1. identity-resolution.ts  — ML entity merge                           │
│     2. content-situation-detector.ts — communication action detection       │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ SITUATION DETECTION                                                         │
│                                                                             │
│ situation-cron.ts (5min interval, registered in instrumentation.ts)         │
│   └── situation-detector.ts                                                 │
│         ├── Parse detectionLogic JSON (mode: structured/natural/hybrid)     │
│         ├── situation-prefilter.ts — fast structured pre-filter             │
│         ├── situation-scope.ts — department boundary check                  │
│         ├── context-assembly.ts — builds SituationContext                   │
│         └── Creates Situation → fires reasoning-engine.ts                   │
│                                                                             │
│ content-situation-detector.ts (triggered by connector-sync post-hook)       │
│   └── LLM evaluates communication batches                                  │
│         └── Creates Situation → fires reasoning-engine.ts                   │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ REASONING PIPELINE                                                          │
│                                                                             │
│ reasoning-engine.ts                                                         │
│   ├── context-assembly.ts — assembleSituationContext()                      │
│   │     ├── entity-resolution.ts — getEntityContext()                       │
│   │     ├── graph-traversal.ts — searchAround()                            │
│   │     ├── rag/retriever.ts — retrieveRelevantContext()                    │
│   │     ├── rag/embedder.ts — embedChunks() for query vectors              │
│   │     ├── loadActivityTimeline() — 30-day ActivitySignal aggregation     │
│   │     ├── loadCommunicationContext() — pgvector content retrieval        │
│   │     └── loadCrossDepartmentSignals() — external entity patterns        │
│   ├── policy-evaluator.ts — evaluateActionPolicies() + getEffectiveAutonomy│
│   ├── reasoning-prompts.ts — buildReasoningSystemPrompt/UserPrompt         │
│   ├── Route by token count:                                                 │
│   │     ├── <12K → ai-provider.ts callLLM() single-pass                    │
│   │     └── >12K → multi-agent-reasoning.ts (3 specialists + coordinator)  │
│   ├── situation-executor.ts — execute approved actions via connectors       │
│   └── autonomy-graduation.ts — update PersonalAutonomy counters            │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ COPILOT                                                                     │
│                                                                             │
│ ai-copilot.ts                                                               │
│   ├── Tools: lookup_entity, search_entities, search_around,                │
│   │   execute_connector_action, create_internal_entity,                     │
│   │   search_emails, get_email_thread, search_documents,                   │
│   │   get_activity_summary, search_messages, get_message_thread            │
│   ├── All data tools apply deptVisFilter for member scoping                │
│   ├── ai-provider.ts — callLLM/streamLLM with tool definitions            │
│   ├── orientation-prompts.ts — system prompt for onboarding phase          │
│   └── business-context.ts — operator business context injection            │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Module Dependency Map

Each entry lists what a file imports from other `src/lib/` files.

### Core Infrastructure
- **db.ts** → (none — leaf dependency)
- **encryption.ts** → (none)
- **env-validation.ts** → (none)
- **api-validation.ts** → (none — uses zod only)
- **rate-limiter.ts** → (none)
- **fetch-api.ts** → (none)
- **document-slots.ts** → (none)
- **entity-data.ts** → (none — type definitions only)
- **hardcoded-type-defs.ts** → (none)
- **types.ts** → (none)
- **reasoning-types.ts** → (none — uses zod only)

### Auth & Permissions
- **auth.ts** → db
- **user-scope.ts** → db

### Knowledge Graph
- **entity-resolution.ts** → db, hardcoded-type-defs
- **entity-model-store.ts** → db
- **graph-traversal.ts** → db, entity-data
- **structural-extraction.ts** → db, ai-provider, hardcoded-type-defs
- **business-context.ts** → db
- **orientation-prompts.ts** → db

### AI Provider
- **ai-provider.ts** → db

### RAG
- **rag/chunker.ts** → (none)
- **rag/embedder.ts** → (external only)
- **rag/embedding-queue.ts** → (external only)
- **rag/pipeline.ts** → (external only)
- **rag/retriever.ts** → (external only)

### Data Pipeline
- **content-pipeline.ts** → db, rag/chunker, rag/embedder
- **activity-pipeline.ts** → db, entity-resolution
- **event-materializer.ts** → db, entity-resolution, entity-model-store, situation-detector, situation-resolver, hardcoded-type-defs
- **identity-resolution.ts** → db, rag/embedder, hardcoded-type-defs
- **connector-sync.ts** → db, connectors/registry, event-materializer, encryption, content-pipeline, activity-pipeline, content-situation-detector
- **sync-scheduler.ts** → db, connector-sync

### Situation Detection
- **situation-detector.ts** → db, ai-provider, entity-resolution, context-assembly, reasoning-engine, situation-scope
- **content-situation-detector.ts** → db, ai-provider, entity-resolution, activity-pipeline, reasoning-engine
- **situation-prefilter.ts** → db, ai-provider
- **situation-audit.ts** → db, ai-provider, situation-prefilter
- **situation-cron.ts** → db, situation-detector, situation-audit
- **situation-scope.ts** → db
- **situation-resolver.ts** → db
- **situation-executor.ts** → db, connectors/registry, encryption
- **event-retention.ts** → db

### Reasoning
- **context-assembly.ts** → db, entity-resolution, graph-traversal, rag/retriever, rag/embedder, business-context
- **reasoning-engine.ts** → db, ai-provider, context-assembly, policy-evaluator, reasoning-prompts, business-context, situation-executor, reasoning-types
- **multi-agent-reasoning.ts** → ai-provider, reasoning-prompts, context-assembly, reasoning-types
- **reasoning-prompts.ts** → context-assembly, policy-evaluator
- **policy-evaluator.ts** → db
- **policy-engine.ts** → db, types
- **autonomy-graduation.ts** → db

### Copilot
- **ai-copilot.ts** → db, ai-provider, entity-resolution, graph-traversal, entity-model-store, business-context, orientation-prompts, situation-prefilter, connectors/registry, encryption, hardcoded-type-defs, user-scope

## API Route Organization

### Auth (public + authenticated)
| Route | Methods | Auth |
|---|---|---|
| `/api/auth/login` | POST | Public |
| `/api/auth/register` | POST | Public |
| `/api/auth/registration-status` | GET | Public |
| `/api/auth/logout` | POST | Public |
| `/api/auth/check` | GET | Public |
| `/api/auth/me` | GET | Authenticated |
| `/api/auth/hubspot/callback` | GET | Public (OAuth) |
| `/api/auth/stripe/callback` | GET | Public (OAuth) |

### Connectors
| Route | Methods | Auth |
|---|---|---|
| `/api/connectors` | GET, POST | Admin |
| `/api/connectors/[id]` | GET, PATCH, DELETE | Admin |
| `/api/connectors/[id]/sync` | POST | Admin |
| `/api/connectors/sync-all` | POST | Admin |
| `/api/connectors/providers` | GET | Admin |
| `/api/connectors/google/auth` | GET | Authenticated |
| `/api/connectors/google/callback` | GET | Public (OAuth) |
| `/api/connectors/google-sheets/clone-pending` | POST | Admin |
| `/api/connectors/hubspot/auth-url` | GET | Admin |
| `/api/connectors/microsoft/auth` | GET | Authenticated |
| `/api/connectors/microsoft/callback` | GET | Public (OAuth) |
| `/api/connectors/slack/auth-url` | GET | Admin |
| `/api/connectors/slack/callback` | GET | Public (OAuth) |
| `/api/connectors/stripe/auth-url` | GET | Admin |

### Departments
| Route | Methods | Auth |
|---|---|---|
| `/api/departments` | GET, POST | GET: Scoped, POST: Admin |
| `/api/departments/[id]` | GET, PATCH, DELETE | Scoped (403 if not visible) |
| `/api/departments/[id]/members` | GET, POST | Scoped |
| `/api/departments/[id]/members/[entityId]` | PATCH, DELETE | Scoped |
| `/api/departments/[id]/entities` | GET | Scoped |
| `/api/departments/[id]/connected-entities` | GET | Scoped |
| `/api/departments/[id]/external-links` | GET | Scoped |
| `/api/departments/[id]/documents` | GET | Scoped |
| `/api/departments/[id]/documents/upload` | POST | Scoped |
| `/api/departments/[id]/documents/[docId]` | DELETE | Scoped |
| `/api/departments/[id]/documents/[docId]/extract` | POST | Scoped |
| `/api/departments/[id]/documents/[docId]/confirm` | POST | Scoped |
| `/api/departments/[id]/documents/[docId]/reprocess` | POST | Scoped |

### Entities
| Route | Methods | Auth |
|---|---|---|
| `/api/entities` | GET, POST | Scoped |
| `/api/entities/[id]` | GET, PATCH, DELETE | Scoped |
| `/api/entities/[id]/relationships` | GET | Scoped |
| `/api/entities/[id]/assign-department` | POST | Admin |
| `/api/entities/unrouted` | GET | Admin |
| `/api/entity-types` | GET, POST | GET: Authenticated, POST: Admin |
| `/api/entity-types/[id]` | GET, PATCH, DELETE | Admin |
| `/api/entity-types/[id]/properties` | POST, PATCH, DELETE | Admin |
| `/api/relationship-types` | GET, POST | Authenticated |
| `/api/relationships/[id]` | DELETE | Admin |

### Graph
| Route | Methods | Auth |
|---|---|---|
| `/api/graph` | GET | Scoped |
| `/api/graph/focused` | GET | Scoped |
| `/api/graph/search` | GET | Scoped |

### Situations
| Route | Methods | Auth |
|---|---|---|
| `/api/situations` | GET | Scoped |
| `/api/situations/[id]` | GET, PATCH | Scoped (PATCH: approve/reject) |
| `/api/situations/[id]/reason` | POST | Scoped |
| `/api/situations/detect` | POST | Admin |
| `/api/situations/audit` | POST | Admin |
| `/api/situations/status` | GET | Authenticated |
| `/api/situation-types` | GET | Scoped |

### Copilot
| Route | Methods | Auth |
|---|---|---|
| `/api/copilot` | POST | Authenticated |
| `/api/copilot/sessions` | GET | Authenticated |
| `/api/copilot/messages` | GET | Authenticated |
| `/api/copilot/context` | GET | Authenticated |

### Events
| Route | Methods | Auth |
|---|---|---|
| `/api/events` | POST, GET | Admin |
| `/api/events/[id]` | GET | Admin |
| `/api/events/process` | POST | Admin |
| `/api/events/cleanup` | POST | Admin |

### Learning & Autonomy
| Route | Methods | Auth |
|---|---|---|
| `/api/learning/overview` | GET | Scoped |
| `/api/learning/departments` | GET | Scoped |
| `/api/learning/situation-types/[id]` | GET | Scoped |
| `/api/learning/feedback-impact` | GET | Scoped |
| `/api/learning/export` | GET | Scoped |
| `/api/autonomy/promote` | POST | Admin |
| `/api/autonomy/demote` | POST | Admin |
| `/api/autonomy/settings` | GET, PUT | Admin |
| `/api/personal-autonomy` | GET | Authenticated |
| `/api/personal-autonomy/[id]/promote` | POST | Admin |

### Users & Invites
| Route | Methods | Auth |
|---|---|---|
| `/api/users` | GET | Admin |
| `/api/users/[id]` | PATCH | Admin |
| `/api/users/[id]/role` | PUT | Admin |
| `/api/users/[id]/scopes` | POST | Admin |
| `/api/users/[id]/scopes/[scopeId]` | DELETE | Admin |
| `/api/users/invite` | POST, GET | Admin |
| `/api/users/invite/[id]` | DELETE | Admin |
| `/api/users/bulk-grant` | POST | Admin |
| `/api/users/export` | GET | Admin |
| `/api/invite/[token]` | GET | Public |
| `/api/invite/[token]/accept` | POST | Public |
| `/api/me/ai-entity` | GET | Authenticated |

### Admin (superadmin only)
| Route | Methods | Auth |
|---|---|---|
| `/api/admin/operators` | GET | Superadmin |
| `/api/admin/operators/[id]` | DELETE | Superadmin |
| `/api/admin/enter-operator` | POST | Superadmin |
| `/api/admin/exit-operator` | POST | Superadmin |
| `/api/admin/create-test-company` | POST | Superadmin |
| `/api/admin/ai-learning-overview` | GET | Superadmin |
| `/api/admin/merge-log` | GET | Admin |
| `/api/admin/merge-log/[id]/reverse` | POST | Admin |
| `/api/admin/merge-suggestions` | GET | Admin |
| `/api/admin/merge-suggestions/[id]/approve` | POST | Admin |
| `/api/admin/merge-suggestions/[id]/dismiss` | POST | Admin |

### Other
| Route | Methods | Auth |
|---|---|---|
| `/api/health` | GET | Public |
| `/api/operator` | GET, PATCH | Authenticated |
| `/api/notifications` | GET, PATCH | Authenticated |
| `/api/action-capabilities` | GET | Admin |
| `/api/policies` | GET, POST, PATCH, DELETE | Admin |
| `/api/settings` | GET, PUT | Superadmin |
| `/api/settings/test-ai` | POST | Admin |
| `/api/rag/search` | POST | Scoped |
| `/api/orientation/*` | various | Authenticated |
| `/api/data/reset` | POST | Admin |
| `/api/data/seed` | POST | Admin |
| `/api/webhooks/[connectorId]` | POST | Public (webhook) |

## Database Models

### Tenant-scoped models (have `operatorId`)
- **Operator** — root tenant entity
- **User** — accounts within an operator
- **Entity** — knowledge graph nodes (departments, people, CRM records, etc.)
- **EntityType** — schema definitions for entity categories
- **Relationship** — edges in the knowledge graph (via RelationshipType)
- **RelationshipType** — edge type definitions
- **SourceConnector** — OAuth connector instances
- **Event** — raw events from connectors
- **Situation** — detected situations with reasoning + status lifecycle
- **SituationType** — situation category definitions with detection logic
- **ContentChunk** — RAG store with pgvector embeddings
- **ActivitySignal** — behavioral signals (email, meeting, doc activity)
- **PersonalAutonomy** — per (situationType, aiEntity) learning state
- **Notification** — user notifications
- **InternalDocument** — uploaded documents with RAG processing state
- **PolicyRule** — governance rules for AI actions
- **CopilotMessage** — copilot conversation history
- **ActionCapability** — registered connector actions
- **OrientationSession** — onboarding conversation state
- **EntityMergeLog** — identity merge audit trail
- **Invite** — pending user invitations

### Global models (no `operatorId`)
- **Session** — auth sessions (linked to User)
- **AppSetting** — global key-value settings
- **UserScope** — junction table granting department access (linked to User)

### Key model relationships
```
Session → User → Operator (session resolution chain)
User → Entity (optional, links account to org chart person)
User ← Entity (ai-agent, via ownerUserId)
UserScope: User ↔ Department Entity
Invite → Entity (invite is for a specific person)
SourceConnector → User (personal connectors) | Operator (company connectors)
ContentChunk → SourceConnector → Operator
ActivitySignal → Operator
Situation → SituationType → Operator
PersonalAutonomy → SituationType + Entity (ai-agent)
Entity → EntityType → Operator
Entity → Entity (parentDepartmentId hierarchy)
Entity → Entity (mergedIntoId merge chain)
```
