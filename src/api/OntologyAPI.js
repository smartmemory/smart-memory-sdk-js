/**
 * Ontology API - Registry management, inference, enrichment, grounding, templates, patterns.
 *
 * Covers all endpoints from ontology.py, ontology_layers.py, and ontology_update.py:
 *   POST /memory/ontology/inference/run
 *   GET  /memory/ontology/registries
 *   POST /memory/ontology/registries
 *   GET  /memory/ontology/registry/{id}/snapshot
 *   POST /memory/ontology/registry/{id}/apply
 *   GET  /memory/ontology/registry/{id}/snapshots
 *   GET  /memory/ontology/registry/{id}/changelog
 *   POST /memory/ontology/registry/{id}/rollback
 *   GET  /memory/ontology/registry/{id}/export
 *   POST /memory/ontology/registry/{id}/import
 *   GET  /memory/ontology/enrichment/providers
 *   POST /memory/ontology/enrichment/run
 *   POST /memory/ontology/grounding/run
 *   GET  /memory/ontology/templates
 *   GET  /memory/ontology/templates/{template_id}
 *   POST /memory/ontology/templates/clone
 *   POST /memory/ontology/templates
 *   DELETE /memory/ontology/templates/{template_id}
 *   GET  /memory/ontology/patterns
 *   POST /memory/ontology/patterns
 *   DELETE /memory/ontology/patterns/{pattern_name}
 *   GET  /memory/ontology/status
 *   POST /memory/ontology/import
 *   GET  /memory/ontology/export
 *   --- Layer endpoints (ontology_layers.py) ---
 *   POST /memory/ontology/registry/{id}/subscribe
 *   DELETE /memory/ontology/registry/{id}/subscribe
 *   PUT  /memory/ontology/registry/{id}/subscribe/pin
 *   DELETE /memory/ontology/registry/{id}/subscribe/pin
 *   GET  /memory/ontology/registry/{id}/layers
 *   GET  /memory/ontology/registry/{id}/layer-diff
 *   POST /memory/ontology/registry/{id}/subscribe/hidden
 *   DELETE /memory/ontology/registry/{id}/subscribe/hidden/{type_name}
 *   --- Ontology update endpoints (ontology_update.py) ---
 *   GET  /memory/ontology-update/config
 *   PUT  /memory/ontology-update/config
 *   POST /memory/ontology-update/trigger
 *   GET  /memory/ontology-update/status
 *   GET  /memory/ontology-update/history
 *   GET  /memory/ontology-update/stats
 */
export class OntologyAPI {
  constructor(baseAPI) {
    this.api = baseAPI;
  }

  // === INFERENCE ===

  /**
   * Run ontology inference over provided raw text chunks.
   * @param {Object} params
   * @param {string} [params.registryId='default']
   * @param {Array<{docId: string, text: string}>} params.rawChunks
   * @param {Object} [params.params={}]
   */
  async runInference({ registryId = 'default', rawChunks, params = {} }) {
    return this.api.post('/memory/ontology/inference/run', {
      registry_id: registryId,
      raw_chunks: rawChunks.map(c => ({ doc_id: c.docId, text: c.text })),
      params
    });
  }

  // === REGISTRY MANAGEMENT ===

  /**
   * List all ontology registries.
   */
  async listRegistries() {
    return this.api.get('/memory/ontology/registries');
  }

  /**
   * Create a new ontology registry.
   * @param {Object} params
   * @param {string} params.name
   * @param {string} [params.description='']
   * @param {string} [params.domain='general']
   */
  async createRegistry({ name, description = '', domain = 'general' }) {
    return this.api.post('/memory/ontology/registries', {
      name,
      description,
      domain
    });
  }

  /**
   * Get a snapshot of a registry (current or specific version).
   * @param {string} registryId
   * @param {string} [version]
   */
  async getSnapshot(registryId, version = null) {
    let url = `/memory/ontology/registry/${registryId}/snapshot`;
    if (version) url += `?version=${encodeURIComponent(version)}`;
    return this.api.get(url);
  }

  /**
   * Apply a changeset to create a new version of the registry.
   * @param {string} registryId
   * @param {Object} params
   * @param {string} [params.baseVersion='']
   * @param {Object} params.changeset - OntologyIR changeset
   * @param {string} [params.message='']
   */
  async applyChangeset(registryId, { baseVersion = '', changeset, message = '' }) {
    return this.api.post(`/memory/ontology/registry/${registryId}/apply`, {
      base_version: baseVersion,
      changeset,
      message
    });
  }

  /**
   * List snapshots for a registry.
   * @param {string} registryId
   * @param {number} [limit=50]
   */
  async listSnapshots(registryId, limit = 50) {
    return this.api.get(`/memory/ontology/registry/${registryId}/snapshots?limit=${limit}`);
  }

