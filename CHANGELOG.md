# Changelog

## [Unreleased]
### Changed (auto, lockstep) — track product version 1.4.36 (1.4.36)
- Version copied from the smartmemory-core release (single-source lockstep).

### Changed (lockstep) — track smartmemory-core==1.4.33 (1.4.33)
- Version bumped to 1.4.33 to track the unified release line (core: CORE-RELATION-RULER-1 EntityRuler cold-start seed ROM). No SDK API change.

### Added (CORE-LLM-GEMINI-1) — Gemini provider key
- `ProfileAPI.updateLLMKeys()` documents and passes `gemini_key` through to
  `PATCH /auth/llm-keys` (generic pass-through — no signature change). New pass-through
  test in `tests/unit/api/DomainAPIs.test.js` (22/22); README example updated to the
  canonical `*_key` field names.

### Added (ONTO-HITL-CONSUMER-1) — ontology HITL queue methods
- `OntologyAPI.listHitl({status, kind, limit})` → `GET /memory/ontology/hitl` (kind omitted when null);
  `OntologyAPI.resolveHitl(itemId, {action, note})` → `POST /memory/ontology/hitl/{id}/resolve`.
  Tests: `tests/unit/api/OntologyHitlAPI.test.js` (4/4). Codex review clean.

### Changed (auto, lockstep) — track product version 1.4.32 (1.4.32)
- Version copied from the smartmemory-core release (single-source lockstep).

### Changed (auto, lockstep) — track product version 1.4.28 (1.4.28)
- Version copied from the smartmemory-core release (single-source lockstep).

### Changed (auto, lockstep) — track product version 1.4.27 (1.4.27)
- Version copied from the smartmemory-core release (single-source lockstep).

### Changed (auto, lockstep) — track product version 1.4.26 (1.4.26)
- Version copied from the smartmemory-core release (single-source lockstep).

### Changed (auto, lockstep) — track product version 1.4.25 (1.4.25)
- Version copied from the smartmemory-core release (single-source lockstep).


### Added (CORE-GRAPH-CANONICAL-DEDUP-1, 2026-06-03) — `dedupEntities()` (0.6.7)

- **`client.graph.dedupEntities({ dryRun = false, requireStructuralConfirmation = true })`** — POSTs
  `/memory/graph/dedup-entities?dry_run=…&require_structural_confirmation=…`. Opt-in graph-maintenance op
  that collapses same-name cross-extractor entity-node fragments into one node, unblocking ensemble alias
  disambiguation. New `EntityDedupReport` typedef (`merged_clusters / merged_nodes / redirected_edges /
  abstained_clusters / dry_run`). Contract:
  `docs/features/CORE-GRAPH-CANONICAL-DEDUP-1/dedup-entities-contract.json`.

### Added (CORE-GRAPH-ALIAS-DISAMBIG-1, 2026-06-03) — `resolveAliases({ disambiguate })` (0.6.6)

- **`client.graph.resolveAliases({ dryRun = false, disambiguate = false })`** threads the new opt-in
  collision-disambiguation flag (default off) as a query param (`?dry_run=…&disambiguate=…`).
  `AliasResolveReport` gains `disambiguated`. Contract:
  `docs/features/CORE-GRAPH-ALIAS-DISAMBIG-1/disambiguate-contract.json`.

### Added (CORE-GRAPH-ALIAS-RESOLVE-2 B2, 2026-06-02) — `client.graph.resolveAliases({ dryRun })`

- **`client.graph.resolveAliases({ dryRun = false })`** — wraps `POST /memory/graph/resolve-aliases`.
  Merges unambiguous single-token entity aliases ("Hudson") into their multi-token canonical
  ("Rock Hudson") over the caller's workspace graph, abstaining on collisions (>=2 candidates).
  `dry_run` is sent as a **query parameter** (`?dry_run=true`), matching the `/clustering/run`
  precedent — not a JSON body. Returns the `AliasResolveReport` typedef:
  `{ resolved, abstained, redirected_edges, ambiguous, dry_run, workspace_id, user_id }`.
- Tests: 2 new cases in `tests/unit/api/NewDomainAPIs.test.js` (default `dry_run=false` + explicit
  `dryRun: true`), 319/319 green. Contract:
  `smart-memory-docs/docs/features/CORE-GRAPH-ALIAS-RESOLVE-2/resolve-aliases-contract.json`.

### Added (NEURO-1d, 2026-06-02) — `search({ consolidationFirst, includeConsolidated })`

- **`client.memory.search(query, { consolidationFirst: true })`** surfaces a consolidated summary
  above the scattered source memories it consolidates — best for synthesis queries. Opt-in; implies
  `includeConsolidated`. **`includeConsolidated: true`** includes consolidated source memories
  (normally hidden). Both default off → body omits the snake_case keys, so existing callers are
  unchanged on the wire.
