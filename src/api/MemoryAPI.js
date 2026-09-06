export class MemoryAPI {
  constructor(baseAPI) {
    this.api = baseAPI;
  }

  /**
   * Create a memory item.
   *
   * Provenance like `retrieved_context_ids` travels inside `metadata` — the storage
   * layer lifts it onto the server-side MemoryItem; no dedicated option exists
   * (GRAPH-API-1i wire field added then removed 2026-08-02).
   *
   * @param {Object} options
   * @param {string} options.content - Memory content
   * @param {string} [options.memoryType='semantic'] - Memory type
   * @param {Object} [options.metadata] - Additional metadata
   * @param {boolean} [options.usePipeline=true] - Run the full extraction pipeline
   * @param {string} [options.profileName] - Pipeline profile, routed server-side
   * @param {Object} [options.conversationContext] - Conversation-aware extraction context
   * @param {boolean} [options.embed] - SVC-EMBED-CONTROL-1 embedding override.
   *   `true` forces an embedding, `false` suppresses one, omitted leaves existing
   *   behaviour untouched. **Only valid with `usePipeline: false`** — the server
   *   answers 400 for the combination rather than silently ignoring it, because
   *   the ingestion pipeline has no per-item override.
   */
  async create({
    content,
    memoryType = 'semantic',
    metadata = null,
    usePipeline = true,
    profileName = null,
    conversationContext = null,
    embed = null,
  }) {
    const body = {
      content,
      memory_type: memoryType,
      metadata,
      use_pipeline: usePipeline,
      profile_name: profileName,
    };
    if (conversationContext !== null && conversationContext !== undefined) {
      body.conversation_context = conversationContext;
    }
    // Send only when set, so an omitted option is byte-identical to the
    // pre-SVC-EMBED-CONTROL-1 request.
    if (embed !== null && embed !== undefined) {
      body.embed = embed;
    }
    return this.api.post('/memory/add', body);
  }

  async get(id) {
    const response = await this.api.get(`/memory/${encodeURIComponent(id)}`);
    return { ...response, id: response.item_id || response.id };
  }

  /**
   * Update a memory item (CORE-CRUD-UPDATE-1 contract).
   *
   * @param {string} id - Memory item ID
   * @param {Object} updates - Update fields
   * @param {string} [updates.content] - Convenience — replaces content
   * @param {Object} [updates.metadata] - Convenience — deep-merges with existing metadata
   * @param {Object} [updates.properties] - Advanced — direct node-property dict.
   *   When provided, takes precedence over content/metadata conveniences.
   * @param {'merge'|'replace'} [updates.write_mode] - Node-property write semantics.
   *   'merge' (default) overlays new properties; 'replace' replaces all
   *   (preserving memory_type and node_category).
   */
  async update(id, updates) {
    return this.api.patch(`/memory/${encodeURIComponent(id)}`, updates);
  }

  async supersede(id, { content, memoryType, metadata = {}, reason }) {
    return this.api.post(`/memory/${encodeURIComponent(id)}/supersede`, {
      content,
      memory_type: memoryType,
      metadata,
      reason
    });
  }

  /**
   * Link two ALREADY-STORED items as a supersession (SVC-SUPERSEDE-LINK-1).
   *
   * Use this when both records exist. Use {@link supersede} instead when the
   * replacement still has to be created from content.
   *
   * The write stamps the OLD record with `superseded`, `superseded_by` and
   * `superseded_at`. Detect supersession by reading those off a recalled record —
   * the newer record carries no marker, so never scan for inbound links.
   *
   * @param {string} id - The OLD item (the one being superseded)
   * @param {string} newItemId - The NEW item; must already exist and be in scope
   * @param {string} [reason] - Optional human-readable reason
   * @throws 400 if `newItemId` equals `id`; 404 if either item is missing *or*
   *   out of scope (deliberately indistinguishable); 409 if the store declined.
   */
  async supersedeLink(id, newItemId, reason = null) {
    return this.api.post(`/memory/${encodeURIComponent(id)}/supersede-link`, {
      new_item_id: newItemId,
      reason
    });
  }

  async delete(id) {
    return this.api.delete(`/memory/${encodeURIComponent(id)}`);
  }

  /**
   * List memory items, optionally filtered by an exact metadata match.
   *
   * @param {object} [options]
   * @param {number} [options.limit=50]
   * @param {number} [options.offset=0]
   * @param {string|null} [options.type=null] - Exact memory type filter, applied
   *   server-side before pagination and counting (sent as `memory_type`).
   * @param {string|null} [options.metadataKey=null] - GRAPH-API-1l. Metadata key to filter
   *   on. Nested keys use dot syntax (`profile.tier`). Must be paired with `metadataValue`;
   *   sending only one half is a 422.
   * @param {string|null} [options.metadataValue=null] - Value the key must equal.
   * @returns {Promise<{items: object[], total: number, limit: number, offset: number}>}
   *   `total` counts the filtered set, so it drives pagination directly.
   */
  async list({
    limit = 50,
    offset = 0,
    type = null,
    metadataKey = null,
    metadataValue = null,
  } = {}) {
    // URLSearchParams, not string concatenation: a metadata value may legitimately
    // contain `&`, `=`, `#`, spaces, or non-ASCII, all of which would corrupt a
    // hand-built query string. Mirrors searchByMetadata below.
    const params = new URLSearchParams({ limit, offset });
    if (type !== null && type !== undefined) params.append('memory_type', type);
    if (metadataKey !== null && metadataKey !== undefined) {
      params.append('metadata_key', metadataKey);
    }
    if (metadataValue !== null && metadataValue !== undefined) {
      params.append('metadata_value', metadataValue);
    }
    return this.api.get(`/memory/list?${params}`);
  }

  /**
   * Search for memory items.
   *
   * @param {string} query - Search query string.
   * @param {object} [options]
   * @param {number} [options.topK=5]
   * @param {boolean} [options.enableHybrid=true]
   * @param {string|null} [options.memoryType=null]
   * @param {boolean} [options.expertise=false] - When true (CORE-EXPERTISE-1 Phase 4a),
   *   the response shape changes from a flat list to `{results: {<expertise_type>: [items]}}`
   *   keyed by expertise type (decision, constraint, learned, opinion, reasoning, observation).
   *   Each bucket holds up to topK items.
   * @param {boolean} [options.includeConsolidated=false] - When true (CORE-CONSOLIDATE-1),
   *   include consolidated source memories (normally hidden) in results.
   * @param {boolean} [options.consolidationFirst=false] - When true (NEURO-1d), surface a
   *   consolidated summary above the scattered source memories it consolidates — best for
   *   synthesis queries. Opt-in; implies includeConsolidated.
   * @param {string|Date|null} [options.asOfDate=null] - Transaction-time travel
   *   (PLAT-AUDITABLE-MEMORY-1): return what the system believed at this
   *   ISO-8601 instant. Date objects serialize to ISO automatically.
   * @param {boolean} [options.asOfStrict=false] - Only meaningful with asOfDate
   *   (PLAT-AUDITABLE-MEMORY-1 gap #2). Default returns results that could not be
   *   resolved, each carrying `as_of_resolution: 'unresolved'`, and summarises them
   *   in the envelope's `as_of_diagnostics`. When true the request fails with 422
   *   instead, for callers who would rather have no answer than a partial history.
   * @param {boolean} [options.includeSuperseded=false] - Keep superseded items
   *   visible in results (PLAT-AUDITABLE-MEMORY-1).
   * @param {boolean} [options.includeRetracted=false] - Keep retracted items visible
   *   in results (CORE-RETRACTED-RECALL-1). A retracted belief was withdrawn outright
   *   with no replacement, so it is a separate lifecycle state from superseded and is
   *   NOT covered by includeSuperseded. Both are inert when asOfDate is set, which
   *   retains those rows regardless.
   * @param {boolean} [options.includeArchived=false] - Keep archived items visible in
   *   results (CORE-ARCHIVED-RECALL-1). Archived items are memories the decay/prune
   *   evolvers retired, or the source an episodic-to-semantic promotion replaced.
   *   Third sibling of the two above and not covered by either: an archived item has
   *   no replacement and no version chain. Also inert when asOfDate is set. Note this
   *   default CHANGED behaviour rather than preserving it — before
   *   CORE-ARCHIVED-RECALL-1 the server read `archived` on no search path at all, so
   *   archived items were returned ranked exactly like live ones.
   * @param {boolean} [options.excludeSpeculative=false] - Exclude speculative
   *   memories from results. Sent as `exclude_speculative` only when true.
   * @param {boolean} [options.cite=false] - When true (RECALL-CITATIONS-1), the
   *   envelope gains a `citations` array of `{n, item_id, item_type, preview, score, footnote_marker}`.
   *   Empty `citations: []` when no results — distinguishes "no results" from "no citations requested".
   * @returns {Promise<{results: Array|Object, group_roots: Object, citations?: Array}>}
   *   CORE-RECALL-LINEAGE-1: the response is ALWAYS a `SearchResponse` envelope —
   *   `results` is a flat array by default and a `{bucket: [...]}` map under
   *   `expertise: true`; `group_roots` is always present (possibly `{}`) and
   *   carries `GroupRootStub`s for any lineage root_id referenced by some
   *   result's `lineage_roots` but not itself in `results`; `citations` is
   *   present only under `cite: true`. Pre-LINEAGE-1 callers who indexed into a
   *   bare array must read `response.results` instead. When `asOfDate` is set the
   *   envelope also carries `as_of_diagnostics` ({as_of, policy, unresolved_count,
   *   unresolved_item_ids, note}) and every result carries `as_of_resolution`. A
   *   result marked `'unresolved'` is PRESENT-DAY content and must not be rendered
   *   as a historical belief.
   */
  /**
   * hopStrategy: consensus follows entities several top results agree on; relevance follows
   * best-result entities and one-off bridges; semantic asks an LLM. Omitted preserves core default.
   * since/until: ISO strings or Dates bounding created_at in [since, until), independent of asOfDate. */
  async search(query, { topK = 5, enableHybrid = true, memoryType = null, expertise = false, cite = false, decompose = false, multiHop = false, maxHops = 3, budgetMs = 1500, semanticHops = false, includeReference = false, includeConsolidated = false, consolidationFirst = false, asOfDate = null, asOfStrict = false, includeSuperseded = false, includeRetracted = false, includeArchived = false, excludeSpeculative = false, since = null, until = null, hopStrategy = null } = {}) {
    const body = { query, top_k: topK, enable_hybrid: enableHybrid };
    for (const [key, value] of Object.entries({ since, until })) {
      if (value != null) body[key] = value instanceof Date ? value.toISOString() : value;
    }
    if (memoryType) body.memory_type = memoryType;
    if (expertise) body.expertise = true;
    if (cite) body.cite = true;
    if (decompose) body.decompose = true;
    if (hopStrategy != null) body.hop_strategy = hopStrategy;
    if (multiHop) body.multi_hop = true;
    if (multiHop && maxHops !== 3) body.max_hops = maxHops;
    if (multiHop && budgetMs !== 1500) body.budget_ms = budgetMs;
    if (multiHop && semanticHops) body.semantic_hops = true;
    if (includeReference) body.include_reference = true;
    if (includeConsolidated) body.include_consolidated = true; // CORE-CONSOLIDATE-1
    if (consolidationFirst) body.consolidation_first = true;   // NEURO-1d: surface summaries above their sources
    // PLAT-AUDITABLE-MEMORY-1: transaction-time travel. Date objects serialize to ISO.
    if (asOfDate) body.as_of_date = asOfDate instanceof Date ? asOfDate.toISOString() : asOfDate;
    if (asOfStrict) body.as_of_strict = true; // gap #2: 422 rather than a partial history
    if (includeSuperseded) body.include_superseded = true;
    if (includeRetracted) body.include_retracted = true; // CORE-RETRACTED-RECALL-1
    if (includeArchived) body.include_archived = true;   // CORE-ARCHIVED-RECALL-1
    if (excludeSpeculative) body.exclude_speculative = true;
    return this.api.post('/memory/search', body);
  }

  /**
   * Ask a question and get a written answer plus the evidence behind it (DIST-LITE-9).
   *
   * Where `search` hands back ranked memories for the caller to read, this returns a
   * grounded answer together with the exact memories and graph relations it was built
   * from, so a reader can check it rather than trust it. The evidence list is the
   * retrieved set captured before the model ran, so a citation cannot be invented.
   *
   * The same request and response shape is served by the lite daemon on port 9014 and
   * by the hosted API, which is what lets `AskPanel` from `@smartmemory/graph` point at
   * either without changing.
   *
   * There is no fallback answer: a 502 comes back when the configured LLM errors or
   * returns nothing, rather than a synthesized reply.
   *
   * @param {string} question - The natural-language question.
   * @param {Object} [options]
   * @param {number} [options.limit=5] - How many memories to retrieve as evidence (1-50).
   * @param {boolean} [options.reasoning=true] - When false, `reasoning` comes back empty.
   * @returns {Promise<{answer: string, reasoning: string, evidence: Array<{item_id: string, content: string}>, relations: Array<{source: string, type: string, target: string, source_id: string, target_id: string}>}>}
   *   Relation rows carry both display labels and graph node ids; combine them as
   *   `${source_id}->${target_id}:${type}` to address the edge in a graph view.
   */
  async ask(question, { limit = 5, reasoning = true } = {}) {
    const body = { question, limit };
    // Omit the default so this client, the Python SDK and the lite daemon all put the
    // same body on the wire for the same call.
    if (reasoning !== true) body.reasoning = reasoning;
    return this.api.post('/memory/ask', body);
  }

  /**
   * Get the complete audit answer for one memory (PLAT-AUDITABLE-MEMORY-1).
   *
   * Returns the explain-contract shape: identity + origin tier, every belief
   * the system held over time (with chain hashes), supersession in both
   * directions, lineage roots, decision provenance, and chain verification.
   * A `chain_verified` of `null` means nothing to verify (legacy or
   * unversioned) — it is NOT a tamper warning.
   *
   * @param {string} memoryId - Memory item ID.
   * @returns {Promise<object>} Explain response
   *   (docs/features/PLAT-AUDITABLE-MEMORY-1/explain-contract.json).
   */
  async explain(memoryId) {
    return this.api.get(`/memory/${encodeURIComponent(memoryId)}/explain`);
  }

  async getWorkingContext(sessionId, query, { k = 20, maxTokens = null, strategy = null } = {}) {
    const body = {
      session_id: sessionId,
      query,
      k,
    };
    if (maxTokens !== null && maxTokens !== undefined) body.max_tokens = maxTokens;
    if (strategy !== null && strategy !== undefined) body.strategy = strategy;
    return this.api.post('/memory/context', body);
  }

  async searchAdvanced(query, { algorithm = 'query_traversal', maxResults = 15, useSSG = true } = {}) {
    return this.api.post('/memory/search/advanced', {
      query,
      algorithm,
      max_results: maxResults,
      use_ssg: useSSG
    });
  }

  async ingest(content, { profileName = null, extractorName = 'llm', context = {} } = {}) {
    return this.api.post('/memory/ingest', {
      content,
      profile_name: profileName,
      extractor_name: extractorName,
      context
    });
  }

  async getLineage(id) {
    return this.api.get(`/memory/${encodeURIComponent(id)}/lineage`);
  }

  async getLinks(id) {
    return this.api.get(`/memory/${encodeURIComponent(id)}/links`);
  }

  /**
   * Find memory items by exact metadata match.
   *
   * @deprecated GRAPH-API-1l — use {@link MemoryAPI#list} with `metadataKey` /
   *   `metadataValue` instead. It applies the same filter but adds pagination and an
   *   exact `total`. This method still works and its behaviour is unchanged; the two
   *   endpoints return slightly different item shapes, so migrate deliberately rather
   *   than by find-and-replace.
   */
  async searchByMetadata(metadataKey, metadataValue, { memoryType = null, limit = 25, since = null, until = null } = {}) {
    const params = new URLSearchParams({
      metadata_key: metadataKey,
      metadata_value: metadataValue,
      limit,
    });
    for (const [key, value] of Object.entries({ since, until })) {
      if (value != null) params.append(key, value instanceof Date ? value.toISOString() : value);
    }
    if (memoryType) params.append('memory_type', memoryType);
    return this.api.get(`/memory/by-metadata?${params}`);
  }

  async getNeighbors(id) {
    return this.api.get(`/memory/${encodeURIComponent(id)}/neighbors`);
  }

  async getSummary() {
    return this.api.get('/memory/summary');
  }

  async ingestConversation(turns, {
    sessionBoundaries = null, conversationId = null, sessionDates = null,
    turnsPerChunk = 15, maxChunkChars = 12000, maxConcurrent = 4, context = null
  } = {}) {
    const body = { turns, turns_per_chunk: turnsPerChunk, max_chunk_chars: maxChunkChars, max_concurrent: maxConcurrent };
    if (sessionBoundaries) body.session_boundaries = sessionBoundaries;
    if (conversationId) body.conversation_id = conversationId;
    if (sessionDates) body.session_dates = sessionDates;
    if (context !== null) body.context = context;
    return this.api.post('/memory/ingest/conversation', body);
  }

  async ingestDocument(content, { title = null, source = null, chunkStrategy = null, context = null } = {}) {
    const body = { content };
    if (title) body.title = title;
    if (source) body.source = source;
    if (chunkStrategy) body.chunk_strategy = chunkStrategy;
    if (context !== null) body.context = context;
    return this.api.post('/memory/ingest/document', body);
  }

  /**
   * Import a ChatGPT or Claude conversation export (DIST-CHAT-IMPORT-1).
   *
   * Conversations run through the normal conversation pipeline, so entities and
   * relations are extracted exactly as for a live conversation. Items land with
   * origin `import:chatgpt_export` / `import:claude_export` — tier 1, so they are
   * recallable, and dedupe-eligible, so re-uploading a later export updates the
   * overlap rather than duplicating it.
   *
   * @param {Blob|File} file - The vendor .zip as downloaded, or its conversations.json.
   * @param {object}  [options]
   * @param {string}  [options.sourceFormat='auto'] - 'auto' | 'chatgpt' | 'claude'.
   * @param {number}  [options.maxConversations=25] - Cap on conversations ingested (1-200).
   *   The import is synchronous and each conversation runs the full pipeline, so this
   *   bound is real. Longest conversations are kept first.
   * @returns {Promise<object>} `{ source_format, conversations_imported,
   *   conversations_failed, turns_imported, items_created, warnings }`. Always check
   *   `warnings` — a non-empty list means something was capped, skipped, or degraded
   *   even though the call succeeded.
   */
  async importChatExport(file, { sourceFormat = 'auto', maxConversations = 25 } = {}) {
    const body = new FormData();
    body.append('file', file, file.name || 'conversations.json');
    body.append('source_format', sourceFormat);
    body.append('max_conversations', String(maxConversations));
    return this.api.post('/memory/import/chat-export', body);
  }

  /** List supported chat-export formats and how a user obtains each export. */
  async chatExportFormats() {
    return this.api.get('/memory/import/chat-export/formats');
  }

  async codeIndex(path, { repo = null, commit = null } = {}) {
    const body = { path };
    if (repo) body.repo = repo;
    if (commit) body.commit = commit;
    return this.api.post('/memory/code/index', body);
  }

  async codeSearch(query, { entityType = null, repo = null, limit = 20, semantic = false } = {}) {
    const params = new URLSearchParams({ query, limit, semantic });
    if (entityType) params.append('entity_type', entityType);
    if (repo) params.append('repo', repo);
    return this.api.get(`/memory/code/search?${params}`);
  }

  async codeContext(entityName, { repo = null } = {}) {
    const params = new URLSearchParams({ entity_name: entityName });
    if (repo) params.append('repo', repo);
    return this.api.get(`/memory/code/context?${params}`);
  }

  async codeDeadCode(repo) {
    return this.api.get(`/memory/code/dead-code?repo=${encodeURIComponent(repo)}`);
  }

  async codeDependencies(entityName, { direction = 'both', repo = null } = {}) {
    const params = new URLSearchParams({ entity_name: entityName, direction });
    if (repo) params.append('repo', repo);
    return this.api.get(`/memory/code/dependencies?${params}`);
  }

  async getPlan(planId) {
    return this.api.get(`/memory/plans/${planId}`);
  }

  async updatePlanTask(planId, { taskId, status }) {
    return this.api.patch(`/memory/plans/${planId}/task`, { task_id: taskId, status });
  }

  async completePlan(planId, { graduate = false } = {}) {
    return this.api.post(`/memory/plans/${planId}/complete`, { graduate });
  }

  async failPlan(planId, reason) {
    return this.api.post(`/memory/plans/${planId}/fail`, { reason });
  }

  async link(sourceId, targetId, linkType = 'RELATED') {
    return this.api.post('/memory/link', {
      source_id: sourceId,
      target_id: targetId,
      link_type: linkType
    });
  }

  async enrich(itemId, routines = []) {
    return this.api.post(`/memory/${encodeURIComponent(itemId)}/enrich`, {
      item_id: itemId,
      routines
    });
  }

  /**
   * Request personalization.
   *
   * The endpoint currently returns HTTP 501 because
   * CORE-PERSONALIZATION-CONTRACT-1 is not implemented.
   */
  async personalize(traits = {}, preferences = {}) {
    return this.api.post('/memory/personalize', { traits, preferences });
  }

  /**
   * Reinforce recalled memory items with explicit feedback.
   *
   * Bumps `retention_score` immediately and, for `helpful` outcomes with multiple
   * items, strengthens the `CO_RETRIEVED` edges between every pair — feeding into
   * the Hebbian co-retrieval evolver.
   *
   * @param {string[]} itemIds - Item IDs returned by a prior `search()` call (1-50).
   * @param {'helpful'|'misleading'|'neutral'} outcome - Feedback signal.
   * @param {string} [query] - Original query that produced these results.
   * @returns {Promise<{updated: number, edges_strengthened: number, outcome: string}>}
   */
  async feedback(itemIds, outcome, query = null) {
    const body = { item_ids: itemIds, outcome };
    if (query !== null && query !== undefined) body.query = query;
    return this.api.post('/memory/feedback', body);
  }

  /**
   * Request grounding for a memory item.
   *
   * The endpoint currently returns HTTP 501 because
   * CORE-GROUND-ROUTE-CONTRACT-1 is not implemented.
   */
  async ground(itemId, sourceUrl, validation = null) {
    return this.api.post(`/memory/${encodeURIComponent(itemId)}/ground`, {
      item_id: itemId,
      source_url: sourceUrl,
      validation
    });
  }

  async clearAll(nuclear = false) {
    return this.api.delete(`/memory/clear-all?nuclear=${nuclear}`);
  }

  // --- Temporal ---

  async getHistory(itemId, { startTime = null, endTime = null, limit = 100 } = {}) {
    let url = `/memory/temporal/${itemId}/history?limit=${limit}`;
    if (startTime) url += `&start_time=${startTime}`;
    if (endTime) url += `&end_time=${endTime}`;
    return this.api.get(url);
  }

  async timeTravel(timestamp, { query = null, limit = 100 } = {}) {
    let url = `/memory/temporal/at/${timestamp}?limit=${limit}`;
    if (query) url += `&query=${encodeURIComponent(query)}`;
    return this.api.get(url);
  }

  async getItemAtTime(itemId, timestamp) {
    return this.api.get(`/memory/temporal/${itemId}/at/${timestamp}`);
  }

  async getChanges(itemId, { since = null, until = null, changeType = null } = {}) {
    let url = `/memory/temporal/${itemId}/changes`;
    const params = [];
    if (since) params.push(`since=${since}`);
    if (until) params.push(`until=${until}`);
    if (changeType) params.push(`change_type=${changeType}`);
    if (params.length) url += `?${params.join('&')}`;
    return this.api.get(url);
  }

  async compareVersions(itemId, v1, v2) {
    return this.api.post(`/memory/temporal/${itemId}/compare?v1=${v1}&v2=${v2}`);
  }

  async rollback(itemId, { toVersion = null, toTime = null } = {}) {
    let url = `/memory/temporal/${itemId}/rollback`;
    const params = [];
    if (toVersion !== null) params.push(`to_version=${toVersion}`);
    if (toTime) params.push(`to_time=${toTime}`);
    if (params.length) url += `?${params.join('&')}`;
    return this.api.post(url);
  }

  // --- Clustering ---

  async runClustering(distanceThreshold = 0.1, dryRun = false) {
    return this.api.post(`/memory/clustering/run?distance_threshold=${distanceThreshold}&dry_run=${dryRun}`);
  }

  async getClusteringStats() {
    return this.api.get('/memory/clustering/stats');
  }
}
