# V-01.02 Changelog — Day 25

Released: 2026-03-11

---

## Round 1: UI/UX fixes and cleanup (7 items)

### 1. Copilot chat redesign
- Rewrote `/copilot` page as a modern AI chat interface (ChatGPT/Claude style)
- Left-aligned messages with "You" / "Qorpera" labels
- Chat history sidebar (240px, collapsible) fetching from `/api/copilot/sessions`
- New API route `GET /api/copilot/sessions` returning distinct sessions with preview text
- Auto-resizing textarea, monospace code block rendering
- All existing functionality preserved (streaming, orientation mode, pagination)

### 2. Settings cleanup
- Superadmin-only guards on Reset Database and Re-seed buttons (`isSuperadmin` check)
- Moved "Export My Data" to `/account` page with download button calling `GET /api/users/export`
- New `GET /api/users/export` route: exports user profile, conversations, scopes as JSON
- New `POST /api/data/seed` and `POST /api/data/reset` routes with superadmin-only 403 guards
- Removed Data Management tab from Settings entirely

### 3. Governance page
- New `/governance` page combining autonomy levels, policies, and governance settings
- Explanatory text sections for non-technical executives
- Promote/demote autonomy buttons, graduation thresholds, policy CRUD modal
- Nav updated: Governance group links to `/governance` instead of `/policies`

### 4. Department card styling
- `.wf-soft` border opacity increased from `rgba(255,255,255,0.07)` to `rgba(255,255,255,0.12)`
- Department cards: `transition-all duration-200` with `hover:border-white/20 hover:scale-[1.02]`

### 5. Document slots simplified
- Reduced from 4 slot types (org-chart, budget, compensation, team-roster) to 2 (org-chart, playbook)
- Multi-document per slot: `Record<string, SlotDocument[]>` instead of single document
- `SLOT_ICONS` reduced to only `org-chart` and `playbook`
- Updated upload route, documents route, and structural extraction to match

### 6. "Sync All" button
- Added to onboarding step 6 and Settings connections tab header
- Connector sync-all route updated to sync ALL active connectors (removed `lastSyncAt: null` filter)

### 7. Situation engine diagnostics
- New `GET /api/situations/status` diagnostic endpoint
- Returns: situationTypeCount, lastDetectionRun, totalSituationsDetected, activeConnectors, aiProviderConfigured, aiReachable, cronRunning
- `isCronRunning()` exported from `situation-cron.ts`
- Admin page: System Status card with color-coded diagnostic badges
- Situations page: inline detection status indicator below header

---

## Round 2: Test fixes (5 items)

### 8. Personnel removal in onboarding step 3
- Added X button on each member row in onboarding step 3
- Calls `DELETE /api/departments/{id}/members/{memberId}` with optimistic UI state

### 9. Multi-document upload fix (sequential)
- `handleSlotFileChange` and `handleContextFileChange` made async
- Files uploaded sequentially with 200ms delay between each to avoid server race conditions
- Added `multiple` attribute to both structural slot and context file inputs

### 10. Google Sheets auto-import via Drive API
- OAuth callback calls Drive API to list spreadsheets modified in last 30 days
- If found: creates connector as "active" with all spreadsheet IDs in config
- If none found: falls back to "pending" status
- Sync implementation iterates over all `spreadsheet_ids` in config
- Re-queries Drive for new spreadsheets on each sync cycle

### 11. AI provider "Error: fetch failed" fix
- Root cause: `.env` had `AI_PROVIDER=ollama` but Ollama was unreachable inside Docker
- Updated `.env` to `AI_PROVIDER=openai` / `AI_MODEL=gpt-5.4`
- Improved error messages across all 6 AI provider fetch calls (OpenAI, Anthropic, Ollama — both call and stream) to show actual URL and failure reason
- Copilot error handler now logs cause and stack trace to server console

### 12. Data Management tab removed from Settings
- Removed the vestigial Data Management section
- Final Settings tabs: AI Configuration, Connections, Team

---

## Round 3: Final fixes before V-01.02 (3 items)

### 13. Google Sheets auto-import — UI enhancements
- **OAuth callback**: now stores spreadsheet names alongside IDs (`spreadsheets: [{id, name, selected}]`) for UI display
- **Connector GET API**: returns `spreadsheets` array, `spreadsheet_ids`, and `spreadsheetCount`
- **Connector PATCH API**: accepts `spreadsheets` array (with selection state) and `spreadsheet_ids`
- **Connector list API**: returns `spreadsheetCount` for Google Sheets connectors
- **Settings connections tab**: Google Sheets connector card displays "Google Sheets — X spreadsheets synced"; "Manage Sheets" button opens inline picker with checkboxes; manual URL fallback when zero sheets discovered
- **Onboarding step 5**: pending Google Sheets bindings show inline spreadsheet picker with checkboxes instead of "Needs spreadsheet URL" message; manual URL input as fallback
- Sync engine already supported multi-spreadsheet iteration and Drive auto-discovery (from round 2)