  /**
   * Get change history for a registry.
   * @param {string} registryId
   * @param {number} [limit=50]
   */
  async getChangelog(registryId, limit = 50) {
    return this.api.get(`/memory/ontology/registry/${registryId}/changelog?limit=${limit}`);
  }

  /**
   * Rollback registry to a previous version.
   * @param {string} registryId
   * @param {Object} params
   * @param {string} [params.targetVersion='']
   * @param {string} [params.message='']
   */
  async rollbackRegistry(registryId, { targetVersion = '', message = '' }) {
    return this.api.post(`/memory/ontology/registry/${registryId}/rollback`, {
      target_version: targetVersion,
      message
    });
  }

  /**
   * Export a registry snapshot.
   * @param {string} registryId
   * @param {string} [version]
   */
  async exportRegistry(registryId, version = null) {
    let url = `/memory/ontology/registry/${registryId}/export`;
    if (version) url += `?version=${encodeURIComponent(version)}`;
    return this.api.get(url);
  }

  /**
   * Import data into a registry.
   * @param {string} registryId
   * @param {Object} params
   * @param {Object} params.data - Complete ontology data to import
   * @param {string} [params.message='']
   */
  async importRegistry(registryId, { data, message = '' }) {
    return this.api.post(`/memory/ontology/registry/${registryId}/import`, {
      data,
      message
    });
  }

  // === ENRICHMENT & GROUNDING ===

  /**
   * List available enrichment providers.
   */
  async listEnrichmentProviders() {
    return this.api.get('/memory/ontology/enrichment/providers');
  }

  /**
   * Run enrichment operation using specified provider.
   * @param {Object} params
   * @param {string} [params.provider='wikipedia']
   * @param {string[]} params.entities
   */
  async runEnrichment({ provider = 'wikipedia', entities }) {
    return this.api.post('/memory/ontology/enrichment/run', {
      provider,
      entities
    });
  }

  /**
   * Run grounding operation using specified grounder.
   * @param {Object} params
   * @param {string} [params.grounder='wikipedia']
   * @param {string} params.itemId
   * @param {string[]} params.candidates
   */
  async runGrounding({ grounder = 'wikipedia', itemId, candidates }) {
    return this.api.post('/memory/ontology/grounding/run', {
      grounder,
      item_id: itemId,
      candidates
    });
  }

  // === TEMPLATES ===

  /**
   * List all available ontology templates.
   */
  async listTemplates() {
    return this.api.get('/memory/ontology/templates');
  }

  /**
   * Preview template details.
   * @param {string} templateId
   */
  async getTemplate(templateId) {
    return this.api.get(`/memory/ontology/templates/${templateId}`);
  }

  /**
   * Clone a template into the workspace as an independent ontology.
   * @param {Object} params
   * @param {string} params.templateId
   * @param {string} params.targetName
   */
  async cloneTemplate({ templateId, targetName }) {
    return this.api.post('/memory/ontology/templates/clone', {
      template_id: templateId,
      target_name: targetName
    });
  }

  /**
   * Save an existing ontology registry as a custom template.
   * @param {Object} params
   * @param {string} params.registryId
   * @param {string} params.name
   * @param {string} [params.description='']
   */
  async saveAsTemplate({ registryId, name, description = '' }) {
    return this.api.post('/memory/ontology/templates', {
      registry_id: registryId,
      name,
      description
    });
  }

  /**
   * Delete a custom template.
   * @param {string} templateId
   */
  async deleteTemplate(templateId) {
    return this.api.delete(`/memory/ontology/templates/${templateId}`);
  }

  // === PATTERNS ===

  /**
   * List entity patterns with stats for the current workspace.
   */
  async listPatterns() {
    return this.api.get('/memory/ontology/patterns');
  }

  /**
   * Manually add an entity pattern.
   * @param {Object} params
   * @param {string} params.name
   * @param {string} params.entityType
   * @param {number} [params.confidence=0.9]
   * @param {boolean} [params.isGlobal=false]
   */
  async createPattern({ name, entityType, confidence = 0.9, isGlobal = false }) {
    return this.api.post('/memory/ontology/patterns', {
      name,
      entity_type: entityType,
      confidence,
      is_global: isGlobal
    });
  }

  /**
   * Delete an entity pattern by name.
   * @param {string} patternName
   * @param {string} entityType
   */
  async deletePattern(patternName, entityType) {
    return this.api.delete(`/memory/ontology/patterns/${patternName}?entity_type=${encodeURIComponent(entityType)}`);
  }

  // === STATUS & IMPORT/EXPORT ===

