# Changelog: v0.2.0 — Phase 2: Activity Intelligence + Personal AI

**Released:** 2026-03-13
**Previous:** V-01.02 (Phase 1 complete)
**Commits:** Days 26–40

## New Features

### Data Layer
- pgvector-powered ContentChunk replacing DocumentChunk (universal content store)
- ActivitySignal pipeline with 90-day retention and daily cleanup
- ML identity resolution: deterministic email merges + fuzzy matching + admin merge panel
- Entity embedding for semantic entity matching
- Scheduled sync infrastructure with per-provider intervals (5/15/30 min)

### Connectors
- Gmail: email sync + write-back (send_email, reply_to_thread)
- Google Drive: document content indexing (Docs, Slides, text, CSV, markdown)
- Google Calendar: meeting activity signals + calendar_note content
- Google Sheets: spreadsheet content indexing
- Slack: company connector with channel sync, thread grouping, write-back
- Microsoft 365: Outlook, OneDrive, Teams, Calendar (full parity with Google)
- Document write-back: create/edit spreadsheets and documents (both providers)

### AI Reasoning
- Context assembly v3: activity timeline, communication context, cross-department signals
- Multi-agent reasoning: 3 specialist agents + coordinator for complex situations
- Token-based routing (>12K tokens triggers multi-agent path)
- ContextSectionMeta telemetry for future evaluation

### Personal AI
- ai-agent entity type, auto-created on invite acceptance
- PersonalAutonomy model: per (situationType, aiEntity) learning tracking
- Effective autonomy: personal level overrides global, highest-wins across scoped users
- Graduation/demotion with notification-based promotion suggestions
- Department mirroring: AI follows owner's department changes

### Copilot
- search_emails (Gmail + Outlook via pgvector)
- get_email_thread (chronological thread view)
- search_documents (Drive + OneDrive via pgvector)
- get_activity_summary (aggregated signals with trend comparison)
- search_messages (Slack + Teams via pgvector)
- get_message_thread (unified across Slack and Teams)

### UI
- AI entity cards in department map (indigo tint, bot icon, autonomy summary)
- "My AI Assistant" section on account page with learning progress
- "AI Learning by Team Member" admin section on learning page
- AI autonomy stats on superadmin admin page

## Bug Fixes
- Connector DELETE cascade: full transactional cleanup of related data
- Sync-all route: removed lastSyncAt:null filter (connectors now re-sync)
- RFC 2822 blank line preserved in email construction
- get_email_thread + get_message_thread: department scoping added
- assignedUserId race condition: merged into single update
- Multiple AI entity queries: added missing operatorId filters
- Account page field name mismatch (totalProposed/totalApproved)
- Situation notification count moved before merge execution

## Test Coverage
- 106 tests across 11 test files
- Covers: encryption, chunking, identity scoring, deterministic merges, policy evaluation, user scoping, context assembly v3, multi-agent reasoning, personal autonomy, connector disconnect cascade, display name fix

## Known Issues
- Settings connections tab still interactive (users could create rootless connectors)
- AI entity not created for pre-existing users (need migration script)
- Graduation notification not actionable (no inline promote button)
- Google users need re-auth for document write scopes
- Drive PDF content extraction not implemented (text-based files only)