### 14. Multi-provider AI configuration
- **New `AIFunction` type**: `"reasoning" | "copilot" | "embedding" | "orientation"`
- **`getAIConfig(aiFunction?)`**: reads per-function keys first (`ai_reasoning_provider`, `ai_reasoning_key`, `ai_reasoning_model`), falls back to generic keys (`ai_provider`, `ai_api_key`, `ai_model`), then env vars
- **`callLLM` / `streamLLM`**: accept `aiFunction` in `CallOptions`, pass through to `getAIConfig`
- **All AI consumers updated**:
  - `reasoning-engine.ts` → `aiFunction: "reasoning"`
  - `situation-detector.ts` → `aiFunction: "reasoning"`
  - `situation-prefilter.ts` → `aiFunction: "reasoning"` (both generate and regenerate)
  - `situation-audit.ts` → `aiFunction: "reasoning"`
  - `structural-extraction.ts` → `aiFunction: "reasoning"`
  - `ai-copilot.ts` → `aiFunction: "copilot"` (normal) or `aiFunction: "orientation"` (orientation mode)
- **Instrumentation**: `seedAISettingsFromEnv()` now seeds all 4 per-function keys from env vars. A simple `.env` still works — per-function settings only needed if you want different providers per function.
- **Settings AI tab redesigned**:
  - "Use same provider for all" toggle (default: ON)
  - When ON: single provider/key/model selector (propagates to all 4 functions), embedding model shown separately
  - When OFF: 4 independent sections (Reasoning, Copilot, Embeddings, Orientation) each with provider dropdown, API key, model selector, and Test Connection button
  - Ollama Base URL field shown when any function uses Ollama
- **Test connection endpoint** (`POST /api/settings/test-ai`): accepts `aiFunction` parameter to test specific function's config
- **Embedding model options**: OpenAI (text-embedding-3-small/large, ada-002), Ollama (nomic-embed-text, mxbai-embed-large, all-minilm)
- **Default models for OpenAI**: reasoning=gpt-5.4, copilot=gpt-5.4, embedding=text-embedding-3-small, orientation=gpt-5.4

### 15. Document upload — silent failure fix
- **Client-side (`onboarding/page.tsx`)**:
  - `uploadFile` now has proper `catch` block (was `try/finally` without `catch` — network errors were silently swallowed by React event system)
  - `console.log` at upload start with file name, type, size
  - `console.error` at every failure path (fetch error, server error, unexpected error)
  - Error banner upgraded from small `<p>` to prominent alert with dismiss button
- **Server-side (`upload/route.ts`)**:
  - `FormData` parsing wrapped in try/catch (catches malformed multipart requests)
  - Logs FormData contents (file name, size, type, documentType) on receive
  - `mkdir` wrapped in try/catch with specific error message about storage directory
  - `writeFile` wrapped in try/catch with error message about permissions
  - `extractText` wrapped in try/catch (non-fatal — upload succeeds even if text extraction fails)
  - Logs successful write path and byte count
- **Dockerfile**: explicitly copies extraction packages (`mammoth`, `xlsx`, `pdf-parse`, `papaparse`) for standalone mode — Next.js standalone tracing may miss `serverComponentsExternalPackages`
- **next.config.mjs**: added `xlsx` and `papaparse` to `serverComponentsExternalPackages`

---

## Files changed (summary)

| Category | Files |
|----------|-------|
| AI provider system | `ai-provider.ts`, `ai-copilot.ts`, `reasoning-engine.ts`, `situation-detector.ts`, `situation-prefilter.ts`, `situation-audit.ts`, `structural-extraction.ts`, `instrumentation.ts` |
| Settings UI | `settings/page.tsx`, `api/settings/test-ai/route.ts` |
| Google Sheets | `api/auth/google/callback/route.ts`, `api/connectors/route.ts`, `api/connectors/[id]/route.ts`, `connectors/google-sheets.ts` |
| Document upload | `api/departments/[id]/documents/upload/route.ts`, `onboarding/page.tsx` |
| Copilot | `copilot/page.tsx`, `api/copilot/route.ts`, `api/copilot/sessions/route.ts` |
| Governance | `governance/page.tsx`, `app-nav.tsx` |
| Diagnostics | `api/situations/status/route.ts`, `situation-cron.ts`, `admin/page.tsx`, `situations/page.tsx` |
| Infra | `Dockerfile`, `next.config.mjs`, `globals.css`, `document-slots.ts` |
| Other | `account/page.tsx`, `api/users/export/route.ts`, `api/data/seed/route.ts`, `api/data/reset/route.ts`, `map/page.tsx`, `learning/page.tsx` |