  /**
   * Get ontology convergence metrics.
   */
  async getStatus() {
    return this.api.get('/memory/ontology/status');
  }

  /**
   * Import OntologyIR data to seed or migrate the ontology.
   * @param {Object} data
   */
  async importOntology(data) {
    return this.api.post('/memory/ontology/import', { data });
  }

  /**
   * Export the full ontology as a portable dict.
   */
  async exportOntology() {
    return this.api.get('/memory/ontology/export');
  }

  // === LAYER ENDPOINTS (ontology_layers.py) ===

  /**
   * Subscribe an overlay ontology to a base ontology.
   * @param {string} registryId
   * @param {Object} params
   * @param {string} params.baseRegistryId
   * @param {string} [params.pinnedVersion]
   */
  async subscribe(registryId, { baseRegistryId, pinnedVersion = null }) {
    return this.api.post(`/memory/ontology/registry/${registryId}/subscribe`, {
      base_registry_id: baseRegistryId,
      pinned_version: pinnedVersion
    });
  }

  /**
   * Detach from base - flatten visible base types into overlay.
   * @param {string} registryId
   */
  async unsubscribe(registryId) {
    return this.api.delete(`/memory/ontology/registry/${registryId}/subscribe`);
  }

  /**
   * Pin subscription to a specific base version.
   * @param {string} registryId
   * @param {string} version
   */
  async pinVersion(registryId, version) {
    return this.api.put(`/memory/ontology/registry/${registryId}/subscribe/pin`, {
      version
    });
  }

  /**
   * Unpin - follow latest base version.
   * @param {string} registryId
   */
  async unpinVersion(registryId) {
    return this.api.delete(`/memory/ontology/registry/${registryId}/subscribe/pin`);
  }

  /**
   * Get provenance map and layer counts for an ontology.
   * @param {string} registryId
   */
  async getLayers(registryId) {
    return this.api.get(`/memory/ontology/registry/${registryId}/layers`);
  }

  /**
   * Compute diff between base and overlay layers.
   * @param {string} registryId
   */
  async getLayerDiff(registryId) {
    return this.api.get(`/memory/ontology/registry/${registryId}/layer-diff`);
  }

  /**
   * Hide a base entity type from the merged view.
   * @param {string} registryId
   * @param {string} typeName
   */
  async hideType(registryId, typeName) {
    return this.api.post(`/memory/ontology/registry/${registryId}/subscribe/hidden`, {
      type_name: typeName
    });
  }

  /**
   * Unhide a previously hidden base entity type.
   * @param {string} registryId
   * @param {string} typeName
   */
  async unhideType(registryId, typeName) {
    return this.api.delete(`/memory/ontology/registry/${registryId}/subscribe/hidden/${typeName}`);
  }

  // === ONTOLOGY UPDATE (ontology_update.py) ===

  /**
   * Get the ontology update configuration for this workspace.
   */
  async getUpdateConfig() {
    return this.api.get('/memory/ontology-update/config');
  }

  /**
   * Update the ontology update configuration.
   * @param {Object} updates
   * @param {boolean} [updates.enabled]
   * @param {string} [updates.schedule] - hourly|daily|manual
   * @param {number} [updates.batchSize]
   * @param {string} [updates.model]
   */
  async updateConfig(updates) {
    const body = {};
    if (updates.enabled !== undefined) body.enabled = updates.enabled;
    if (updates.schedule !== undefined) body.schedule = updates.schedule;
    if (updates.batchSize !== undefined) body.batch_size = updates.batchSize;
    if (updates.model !== undefined) body.model = updates.model;
    return this.api.put('/memory/ontology-update/config', body);
  }

  /**
   * Trigger a batch ontology update run.
   * @param {Object} [options]
   * @param {number} [options.batchSize]
   */
  async triggerUpdate({ batchSize = null } = {}) {
    const body = {};
    if (batchSize !== null) body.batch_size = batchSize;
    return this.api.post('/memory/ontology-update/trigger', body);
  }

  /**
   * Get the status of the latest batch run.
   */
  async getUpdateStatus() {
    return this.api.get('/memory/ontology-update/status');
  }

  /**
   * Get paginated history of batch runs.
   * @param {Object} [options]
   * @param {number} [options.page=1]
   * @param {number} [options.pageSize=10]
   */
  async getUpdateHistory({ page = 1, pageSize = 10 } = {}) {
    return this.api.get(`/memory/ontology-update/history?page=${page}&page_size=${pageSize}`);
  }

  /**
   * Get ontology update statistics for this workspace.
   * @param {Object} [options]
   * @param {boolean} [options.history=false]
   */
  async getUpdateStats({ history = false } = {}) {
    return this.api.get(`/memory/ontology-update/stats?history=${history}`);
  }
}
