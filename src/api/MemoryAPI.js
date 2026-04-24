export class MemoryAPI {
  constructor(baseAPI) {
    this.api = baseAPI;
  }

  async create({ content, memoryType = 'semantic', metadata = null, usePipeline = true, profileName = null }) {
    return this.api.post('/memory/add', {
      content,
      memory_type: memoryType,
      metadata,
      use_pipeline: usePipeline,
      profile_name: profileName
    });
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
    return this.api.put(`/memory/${id}`, updates);
  }

  async delete(id) {
    return this.api.delete(`/memory/${id}`);
  }

  async list({ limit = 50, offset = 0, type = null } = {}) {
    let url = `/memory/list?limit=${limit}&offset=${offset}`;
    if (type) url += `&memory_type=${type}`;
    return this.api.get(url);
  }

  async search(query, { topK = 5, enableHybrid = true, memoryType = null } = {}) {
    const body = { query, top_k: topK, enable_hybrid: enableHybrid };
    if (memoryType) body.memory_type = memoryType;
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

  async getSummary() {
    return this.api.get('/memory/summary');
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

  async feedback(feedback, memoryType = 'semantic') {
    return this.api.post('/memory/feedback', { feedback, memory_type: memoryType });
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
