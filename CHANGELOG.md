# Changelog

## [Unreleased]

### Added — DRY-FRONTEND-1 runtime-resolved API base

- `apiBaseUrl` now also accepts a zero-arg function returning the current base.
  `AuthCore.apiBaseUrl`, `RefreshManager` (per refresh) and `BaseAPI` (per request)
  resolve it on every access, so apps whose base is set at runtime after module
  load (e.g. admin's app-config `apiBase`) keep refresh, logout and trust checks
  on the live value. Passing a string is unchanged.

### Fixed — UI-IDLE-DISCONNECT-1 session and progress recovery

- Refresh cookie sessions through request options with CSRF double-submit headers;
  retain auth on transient refresh failure and share concurrent refresh calls.
- Unify JSON, binary, authenticated-fetch, and interceptor 401 recovery: one refresh
  and retry, definitive sign-out on refresh 401/403 or exhausted request 401.
- Reconnect progress after EOF/transient errors with fresh auth, exact SSE cursors
  or next run sequence, bounded backoff without a retry limit, online/visibility
  resume, and complete close cleanup. Add opt-in finite replay completion.
- Expose `client.connection` / `auth.connection` status subscription with reasons;
  ship recovery declarations for fetch, progress, and connection subpaths.
- Guard in-flight refresh against logout/session changes and request/stream replay
  against workspace changes.
- **Migration required:** `installInterceptor` returns an injectable fetch function
  instead of mutating global fetch/returning an uninstaller. Apps must route their
  transports through it. See README; no app adoption is included here.

### Fixed — CORE-BG-2b progress contract v1.6.0

- Accept `skipped` in the `ProgressEvent.status` type; SSE subscriptions pass skipped evolver events through unchanged.

### Added (2026-09-18) — workspace naming (AUTH-IDENTITY-MODEL-1 Phase 3)

- `getWorkspaceId`/`setWorkspaceId` are now primary on `TokenManager` and the client;
  `getTeamId`/`setTeamId` delegate to them and keep working for one release.
- The storage key moves from `smart_memory_team_id` to `smart_memory_workspace_id`, with the old
  key kept as a legacy alias so **existing browser sessions are read through the legacy path and
  nobody is logged out**. Custom `tokenKeys.team` configurations remain supported.
- `/auth/me` parsing prefers `default_workspace_id` and falls back to `default_team_id`; the server
  sends both during the deprecation window.
- The Clerk exchange helper returns `workspaceId` alongside the existing `teamId`.
- `TeamAPI` addresses real teams, not workspaces, and is unchanged.

### Added: switchable reranker policy (CORE-RERANK-PLUGIN-1)

- `memories.search(query, { reranker })` maps an explicit override to `reranker`
  and omits it when the caller wants server-side policy resolution.

### Changed: CORE-LEXICAL-INDEX-1 consumer cutover
- R-E4: Pin lexical HTTP contract v2 to exact 400/503 detail envelopes and verify consumer error fidelity.

- Use one `lexical` channel with default weight 0.8. Removed channel names fail validation, explicit zero is preserved, and unavailable required lexical search fails without partial success.
- Coordinated service, common, Python, JS, MCP and lite contracts cover migration and recovery. See [migration guidance](https://github.com/smartmemory/smart-memory-docs/blob/main/docs/features/CORE-LEXICAL-INDEX-1/migration.md) and the [canonical contract](https://github.com/smartmemory/smart-memory-docs/blob/main/docs/features/CORE-LEXICAL-INDEX-1/lexical-contract.json).
- Release remains pending maintainer review of measured write cost and final verification. No version bump.

### Fixed (2026-09-10) — decision supersession context

- `DecisionAPI.supersede` documents and forwards optional `rejected_alternatives`, `rationale`,
  and `constraints`; the SDK continues to pass the request object through without lossy remapping.

### Documentation (2026-09-10) — decision belief reads (CORE-DECISION-BELIEF-SURFACE-1)

- `DecisionAPI.get` / `list` / `search` document the three Dempster-Shafer belief reads the service now
  returns: `belief_hold`, `plausibility_hold` and `ignorance`. All three pass through unchanged, so there
  is no code change and no version bump; core's `VERSION` is the release dial.
- The JSDoc states that the reads are evidence-only and independent of the prior scalar `confidence`, and
  that they separate a disputed decision (high `contest`) from one nothing has evidenced yet (high
  `ignorance`), which `stability` cannot do because it reads 0.5 for both.

### Changed (2026-09-09)

- `memory.search()` documents the additive `coverage` envelope field: `complete`, `refill_rounds`, `vector_scope_incomplete` (server candidate-budget completeness, CORE-RECALL-SEMANTICS-1 W1) alongside the existing created-at window note.

### Added (2026-09-08) — rerank evidence (CORE-RERANK-EXPOSE-1)

- Document and lock unmodified rerank evidence passthrough for search responses, including expertise/citation variants. No runtime transform or cutoff.


### Added (2026-09-07) — list grounding policy (PLAT-RETRIEVAL-POLICY-1 slice 1)

- `memories.list({ includeGrounding })` maps explicit `true`/`false` to `include_grounding`.
  Omitted/null inherits workspace then env (default OFF). The response retains the resolved
  `policy.include_grounding` and `policy.source` fields. No SDK version bump.


### Changed (2026-09-06) — `personalize()` and `ground()` document their 501 (CORE-PERSONALIZATION-CONTRACT-1, CORE-GROUND-ROUTE-CONTRACT-1)

- Both methods remain on `MemoryAPI` but state that the endpoint returns HTTP 501 because the
  feature is not implemented server-side.

### Added (2026-09-06) — `since`/`until`, `hopStrategy`, origin context

- `search()` and metadata search forward `since`/`until` as ISO strings or `Date` objects
  (SEARCH-TIME-RANGE-1).
- `hopStrategy` maps to the REST `hop_strategy` parameter (SEARCH-HOP-STRATEGY-SURFACE-1).
- Conversation and document ingestion forward optional origin context
  (CORE-ORIGIN-PROPAGATION-1).


- fix(memory): document the now-enforced list type filter and test combined type/metadata filters with filtered pagination totals.

### Added — `excludeSpeculative` on `search()`

- `search()` accepts `excludeSpeculative`, mapped to `exclude_speculative` and
  sent only when true.

## [1.4.86] - 2026-09-04

### Added (2026-09-04) — `memories.ask()` (DIST-LITE-9)

- `client.memories.ask(question, { limit = 5, reasoning = true })` calls
  `POST /memory/ask` and resolves to `{answer, reasoning, evidence, relations}`.
- `reasoning` is omitted at its default so this SDK, the Python client and the lite
  daemon send an identical body.
- Relation rows carry `source_id` / `target_id`; combine them as
  `${source_id}->${target_id}:${type}` to address the edge in a graph view.
- Rejects rather than resolving to a fallback answer when the server's LLM cannot answer.

### Added (2026-08-22) — `includeArchived` on `search()` (CORE-ARCHIVED-RECALL-1)

- `search()` accepts `includeArchived` (mapped to `include_archived`), sent only
  when true like the other lifecycle flags — which also keeps an older server
  that predates the field from rejecting the request.
- Third sibling of `includeSuperseded` / `includeRetracted`. An archived item is
  one the decay/prune evolvers retired, or the source an episodic-to-semantic
  promotion replaced. It has no replacement and no version chain, so it is not
  covered by either of the other two. Inert under `asOfDate`.
- **The default changed behaviour rather than preserving it.** Before
  CORE-ARCHIVED-RECALL-1 the server read `archived` on no search path at all, so
  archived items came back ranked exactly like live ones. UI that wants to show
  them (an audit or maintenance view) must now pass `includeArchived: true`.


### Added — `client.policy` policy-exchange API (GOV-STRATUM-SEAM-1 P1)

- `client.policy.getBundle({ workflow, domain, statuses })` calls
  `GET /memory/policy/bundle`; status values are encoded as repeatable query
  parameters and default to `active`.
- `client.policy.recordEnforcementEvent(event)` posts the contract event
  unchanged to `POST /memory/policy/events` and returns its idempotency result.

### Added — `importChatExport()` / `chatExportFormats()` (DIST-CHAT-IMPORT-1)

`memory.importChatExport(file, { sourceFormat, maxConversations })` uploads a ChatGPT or
Claude export (a `File`/`Blob` — the vendor `.zip` or its `conversations.json`) as multipart
form data and returns `{ source_format, conversations_imported, conversations_failed,
turns_imported, items_created, warnings }`. `memory.chatExportFormats()` lists both vendors
and how to obtain each export.

**Always check `warnings`.** The import is synchronous and capped at 25 conversations by
default, so a partial import returns 200 with the shortfall named — treating the response as
a plain success silently drops the rest of the archive.


### Changed — recommended wake-up budget ~200 -> ~300 (CORE-TOKEN-ESTIMATOR-UNDERCOUNT-1)

- `client.recall.pack({ preset: 'wakeup' })` guidance updated. The card is
  content-bounded (~70 real tokens); the headroom is for verbose workspaces.

### Added — `client.recall.pack({ preset })` (CORE-RECALL-BUDGET-1 Phase 5)

- `preset: 'wakeup'` returns the L1 session-start card. `null` and `undefined` are treated
  identically and omitted from the wire body, consistent with `query` and `sections`.

### Fixed — `client.recall.pack` threw on `sections: null` (CORE-RECALL-BUDGET-1)

- `null` and `undefined` are now treated identically for both `query` and `sections` and
  omitted from the wire body. `sections: null` previously reached `null.map(...)` and
  threw — and `null` is exactly what a caller gets from `JSON.parse`, a default-valued
  config object, or a spread options object. Omitting also matches the Python SDK and the
  MCP remote backend, so one body shape reaches the route from every client.

### Added — CORE-RECALL-BUDGET-1: budgeted recall pack client surface

- New `RecallAPI` sub-API, attached as `client.recall`. One method,
  `pack({ budgetTokens, query?, sections? })`, POSTs to `/memory/recall/pack`
  and resolves the `RecallPack` object (`{ block, manifest }`). `budgetTokens`
  maps to wire `budget_tokens`; `sections` entries accept either wire-shape
  `cap_tokens` or camelCase `capTokens` and are normalized to `cap_tokens` on
  the wire. `query` and `sections` are omitted from the request body when
  not provided.

### Added — cancellable graph reads

- Every `GraphAPI` read (`getNeighbors`, `getHealth`, `getInferenceRules`,
  `getFullGraph`, `findShortestPath`, `getGroundingStatus`, `getLinks`, and the
  POST-but-read `getEdgesBulk`) accepts an optional `{ signal }` and forwards it
  to `fetch`, so a caller whose results went stale can cancel in flight.
  Writes deliberately take no signal: aborting a mutation stops the client
  reading the response, not the server applying it.
- `BaseAPI.request` / `requestBinary` rethrow `AbortError` untouched instead of
  wrapping it in `APIError(..., 'network_error')`, so a cancellation is not
  reported to users as a network failure. Check `err.name === 'AbortError'`.
- `GraphAPI.getNeighbors` now URL-encodes the item id.

### Added — CORE-MEMTYPE-DECLARE-1 P4: record lifecycle client surface

- `OntologyAPI.migrateTypeInstances(..., { onViolation: 'refuse'|'skip' })`
  supports record schema preflight/skip behavior and returns the additive
  record migration report fields. The default is omitted on the wire so
  existing entity migration requests remain byte-compatible.
- `OntologyAPI.retireType(typeId, reason)` retires this workspace's OWN
  confirmed record class. The server refuses with 400 unless the type resolves
  to the private layer and is kind 'record' — public and pack classes are shared
  vocabulary and are not retirable here.

### Added — CORE-MEMTYPE-DECLARE-1 P1: declare surface

- `OntologyAPI.declareType(name, {kind, propertiesSchema, requiredProperties,
  storageStrategy, storageSearchable, tier, ...})` →
  `POST /memory/ontology/types`. `kind: 'record'` declares a concrete record
  type; items with `memory_type=name` are then accepted by the add and
  structured-ingest surfaces with schema checks (STRICT by default —
  violations refused with a structured 400; server-side kill-switch
  downgrades to WARNING).
- `OntologyAPI.declareRelation(name, {domain, range, cardinality, ...})` →
  `POST /memory/ontology/relations` (declare-only in P1).
- `OntologyAPI.listTypes` gains the `kind` filter.
- `OntologyAPI` is now exported from the `core` entry too (dual-export rule —
  it was index-only).

### Fixed — `MemoryAPI` interpolated caller-supplied item ids into paths RAW

- Ten methods built their URL as `` `/memory/${id}/...` `` with no encoding:
  `get`, `update`, `delete`, `supersede`, `supersedeLink`, `getLineage`,
  `getLinks`, `getNeighbors`, `enrich`, `ground`. All now use
  `encodeURIComponent`, matching `explain()`, which already did — which is what
  marks this as an oversight rather than a convention.
- **Why it matters:** an item id is caller data. `get('a/../../evil')` addressed
  `/memory/a/../../evil` and walked out of the route it was aiming at. Even
  without a hostile caller, any id legitimately containing `/` silently missed
  its item instead of being looked up.
- Transparent to correct callers: FastAPI percent-decodes path params, so an id
  containing `:` or a space reaches the server unchanged.
- Found while pointing `forge/compose` at this SDK — its own client encodes, and
  the mismatch was what stopped it adopting `client.memories.*` for the
  id-addressed routes.
- Regression cover: `tests/unit/api/MemoryAPI.test.js`, one case per method
  (10 of the 11 fail without the fix; `explain` passes either way).

## [1.4.60] - 2026-08-06

### Added (2026-08-05) — SVC-ALLOC-1 sequence client surface

- New `SequenceAPI`, exposed as `client.sequences` and from the package entry
  point: `allocate(name, {floor, count})` and `peek(name)`.
- `allocate()` throws on every non-2xx and never returns a sentinel. There is no
  benign failure for an allocator — a `null` on 503 would let a caller mistake
  coordinator failure for a value.
- `peek()` returns `null` only for a 404. A 503 throws.
- `floor: 0` is sent rather than dropped; it is falsy but meaningful.
- Do not wrap these calls in a lease — that is the point. The lease remains
  required for read-modify-write.

### Added (2026-08-05) — embed control + supersede-link (SVC-EMBED-CONTROL-1, SVC-SUPERSEDE-LINK-1)

- `memory.create()` accepts `embed: true | false`. Sent only when set, so an
  omitted option is byte-identical to the previous request. Valid only with
  `usePipeline: false`; the service answers 400 for the combination.
- New `memory.supersedeLink(id, newItemId, reason?)` relates two records that
  already exist, complementing `supersede()` which creates the replacement.
- Detect supersession by reading `superseded` / `superseded_by` /
  `superseded_at` off the OLD record. The newer record carries no marker by
  design, so never scan for inbound links.

### Added (2026-08-05) — SVC-LEASE-1 lease client surface

- New `LockAPI`, exposed as `client.locks` and from the package entry point:
  `acquire()`, `renew()`, and `release()` wrap the scoped renewable lease routes.
- Recognised ownership conflicts are normal control flow (`null` for acquire/renew,
  `false` for release); validation, quota, coordinator, and network failures raise
  so an unknown coordinator outcome cannot be mistaken for a known one.
- A 409 is control flow only when its `detail.reason` is the one the call models;
  an unexpected reason, or a 409 with no parseable detail, raises.

### Added (2026-08-05) — `includeRetracted` on `search()` (CORE-RETRACTED-RECALL-1)

- `MemoryAPI.search()` gains `includeRetracted` (`include_retracted`), sent only when
  true so unset params stay absent from the body rather than serializing as null.
- Sibling of `includeSuperseded` and not covered by it: a retracted belief was
  withdrawn with no replacement. **Retracted items are hidden by default as of this
  release**; pass `includeRetracted: true` to see them.

## [1.4.59] - 2026-08-04

### Added (2026-08-04) — as-of search + explain (PLAT-AUDITABLE-MEMORY-1 T11)
- `MemoryAPI.search()` gains `asOfDate` (`as_of_date`; string or Date,
  serialized to ISO) and `includeSuperseded` (`include_superseded`) —
  transaction-time travel per the search contract.
- New `MemoryAPI.explain(memoryId)` → `GET /memory/{id}/explain`: the
  single-call audit answer (explain-contract shape). `chain_verified` of
  `null` means nothing to verify, not a tamper warning.

## [1.4.57] - 2026-08-02
Version copied verbatim from `smart-memory-core/VERSION` per the release sync chain — core is the
only dial. The SDK had been lagging at 1.4.53 while core advanced to 1.4.57; this release
resynchronises it. Published manually (org CI is down).

### Added (2026-08-02) — GRAPH-API-1l: metadata filters on `MemoryAPI.list()`
- `list()` accepts `metadataKey` / `metadataValue` for an exact metadata match, mapped to the
  `metadata_key` / `metadata_value` query params. Nested keys use dot syntax (`profile.tier`)
  and are sent unchanged. Omitted from the query string entirely when not supplied — the route
  validates them as a both-or-neither pair, so sending one alone is a 422.
- `total` in the response counts the filtered set, so it drives pagination directly.

### Fixed (2026-08-02) — GRAPH-API-1l: `list()` now URL-encodes its query string
- `list()` built its query string by raw concatenation, so a value containing `&`, `=`, `#`, a
  space, or non-ASCII would have corrupted the request. It now uses `URLSearchParams`, matching
  `searchByMetadata()`. This became load-bearing with user-supplied metadata values, which are
  far more likely to contain reserved characters than a numeric limit or offset.
- The pre-existing quirk where `list({type})` sends a `memory_type` param that `/memory/list`
  does not declare (and therefore ignores) is **deliberately unchanged** — silently altering it
  mid-feature would be a behaviour change nobody asked for.

### Deprecated (2026-08-02) — GRAPH-API-1l: `searchByMetadata()`
- JSDoc `@deprecated` pointing at `list()`. No behaviour change; the two endpoints return
  slightly different item shapes, so migrate deliberately.

### Changed (2026-08-02) — GRAPH-API-1i `retrievedContextIds` option added, then removed same day
- `MemoryAPI.create` briefly accepted a `retrievedContextIds` option. Removed after
  review: provenance travels inside `metadata`, which persists and lifts onto the
  server-side typed field — the dedicated option duplicated that path for zero
  consumers. Net change versus the last release: none.

### Fixed (2026-08-02) — stale `DecisionAPI.findConflicts` assertion
- GRAPH-API-1b gave `findConflicts` a `minContest` param that is always sent
  (`?min_contest=0` by default); its test still asserted the bare URL and had been
  failing since. Assertion corrected and an explicit-value case added.

### Added (2026-08-02) — MAYA-SAID-1
- search_by_metadata gains limit param (route already supported it)

### Added (2026-08-01) — GRAPH-API-1b: graph/decision wrapper parity
- `GraphAPI.bulkUpsert` (batched node+edge upsert) added; `getEdgesBulk` gains
  `includeProperties`; `DecisionAPI.findConflicts` gains `minContest`. All seven
  graph/decision routes now covered by mocked tests.

### Fixed (2026-07-22) — PLAT-ANALYTICS-1 privacy blockers (adversarial review)

Three channels bypassed the product-event allowlist entirely, so the strict payload
posture the feature was built around did not hold in practice.

- **Session replay was recording unmasked text.** The config set top-level `mask_all_text`
  and `mask_all_element_attributes`, but posthog-js reads those only in `autocapture.js`
  and `dead-clicks-autocapture.js` — and autocapture is off. The replay recorder resolves
  masking solely from `session_recording.{maskAllInputs, maskTextSelector, blockSelector}`,
  so rendered memory content, search results, and chat text were serialized into
  `$snapshot` in the clear. Now sets `session_recording.maskTextSelector: '*'`. The
  top-level flags are kept as defense in depth for the autocapture surfaces, which remote
  config can switch on.
- **Exception autocapture bypassed the sanitized seam.** `capture_exceptions: true` hooked
  `window.onerror` and `unhandledrejection` and shipped raw messages, stacks, and
  filenames, never passing through `captureException` (which strips exactly those). An
  error whose message was built from a search query or memory content was sent verbatim.
  Now `false`; explicit capture only.
- **Console output was being recorded into replays.** The production PostHog project
  returns `sessionRecording.consoleLogRecordingEnabled: true` in its remote config, and
  posthog-js resolves the setting as `client ?? server` — so leaving it unset silently
  inherited `true`. Apps log raw payloads while debugging (Maya logs recalled memory
  content), and console capture is not covered by text masking. Now pinned
  `enable_recording_console_log: false` from the client, which takes precedence.
- **Every event carried the full URL including its query string.** PostHog attaches
  `$current_url` / `$referrer` (and `$initial_*` variants) automatically, outside the
  allowlist. Our routes put record identifiers in the query — `/Memories?id=<item_id>`
  and the viewer's `/?run=<run_id>` — so memory and run IDs rode along on every pageview,
  identify, product event, and replay snapshot. Adds a `before_send` hook that strips the
  query string and fragment from every URL-bearing property, recursing into `$set` /
  `$set_once`. An unparseable URL is dropped rather than forwarded.

### Fixed (2026-07-22) — PLAT-ANALYTICS-1 S6 identify/workspace ordering
- `AnalyticsIdentity` now registers the active `workspace_id` super-property *before* calling
  `identify()`. PostHog reads super-properties when it builds the outgoing payload, so the
  previous order let an `$identify` event carry the prior/default workspace during an
  organization switch. Found by the S6 network-level E2E assertion; unit coverage now asserts
  invocation order rather than just that both calls happened.

### Added (2026-07-22) — PLAT-ANALYTICS-1 S2 shared browser analytics
- Added the optional `@smartmemory/sdk-js/react/analytics` subpath with a masked-replay PostHog
  configuration (autocapture off, session replay on with full text/attribute/input masking),
  normalized identity/workspace handling, contract-generated product-event allowlists,
  sanitized exception capture, and synchronous reset.
- React auth state now exposes the active token-manager `workspaceId` to consumers.

### Changed (auto, lockstep) — track product version 1.4.51 (1.4.51)
- Version copied from the smartmemory-core release (single-source lockstep).

### Changed (auto, lockstep) — track product version 1.4.50 (1.4.50)
- Version copied from the smartmemory-core release (single-source lockstep).

### Changed (auto, lockstep) — track product version 1.4.49 (1.4.49)
- Version copied from the smartmemory-core release (single-source lockstep).

### Changed (auto, lockstep) — track product version 1.4.48 (1.4.48)
- Version copied from the smartmemory-core release (single-source lockstep).

### Added (2026-07-13) — MAYA-SELF-1 system teams and supersession
- `TeamAPI.create()` accepts `isSystem`, `TeamAPI.list()` accepts `includeSystem`, and
  `MemoryAPI.supersede()` calls the append-only supersession endpoint. Defaults preserve the existing
  public team list and request shapes.

### Changed (auto, lockstep) — track product version 1.4.47 (1.4.47)
- Version copied from the smartmemory-core release (single-source lockstep).

### Changed (auto, lockstep) — track product version 1.4.46 (1.4.46)
- Version copied from the smartmemory-core release (single-source lockstep).

### Changed (auto, lockstep) — track product version 1.4.45 (1.4.45)
- Version copied from the smartmemory-core release (single-source lockstep).

### Added (2026-07-09) — ONTO-HITL-CURATE-1 SDK wrappers
- `OntologyAPI` gains wrappers for the ontology curation queue HTTP surface: `listReviewQueue`,
  `approveReviewType`, `rejectReviewType`, `mergeReviewType`, `editPromoteReviewType`,
  `assignReviewer`, `bulkReviewAction`.
- Tests in `tests/unit/api/OntologyCurateAPI.test.js` cover exact queue URLs, params, bodies,
  URL-encoded type ids, and bulk mixed reports.

### Added (2026-07-09) — ontology type/relation read, audit, and migration methods (ONTO-CRUD-1)
- `OntologyAPI` gains 9 methods over the `ontology_crud.py` HTTP surface: `listTypes`,
  `listRelations`, `getType`, `getRelation`, `listAudit`, `getTypeAudit`, `getRelationAudit`,
  `getPackAudit`, `migrateTypeInstances`.
- Tests in `tests/unit/api/OntologyCrudAPI.test.js` cover the happy path for all 9 methods plus
  404/400 error propagation.

### Changed (auto, lockstep) — track product version 1.4.44 (1.4.44)
- Version copied from the smartmemory-core release (single-source lockstep).


### Changed (auto, lockstep) — track product version 1.4.44 (1.4.44)
- Version copied from the smartmemory-core release (single-source lockstep).

### Changed (auto, lockstep) — track product version 1.4.43 (1.4.43)
- Version copied from the smartmemory-core release (single-source lockstep).

### Changed (auto, lockstep) — track product version 1.4.42 (1.4.42)
- Version copied from the smartmemory-core release (single-source lockstep).

### Changed (auto, lockstep) — track product version 1.4.40 (1.4.40)
- Version copied from the smartmemory-core release (single-source lockstep).

### Changed (auto, lockstep) — track product version 1.4.39 (1.4.39)
- Version copied from the smartmemory-core release (single-source lockstep).

### Changed (auto, lockstep) — track product version 1.4.38 (1.4.38)
- Version copied from the smartmemory-core release (single-source lockstep).

### Changed (auto, lockstep) — track product version 1.4.37 (1.4.37)
- Version copied from the smartmemory-core release (single-source lockstep).

### Added (2026-07-03) — subscribeProgress cookie/SSO auth support (FIX-A)
- `SubscribeProgressOptions.useCookieAuth?: boolean` — when `true` and no `token`/`apiKey`
  is provided, `fetchEventSource` is called with `credentials: 'include'` so the browser
  forwards session cookies (SSO environments). Token and apiKey continue to take precedence.
  The SmartMemory service already sets `allow_credentials=true` and enumerates studio origins,
  so credentialed SSE requests are accepted without a service change.
- Unit tests in `tests/unit/progress/subscribeProgress.test.js` (7 assertions).

### Added (2026-07-02) — URL contract tests across the API surface
- Propagated the URL-asserting contract-test pattern (the guard that caught the 2026-07-02
  path-drift 404s) across the remaining API classes: 320 lines of new assertions in
  `tests/unit/api/{MemoryAPI,DomainAPIs,NewDomainAPIs}.test.js` pinning each client method
  to the exact service path + verb (spot-verified against smart-memory-service routes).
  No drift found in the covered methods. Suite: 383 passed.

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