- Tests: 3 new cases in `tests/unit/api/MemoryAPI.test.js` (body pass-through + default-omit), 31/31
  green. Contract: `smart-memory-docs/docs/features/CORE-SEARCH-1/search-contract.json`.

### Added (CORE-AGENT-2, 2026-05-24) — `client.agents.getEvaluation()` + `listEvaluationHistory()`

- **`client.agents.getEvaluation(agentId, { dimension, domain })`** — wraps `GET /memory/agents/{agent_id}/evaluation`. Returns `{ evaluation: object | null }`; cold-start returns `{ evaluation: null }` (never throws) per the contract. 404 on cross-tenant / unknown agent.
- **`client.agents.listEvaluationHistory(agentId, { dimension, domain, limit })`** — wraps `GET /memory/agents/{agent_id}/evaluation/history`. Returns a list of historical evaluation rows in supersession order.
- Test harness for `src/api/AgentAPI.js` doesn't yet exist in this repo; new methods are verified by code inspection + sibling pattern matching. Filed as `SDK-JS-AGENTAPI-TESTS` follow-up (see CORE-AGENT-2 report §7).

Source: `smart-memory-docs/docs/features/CORE-AGENT-2/report.md`. Contract: `smart-memory-docs/docs/features/CORE-AGENT-2/evaluation-contract.json`.

### Added (CORE-DECISION-PROVENANCE-LOOKUP-1, 2026-05-23) — `DecisionAPI.list({ provenance_memory_id })`

- **`client.decisions.list(params)`** now documents and accepts `provenance_memory_id` in `params`. The underlying `URLSearchParams` pass-through already supported arbitrary params, so no code change was needed — only a JSDoc update that surfaces the new query semantics: returns only active decisions whose provenance subgraph contains the given memory; existing filters compose in-query; unknown/out-of-scope memory ids return an empty list (never 404).


### Changed (CORE-RECALL-LINEAGE-1 Phase 3, 2026-05-22) — SearchResponse envelope is pass-through

- **`MemoryAPI.search()`** is unchanged at the code level — the SDK is pass-through and the service now returns the unified `{results, group_roots, citations?}` envelope. JSDoc updated to describe the new shape and warn callers who previously indexed the response as a bare array to read `response.results` instead.
- Per-result `lineage_roots: string[]` (always non-empty; canonicals self-reference) and per-envelope `group_roots: Record<string, GroupRootStub>` are now first-class. See `smart-memory-docs/docs/features/CORE-SEARCH-1/search-contract.json` for canonical shapes.
- No new dependency; no API break (the field was previously serialised-but-undeclared in JSDoc).

### Added (RECALL-CITATIONS-1, 2026-05-10)

- **`memoryAPI.search(query, { cite: true })`** opts into the citation-ready response. When `cite: true`, the response is the wrapped `{ results, citations }` envelope; `results` preserves the existing flat-list / typed-dict shape and `citations` is the top-3 array shaped `{ n, item_id, item_type, preview, score, footnote_marker }` per the RECALL-CITATIONS-1 contract. The SDK does no unwrapping — it returns the envelope as-is so callers can render the footnote block directly. Empty result set with `cite: true` returns `citations: []` (never omitted). 2 new unit tests in `tests/unit/api/MemoryAPI.test.js`.

### Changed (CORE-EXPERTISE-1 Phase 4b, 2026-05-08)

- **README gains "Expertise Layer" Domain APIs section.** Shows `client.decisions.create({ rejectedAlternatives, rationale, constraints })` for capture and `client.memories.search(query, { expertise: true })` returning the typed dict for partitioned recall. Links to the canonical 1-pager. No code change.

### Added (CORE-EXPERTISE-1 Phase 4a, 2026-05-08)

- **`MemoryAPI.search(query, { expertise: true })` returns the typed-dict response.** New `expertise` boolean option forwarded as `expertise: true` in the POST body; when set, the service responds with `{ results: { decision: [...], constraint: [...], learned: [...], opinion: [...], reasoning: [...], observation: [...] } }` keyed by expertise memory type. Default behaviour (flat list) unchanged. JSDoc covers the conditional return shape. 2 new unit tests in `tests/unit/api/MemoryAPI.test.js` (passthrough body + omission when not set). Contract: `smart-memory-docs/docs/features/CORE-EXPERTISE-1/expertise-search-contract.json`.

### Added (CORE-EXPERTISE-1 Phase 1, 2026-05-07)

- **`DecisionAPI.create()` accepts `rejectedAlternatives`, `rationale`, `constraints`.** Three new optional camelCase params forwarded to `POST /memory/decisions/create` as snake_case payload keys (`rejected_alternatives`, `rationale`, `constraints`). 1 new unit test in `tests/unit/api/NewDomainAPIs.test.js` plus existing test updated for the new payload shape. Feature folder: `smart-memory-docs/docs/features/CORE-EXPERTISE-1/phase-1-decision-schema/`.

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
