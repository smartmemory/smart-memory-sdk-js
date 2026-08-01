export class MemoryAPI {
  constructor(baseAPI) {
    this.api = baseAPI;
  }

  /**
   * Create a memory item.
   *
   * @param {Object} options
   * @param {string} options.content - Memory content
   * @param {string} [options.memoryType='semantic'] - Memory type
   * @param {Object} [options.metadata] - Additional metadata
   * @param {boolean} [options.usePipeline=true] - Run the full extraction pipeline
   * @param {string} [options.profileName] - Pipeline profile, routed server-side
   * @param {Object} [options.conversationContext] - Conversation-aware extraction context
   * @param {string[]} [options.retrievedContextIds] - CORE-DECISION-OUTCOME-1 D4:
   *   item_ids of the memory items retrieved as context for the work that produced
   *   this item. Omitted from the body when empty; the server defaults it to [].
   *   Added in PLAT-GRAPH-API-1i for parity with the Python SDK.
   */
  async create({
    content,
    memoryType = 'semantic',
    metadata = null,
    usePipeline = true,
    profileName = null,
    conversationContext = null,
    retrievedContextIds = null,
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
    if (Array.isArray(retrievedContextIds) && retrievedContextIds.length > 0) {
      body.retrieved_context_ids = retrievedContextIds;
    }
    return this.api.post('/memory/add', body);
  }

  async get(id) {
    const response = await this.api.get(`/memory/${id}`);
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
    return this.api.patch(`/memory/${id}`, updates);
  }

  async supersede(id, { content, memoryType, metadata = {}, reason }) {
    return this.api.post(`/memory/${id}/supersede`, {
      content,
      memory_type: memoryType,
      metadata,
      reason
    });
  }

  async delete(id) {
    return this.api.delete(`/memory/${id}`);
  }

  async list({ limit = 50, offset = 0, type = null } = {}) {
    let url = `/memory/list?limit=${limit}&offset=${offset}`;
    if (type) url += `&memory_type=${type}`;
    return this.api.get(url);
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
   *   bare array must read `response.results` instead.
   */
  async search(query, { topK = 5, enableHybrid = true, memoryType = null, expertise = false, cite = false, decompose = false, multiHop = false, maxHops = 3, budgetMs = 1500, semanticHops = false, includeReference = false, includeConsolidated = false, consolidationFirst = false } = {}) {
    const body = { query, top_k: topK, enable_hybrid: enableHybrid };
    if (memoryType) body.memory_type = memoryType;
    if (expertise) body.expertise = true;
    if (cite) body.cite = true;
    if (decompose) body.decompose = true;
    if (multiHop) body.multi_hop = true;
    if (multiHop && maxHops !== 3) body.max_hops = maxHops;
    if (multiHop && budgetMs !== 1500) body.budget_ms = budgetMs;
    if (multiHop && semanticHops) body.semantic_hops = true;
    if (includeReference) body.include_reference = true;
    if (includeConsolidated) body.include_consolidated = true; // CORE-CONSOLIDATE-1
    if (consolidationFirst) body.consolidation_first = true;   // NEURO-1d: surface summaries above their sources
    return this.api.post('/memory/search', body);
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
    return this.api.get(`/memory/${id}/lineage`);
  }

  async getLinks(id) {
    return this.api.get(`/memory/${id}/links`);
  }

  async searchByMetadata(metadataKey, metadataValue, { memoryType = null, limit = 25 } = {}) {
    const params = new URLSearchParams({
      metadata_key: metadataKey,
      metadata_value: metadataValue,
      limit,
    });
    if (memoryType) params.append('memory_type', memoryType);
    return this.api.get(`/memory/by-metadata?${params}`);
  }

  async getNeighbors(id) {
    return this.api.get(`/memory/${id}/neighbors`);
  }

  async getSummary() {
    return this.api.get('/memory/summary');
  }

  async ingestConversation(turns, {
    sessionBoundaries = null, conversationId = null, sessionDates = null,
    turnsPerChunk = 15, maxChunkChars = 12000, maxConcurrent = 4
  } = {}) {
    const body = { turns, turns_per_chunk: turnsPerChunk, max_chunk_chars: maxChunkChars, max_concurrent: maxConcurrent };
    if (sessionBoundaries) body.session_boundaries = sessionBoundaries;
    if (conversationId) body.conversation_id = conversationId;
    if (sessionDates) body.session_dates = sessionDates;
    return this.api.post('/memory/ingest/conversation', body);
  }

  async ingestDocument(content, { title = null, source = null, chunkStrategy = null } = {}) {
    const body = { content };
    if (title) body.title = title;
    if (source) body.source = source;
    if (chunkStrategy) body.chunk_strategy = chunkStrategy;
    return this.api.post('/memory/ingest/document', body);
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
    return this.api.post(`/memory/${itemId}/enrich`, {
      item_id: itemId,
      routines
    });
  }

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

  async ground(itemId, sourceUrl, validation = null) {
    return this.api.post(`/memory/${itemId}/ground`, {
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
