# Changelog

## [Unreleased]

### Added (DIST-OBSIDIAN-1)

- **`new BaseAPI(authCore, { fetchFn })` and `new SmartMemoryClient({ ..., fetchFn })`.** Optional `fetchFn` constructor option to inject a custom fetch-compatible function for environments where the global `fetch` is unavailable or restricted (notably Obsidian, where network calls must go through `requestUrl`). Defaults to global `fetch` when omitted; behavior unchanged for existing callers. Propagates from `SmartMemoryClient` config through to `BaseAPI` so all sub-API HTTP calls use the injected function. New test in `tests/api/BaseAPI.test.js`.

### Changed — BREAKING (SDK-CONSISTENCY-1)

- **`MemoryAPI.feedback(itemIds, outcome, query?)` signature changed.** Previously `feedback(feedback, memoryType = 'semantic')` which posted `{feedback, memory_type}` to a server endpoint that has been removed. The new signature posts `{item_ids, outcome, query?}` to the surviving `POST /memory/feedback` route — bumps `retention_score` on the items and (for `helpful` with multiple IDs) strengthens `CO_RETRIEVED` edges between every pair. The only known caller was the dead `provideFeedback` wrapper in `smart-memory-web` (deleted in the same change set).

### Added (SDK-CONSISTENCY-1)

- **`MemoryAPI.create({ ..., conversationContext })`** parameter added to bring JS parity with the Python SDK's `client.add(..., conversation_context=...)`. Marshalled to `conversation_context` in the request body; omitted when `null`/`undefined`.

### Added

- **CORE-SUMMARY-1: Memory snapshot JS SDK API.** New `SummaryAPI` class wired as `client.summaries.*` on `SmartMemoryClient`: `generate({ windowStart, includeMarkdown })`, `latest()`, `get(snapshotId)`, `getMarkdown(snapshotId)` (graph-only fast path), `list({ isHeartbeat, limit, before })`, `delta({ from, to })`, `delete(snapshotId)`. Read methods return `null` on 404; write methods reject. 11 new Vitest tests in `tests/unit/api/SummaryAPI.test.js`. Contract: `smart-memory-docs/docs/features/CORE-SUMMARY-1/snapshot-contract.json`.

- **CORE-CRUD-UPDATE-1: `MemoryAPI.update(id, updates)` documented for `properties` + `write_mode`.** Method signature is unchanged (it already forwarded an arbitrary `updates` object to `PUT /memory/{id}`). Service now honors the new fields per the contract. JSDoc on `src/api/MemoryAPI.js` updated. Contract: `smart-memory-docs/docs/features/CORE-CRUD-UPDATE-1/update-contract.json`.

- **CORE-MEMORY-DYNAMICS-1 M1a: `MemoryAPI.getWorkingContext(sessionId, query, { k = 20, maxTokens = null, strategy = null } = {})`.** New method posting to `POST /memory/context`. Returns the contract-shape response per `smart-memory-docs/docs/features/CORE-MEMORY-DYNAMICS-1/context-api-contract.json` pass-through. Optional params omitted when `null` *or* `undefined` (parity verified by regression test). Body uses canonical snake_case field names (`session_id`, `max_tokens`) to match the service contract. 5 new Vitest tests (19 total in `MemoryAPI.test.js`). No shim layer — JS SDK never exposed `memoryRecall`.

### Changed

#### Header Rename: X-Team-Id → X-Workspace-Id (SCOPE-WS-1)
- `AuthCore.getAuthHeaders()` now sends `X-Workspace-Id` instead of `X-Team-Id`
- `clerkWeb.js` bootstrapper reads `x-sm-workspace-id` response header (old `x-sm-team-id` removed)
- All frontends using this SDK updated in lockstep; no transition fallback needed

### Added
- **ProcedureDriftAPI (CFS-4)**: Schema drift detection methods
  - `list(params)` — list drift events with filtering (procedure_id, resolved, breaking_only, date range)
  - `get(eventId)` — get drift event detail with full changes
  - `resolve(eventId, note)` — mark drift event as resolved
  - `sweep()` — trigger workspace-wide drift sweep
  - `listSnapshots(procedureId)` — list schema snapshot history
- Registered as `client.procedureDrift` on SmartMemoryClient
- 8 new tests in NewDomainAPIs.test.js (155 total)

## 0.2.0 (2026-02-08)

### Migration Complete

All 4 SmartMemory frontends now use `@smartmemory/sdk-js` for authentication:

| App | Auth Mode | Lines Removed | Pattern |
|-----|-----------|---------------|---------|
| **smart-memory-web** | custom | ~520 | SDK compat layer in api.js, SDK-backed AuthContext |
| **smart-memory-insights** | sso | ~384 | SDK AuthCore in main.jsx fetch interceptor |
| **smart-memory-studio** | sso | ~371 | SDK AuthCore + sdkAuth export for non-React code |
| **maya** | custom | ~143 | SDK AuthCore for auth, MayaAPI kept for chat endpoints |

Total: ~1418 lines of duplicated auth/API code removed across 4 apps.

## 0.1.1 (2026-02-08)

### Added
- **X-Team-Id header**: TokenManager stores team ID separately from tenant ID; AuthCore emits both `X-Workspace-Id` and `X-Team-Id` headers
- **DecisionAPI**: `reinforce()`, `supersede()`, `retract()`, `getProvenance()` methods
- **SmartMemoryClient**: `setTeamId()` / `getTeamId()` convenience methods
- 9 new tests (110 total)

### Fixed
- **SSOManager.storeCallbackTokens()**: accepts both param conventions (`refresh_token`/`refresh`, `team_id`/`team`) for cross-app SSO compatibility

## 0.1.0 (2026-02-08)

### Added
- **AuthCore** with dual-mode authentication: `custom` (email/password login) and `sso` (redirect-based)
- **TokenManager** with localStorage, sessionStorage, and in-memory storage backends, plus storage fallback and custom key support
- **RefreshManager** with single-flight deduplication for concurrent token refreshes
- **SSOManager** for redirect-based authentication with URL validation and callback token storage
- **BaseAPI** with automatic auth headers, 401 refresh-retry logic, and structured error handling
- **SmartMemoryClient** as unified entry point aggregating auth + all 10 domain APIs
- **Domain APIs**: MemoryAPI (23 methods), DecisionAPI (4), GraphAPI (5), TeamAPI (9), ProfileAPI (4), SubscriptionAPI (5), AuthAPI (7), AgentAPI (4), UsageAPI (3), InsightsAPI (4)
- **React bindings**: SmartMemoryProvider, useAuth, useAuthState, useAuthActions, useSmartMemory, AuthWrapper
- **Fetch utilities**: createAuthFetch wrapper and installInterceptor for global fetch interception
- **APIError** class for structured error handling with status codes and detail payloads
- JSDoc types for all public APIs
- 101 unit tests across 13 test files
- Multi-entry build: `@smartmemory/sdk-js`, `@smartmemory/sdk-js/core`, `@smartmemory/sdk-js/react`, `@smartmemory/sdk-js/fetch`
- Bundle size: 5.63 KB gzipped (main entry)
